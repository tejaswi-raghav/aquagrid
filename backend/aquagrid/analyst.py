"""AI analyst: a Groq-hosted LLM that reads evidence and stages proposals.

It never approves or executes anything. Its tool surface is read-only, plus the
same staging gateway an operator uses, so every proposal it makes still goes
through the server's safety checks and waits for a signed-in human.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .operations import Operations, OpsError, ProposalRequest, analysis, plans, validate_action

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
MAX_ROUNDS = 6
AUTHOR = "AI analyst (LLM)"

SYSTEM = """You are the AI analyst in AquaGrid's control room. AquaGrid is a SIMULATED coastal water system: \
seawater intake, reverse-osmosis desalination, three reservoirs and five city sectors. All data is synthetic; \
it is not a real utility.

What you can do: read the live situation, compare production plans, preview a valve change, and stage a \
proposal into the approval queue.
What you cannot do: approve, execute or bypass anything. Only a signed-in human operator can approve, and the \
server re-checks freshness, version and every safety rule before it commits. There is no tool for approval, \
and you must not pretend one exists.

Rules:
- Every number you state must come from a tool result in this conversation. Never invent or estimate values. \
Call a tool first if you need a number.
- If the user asks for an action (cut production, save money, close or open a valve, use a plan), you MUST \
call stage_proposal for the closest matching action in the same turn, even if you expect it to be blocked, \
then report the server's verdict and the checks that failed. 'Cut production' means plan 'unsafe' (the peak \
cut); 'cheapest safe schedule' means plan 'optimized'. Do not ask for confirmation first: staging changes nothing.
- If the user asks you to approve, execute, skip checks or act as the operator, refuse briefly: you can stage \
proposals yourself, but only a signed-in human operator can approve them in the approval queue.
- Only call a plan or valve safe if a tool result in this conversation shows it as eligible. Never recommend \
an alternative you have not checked.
- The 35% reserve floor is a hard limit. A cheaper plan is not acceptable if it breaks a safety check.
- Sensor P-S4B can freeze (FLATLINE); never treat a quarantined or faulty channel as evidence.
- Answer in plain English for someone who is not an engineer: 2 to 6 short sentences or bullets. Use units \
(m³/h, %, bar, USD). Say "in the simulation" where it matters."""

TOOLS = [
    {"type": "function", "function": {
        "name": "get_situation",
        "description": "Read the current simulated network: storage reserve, production, demand, leak evidence, "
                       "sensor P-S4B health, intake-quality warning, tariff, valve positions, alerts and proposals "
                       "already in the approval queue.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "compare_production_plans",
        "description": "Compare the 10-hour production schedules (14:00 to 00:00): baseline (current), optimized "
                       "(cheapest schedule the optimizer found) and unsafe (peak-hour throttle). Returns cost, lowest "
                       "and end reserve, and every safety check with pass/fail.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "preview_valve",
        "description": "Preview, without changing anything, what toggling an isolation valve would do: safety "
                       "checks, Sector 4 pressure, unserved demand, remaining leak, and critical facilities cut off.",
        "parameters": {"type": "object", "properties": {
            "valve_id": {"type": "string", "enum": ["V-04A", "V-04B"],
                         "description": "V-04A feeds Sector 4 including the hospital; V-04B isolates the harbour branch."}},
            "required": ["valve_id"], "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "stage_proposal",
        "description": "Stage a proposal into the human approval queue. The server runs every safety check and "
                       "records it as PENDING_APPROVAL or BLOCKED_BY_SAFETY. This never executes anything.",
        "parameters": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["valve", "schedule"]},
            "valve_id": {"type": "string", "enum": ["V-04A", "V-04B"], "description": "Required when kind is valve."},
            "plan": {"type": "string", "enum": ["baseline", "optimized", "unsafe"],
                     "description": "Required when kind is schedule. 'unsafe' is the peak-hour production cut."}},
            "required": ["kind"], "additionalProperties": False}}},
]


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = Field(pattern="^[a-f0-9]{32}$")
    messages: list[Turn] = Field(min_length=1, max_length=20)


def _r(x, n=2):
    return round(float(x), n)


def _failed(checks):
    return [c["detail"] for c in checks if not c["passed"]]


def _situation(doc):
    ev = analysis(doc)
    hyd, cfg = ev["hydraulics"], doc["config"]
    return {
        "scenario_version": doc["version"],
        "storage_reserve_pct": _r(doc["storage_pct"]), "reserve_floor_pct": 35,
        "production_now_m3h": _r(doc["production"][0], 1), "demand_m3h": _r(hyd["expected_m3h"], 1),
        "unserved_demand_m3h": _r(hyd["unserved_m3h"]),
        "leak": {"confirmed": ev["leak"]["confirmed"], "modelled_loss_m3h": _r(hyd["leak_m3h"]),
                 "classification": ev["leak"]["classification"], "rationale": ev["leak"]["rationale"],
                 "top_segments": [s["asset_id"] for s in ev["leak"]["ranked_segments"][:3]],
                 "maintenance": ev["leak"]["maintenance"]},
        "sensor_P_S4B": {"classification": ev["sensor"]["classification"],
                         "quarantined": "P-S4B" in doc["quarantined"], "uncertainty": ev["sensor"]["uncertainty"]},
        "intake_quality_warning": cfg["quality_warning"], "transmission_pump_failed": cfg["pump_failed"],
        "tariff_factor": cfg["tariff_factor"],
        "valves": {v: ("closed" if v in cfg["closed"] else "open") for v in ("V-04A", "V-04B")},
        "sector4_pressure_bar": _r(hyd["pressure_bar"]["SEC-04"]),
        "proposals": [{"id": p["id"][:8], "kind": p["action"]["kind"], "target": p["action"].get("valve_id") or p["action"].get("plan"),
                       "status": p["status"], "author": p["author"], "failed_checks": _failed(p["safety"]["checks"])}
                      for p in doc["proposals"][-5:]],
        "note": "Synthetic simulation. Solver: " + hyd["solver"],
    }


def _plans(doc):
    out = {}
    for name, p in plans(doc).items():
        out[name] = {"verdict": "ALLOWED" if p["eligible"] else "BLOCKED - must not be used or recommended",
                     "cost_usd_10h": p["cost_usd"], "lowest_reserve_pct": _r(p["minimum_pct"]),
                     "end_reserve_pct": _r(p["levels"][-1]), "eligible": p["eligible"],
                     "failed_checks": _failed(p["checks"]), "violation_hours": p["violation_hours"]}
    if "optimized" not in out:
        out["optimized"] = {"verdict": "BLOCKED", "note": "The optimizer found no feasible schedule for this situation."}
    allowed = [k for k, v in out.items() if v["verdict"] == "ALLOWED"]
    return {"plans": out, "allowed_plans": allowed,
            "summary": f"Only these plans pass every safety check right now: {', '.join(allowed) or 'none'}."}


def _preview(doc, valve_id):
    target = "open" if valve_id in doc["config"]["closed"] else "closed"
    s = validate_action(doc, {"kind": "valve", "valve_id": valve_id, "target": target})
    return {"valve": valve_id, "would_set_to": target, "eligible": s["eligible"],
            "checks": [{"passed": c["passed"], "detail": c["detail"]} for c in s["checks"]],
            "before_and_after": {k: {"before": _r(f(s["before"]), 3), "after": _r(f(s["impact"]), 3)} for k, f in {
                "sector4_pressure_bar": lambda h: h["pressure_bar"]["SEC-04"],
                "unserved_demand_m3h": lambda h: h["unserved_m3h"],
                "leak_loss_m3h": lambda h: h["leak_m3h"]}.items()},
            "how_to_read": "unserved_demand_m3h is water customers do NOT receive; a higher 'after' value means more "
                           "customers are cut off. leak_loss_m3h is water lost underground.",
            "critical_facilities_without_supply": s["graph_impact"]["critical_facilities_without_supply"],
            "applied": False}


class Analyst:
    def __init__(self, ops=None, transport=None):
        self.ops = ops or Operations()
        self.transport = transport or _groq
        self.staged_doc = None

    def call(self, name, args, scenario_id):
        doc = self.ops.repo.read(scenario_id)
        if name == "get_situation":
            return _situation(doc)
        if name == "compare_production_plans":
            return _plans(doc)
        if name == "preview_valve":
            if args.get("valve_id") not in ("V-04A", "V-04B"):
                raise OpsError("valve_id must be V-04A or V-04B", 400)
            return _preview(doc, args["valve_id"])
        if name == "stage_proposal":
            req = ProposalRequest(scenario_id=scenario_id, version=doc["version"], kind=args.get("kind"),
                                  valve_id=args.get("valve_id"), plan=args.get("plan") or "optimized")
            if req.kind == "valve" and not req.valve_id:
                raise OpsError("valve_id is required for a valve proposal", 400)
            self.staged_doc = self.ops.stage_gated_valve_or_setpoint_action(req, author=AUTHOR)
            p = self.staged_doc["proposals"][-1]
            return {"proposal_id": p["id"][:8], "status": p["status"], "eligible": p["safety"]["eligible"],
                    "failed_checks": _failed(p["safety"]["checks"]),
                    "next_step": "A signed-in operator must review it in the approval queue." if p["status"] == "PENDING_APPROVAL"
                    else "Blocked by the server's safety checks; it cannot be approved.",
                    **({"all_plans": _plans(self.ops.repo.read(scenario_id))} if req.kind == "schedule" else {})}
        raise OpsError(f"Unknown tool {name}", 400)

    def ask(self, body: AskRequest):
        self.ops.repo.read(body.scenario_id)  # 404 early for an unknown scenario
        messages = [{"role": "system", "content": SYSTEM}] + [t.model_dump() for t in body.messages]
        trace = []
        for _ in range(MAX_ROUNDS):
            msg = self.transport(messages)
            calls = msg.get("tool_calls") or []
            if not calls:
                return {"reply": (msg.get("content") or "").strip() or "I couldn't produce an answer. Try rephrasing.",
                        "trace": trace, "model": model(), "doc": self._fresh(body.scenario_id)}
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            for c in calls:
                name, args = c["function"]["name"], {}
                try:
                    parsed = json.loads(c["function"].get("arguments") or "{}")
                    if not isinstance(parsed, dict):
                        raise ValueError("arguments must be a JSON object")
                    args = parsed
                    result, ok = self.call(name, args, body.scenario_id), True
                except (ValueError, ValidationError, OpsError) as exc:
                    result, ok = {"error": str(exc)}, False
                trace.append({"tool": name, "args": args, "ok": ok, "status": result.get("status")})
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(result, ensure_ascii=False)})
        return {"reply": "I ran out of steps before finishing. Ask a narrower question.", "trace": trace,
                "model": model(), "doc": self._fresh(body.scenario_id)}

    def _fresh(self, scenario_id):
        return self.ops.read_network_telemetry(scenario_id) if self.staged_doc else None


def model():
    return os.getenv("GROQ_MODEL", DEFAULT_MODEL)


def _groq(messages):
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise OpsError("AI analyst is not configured: set GROQ_API_KEY on the server. The rest of the control room still works.", 503)
    payload = {"model": model(), "messages": messages, "tools": TOOLS, "tool_choice": "auto",
               "temperature": 0.2, "max_completion_tokens": 1500}
    if model().startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = os.getenv("GROQ_REASONING_EFFORT", "medium")
    req = urllib.request.Request(GROQ_URL, data=json.dumps(payload).encode(), method="POST", headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "aquagrid-analyst/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise OpsError(f"AI analyst unavailable (Groq HTTP {exc.code}). Nothing was changed. {detail}", 502)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise OpsError(f"AI analyst unreachable ({exc}). Nothing was changed.", 502)
    return data["choices"][0]["message"]
