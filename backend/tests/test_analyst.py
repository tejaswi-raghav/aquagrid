"""AI analyst checks with a scripted fake LLM (no network)."""
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from aquagrid.analyst import Analyst, AskRequest, TOOLS, AUTHOR
from aquagrid.operations import Operations, Event, OpsError
from aquagrid.repository import Repository
from aquagrid import security


def call(name, **args):
    return {"id": f"c-{name}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


class Script:
    """Replays tool calls, then a final answer; records what the model was shown."""
    def __init__(self, *turns):
        self.turns, self.seen = list(turns), []
    def __call__(self, messages):
        self.seen.append(messages)
        return self.turns.pop(0)


class AnalystTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ops = Operations(Repository(self.tmp.name + '/db.sqlite'))
        d = self.ops.create()
        op = security.login('CR-07', '2468')['token']
        self.d = self.ops.event(Event(scenario_id=d['id'], version=d['version'], token=op, operation='compound'))
    def tearDown(self): self.tmp.cleanup()
    def ask(self, script, text="hi"):
        return Analyst(self.ops, script).ask(AskRequest(scenario_id=self.d['id'], messages=[{"role": "user", "content": text}]))

    def test_tool_surface_has_no_approval_or_execution(self):
        names = {t["function"]["name"] for t in TOOLS}
        self.assertEqual(names, {"get_situation", "compare_production_plans", "preview_valve", "stage_proposal"})
        self.assertFalse(any(w in n for n in names for w in ("approve", "execute", "decide", "actuate")))

    def test_unsafe_cut_is_staged_but_blocked_and_labelled(self):
        s = Script({"tool_calls": [call("stage_proposal", kind="schedule", plan="unsafe")]}, {"content": "Blocked."})
        out = self.ask(s, "cut production to save money")
        p = out["doc"]["proposals"][-1]
        self.assertEqual(p["status"], "BLOCKED_BY_SAFETY"); self.assertEqual(p["author"], AUTHOR)
        result = json.loads(s.seen[1][-1]["content"])
        self.assertTrue(any("35%" in c for c in result["failed_checks"]))
        self.assertEqual(out["trace"][0]["status"], "BLOCKED_BY_SAFETY")

    def test_valve_proposal_waits_for_a_human(self):
        s = Script({"tool_calls": [call("stage_proposal", kind="valve", valve_id="V-04B")]}, {"content": "Staged."})
        out = self.ask(s)
        self.assertEqual(out["doc"]["proposals"][-1]["status"], "PENDING_APPROVAL")
        self.assertEqual(out["doc"]["state"]["valves"]["V-04B"]["position"], "open")

    def test_reads_do_not_mutate_and_return_engine_numbers(self):
        before = self.ops.repo.read(self.d['id'])
        s = Script({"tool_calls": [call("get_situation"), call("compare_production_plans"), call("preview_valve", valve_id="V-04B")]},
                   {"content": "Summary."})
        out = self.ask(s)
        self.assertIsNone(out["doc"]); self.assertEqual(before, self.ops.repo.read(self.d['id']))
        sit, plans, prev = (json.loads(m["content"]) for m in s.seen[1][-3:])
        self.assertTrue(sit["leak"]["confirmed"]); self.assertEqual(sit["sensor_P_S4B"]["classification"], "FLATLINE")
        self.assertFalse(plans["plans"]["unsafe"]["eligible"]); self.assertEqual(plans["allowed_plans"], ["baseline"]); self.assertFalse(prev["applied"])

    def test_bad_arguments_become_tool_errors_not_crashes(self):
        bad = {"id": "x", "type": "function", "function": {"name": "stage_proposal", "arguments": "not json"}}
        s = Script({"tool_calls": [bad, call("preview_valve", valve_id="V-99"), call("approve_everything")]}, {"content": "ok"})
        out = self.ask(s)
        self.assertEqual([t["ok"] for t in out["trace"]], [False, False, False])
        self.assertEqual(self.ops.repo.read(self.d['id'])['proposals'], [])

    def test_missing_key_reports_503(self):
        os.environ.pop("GROQ_API_KEY", None)
        with self.assertRaises(OpsError) as e:
            Analyst(self.ops).ask(AskRequest(scenario_id=self.d['id'], messages=[{"role": "user", "content": "hi"}]))
        self.assertEqual(e.exception.status, 503)


if __name__ == '__main__':
    unittest.main()
