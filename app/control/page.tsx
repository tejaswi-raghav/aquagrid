"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type Evaluation } from "@/lib/api";
import { useScenario } from "@/components/ScenarioController";
import { NetworkTwin } from "@/components/control/NetworkTwin";
import { SiteHeader } from "@/components/sections/SiteChrome";
import { Authority, ErrorNote, Verdict } from "@/components/ui/bits";
import { LineChart, SERIES } from "@/components/ui/LineChart";

const PLAN_COLORS = [SERIES.reference, SERIES.s1, SERIES.s3];
const SHORT: Record<string, string> = { baseline: "Baseline", shift: "Shift off-peak", peak_throttle: "Peak throttling" };

function Plans() {
  const { ctx, log } = useScenario();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(1);
  useEffect(() => {
    api.evaluate(ctx, ["baseline", "shift", "peak_throttle"]).then((r) => { setEv(r); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "The simulation engine can't be reached."));
  }, [ctx]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!ev) return <p className="text-[var(--color-muted)]">Evaluating plans…</p>;
  const p = ev.results[pick];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <LineChart
        title="Projected combined storage, %"
        x={ev.baseline.hours} unit="%" yMin={20} yMax={75}
        series={ev.results.map((r, i) => ({ name: SHORT[r.plan_id] ?? r.plan_name, values: r.levels_pct, color: PLAN_COLORS[i], dashed: i === 0 }))}
        thresholds={[{ value: ev.assumptions.floor_pct, label: `${ev.assumptions.floor_pct}% floor`, color: "#d33a3f", dashed: false }]}
        band={[0, 6]} bandLabel="Peak tariff" format={(v) => v.toFixed(1)} height={260}
      />
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Plan" className="flex flex-wrap gap-1.5">
          {ev.results.map((r, i) => (
            <button key={r.plan_id} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)}
              className={`rounded-full border px-3 py-1.5 text-[13.5px] font-[620] ${pick === i ? "border-[var(--color-yellow)] bg-[var(--color-yellow)] text-black" : "border-[var(--color-line)]"}`}>
              {r.plan_name}
            </button>
          ))}
        </div>
        <Verdict kind={p.verdict === "REJECTED" ? "rejected" : p.verdict === "HOLD" ? "hold" : "accepted"} headline={p.headline}>
          Lowest storage {p.min_level_pct}% at {p.min_level_at}. Electricity ${p.cost_usd.toLocaleString()}
          {p.savings_vs_baseline_usd ? `, $${p.savings_vs_baseline_usd.toLocaleString()} less than baseline` : ""}.
        </Verdict>
        <ul className="space-y-1 text-[14px]">
          {p.constraints.map((c) => <li key={c.id}>{c.passed ? "✓" : c.severity === "advisory" ? "!" : "×"} {c.label}</li>)}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => log({ kind: p.verdict === "REJECTED" ? "rejection" : "decision", title: `${p.plan_name} evaluated`, detail: `${p.verdict}: minimum ${p.min_level_pct}%, cost $${p.cost_usd}.` })}>
          Record this evaluation
        </button>
        <Authority text={`${ev.engine}. Loss in projection: ${ev.assumptions.modelled_loss_m3h} m³/h.`} />
      </div>
    </div>
  );
}

export default function ControlRoom() {
  const { state, scene, setScene, activity, reset, offline, retry, quarantined, valveRecords } = useScenario();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), scene, quarantined, valve_records: valveRecords, activity, state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "aquagrid-session.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-24 pt-24 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="type-h2">Control room</h1>
            <p className="measure mt-3 text-[1.0625rem] leading-relaxed">The whole network as the operators see it. Move through the afternoon, inspect any asset, and trace where its water comes from.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Scenario time" className="flex flex-wrap gap-1 rounded-full bg-[var(--color-mist)] p-1">
              {(state?.scenes ?? []).map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={scene === s.id} title={s.title} onClick={() => setScene(s.id)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-[640] ${scene === s.id ? "bg-[var(--color-yellow)] text-black" : "hover:bg-[var(--color-paper)]"}`}>
                  {s.clock}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset to 13:00</button>
          </div>
        </div>

        {offline && (
          <div className="mt-6 rounded-lg bg-[var(--color-red-pale)] p-4">
            <p className="font-[680]">The simulation engine isn’t responding.</p>
            <p className="mt-1 text-[14.5px]">Start it with <code>npm run dev:api</code> and try again.</p>
            <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={retry}>Try again</button>
          </div>
        )}

        <div className="mt-8"><NetworkTwin /></div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="alerts-title">
            <h2 id="alerts-title" className="type-h3">Alerts at {state?.scene.clock ?? "—"}</h2>
            {state && state.alerts.length === 0 && <p className="mt-3 text-[var(--color-muted)]">No open alerts. The network is at baseline.</p>}
            <ul className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
              {state?.alerts.map((a) => (
                <li key={a.id} className="flex gap-3 py-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.severity === "critical" ? "#d33a3f" : a.severity === "warning" ? "#e8892b" : "#2f7fd0" }} aria-hidden="true" />
                  <div><p className="font-[660]">{a.title} <span className="font-[400] text-[var(--color-muted)]">{a.raised_at}</span></p><p className="text-[14.5px]">{a.detail}</p></div>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="activity-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="activity-title" className="type-h3">Activity this session</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={exportJson}>Export session JSON</button>
            </div>
            {activity.length === 0 && <p className="mt-3 text-[var(--color-muted)]">Nothing recorded yet. Cross-checks, evaluations and approvals appear here.</p>}
            <ul className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
              {activity.map((a, i) => (
                <li key={i} className="py-3">
                  <p className="font-[660]">{a.title} <span className="font-[400] text-[var(--color-muted)]">{a.clock}</span></p>
                  <p className="text-[14.5px]">{a.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">Kept in this browser tab only. Not a tamper-proof operational log.</p>
          </section>
        </div>

        <section aria-labelledby="plans-title" className="mt-14">
          <h2 id="plans-title" className="type-h3">Production plans for the evening</h2>
          <p className="measure mb-5 mt-2 text-[15px]">Three schedules for 14:00 to midnight, evaluated by the simulation engine in the conditions you’ve selected above.</p>
          <Plans />
        </section>
      </main>
    </>
  );
}
