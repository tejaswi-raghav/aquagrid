"use client";

import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api, ApiError, type Evaluation, type PlanResult } from "@/lib/api";
import { useScenario } from "@/components/ScenarioController";
import { useInView, useReducedMotion, useWebGL } from "@/lib/hooks";
import { IncidentCamera } from "@/components/three/IncidentCamera";
import { Tank } from "@/components/three/ReservoirSystem";
import { TwinCanvas } from "@/components/three/TwinCanvas";
import { COLORS, std, type TwinApi } from "@/components/three/twin";
import { Authority, CheckList, ErrorNote, Figure, Verdict } from "@/components/ui/bits";
import { LineChart, SERIES } from "@/components/ui/LineChart";

const R = 6;
const H = 10;

function ScenarioTank({ x, plan, hour, reduced }: { x: number; plan: PlanResult; hour: number; reduced: boolean }) {
  const level = plan.levels_pct[hour] / 100;
  const floorMat = useMemo(() => std(COLORS.red, { opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), []);
  const row = plan.rows[Math.min(hour, plan.rows.length - 1)];
  return (
    <group position={[x, 0, 0]}>
      <Tank radius={R} height={H} level={level} floor={plan.floor_pct / 100} reducedMotion={reduced} floorColor={COLORS.red} />
      {/* The 35% floor as a horizontal plane through the tank */}
      <mesh material={floorMat} position={[0, 0.1 + (plan.floor_pct / 100) * (H - 0.2), 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R + 1.2, 64]} />
      </mesh>
      <Html position={[-R - 0.6, H * 0.85, 0]} center zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
        <div className="-translate-x-1/2 whitespace-nowrap rounded bg-[rgba(255,255,255,0.85)] px-2 py-1 text-[12px] text-black">
          In <b>{row.production_m3h}</b> m³/h
        </div>
      </Html>
      <Html position={[R + 0.6, 1.4, 0]} center zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
        <div className="translate-x-1/2 whitespace-nowrap rounded bg-[rgba(255,255,255,0.85)] px-2 py-1 text-[12px] leading-snug text-black">
          Out <b>{row.demand_m3h}</b> m³/h{row.loss_m3h > 0 && <><br />Leak <b>{row.loss_m3h}</b> m³/h</>}
        </div>
      </Html>
      <Html position={[R + 1.6, 0.1 + (plan.floor_pct / 100) * (H - 0.2), 0]} zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
        <div className="-translate-y-1/2 whitespace-nowrap text-[12px] font-[680] text-[#9b0016]">{plan.floor_pct}% floor</div>
      </Html>
    </group>
  );
}

export function ReservoirSection() {
  const { ctx } = useScenario();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [ref, inView] = useInView<HTMLDivElement>("150px");
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Evaluate in incident conditions (from the 14:15 decision point onward).
  const evalCtx = useMemo(() => ({ ...ctx, scene: Math.max(ctx.scene, 6) }), [ctx]);
  useEffect(() => {
    api.evaluate(evalCtx, ["baseline", "peak_throttle"]).then((r) => { setEv(r); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "The simulation engine can't be reached."));
  }, [evalCtx]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setHour((h) => { if (h >= 10) { setPlaying(false); return 10; } return h + 1; }), 850);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const explode = useRef(0), explodeTarget = useRef(0);
  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget, focusLayer: null, selected: null, hovered: null, select: () => {}, hover: () => {},
    state: null, reducedMotion: reduced, showLabels: false, lockedValve: null, selectLayer: () => {},
  }), [reduced]);

  const base = ev?.results[0], prop = ev?.results[1];
  return (
    <section id="storage" aria-labelledby="storage-title" className="bg-[var(--color-paper)] py-24">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-10">
        <h2 id="storage-title" className="type-h2 max-w-[20ch]">Storage is the margin for every decision.</h2>
        <p className="measure mt-5 text-[1.0625rem] leading-relaxed">
          The same reservoirs under two plans for the evening, both computed by the simulation engine. Play the hours forward and watch
          the proposed plan run through the reserve meant for emergencies.
        </p>
        {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
        {base && prop && ev && (
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div ref={ref} className="on-navy relative h-[58svh] min-h-[400px] overflow-hidden rounded-2xl bg-[var(--color-navy)]">
              {webgl ? (
                <TwinCanvas twin={twin} active={inView} label="Two transparent reservoirs comparing baseline and peak-throttling storage" initial={{ pos: [0, 15, 58], fov: 34 }} minDistance={18} maxDistance={90}>
                  <IncidentCamera shot={{ pos: [0, 13, 58], target: [0, 5, 0] }} shotKey="tanks" reducedMotion={reduced} />
                  <ScenarioTank x={-9.5} plan={base} hour={hour} reduced={reduced} />
                  <ScenarioTank x={9.5} plan={prop} hour={hour} reduced={reduced} />
                </TwinCanvas>
              ) : webgl === false ? (
                <p className="p-6 text-black">3D isn’t available here. The chart beside shows the same projection.</p>
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-2 p-5 text-center text-black" aria-live="polite">
                {[["Baseline operation", base], ["Peak-tariff throttling", prop]].map(([label, plan]) => {
                  const pl = plan as PlanResult;
                  const below = pl.levels_pct[hour] < pl.floor_pct;
                  return (
                    <div key={label as string}>
                      <div className="text-[13.5px] opacity-80">{label as string}</div>
                      <div className="type-figure mt-1 text-[2rem] leading-none">
                        <span className={below ? "rounded bg-[var(--color-red)] px-1.5" : ""}>{pl.levels_pct[hour].toFixed(1)}%</span>
                      </div>
                      {below && <div className="mt-1 text-[12.5px] font-[640]">below the safety floor</div>}
                    </div>
                  );
                })}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-[rgba(255,255,255,0.85)] px-4 py-3 text-black">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (hour >= 10) setHour(0); setPlaying((p) => !p); }} disabled={reduced && false}>
                  {playing ? "Pause" : hour >= 10 ? "Replay" : "Play the evening"}
                </button>
                <label htmlFor="hour" className="sr-only">Hour</label>
                <input id="hour" type="range" min={0} max={10} value={hour} onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }} className="w-full accent-[#b2fc6f]" />
                <span className="type-figure w-14 text-right text-[1.1rem]">{prop.hours[hour]}</span>
              </div>
            </div>
            <div className="space-y-6">
              <LineChart
                title="Combined storage, %"
                x={prop.hours} unit="%" yMin={20} yMax={70}
                series={[
                  { name: "Baseline", values: base.levels_pct, color: SERIES.reference, dashed: true },
                  { name: "Peak throttling", values: prop.levels_pct, color: SERIES.s1 },
                ]}
                thresholds={[{ value: prop.floor_pct, label: `${prop.floor_pct}% floor`, color: "#b3001b", dashed: false }]}
                marker={hour} band={[0, 6]} bandLabel="Peak tariff" format={(v) => v.toFixed(1)} height={230}
              />
              <div className="grid grid-cols-2 gap-5">
                <Figure label="Baseline lowest" value={base.min_level_pct.toFixed(1)} unit="%" note={`${base.verdict.toLowerCase()}`} />
                <Figure label="Throttling lowest" value={prop.min_level_pct.toFixed(1)} unit="%" emphasis note={prop.breach_at ? `crosses the floor at ${prop.breach_at}` : prop.verdict.toLowerCase()} />
              </div>
              <Verdict kind={prop.verdict === "REJECTED" ? "rejected" : prop.verdict === "HOLD" ? "hold" : "accepted"} headline={prop.headline}>
                Peak throttling saves ${prop.savings_vs_baseline_usd?.toLocaleString()} of electricity and {prop.verdict === "REJECTED" ? "is rejected" : "is not rejected"} by the backend.
              </Verdict>
              <CheckList checks={prop.constraints} />
              <Authority text={`Projection from ${ev.assumptions.start_pct}% at 14:00, ${ev.assumptions.demand_m3h} m³/h demand, ${ev.assumptions.modelled_loss_m3h} m³/h modelled loss. ${ev.engine}.`} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
