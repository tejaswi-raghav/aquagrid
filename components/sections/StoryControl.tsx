"use client";

import { useCallback, useEffect, useState } from "react";
import { useScenario } from "@/components/ScenarioController";
import { api, type SimState } from "@/lib/api";
import { request, type OpsDoc } from "@/lib/operations";
import { ErrorNote, Verdict } from "@/components/ui/bits";

/** The original inline story interaction, using the same durable gateway as /control. */
export function StoryControl({ onLock, onOperationalState }: {
  onLock: (valve: string | null) => void;
  onOperationalState: (state: SimState) => void;
}) {
  const { session, setSession } = useScenario();
  const [room, setRoom] = useState<OpsDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operatorId, setOperatorId] = useState("CR-07");
  const [pin, setPin] = useState("");
  const proposal = room?.proposals.at(-1);
  const applied = room?.config.closed.includes("V-04B") ?? false;
  const pending = proposal?.status === "PENDING_APPROVAL";
  const accept = useCallback((value: OpsDoc) => {
    setRoom(value);
    localStorage.setItem("aquagrid_story_ops_id", value.id);
    localStorage.setItem("aquagrid_ops_id", value.id);
    onOperationalState(value.state);
  }, [onOperationalState]);

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem("aquagrid_story_ops_id");
    if (saved) request<OpsDoc>("read", { scenario_id: saved }).then(value => {
      if (!cancelled) accept(value);
    }).catch(() => { if (!cancelled) setError("The saved story could not be loaded. Try loading it again or start a new demo."); });
    return () => { cancelled = true; };
  }, [accept]);

  useEffect(() => {
    onLock(pending && !applied ? proposal?.action.valve_id ?? null : null);
    return () => onLock(null);
  }, [pending, applied, proposal?.action.valve_id, onLock]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "The request failed. No change was applied."); }
    finally { setBusy(false); }
  }

  async function stage(valveId: "V-04A" | "V-04B") {
    await run(async () => {
      const current = room
        ? await request<OpsDoc>("read", { scenario_id: room.id })
        : await request<OpsDoc>("create_story", {});
      accept(current);
      accept(await request<OpsDoc>("stage", { scenario_id: current.id, version: current.version, kind: "valve", valve_id: valveId }));
    });
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api.login(operatorId, pin);
      setSession(result); setPin("");
      sessionStorage.setItem("aquagrid_ops_token", result.token);
      sessionStorage.setItem("aquagrid_ops_operator", result.operator.sub);
    });
  }

  async function approve() {
    if (!room || !proposal || !session) return;
    await run(async () => accept(await request<OpsDoc>("decision", {
      scenario_id: room.id, version: room.version, proposal_id: proposal.id, token: session.token, approve: true,
    })));
  }

  return <div className="space-y-5" aria-busy={busy}>
    {applied ? <Verdict kind="accepted" headline="V-04B closed in the simulation">
      The Harbour branch is isolated. Modeled leak loss is {room!.evidence.hydraulics.leak_m3h.toFixed(2)} m³/h and Sector 4 pressure is {room!.evidence.hydraulics.pressure_bar["SEC-04"].toFixed(2)} bar. The hospital stays supplied. No physical valve was touched.
    </Verdict> : <div className="rounded-lg border border-[var(--color-line)] p-4">
      <p className="text-[13px] text-[var(--color-muted)]">The network analyst suggests</p>
      <p className="mt-1 text-[1.0625rem] font-[620] leading-snug">Close the Harbour branch valve V-04B to isolate the leak while keeping the rest of Sector 4 supplied.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => stage("V-04B")}>Stage the valve change</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => stage("V-04A")}>What if it closed V-04A instead?</button>
      </div>
    </div>}

    {proposal && !applied && <div className="space-y-3">
      <Verdict kind={proposal.status === "BLOCKED_BY_SAFETY" ? "rejected" : "locked"}
        headline={pending ? "HUMAN AUTHORIZATION REQUIRED" : proposal.status.replaceAll("_", " ")}>
        {pending ? `Closing ${proposal.action.valve_id} passes the safety checks. The valve stays open until a Control-Room Operator approves.` : "This proposal cannot execute. Review its checks; refresh evidence and stage again if the record has expired."}
      </Verdict>
      <ul className="space-y-2 text-[14px]" aria-label="Inline valve safety checks">
        {proposal.safety.checks.map(check => <li key={check.id} className="flex items-start gap-2"><span className={check.passed ? "text-[#62d5a1]" : "text-[#ff9297]"}>{check.passed ? "✓" : "×"}</span><span>{check.detail}</span></li>)}
      </ul>
    </div>}

    {pending && !applied && <div className="rounded-lg bg-[var(--color-mist)] p-4">
      {session ? <div className="space-y-3">
        <p>Signed in as <strong>{session.operator.name}</strong> ({session.operator.sub}).</p>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={approve}>Approve and close V-04B</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setSession(null); sessionStorage.removeItem("aquagrid_ops_token"); sessionStorage.removeItem("aquagrid_ops_operator"); }}>Sign out</button></div>
      </div> : <form onSubmit={signIn} className="space-y-3">
        <h4 className="font-[680]">Operator sign-in</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px]">Operator ID<input aria-label="Story operator ID" value={operatorId} onChange={event => setOperatorId(event.target.value)} autoComplete="username" className="mt-1 block w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[15px]" required /></label>
          <label className="text-[13px]">PIN<input aria-label="Story operator PIN" value={pin} onChange={event => setPin(event.target.value)} type="password" inputMode="numeric" autoComplete="current-password" className="mt-1 block w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[15px]" required /></label>
        </div>
        <button type="submit" className="btn btn-blue btn-sm" disabled={busy || !pin}>Sign in</button>
        <p className="text-[12.5px] text-[var(--color-muted)]">Demo accounts: CR-07 / 2468 can approve. AN-02 / 1357 is an analyst and will be refused.</p>
      </form>}
    </div>}
    {error && <ErrorNote>{error}</ErrorNote>}
    {room && <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => accept(await request<OpsDoc>("read", { scenario_id: room.id })))}>Load saved decision</button>
      {session && !applied && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => accept(await request<OpsDoc>("event", { scenario_id: room.id, version: room.version, token: session.token, operation: "sample" })))}>Refresh evidence</button>}
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => accept(await request<OpsDoc>("create_story", {})))}>Start a new demo</button>
      <a href="/control" className="btn btn-ghost btn-sm">Inspect saved decision in control room</a>
    </div>}
    <p className="text-[13px] text-[var(--color-muted)]">Simulation only. Staging creates a saved copy of the 14:00 disruption. Approval uses the same safety gateway and audit history as the control room.</p>
  </div>;
}
