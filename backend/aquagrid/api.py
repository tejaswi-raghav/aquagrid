"""Framework-free HTTP routing shared by the Vercel function and the dev server."""

import json
import traceback
from urllib.parse import parse_qs, urlparse

from . import config as C
from . import control, desal, network, planning, scenario, security, sensors


class HttpError(Exception):
    def __init__(self, status, message, extra=None):
        super().__init__(message)
        self.status, self.extra = status, extra or {}


def _ctx(body):
    try:
        return scenario.Context(body.get("scene", 1), body.get("quarantined"), body.get("valve_records"))
    except (ValueError, TypeError) as exc:
        raise HttpError(400, str(exc))


def health(_q, _b):
    return {"ok": True, "engine": C.ENGINE_VERSION, "authority": "python-backend",
            "signing_key": "development" if security.USING_DEV_SECRET else "configured"}


def get_network(_q, _b):
    return network.topology()


def post_state(_q, body):
    return scenario.build_state(_ctx(body))


def post_analyze(_q, body):
    ctx = _ctx(body)
    try:
        return sensors.analyze(body.get("sensor_id", ""), ctx.minute, ctx.isolated_at)
    except KeyError:
        raise HttpError(404, "Unknown sensor.")


def post_quarantine(_q, body):
    ctx = _ctx(body)
    sid = body.get("sensor_id", "")
    try:
        analysis = sensors.analyze(sid, ctx.minute, ctx.isolated_at)
    except KeyError:
        raise HttpError(404, "Unknown sensor.")
    if not analysis["quarantine_recommended"]:
        raise HttpError(409, f"Quarantine refused: evidence does not show {sid} is unreliable.", {"analysis": analysis})
    quarantined = sorted(set(ctx.quarantined) | {sid})
    new_ctx = scenario.Context(ctx.scene["id"], quarantined, body.get("valve_records"))
    return {"quarantined": quarantined, "analysis": analysis, "state": scenario.build_state(new_ctx)}


def post_evaluate(_q, body):
    ctx = _ctx(body)
    plans = body.get("plans") or [body.get("plan", "baseline")]
    loss = ctx.planning_loss()
    quality = scenario.build_state(ctx)["quality_review_open"]
    base = planning.evaluate(planning.plan_production("baseline"), start_pct=C.LEVEL_AT_1400_PCT,
                             loss_m3h=loss, quality_review_open=quality, plan_id="baseline")
    results = []
    for plan in plans:
        if isinstance(plan, dict):
            production, pid = plan.get("production_m3h"), "custom"
        else:
            try:
                production, pid = planning.plan_production(plan), plan
            except KeyError:
                raise HttpError(404, f"Unknown plan '{plan}'.")
        try:
            results.append(planning.evaluate(production, start_pct=C.LEVEL_AT_1400_PCT, loss_m3h=loss,
                                             quality_review_open=quality, plan_id=pid, baseline=base))
        except (ValueError, TypeError) as exc:
            raise HttpError(400, str(exc))
    alt = planning.safe_alternative(start_pct=C.LEVEL_AT_1400_PCT, loss_m3h=loss)
    if alt:
        alt["evaluation"] = planning.evaluate(alt["production_m3h"], start_pct=C.LEVEL_AT_1400_PCT, loss_m3h=loss,
                                              quality_review_open=quality, plan_id="safe_alternative", baseline=base)
    return {
        "authority": "python-backend", "engine": C.ENGINE_VERSION,
        "assumptions": {"capacity_m3": C.CAPACITY_M3, "start_pct": C.LEVEL_AT_1400_PCT, "demand_m3h": C.DEMAND_M3H,
                        "modelled_loss_m3h": loss, "floor_pct": C.SAFETY_FLOOR_PCT,
                        "peak_window": f"{C.PEAK_START_H:02d}:00–{C.PEAK_END_H:02d}:00",
                        "tariffs_usd_kwh": {"peak": C.PEAK_TARIFF, "off_peak": C.OFF_PEAK_TARIFF}},
        "baseline": base, "results": results, "safe_alternative": alt,
    }


def get_desal(q, _b):
    try:
        prod = float(q.get("production", [C.NOMINAL_PRODUCTION_M3H])[0])
    except ValueError:
        raise HttpError(400, "production must be a number")
    return desal.model(prod)


def post_login(_q, body):
    try:
        return security.login(body.get("operator_id"), body.get("pin"))
    except security.AuthError as exc:
        raise HttpError(exc.status, str(exc))


def post_stage(_q, body):
    ctx = _ctx(body)
    try:
        return control.stage(body.get("valve_id"), body.get("action", "close"), ctx,
                             proposed_by=str(body.get("proposed_by", "Operator request"))[:80])
    except control.ControlError as exc:
        raise HttpError(exc.status, str(exc))


def post_approve(_q, body):
    ctx = _ctx(body)
    try:
        result = control.approve(body.get("proposal"), body.get("signature"), body.get("token"), ctx)
    except security.AuthError as exc:
        raise HttpError(exc.status, str(exc))
    except control.ControlError as exc:
        raise HttpError(exc.status, str(exc), {"evaluation": exc.evaluation})
    records = list(body.get("valve_records") or []) + [{"record": result["record"], "signature": result["signature"]}]
    result["state"] = scenario.build_state(scenario.Context(ctx.scene["id"], ctx.quarantined, records))
    return result


ROUTES = {
    ("GET", "/api/health"): health,
    ("GET", "/api/network"): get_network,
    ("POST", "/api/state"): post_state,
    ("POST", "/api/sensors/analyze"): post_analyze,
    ("POST", "/api/sensors/quarantine"): post_quarantine,
    ("POST", "/api/plans/evaluate"): post_evaluate,
    ("GET", "/api/desal"): get_desal,
    ("POST", "/api/auth/login"): post_login,
    ("POST", "/api/valves/stage"): post_stage,
    ("POST", "/api/valves/approve"): post_approve,
}


def handle(method, raw_path, raw_body=b""):
    """Return (status, payload dict)."""
    url = urlparse(raw_path)
    path = url.path.rstrip("/") or "/"
    if method == "OPTIONS":
        return 204, {}
    if path.startswith('/api/ops/'):
        from .operations_api import dispatch
        return dispatch(method,path,raw_body)
    if path in ('/api/valves/stage','/api/valves/approve'):
        return 410, {'error':'Legacy stateless controls retired. Use /api/ops staging and operator decision gateway.'}
    fn = ROUTES.get((method, path))
    if fn is None:
        known = {p for _, p in ROUTES}
        return (405 if path in known else 404), {"error": "Not found" if path not in known else "Method not allowed"}
    try:
        body = json.loads(raw_body or b"{}") if method == "POST" else {}
        if not isinstance(body, dict):
            raise HttpError(400, "JSON object expected")
        return 200, fn(parse_qs(url.query), body)
    except json.JSONDecodeError:
        return 400, {"error": "Invalid JSON"}
    except HttpError as exc:
        return exc.status, {"error": str(exc), **exc.extra}
    except Exception:  # pragma: no cover - surfaced to logs, generic to clients
        traceback.print_exc()
        return 500, {"error": "Simulation engine error"}
