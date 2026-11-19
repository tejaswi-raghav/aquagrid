"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/sections/SiteChrome";
import { LineChart } from "@/components/ui/LineChart";
import { api } from "@/lib/api";
import { ASSET_NAMES } from "@/lib/assets";
import { request, type Comparison, type LabConfig, type OpsDoc, type Proposal } from "@/lib/operations";
import { NetworkTwin } from "./NetworkTwin";
import { SituationTwin } from "./SituationTwin";
import { Checks, DrillStepper, Heartbeat, Kpi, LiveClock, Pair, Panel, ReserveGauge, Toasts, type DrillStep, type Toast } from "./opsui";
import "./control.css";

const empty: LabConfig = { leak: 0, pump_failed: false, sensor: "healthy", demand_factor: 1, tariff_factor: 1, quality_warning: false, closed: [] };
const clock = (t: number) => new Date(t * 1000).toLocaleString();
const num = (n: number) => n.toFixed(1);
const HOURS = ["14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "00"];
const C = { blue: "#62a7ea", yellow: "#fff44f", ref: "#8fa3c7", red: "#ff6b6f", amber: "#f0a24a" };

type Mode = "monitor" | "investigate" | "decide";
const MODES: [Mode, string, string][] = [
  ["monitor", "Monitor", "See the network and what's wrong"],
  ["investigate", "Investigate", "Test evidence and what-ifs"],
  ["decide", "Decide", "Check safety, then authorize"],
];
const TOOLS: Record<Mode, [string, string][]> = {
  monitor: [["evidence", "Operational brief"], ["replay", "Decision replay"]],
  investigate: [["evidence", "Evidence inspector"], ["lab", "Scenario Lab"], ["impact", "Impact explorer"]],
  decide: [["plans", "Production planning"], ["queue", "Approval queue"], ["replay", "Decision replay"]],
};

export default function OperationsWorkspace() {
  const [doc, setDoc] = useState<OpsDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("monitor");
  const [tool, setTool] = useState("evidence");
  const [asset, setAsset] = useState("SEC-04");
  const [view, setView] = useState<"3d" | "map">("3d");
  const [config, setConfig] = useState<LabConfig>(empty);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [plan, setPlan] = useState("optimized");
  const [token, setToken] = useState("");
  const [operator, setOperator] = useState("");
  const [login, setLogin] = useState(false);
  const [pin, setPin] = useState("");
  const [id, setId] = useState("CR-07");
  const [review, setReview] = useState<Proposal | null>(null);
  const [replay, setReplay] = useState<Proposal | null>(null);
  const [denial, setDenial] = useState("");
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const detailRef = useRef<HTMLElement>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const tid = ++toastId.current;
    setToasts((x) => [...x.slice(-3), { ...t, id: tid }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== tid)), 5000);
  }, []);

  const accept = useCallback((d: OpsDoc) => { setDoc(d); localStorage.setItem("aquagrid_ops_id", d.id); }, []);

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem("aquagrid_ops_id");
    (saved ? request<OpsDoc>("read", { scenario_id: saved }) : request<OpsDoc>("create", {}))
      .then((d) => { if (!cancelled) { accept(d); setConfig(d.config); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    setToken(sessionStorage.getItem("aquagrid_ops_token") || "");
    setOperator(sessionStorage.getItem("aquagrid_ops_operator") || "");
    return () => { cancelled = true; };
  }, [accept]);

  // Drill progress counts what the operator actually opened after the disruption, not default tabs.
  const disruptedNow = !!doc && doc.state.alerts.length > 0;
  const mark = useCallback((k: string) => { if (disruptedNow) setVisited((v) => (v[k] ? v : { ...v, [k]: true })); }, [disruptedNow]);
  useEffect(() => { if (asset === "P-S4B") mark("sensor"); }, [asset, mark]);

  const refresh = async () => { if (doc) accept(await request<OpsDoc>("read", { scenario_id: doc.id })); };
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "Operation failed";
      setError(msg); toast({ tone: "danger", title: "Not applied", detail: msg });
    } finally { setBusy(false); }
  }
  const command = () => ({ scenario_id: doc!.id, version: doc!.version, token });
  const needSignIn = () => { if (!token) { setLogin(true); toast({ tone: "info", title: "Operator sign-in required", detail: "Changes to the scenario go through an authorized operator." }); return true; } return false; };

  const EVENT_COPY: Record<string, [string, string]> = {
    compound: ["14:00 disruption triggered", "Tariff spike, Sector 4 leak, frozen sensor and bloom warning are now live."],
    sample: ["Telemetry refreshed", "New synchronized sample from every sensor."],
    reset: ["Scenario reset", "Network back to baseline. Decisions remain in the replay."],
    quarantine: ["Sensor quarantined", "P-S4B is excluded from decisions until a field check."],
  };
  async function event(operation: string) {
    if (needSignIn()) return;
    await run(async () => {
      accept(await request<OpsDoc>("event", { ...command(), operation }));
      setComparison(null);
      const [title, detail] = EVENT_COPY[operation] ?? ["Updated", ""];
      toast({ tone: operation === "compound" ? "danger" : "success", title, detail });
      if (operation === "compound") setAsset("P-S4A");
    });
  }
  async function stage(kind: string, extra: Record<string, unknown> = {}) {
    await run(async () => {
      const d = await request<OpsDoc>("stage", { ...command(), kind, ...extra });
      accept(d); setMode("decide"); setTool("queue");
      const p = d.proposals[d.proposals.length - 1];
      toast(p?.status === "BLOCKED_BY_SAFETY"
        ? { tone: "danger", title: "Blocked by safety checks", detail: "Recorded with its evidence. It cannot be approved." }
        : { tone: "info", title: "Proposal staged and locked", detail: "Waiting for operator approval." });
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  async function decide(p: Proposal, approve: boolean) {
    await run(async () => {
      const result = await request<OpsDoc>("decision", { ...command(), proposal_id: p.id, approve });
      accept(result); setReview(null);
      setReplay(result.proposals.find((x) => x.id === p.id) || null);
      toast(approve ? { tone: "success", title: "Approved and executed in simulation", detail: "The backend re-checked every constraint before committing." } : { tone: "info", title: "Proposal rejected" });
    });
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const r = await api.login(id, pin);
      setToken(r.token); setOperator(r.operator.sub);
      sessionStorage.setItem("aquagrid_ops_token", r.token);
      sessionStorage.setItem("aquagrid_ops_operator", r.operator.sub);
      setPin(""); setLogin(false);
      toast({ tone: "success", title: `Signed in as ${r.operator.sub}`, detail: r.operator.role.replace(/_/g, " ") });
    });
  }
  const signOut = () => { setToken(""); setOperator(""); sessionStorage.removeItem("aquagrid_ops_token"); sessionStorage.removeItem("aquagrid_ops_operator"); };
  const changeConfig = (value: LabConfig) => { setConfig(value); setComparison(null); };
  const go = (m: Mode, t: string, a?: string) => { setMode(m); setTool(t); mark(t); if (a) setAsset(a); detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const selected = doc?.topology.assets.find((a) => a.id === asset);
  const hydraulicAsset = doc?.topology.hydraulic_assets.find((a) => a.id === asset);
  const sensor = doc?.state.sensors[asset];
  const selectedProposal = review || replay;
  const selectedPlan = doc?.plans[plan] || doc?.plans.baseline;
  const pending = doc?.proposals.filter((p) => p.status === "PENDING_APPROVAL") ?? [];
  const lockedValve = pending.find((p) => p.action.kind === "valve")?.action.valve_id ?? null;

  const steps: DrillStep[] = useMemo(() => {
    if (!doc) return [];
    const disrupted = doc.state.alerts.length > 0 || doc.audit.some((a) => a.kind.includes("compound"));
    return [
      { key: "trigger", title: "Trigger the 14:00 disruption", detail: "Four problems arrive at once", done: disrupted, onGo: () => { if (!disrupted) void event("compound"); else go("monitor", "evidence"); } },
      { key: "evidence", title: "Read the leak evidence", detail: "Flow balance, not pressure alone", done: !!visited.evidence && disrupted, onGo: () => go("investigate", "evidence", "P-S4A") },
      { key: "sensor", title: "Inspect the frozen sensor", detail: "P-S4B stopped moving, so it's excluded", done: !!visited.sensor, onGo: () => go("investigate", "evidence", "P-S4B") },
      { key: "plan", title: "Compare production plans", detail: "Savings never beat the 35% floor", done: !!visited.plans, onGo: () => go("decide", "plans", "RES-02") },
      { key: "stage", title: "Stage a valve isolation", detail: "AI proposes, nothing moves yet", done: doc.proposals.some((p) => p.action.kind === "valve"), onGo: () => { setAsset("V-04B"); setMode("investigate"); setTool("impact"); } },
      { key: "approve", title: "Approve as an operator", detail: "Human sign-off, server re-check", done: doc.proposals.some((p) => p.status === "EXECUTED_IN_SIMULATION"), onGo: () => go("decide", "queue") },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, visited]);

  const exportReport = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "aquagrid-decision-report.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const h = doc?.evidence.hydraulics;
  return (
    <div className="ops-shell">
      <header className="ops-header">
        <a href="/" aria-label="AquaGrid home"><Logo /></a>
        <div className="ops-title">
          <strong>Control room</strong>
          <span>Coastal water authority, simulation</span>
        </div>
        <div className="ops-live">
          <Heartbeat live={!!doc && !error} />
          <span className={`ops-conn ${doc && !error ? "ok" : "down"}`}>{doc && !error ? (busy ? "Working…" : "Backend live") : error ? "Backend unavailable" : "Connecting"}</span>
          <LiveClock />
        </div>
        <nav className="ops-header-actions">
          <a href="/">Story</a>
          <a href="/plant">Plant</a>
          <button type="button" className={token ? "ghost" : "primary"} onClick={() => (token ? signOut() : setLogin(true))}>
            {token ? `${operator}, sign out` : "Operator sign in"}
          </button>
        </nav>
      </header>

      <section className="ops-hero">
        <div className="ops-hero-copy">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            See it. Prove it. <span className="hl">Then decide.</span>
          </motion.h1>
          <p>
            This is where AquaGrid’s operators work. Every number comes from the Python backend, which runs an EPANET hydraulic model.
            AI can propose changes, but nothing touches the network until a signed-in operator approves and the server re-checks safety.
          </p>
          <div className="ops-actions">
            <button type="button" className="primary big" disabled={!doc || busy} onClick={() => event("compound")}>Trigger 14:00 disruption</button>
            <button type="button" disabled={!doc || busy} onClick={() => event("sample")}>Refresh telemetry</button>
            <button type="button" disabled={!doc || busy} onClick={() => event("reset")}>Reset scenario</button>
            <button type="button" disabled={!doc} onClick={exportReport}>Export report</button>
          </div>
        </div>
        {doc && <DrillStepper steps={steps} />}
      </section>

      {error && !doc && (
        <div role="alert" className="ops-error">
          {error}
          <button type="button" disabled={busy} onClick={() => run(async () => accept(await request<OpsDoc>("create", {})))}>Create a new scenario</button>
        </div>
      )}

      {!doc ? (
        <div className="ops-loading" aria-busy="true">
          <div className="skeleton-row">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton" />)}</div>
          <div className="skeleton big" />
          <p>{error ? "The backend is unavailable. No operational actions can execute." : "Loading the saved scenario and solving the hydraulic model…"}</p>
        </div>
      ) : (
        <>
          <div className="ops-kpis">
            <Kpi label="Production" value={doc.production[0]} unit="m³/h" tone={doc.production[0] < doc.evidence.hydraulics.expected_m3h ? "warning" : "normal"}>
              <span className="kpi-sub">Desalination output now</span>
            </Kpi>
            <Kpi label="Demand" value={h!.expected_m3h} unit="m³/h"><span className="kpi-sub">What the city is drawing</span></Kpi>
            <Kpi label="Reserve" value={doc.storage_pct} unit="%" tone={doc.storage_pct < 35 ? "critical" : doc.storage_pct < 43 ? "warning" : "normal"}>
              <ReserveGauge pct={doc.storage_pct} />
            </Kpi>
            <Kpi label="Leak loss" value={h!.leak_m3h} unit="m³/h" tone={h!.leak_m3h > 1 ? "critical" : "normal"}>
              <span className="kpi-sub">{h!.leak_m3h > 1 ? "Water lost underground" : "No modelled loss"}</span>
            </Kpi>
            <Kpi label="Unserved" value={h!.unserved_m3h} unit="m³/h" tone={h!.unserved_m3h > 1 ? "warning" : "normal"}>
              <span className="kpi-sub">Customers short of water</span>
            </Kpi>
            <Kpi label="Awaiting approval" value={pending.length} digits={0} tone={pending.length ? "attention" : "normal"}>
              <span className="kpi-sub">{pending.length ? "A human must decide" : "Nothing pending"}</span>
            </Kpi>
          </div>

          <div className="ops-meta">
            <span>Scenario {doc.id.slice(0, 8)}, version {doc.version}</span>
            <span>Sampled {clock(doc.sampled_at)}</span>
            <span>{doc.storage_backend === "private-blob-cas" ? "Saved to durable cloud storage" : "Saved to local SQLite"}</span>
            <span>Solver: {h!.solver}</span>
          </div>

          <div className="ops-workspace">
            <aside className="ops-incidents" aria-label="Incident queue">
              <h2>Incidents</h2>
              <AnimatePresence initial={false}>
                {doc.state.alerts.length ? doc.state.alerts.map((a, i) => (
                  <motion.button key={a.id} type="button" layout className={`incident ${a.severity} ${a.assets.includes(asset) ? "is-active" : ""}`}
                    initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ delay: i * 0.06 }}
                    onClick={() => { setAsset(a.assets[0]); setMode("investigate"); setTool("evidence"); mark("evidence"); }}>
                    <span className="incident-sev"><i aria-hidden="true" />{a.severity === "critical" ? "Critical" : a.severity === "warning" ? "Warning" : "Info"}<time>{a.raised_at}</time></span>
                    <strong>{a.title}</strong>
                    <small>{a.detail}</small>
                  </motion.button>
                )) : (
                  <motion.div key="calm" className="calm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span className="calm-ring" aria-hidden="true" />
                    <p><b>All clear.</b> The network is at baseline. Trigger the 14:00 disruption to start the drill.</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="ops-model-note">
                <h3>Model</h3>
                <p>WNTR / EPANET 2.2, pressure-driven demand. Synthetic geometry: pressures and flows are solved, not calibrated to a real utility.</p>
              </div>
            </aside>

            <section className="ops-stage" aria-label="Network view">
              <div className="ops-stage-head">
                <div>
                  <h2>Coast-to-city network</h2>
                  <p>Click any asset. {view === "3d" ? "The camera follows your selection." : "Drag to pan, search to filter."}</p>
                </div>
                <div className="seg" role="tablist" aria-label="View">
                  {(["3d", "map"] as const).map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                      {view === v && <motion.span layoutId="view-pill" className="seg-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <span>{v === "3d" ? "3D twin" : "Schematic"}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Both views stay mounted so the WebGL canvas is never torn down mid-render. */}
              <div className="stage-view" hidden={view !== "3d"}>
                <SituationTwin state={doc.state} selected={asset} onSelect={setAsset} lockedValve={lockedValve} active={view === "3d"} />
              </div>
              <div className="stage-view map-view" hidden={view !== "map"}>
                <NetworkTwin operationalState={doc.state} selectedAsset={asset} onAssetSelect={setAsset} hideInspector />
              </div>
            </section>

            <aside className="ops-inspector" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.div key={asset} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                  <span className="ops-overline">{selected?.type ?? "pipe"}, {asset}</span>
                  <h2>{ASSET_NAMES[asset] ?? selected?.name ?? asset}</h2>
                  <span className={`status-chip s-${doc.state.asset_status[asset] ?? "normal"}`}>{doc.state.asset_status[asset] ?? "normal"}</span>
                  {sensor && (
                    <>
                      <Pair label={sensor.label} value={`${num(sensor.value)} ${sensor.unit}`} />
                      <LineChart title="Last 30 samples" x={sensor.series.map((p) => p.t)} series={[{ name: asset, values: sensor.series.map((p) => p.v), color: sensor.status === "normal" ? C.blue : C.amber }]} unit={sensor.unit} height={150} />
                    </>
                  )}
                  {selected && !sensor && (
                    <>
                      <Pair label="Modelled inflow" value={num(doc.state.flows.filter((f) => f.to === asset).reduce((s, f) => s + f.m3h, 0)) + " m³/h"} />
                      <Pair label="Modelled outflow" value={num(doc.state.flows.filter((f) => f.from === asset).reduce((s, f) => s + f.m3h, 0)) + " m³/h"} />
                    </>
                  )}
                  {hydraulicAsset && (
                    <>
                      <Pair label="Solved pipe flow" value={num(h!.pipe_flow_m3h[asset] || 0) + " m³/h"} />
                      <Pair label="Hydraulic link" value={`${hydraulicAsset.from || "Source"} to ${hydraulicAsset.to || asset}`} />
                      {hydraulicAsset.length_m && <Pair label="Synthetic geometry" value={`${hydraulicAsset.length_m} m, ${hydraulicAsset.diameter_m} m diameter`} />}
                    </>
                  )}
                  {(asset.startsWith("SEC-") || asset === "BR-4H") && (
                    <>
                      <Pair label="EPANET pressure" value={`${num(h!.pressure_bar[asset] || 0)} bar`} />
                      <Pair label="Delivered demand" value={`${num(h!.delivered_m3h[asset] || 0)} m³/h`} />
                    </>
                  )}
                  {asset.startsWith("RES-") && <Pair label="Strategic storage" value={`${doc.storage_pct}%, floor 35%`} />}
                  {doc.state.valves[asset] && (
                    <div className="inspector-actions">
                      <Pair label="Current position" value={doc.state.valves[asset].position} />
                      <button type="button" disabled={busy} onClick={() => run(async () => {
                        const closed = doc.config.closed.includes(asset as "V-04A" | "V-04B") ? doc.config.closed.filter((x) => x !== asset) : [...doc.config.closed, asset as "V-04A" | "V-04B"];
                        setComparison(await request<Comparison>("preview", { ...command(), config: { ...doc.config, closed } }));
                        setMode("investigate"); setTool("impact");
                        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      })}>Evaluate valve impact</button>
                      <button type="button" className="primary" disabled={busy} onClick={() => stage("valve", { valve_id: asset })}>Stage valve proposal</button>
                    </div>
                  )}
                  <h3>Connected to</h3>
                  <div className="ops-connections">
                    {doc.topology.edges.filter((e) => e.from === asset || e.to === asset).map((e) => {
                      const other = e.from === asset ? e.to : e.from;
                      return <button type="button" key={other} onClick={() => setAsset(other)}>{other}</button>;
                    })}
                  </div>
                  <button type="button" className="link-btn" onClick={() => go("investigate", "evidence")}>Open the evidence inspector</button>
                </motion.div>
              </AnimatePresence>
            </aside>
          </div>

          <section className="ops-detail" ref={detailRef}>
            <div className="ops-modes" role="tablist" aria-label="Operator task">
              {MODES.map(([key, title, desc]) => (
                <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { const t = key === "decide" ? "plans" : "evidence"; setMode(key); setTool(t); mark(t); }}>
                  {mode === key && <motion.span layoutId="mode-pill" className="mode-pill" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  <b>{title}</b><span>{desc}</span>
                </button>
              ))}
            </div>
            <nav className="ops-tabs" aria-label="Tools">
              {TOOLS[mode].map(([key, title]) => (
                <button key={key} type="button" aria-pressed={tool === key} onClick={() => { setTool(key); mark(key); setComparison(null); }}>
                  {title}
                  {tool === key && <motion.span layoutId="tab-line" className="tab-line" />}
                </button>
              ))}
            </nav>

            <Panel id={`${mode}-${tool}`}>
              {tool === "evidence" && (
                <div className="ops-detail-grid">
                  <article>
                    <p className="ops-overline">Validate, then detect</p>
                    <h2>Independent evidence, one operational picture.</h2>
                    <div className={`verdict-band ${doc.evidence.leak.confirmed ? "bad" : "ok"}`}>
                      <span>Leak conclusion</span><strong>{doc.evidence.leak.classification.replace(/_/g, " ")}</strong>
                    </div>
                    <Pair label="Unexplained modelled flow" value={`${num(doc.evidence.leak.unexplained_m3h)} m³/h`} />
                    <Pair label="Sensor P-S4B" value={doc.evidence.sensor.classification} />
                    <Pair label="Rolling variance" value={doc.evidence.sensor.variance.toExponential(3) + " bar²"} />
                    <Pair label="Residual against independent junction" value={num(doc.evidence.sensor.difference_bar) + " bar"} />
                    <p>{doc.evidence.leak.rationale}</p>
                    <p className="ops-muted">{doc.evidence.sensor.uncertainty}</p>
                    <button type="button" className="primary" disabled={busy || doc.evidence.sensor.classification === "HEALTHY" || doc.quarantined.includes("P-S4B")} onClick={() => event("quarantine")}>
                      {doc.quarantined.includes("P-S4B") ? "P-S4B quarantined" : "Quarantine faulty channel"}
                    </button>
                  </article>
                  <article>
                    <LineChart title="P-S4B against independent P-S4A" x={doc.state.sensors["P-S4B"].series.map((p) => p.t)}
                      series={[{ name: "P-S4B", values: doc.evidence.sensor.samples, color: C.yellow }, { name: "P-S4A", values: doc.state.sensors["P-S4A"].series.map((p) => p.v), color: C.blue }]} unit="bar" height={230} />
                    <h3>Most likely pipe segments</h3>
                    {doc.evidence.leak.ranked_segments.slice(0, 3).map((p) => (
                      <button type="button" className="ops-ranked" key={p.asset_id} onClick={() => setAsset(p.asset_id)}>
                        <b>{p.rank}. {p.asset_id}</b><span>{p.reason}</span>
                      </button>
                    ))}
                    <p>{doc.evidence.leak.maintenance}</p>
                    <details>
                      <summary>Measurements, timestamp and model assumptions</summary>
                      <p>{clock(doc.evidence.measured_at)}</p>
                      {doc.evidence.assumptions.map((a) => <p key={a}>{a}</p>)}
                      <pre>{JSON.stringify(h!.pipe_flow_m3h, null, 2)}</pre>
                    </details>
                  </article>
                </div>
              )}

              {tool === "lab" && (
                <div className="ops-detail-grid">
                  <article>
                    <p className="ops-overline">Scenario Lab, candidate only</p>
                    <h2>Test a disruption before applying it.</h2>
                    <label>Harbour pipe leak: <b>{config.leak}</b> nominal m³/h
                      <input aria-label="Pipe leak injection" type="range" min="0" max="180" step="5" value={config.leak} onChange={(e) => changeConfig({ ...config, leak: +e.target.value })} />
                    </label>
                    <div className="two">
                      <label>Demand multiplier<input aria-label="Demand multiplier" type="number" min="0.8" max="1.8" step="0.1" value={config.demand_factor} onChange={(e) => changeConfig({ ...config, demand_factor: +e.target.value })} /></label>
                      <label>Tariff multiplier<input aria-label="Tariff multiplier" type="number" min="1" max="3" step="0.1" value={config.tariff_factor} onChange={(e) => changeConfig({ ...config, tariff_factor: +e.target.value })} /></label>
                    </div>
                    <label>P-S4B sensor mode
                      <select aria-label="P-S4B sensor mode" value={config.sensor} onChange={(e) => changeConfig({ ...config, sensor: e.target.value as LabConfig["sensor"] })}>
                        <option value="healthy">Healthy</option><option value="flatline">Flatline</option><option value="drift">Drift</option>
                      </select>
                    </label>
                    <label className="ops-checkbox"><input type="checkbox" checked={config.pump_failed} onChange={(e) => changeConfig({ ...config, pump_failed: e.target.checked })} />Transmission pump failure</label>
                    <label className="ops-checkbox"><input type="checkbox" checked={config.quality_warning} onChange={(e) => changeConfig({ ...config, quality_warning: e.target.checked })} />Intake-quality warning</label>
                    <div className="ops-actions">
                      <button type="button" className="primary" disabled={busy} onClick={() => run(async () => { setComparison(await request<Comparison>("preview", { ...command(), config })); toast({ tone: "info", title: "Candidate simulated", detail: "Nothing was applied." }); })}>Run candidate simulation</button>
                      <button type="button" disabled={busy || !comparison} onClick={() => stage("scenario", { config })}>Stage candidate for approval</button>
                    </div>
                    <p className="ops-muted">Preview never changes the applied scenario. Injecting these faults needs operator authorization through the same gateway.</p>
                  </article>
                  <article>
                    {comparison ? (
                      <>
                        <h3>Baseline against candidate</h3>
                        <Pair label="Leak change" value={`${num(comparison.comparison.loss_change_m3h)} m³/h`} />
                        <Pair label="Unserved-demand change" value={`${num(comparison.comparison.unserved_change_m3h)} m³/h`} />
                        <Pair label="Baseline loss, candidate loss" value={`${num(comparison.baseline.hydraulics.leak_m3h)}, ${num(comparison.candidate.hydraulics.leak_m3h)} m³/h`} />
                        <Pair label="Candidate sensor" value={comparison.candidate.sensor.classification} />
                        <LineChart title="Candidate storage under current production" x={HOURS} series={[{ name: "Candidate reserve", values: comparison.projection.levels, color: C.yellow }]} thresholds={[{ value: 35, label: "35% floor", color: C.red }]} unit="%" height={220} />
                        <Checks items={comparison.projection.checks} />
                      </>
                    ) : <EmptyHint text="Choose faults and run the candidate to compare hydraulic response, lost demand and the reservoir trajectory." />}
                  </article>
                </div>
              )}

              {tool === "impact" && (
                <div className="ops-detail-grid">
                  <article>
                    <p className="ops-overline">What happens if…</p>
                    <h2>Impact explorer</h2>
                    <p>Pick a valve, evaluate it, and see who loses water before anyone touches it.</p>
                    <div className="valve-pick">
                      <button type="button" aria-pressed={asset === "V-04B"} onClick={() => setAsset("V-04B")}><b>V-04B</b><span>Harbour branch, 140 connections</span></button>
                      <button type="button" aria-pressed={asset === "V-04A"} onClick={() => setAsset("V-04A")}><b>V-04A</b><span>Sector 4 inlet, includes the hospital</span></button>
                    </div>
                    {doc.state.valves[asset] && (
                      <div className="ops-actions">
                        <button type="button" className="primary" disabled={busy} onClick={() => run(async () => {
                          const closed = doc.config.closed.includes(asset as "V-04A" | "V-04B") ? doc.config.closed.filter((x) => x !== asset) : [...doc.config.closed, asset as "V-04A" | "V-04B"];
                          setComparison(await request<Comparison>("preview", { ...command(), config: { ...doc.config, closed } }));
                        })}>Evaluate {asset}</button>
                        <button type="button" disabled={busy} onClick={() => stage("valve", { valve_id: asset })}>Stage {asset} proposal</button>
                      </div>
                    )}
                    <p className="ops-muted">Reachability finds disconnected customers. EPANET then solves the remaining pressure and delivered demand. Neither is a calibrated forecast.</p>
                  </article>
                  <article>
                    {comparison ? (
                      <>
                        <h3>Modelled consequences</h3>
                        {Object.keys(comparison.candidate.hydraulics.pressure_bar).map((n) => (
                          <Pair key={n} label={`${n} pressure`} value={<PressureDelta a={comparison.baseline.hydraulics.pressure_bar[n]} b={comparison.candidate.hydraulics.pressure_bar[n]} />} />
                        ))}
                        <Pair label="Candidate unserved demand" value={num(comparison.candidate.hydraulics.unserved_m3h) + " m³/h"} />
                        <Pair label="Candidate reserve minimum" value={num(comparison.projection.minimum_pct) + "%"} />
                        <Pair label="Disconnected assets" value={comparison.graph_impact.isolated_nodes.join(", ") || "None"} />
                        <Pair label="Critical facilities disconnected" value={comparison.graph_impact.critical_facilities_without_supply.join(", ") || "None"} />
                        <Checks items={comparison.valve_safety?.checks || comparison.projection.checks} />
                      </>
                    ) : <EmptyHint text="No comparison yet. Evaluate a valve to see its consequences." />}
                  </article>
                </div>
              )}

              {tool === "plans" && selectedPlan && (
                <div className="ops-detail-grid">
                  <article>
                    <p className="ops-overline">Simulate, optimize, enforce safety</p>
                    <h2>Production planning</h2>
                    <p>A constrained optimizer searches schedules in 50 m³/h steps between 100 and 800 m³/h, keeping storage between 35% and 98% and ending no lower than it started. A feasible plan is still only a proposal.</p>
                    <div className="ops-plan-options">
                      {Object.keys(doc.plans).map((k) => (
                        <button type="button" key={k} aria-pressed={plan === k} onClick={() => setPlan(k)} className={doc.plans[k].eligible ? "" : "is-unsafe"}>
                          <b>{k === "optimized" ? "Optimized tariff plan" : k === "unsafe" ? "Unsafe peak throttle" : "Current schedule"}</b>
                          <span>{doc.plans[k].eligible ? `Lowest reserve ${num(doc.plans[k].minimum_pct)}%` : doc.plans[k].violation_hours.length ? "Breaches the 35% floor" : "Fails a safety check"}</span>
                        </button>
                      ))}
                    </div>
                    <LineChart title="Projected combined reserve" x={HOURS}
                      series={[{ name: "Current schedule", values: doc.plans.baseline.levels, color: C.ref, dashed: true }, { name: "Selected plan", values: selectedPlan.levels, color: selectedPlan.eligible ? C.yellow : C.red }]}
                      thresholds={[{ value: 35, label: "35% floor", color: C.red }]} unit="%" height={250} />
                    <LineChart title="Production and demand, m³/h" x={selectedPlan.rows.map((r) => r.hour)}
                      series={[{ name: "Production", values: selectedPlan.production, color: C.blue }, { name: "Demand", values: selectedPlan.rows.map((r) => r.demand_m3h), color: C.ref }]} height={170} />
                  </article>
                  <article>
                    <div className={`verdict-band ${selectedPlan.eligible ? "ok" : "bad"}`}>
                      <span>Safety engine</span><strong>{selectedPlan.eligible ? "Within constraints" : "Safety constraint violated"}</strong>
                    </div>
                    <LineChart title="Tariff feed, $/kWh" x={selectedPlan.rows.map((r) => r.hour)} series={[{ name: "Tariff", values: selectedPlan.rows.map((r) => r.tariff), color: C.amber }]} height={140} step />
                    <Pair label="Minimum reserve" value={num(selectedPlan.minimum_pct) + "%"} />
                    <Pair label="Calculated energy cost" value={"$" + selectedPlan.cost_usd.toFixed(2)} />
                    <Pair label="Difference from current plan" value={"$" + (doc.plans.baseline.cost_usd - selectedPlan.cost_usd).toFixed(2)} />
                    <Pair label="Hours below the floor" value={selectedPlan.violation_hours.join(", ") || "None"} />
                    <Checks items={selectedPlan.checks} />
                    <button type="button" className="primary" disabled={busy} onClick={() => stage("schedule", { plan })}>Stage selected schedule</button>
                    <p className="ops-muted">Blocked proposals are recorded with their evidence and failed checks, and cannot be approved. Tariff savings never override reserve or quality constraints.</p>
                  </article>
                </div>
              )}

              {tool === "queue" && (
                <div className="ops-queue">
                  <div className="ops-queue-head">
                    <div><p className="ops-overline">Human approval</p><h2>Control proposals</h2></div>
                    <button type="button" onClick={() => run(async () => { try { await request("actuate", command()); } catch (e) { setDenial(e instanceof Error ? e.message : "Direct access denied"); } })}>Test direct AI actuator denial</button>
                  </div>
                  {denial && <p className="ops-error inline">403: {denial}</p>}
                  <AnimatePresence initial={false}>
                    {doc.proposals.length ? doc.proposals.slice().reverse().map((p) => (
                      <motion.article layout className={`ops-proposal st-${p.status.toLowerCase()}`} key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div>
                          <span className={`ops-status ${p.status.toLowerCase()}`}>{p.status === "PENDING_APPROVAL" && <i aria-hidden="true" />}{p.status.replaceAll("_", " ").toLowerCase()}</span>
                          <h3>{p.action.kind === "valve" ? `${p.action.valve_id} to ${p.action.target}` : p.action.kind === "schedule" ? "Plant production schedule" : "Scenario Lab candidate"}</h3>
                          <p>{clock(p.created_at)}, proposed by {p.author}</p>
                        </div>
                        <div className="ops-proposal-actions">
                          <button type="button" onClick={() => { setReplay(p); setTool("replay"); }}>Evidence and replay</button>
                          {p.status === "PENDING_APPROVAL" && (
                            <>
                              <button type="button" className="primary" disabled={busy} onClick={() => (token ? setReview(p) : setLogin(true))}>Review approval</button>
                              <button type="button" disabled={busy} onClick={() => decide(p, false)}>Reject</button>
                            </>
                          )}
                        </div>
                      </motion.article>
                    )) : <EmptyHint text="No proposals yet. Stage a schedule, a valve action or a Scenario Lab candidate." />}
                  </AnimatePresence>
                </div>
              )}

              {tool === "replay" && (
                <div className="ops-detail-grid">
                  <article>
                    <h2>Decision replay</h2>
                    <p>Every saved decision with its inputs, checks, authorization and outcome. Replay is read-only and never re-runs a command.</p>
                    {doc.proposals.slice().reverse().map((p) => (
                      <button type="button" className="ops-ranked" key={p.id} aria-pressed={selectedProposal?.id === p.id} onClick={() => setReplay(p)}>
                        <b>{p.action.kind}: {p.status.replaceAll("_", " ").toLowerCase()}</b><span>{p.id.slice(0, 8)}, {clock(p.created_at)}</span>
                      </button>
                    ))}
                    <h3>Audit timeline</h3>
                    <ol className="ops-timeline">
                      {doc.audit.slice().reverse().map((a) => (
                        <li key={a.id}>
                          <details>
                            <summary><span>{a.kind.replaceAll("_", " ")}</span><time>{clock(a.at)}</time></summary>
                            <p>Actor: {a.actor}</p>
                            <pre>{JSON.stringify(a.data, null, 2)}</pre>
                          </details>
                        </li>
                      ))}
                    </ol>
                  </article>
                  <article>
                    {selectedProposal ? (
                      <>
                        <p className="ops-overline">{selectedProposal.id}</p>
                        <h3>{selectedProposal.status.replaceAll("_", " ").toLowerCase()}</h3>
                        <Checks items={selectedProposal.safety.checks} />
                        <Pair label="Authorizing operator" value={selectedProposal.approver || "Not authorized"} />
                        <Pair label="Saved outcome leak" value={selectedProposal.outcome ? num(selectedProposal.outcome.hydraulics.leak_m3h) + " m³/h" : "No execution"} />
                        <details open><summary>Input snapshot and action</summary><pre>{JSON.stringify({ input: selectedProposal.input, action: selectedProposal.action }, null, 2)}</pre></details>
                        <details><summary>Recorded sensor and hydraulic evidence</summary><pre>{JSON.stringify(selectedProposal.evidence, null, 2)}</pre></details>
                      </>
                    ) : <EmptyHint text="Select a saved decision to see what was known when it was made." />}
                  </article>
                </div>
              )}
            </Panel>
          </section>
          <footer className="ops-footer">Synthetic demonstration. WNTR/EPANET steady state, no real controllers. The audit persists with the scenario document; it is not a cryptographically immutable ledger.</footer>
        </>
      )}

      <AnimatePresence>
        {login && (
          <motion.div className="ops-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form className="ops-modal" onSubmit={signIn} initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
              <p className="ops-overline">Demo identity</p>
              <h2>Operator sign-in</h2>
              <p>CR-07 / 2468 is the demo control-room operator. AN-02 / 1357 is an analyst and can’t approve. Both control simulated assets only.</p>
              <label>Operator ID<input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required /></label>
              <label>PIN<input value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" type="password" inputMode="numeric" required /></label>
              {error && <p role="alert" className="ops-error inline">{error}</p>}
              <div className="ops-actions">
                <button disabled={busy} type="submit" className="primary">Sign in</button>
                <button type="button" onClick={() => setLogin(false)}>Cancel</button>
              </div>
            </motion.form>
          </motion.div>
        )}
        {review && (
          <motion.div className="ops-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="ops-modal" role="dialog" aria-modal="true" aria-label="Review simulated execution" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
              <p className="ops-overline">Human checkpoint</p>
              <h2>Authorize this simulated change?</h2>
              <p>{review.action.kind === "valve" ? `${review.action.valve_id} will become ${review.action.target}.` : review.action.kind === "schedule" ? "The plant schedule will change." : "The candidate faults will be injected into this demo scenario."}</p>
              <Checks items={review.safety.checks} />
              <Pair label="Minimum projected storage" value={num(review.safety.projection.minimum_pct) + "%"} />
              <Pair label="Expires" value={clock(review.expires_at)} />
              <p className="ops-muted">The server re-checks freshness, state version and every safety constraint before it commits the state and the audit together.</p>
              {error && <p role="alert" className="ops-error inline">{error}</p>}
              <div className="ops-actions">
                <button type="button" className="primary" disabled={busy} onClick={() => decide(review, true)}>Approve and execute in simulation</button>
                <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <Toasts items={toasts} onDismiss={(tid) => setToasts((x) => x.filter((t) => t.id !== tid))} />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="empty-hint"><span aria-hidden="true" />{text}</div>;
}

function PressureDelta({ a, b }: { a: number; b: number }) {
  const d = b - a;
  return <span className={d < -0.3 ? "delta down" : d > 0.3 ? "delta up" : "delta"}>{num(a)} → {num(b)} bar</span>;
}
