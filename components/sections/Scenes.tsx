"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type DesalModel, type Evaluation, type SensorAnalysis, type SimState, type StageResult } from "@/lib/api";
import { useScenario } from "@/components/ScenarioController";
import { Authority, CheckList, ErrorNote, Figure, StatusChip, Verdict } from "@/components/ui/bits";
import { LineChart, SERIES } from "@/components/ui/LineChart";

const money = (v: number) => `$${Math.round(v).toLocaleString()}`;

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="measure text-[1.0625rem] leading-relaxed">{children}</p>;
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-[var(--color-blue)] bg-[var(--color-mist)] px-4 py-3">
      <p className="text-[14.5px] font-[680]">{title}</p>
      <p className="mt-1 text-[14.5px] leading-relaxed">{children}</p>
    </div>
  );
}

/* 1 ─ Normal operations */
export function SceneNormal({ s }: { s: SimState }) {
  const sensors = Object.values(s.sensors);
  const normal = sensors.filter((x) => x.status === "normal").length;
  return (
    <>
      <Lead>
        At 13:00 the system is in balance. The plant makes more water than the city uses, and the surplus tops up storage.
        Every sensor agrees with its neighbours.
      </Lead>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Figure label="Production" value={s.production.m3h} unit="m³/h" />
        <Figure label="Demand" value={s.demand_m3h} unit="m³/h" />
        <Figure label="Storage" value={s.storage.pct.toFixed(1)} unit="%" />
        <Figure label="Tariff" value={`$${s.tariff.current_usd_kwh.toFixed(2)}`} unit="/kWh" />
      </div>
      <p className="text-[14.5px]"><span className="font-[640]">{normal} of {sensors.length}</span> sensors reporting normally. No open alerts.</p>
    </>
  );
}

/* 2 ─ Tariff spike */
export function SceneTariff({ s }: { s: SimState }) {
  const [desal, setDesal] = useState<DesalModel | null>(null);
  useEffect(() => { api.desal(s.production.m3h).then(setDesal).catch(() => setDesal(null)); }, [s.production.m3h]);
  const hours = s.tariff.schedule.map((h) => h.hour);
  const peakStart = hours.indexOf(s.tariff.peak_window[0]);
  const peakEnd = hours.indexOf(s.tariff.peak_window[1]);
  return (
    <>
      <Lead>
        At 14:00 electricity jumps to the peak tariff. Desalination is the city’s largest single electrical load, so the
        cost of every cubic metre jumps with it. Operators are under pressure to make less water until the peak ends.
      </Lead>
      <LineChart
        title="Electricity tariff through the day"
        x={hours} unit="$/kWh" step yMin={0} yMax={0.4}
        series={[{ name: "Tariff", values: s.tariff.schedule.map((h) => h.usd_kwh), color: SERIES.s1 }]}
        band={[peakStart, peakEnd]} bandLabel="Peak" marker={hours.indexOf(s.scene.clock.slice(0, 2) + ":00")}
        format={(v) => v.toFixed(2)} height={190}
      />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Figure label="Plant load" value={s.production.power_kw.toLocaleString()} unit="kW" />
        <Figure label="Cost per hour now" value={money(s.production.cost_per_hour_usd)} emphasis />
        {desal && <Figure label="Same hour off-peak" value={money(desal.operating_point.cost_per_hour_offpeak_usd)} />}
      </div>
    </>
  );
}

/* 3 ─ Sector 4 leak */
export function SceneLeak({ s }: { s: SimState }) {
  const fm = s.sensors["FM-S4"], a = s.sensors["P-S4A"], b = s.sensors["P-S4B"], c = s.sensors["P-S3"];
  return (
    <>
      <Lead>
        At 14:02 a main breaks on the Harbour branch. More water now enters Sector 4 than its customers use, and the pressure at the
        sector junction falls. The two pressure sensors in Sector 4 disagree.
      </Lead>
      <LineChart
        title="Sector 4 inflow against expected demand"
        x={fm.series.map((p) => p.t)} unit="m³/h"
        series={[{ name: "Inflow FM-S4", values: fm.series.map((p) => p.v), color: SERIES.s1 }]}
        thresholds={s.evidence ? [{ value: s.evidence.flow_balance.expected_demand_m3h, label: "Expected", color: "#c1d2eb" }] : []}
        format={(v) => v.toFixed(0)} height={180}
      />
      <LineChart
        title="Pressure, last 30 minutes"
        x={a.series.map((p) => p.t)} unit="bar" yMin={1}
        series={[
          { name: "P-S4A junction", values: a.series.map((p) => p.v), color: SERIES.s1 },
          { name: "P-S4B harbour", values: b.series.map((p) => p.v), color: SERIES.s3 },
          { name: "P-S3 neighbour", values: c.series.map((p) => p.v), color: SERIES.s2 },
        ]}
        height={200}
      />
      {s.evidence && (
        <ul className="list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed">
          {s.evidence.lines_of_evidence.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {s.evidence && <Callout title="Why pressure alone isn’t proof">{s.evidence.caveat}</Callout>}
    </>
  );
}

/* 4 ─ Sensor flatline */
export function SceneFlatline({ s, active }: { s: SimState; active: boolean }) {
  const { ctx, setQuarantined, applyState, log, quarantined } = useScenario();
  const [analysis, setAnalysis] = useState<SensorAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = s.sensors["P-S4A"], b = s.sensors["P-S4B"];
  const isQ = quarantined.includes("P-S4B");

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.analyze(ctx, "P-S4B");
      setAnalysis(r);
      log({ kind: "info", title: "P-S4B cross-checked", detail: `${r.verdict}: ${r.summary}` });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Cross-check failed."); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (active && !analysis && !busy) void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active]);

  const quarantine = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.quarantine(ctx, "P-S4B");
      setQuarantined(r.quarantined); applyState(r.state);
      log({ kind: "decision", title: "P-S4B quarantined", detail: "Excluded from decisions until a field check. The leak evidence stands on flow balance and P-S4A." });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Quarantine failed."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Lead>
        Pressure sensor B on the Harbour branch has reported exactly 3.80 bar since 13:53. If operators trusted it, the leak would look
        like a false alarm. The engine checks it against its neighbours and the flow balance before anyone acts on it.
      </Lead>
      <LineChart
        title="P-S4B against P-S4A"
        x={b.series.map((p) => p.t)} unit="bar" yMin={1}
        series={[
          { name: "P-S4B flat", values: b.series.map((p) => p.v), color: SERIES.s3 },
          { name: "P-S4A", values: a.series.map((p) => p.v), color: SERIES.s1 },
        ]}
        height={190}
      />
      {analysis && (
        <div className="space-y-3">
          <CheckList checks={analysis.checks.map((c) => ({ ...c, passed: !c.fault_indicated }))} />
          <p className="text-[14.5px] leading-relaxed"><span className="font-[680]">{analysis.verdict === "UNRELIABLE" ? "Unreliable." : analysis.verdict === "SUSPECT" ? "Suspect." : "Plausible."}</span> {analysis.summary}</p>
          <p className="text-[13px] text-[var(--color-muted)]">{analysis.note}</p>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy}>Run the cross-check again</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={quarantine} disabled={busy || isQ || !analysis?.quarantine_recommended}>
          {isQ ? "P-S4B quarantined" : "Quarantine P-S4B"}
        </button>
      </div>
      <Authority text={`Cross-check computed by the simulation engine at ${analysis?.clock ?? s.scene.clock}`} />
    </>
  );
}

/* 5 ─ Algal bloom */
export function SceneBloom({ s }: { s: SimState }) {
  const chl = s.sensors["CHL-01"];
  const points = ["CHL-01", "TURB-01", "SDI-01", "COND-01"].map((id) => s.sensors[id]);
  return (
    <>
      <Lead>
        Chlorophyll-a at the offshore intake has crossed its warning level, and turbidity is rising behind it. An algal bloom is drifting
        toward the intake.
      </Lead>
      <LineChart
        title="Chlorophyll-a at the intake"
        x={chl.series.map((p) => p.t)} unit="µg/L" yMin={0}
        series={[{ name: "CHL-01", values: chl.series.map((p) => p.v), color: SERIES.s2 }]}
        thresholds={[{ value: chl.thresholds.warning ?? 7, label: "Warning", color: "#e8892b" }]}
        height={180}
      />
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Monitoring points affected by the bloom</caption>
        <thead className="text-[12.5px] text-[var(--color-muted)]"><tr><th className="py-1 font-[560]">Monitoring point</th><th className="font-[560]">Reading</th><th className="font-[560]">Status</th></tr></thead>
        <tbody className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {points.map((p) => (
            <tr key={p.id}>
              <td className="py-2 pr-2">{p.label}<span className="block text-[12px] text-[var(--color-muted)]">{p.id}</span></td>
              <td className="pr-2 font-[640]">{p.value} {p.unit}</td>
              <td><StatusChip status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Callout title="A warning about the source, not a verdict on the tap">
        Reverse osmosis is a strong barrier and product conductivity is in specification. That does not prove the drinking water is
        unaffected: algal toxins and taste-and-odour compounds need laboratory sampling. Until a water-quality specialist reviews the
        results, any change to production is held for human review.
      </Callout>
    </>
  );
}

/* 6 ─ The unsafe decision */
export function SceneDecision({ s, active, onProjection }: { s: SimState; active: boolean; onProjection: (pct: number | null) => void }) {
  const { ctx, log } = useScenario();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show3d, setShow3d] = useState(true);

  const evaluate = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.evaluate(ctx, ["baseline", "peak_throttle"]);
      setEv(r);
      const p = r.results[1];
      log({ kind: p.verdict === "REJECTED" ? "rejection" : "decision", title: `Peak throttling ${p.verdict.toLowerCase()} by the safety engine`, detail: `Minimum storage ${p.min_level_pct}% against a ${p.floor_pct}% floor.` });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Evaluation failed."); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (active && !ev && !busy) void evaluate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active]);
  useEffect(() => { onProjection(active && show3d && ev ? ev.results[1].min_level_pct : null); }, [active, show3d, ev, onProjection]);

  const p = ev?.results[1];
  const alt = ev?.safe_alternative;
  return (
    <>
      {s.proposal && (
        <div className="rounded-lg border border-[var(--color-line)] p-4">
          <p className="text-[13px] text-[var(--color-muted)]">{s.proposal.proposed_by} proposes</p>
          <p className="mt-1 text-[1.0625rem] font-[620] leading-snug">{s.proposal.text}</p>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {p && ev && (
        <>
          <Verdict kind={p.verdict === "REJECTED" ? "rejected" : p.verdict === "HOLD" ? "hold" : "accepted"} headline={p.headline}>
            {p.breach_at
              ? <>Storage would cross the {p.floor_pct}% floor at {p.breach_at} and reach {p.min_level_pct}% by {p.min_level_at}. The engine rejects the plan whatever it saves.</>
              : <>Minimum storage {p.min_level_pct}% at {p.min_level_at}.</>}
          </Verdict>
          <LineChart
            title="Projected combined storage"
            x={p.hours} unit="%" yMin={20} yMax={70}
            series={[
              { name: "Baseline", values: ev.baseline.levels_pct, color: SERIES.reference, dashed: true },
              { name: "Peak throttling", values: p.levels_pct, color: SERIES.s1 },
            ]}
            thresholds={[{ value: p.floor_pct, label: `${p.floor_pct}% floor`, color: "#d33a3f", dashed: false }]}
            band={[0, 6]} bandLabel="Peak tariff" format={(v) => v.toFixed(1)} height={220}
          />
          <div className="grid grid-cols-2 gap-5">
            <Figure label="Saving the AI was chasing" value={money(p.savings_vs_baseline_usd ?? 0)} />
            <Figure label="Lowest storage" value={p.min_level_pct.toFixed(1)} unit="%" emphasis />
          </div>
          <CheckList checks={p.constraints} />
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={show3d} onChange={(e) => setShow3d(e.target.checked)} className="h-4 w-4 accent-black" />
            Show the projected minimum in the 3D reservoirs
          </label>
          {alt && (
            <div className="rounded-lg bg-[var(--color-mist)] p-4">
              <p className="text-[14.5px] font-[680]">The engine’s own alternative</p>
              <p className="mt-1 text-[14.5px] leading-relaxed">
                Hold {alt.peak_production_m3h} m³/h through the peak and recover at full output afterwards: storage bottoms out at{" "}
                {alt.evaluation.min_level_pct}% and saves {money(alt.evaluation.savings_vs_baseline_usd ?? 0)}.{" "}
                {alt.evaluation.verdict === "HOLD" ? "It still waits for the water-quality review before anyone schedules it." : ""}
              </p>
            </div>
          )}
          <Authority text={`Evaluated by ${ev.engine}. The browser only displays the result.`} />
        </>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={evaluate} disabled={busy}>{busy ? "Evaluating…" : "Evaluate again"}</button>
    </>
  );
}

/* 7 ─ Human control */
export function SceneControl({ s, onLock }: { s: SimState; onLock: (valve: string | null) => void }) {
  const { ctx, session, setSession, addValveRecord, applyState, log } = useScenario();
  const [staged, setStaged] = useState<StageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opId, setOpId] = useState("CR-07");
  const [pin, setPin] = useState("");
  const applied = s.valves["V-04B"]?.position === "closed";

  useEffect(() => {
    onLock(staged?.proposal && !applied ? staged.proposal.valve_id : null);
  }, [staged, applied, onLock]);

  const stage = async (valve: "V-04A" | "V-04B", by: string) => {
    setBusy(true); setError(null);
    try {
      const r = await api.stage(ctx, valve, "close", by);
      setStaged(r);
      log({ kind: r.evaluation.verdict === "REJECTED" ? "rejection" : "decision", title: `Close ${valve} ${r.evaluation.verdict === "REJECTED" ? "rejected" : "staged and locked"}`, detail: r.evaluation.headline });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Staging failed."); }
    finally { setBusy(false); }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.login(opId, pin);
      setSession(r); setPin("");
      log({ kind: "info", title: `${r.operator.name} signed in`, detail: `Role: ${r.operator.role.replace(/_/g, " ")}` });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!staged?.proposal || !staged.signature || !session) return;
    setBusy(true); setError(null);
    try {
      const r = await api.approve(ctx, staged.proposal, staged.signature, session.token);
      addValveRecord({ record: r.record, signature: r.signature });
      applyState(r.state);
      log({ kind: "approval", title: `V-04B closed by ${r.operator.name}`, detail: "Backend revalidated the proposal before applying it to the simulated valve." });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Approval failed.");
      if (e instanceof ApiError && e.status === 403) log({ kind: "rejection", title: "Approval refused", detail: e.message });
    } finally { setBusy(false); }
  };

  const ev = staged?.evaluation;
  const canApprove = !!staged?.proposal && !!session && !applied;
  return (
    <>
      {applied ? (
        <Verdict kind="accepted" headline="V-04B closed in the simulation">
          The Harbour branch is isolated, modelled leak loss is {s.leak.modelled_loss_m3h} m³/h and Sector 4 pressure is back to{" "}
          {s.sensors["P-S4A"].value} bar. The hospital stays supplied. No physical valve was touched.
        </Verdict>
      ) : s.staged_suggestion && (
        <div className="rounded-lg border border-[var(--color-line)] p-4">
          <p className="text-[13px] text-[var(--color-muted)]">{s.staged_suggestion.proposed_by} suggests</p>
          <p className="mt-1 text-[1.0625rem] font-[620] leading-snug">{s.staged_suggestion.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => stage("V-04B", s.staged_suggestion!.proposed_by)}>Stage the valve change</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => stage("V-04A", "What-if: close the sector inlet")}>What if it closed V-04A instead?</button>
          </div>
        </div>
      )}

      {ev && !applied && (
        <div className="space-y-3">
          <Verdict kind={ev.verdict === "REJECTED" ? "rejected" : "locked"} headline={ev.headline}>
            {ev.verdict === "REJECTED"
              ? `Closing ${ev.valve_id} fails the safety checks. Nothing can be approved.`
              : `Closing ${ev.valve_id} passes every check, but the change stays locked until a Control-Room Operator approves it.`}
          </Verdict>
          <CheckList checks={ev.checks} />
        </div>
      )}

      {staged?.proposal && !applied && (
        <div className="rounded-lg bg-[var(--color-mist)] p-4">
          {session ? (
            <div className="space-y-3">
              <p className="text-[14.5px]">Signed in as <span className="font-[680]">{session.operator.name}</span> ({session.operator.sub}).</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={approve} disabled={!canApprove || busy}>Approve and close V-04B</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSession(null)}>Sign out</button>
              </div>
            </div>
          ) : (
            <form onSubmit={signIn} className="space-y-3">
              <p className="text-[14.5px] font-[680]">Operator sign-in</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[13px]">Operator ID
                  <input value={opId} onChange={(e) => setOpId(e.target.value)} autoComplete="username" className="mt-1 block w-full rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[15px]" />
                </label>
                <label className="text-[13px]">PIN
                  <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" className="mt-1 block w-full rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[15px]" />
                </label>
              </div>
              <button type="submit" className="btn btn-blue btn-sm" disabled={busy || !pin}>Sign in</button>
              <p className="text-[12.5px] text-[var(--color-muted)]">Demo accounts: CR-07 / 2468 can approve. AN-02 / 1357 is an analyst and will be refused.</p>
            </form>
          )}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <p className="text-[13px] text-[var(--color-muted)]">Simulation only. AquaGrid has no connection to any real valve, PLC or SCADA system.</p>
    </>
  );
}
