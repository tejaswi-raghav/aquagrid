"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api, ApiError, type DesalModel } from "@/lib/api";
import { useInView, useReducedMotion, useWebGL } from "@/lib/hooks";
import { Asset } from "@/components/three/Asset";
import { EnergyRecovery, FilterBank, MembraneRack, ProductTank, PumpSkid } from "@/components/three/DesalinationPlant";
import { IncidentCamera } from "@/components/three/IncidentCamera";
import { makeFlowMaterial, pathGeometry } from "@/components/three/PipelineNetwork";
import { TwinCanvas } from "@/components/three/TwinCanvas";
import { COLORS, std, useTwin, type TwinApi } from "@/components/three/twin";
import { Authority, ErrorNote, Figure } from "@/components/ui/bits";
import { LineChart, SERIES } from "@/components/ui/LineChart";

const STAGE_X_COLLAPSED = [-10, -6, -2, 2, 6, 10];
const STAGE_X_EXPLODED = [-16.5, -10, -3.3, 3.3, 10, 16.5];

function IntakeModel() {
  const m = useMemo(() => ({ sea: std(COLORS.sea, { opacity: 0.8 }), cap: std("#b8c3d4"), house: std("#e3e9f2") }), []);
  return (
    <group>
      <mesh material={m.sea} position={[-1.2, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4, 6]} /></mesh>
      <mesh material={m.cap} position={[-1.8, 0.5, 0]}><cylinderGeometry args={[0.9, 0.9, 0.16, 28]} /></mesh>
      <mesh material={m.cap} position={[-1.8, 0.25, 0]}><cylinderGeometry args={[0.3, 0.3, 0.5, 12]} /></mesh>
      <mesh material={m.house} position={[1.2, 1, 0]}><boxGeometry args={[2.2, 2, 2.6]} /></mesh>
    </group>
  );
}

function Stage({ index, id, name, powerKw, children }: { index: number; id: string; name: string; powerKw?: number; children: React.ReactNode }) {
  const { explode, selected } = useTwin();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const e = explode.current;
    ref.current.position.x = THREE.MathUtils.lerp(STAGE_X_COLLAPSED[index], STAGE_X_EXPLODED[index], e);
    ref.current.position.y = e * (index % 2 === 0 ? 0 : 1.2);
  });
  return (
    <group ref={ref}>
      <Asset id={id} ring={3.4} label={false}>{children}</Asset>
      <Html position={[0, index % 2 === 0 ? 4.2 : 6.4, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: "none" }}>
        <div className={`whitespace-nowrap rounded-md px-2 py-1 text-center text-[12.5px] leading-tight ${selected === id ? "bg-[var(--color-yellow)] text-black" : "bg-[rgba(255,255,255,0.85)] text-black"}`}>
          <div className="font-[660]">{index + 1}. {name}</div>
          {powerKw !== undefined && <div className="opacity-80">{powerKw > 0 ? `${powerKw.toLocaleString()} kW` : "no direct load"}</div>}
        </div>
      </Html>
    </group>
  );
}

function ProcessLine({ speed }: { speed: number }) {
  const { explode, reducedMotion } = useTwin();
  const { geo, length } = useMemo(() => pathGeometry([[-19, 0.3, 0], [19, 0.3, 0]], 0.28), []);
  const mat = useMemo(() => makeFlowMaterial(COLORS.steel), []);
  const brine = useMemo(() => pathGeometry([[3.3, 0.3, 2.4], [10, 0.3, 2.4], [10, 0.3, 4.2], [20, 0.3, 4.2]], 0.2), []);
  const brineMat = useMemo(() => { const m = makeFlowMaterial("#8a96ad"); (m.uniforms.uFlow.value as THREE.Color).set("#c9d6e6"); return m; }, []);
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    for (const [m, len] of [[mat, length], [brineMat, brine.length]] as const) {
      m.uniforms.uTime.value += dt;
      m.uniforms.uSpeed.value = reducedMotion ? 0 : speed;
      m.uniforms.uLength.value = len;
    }
    if (g.current) g.current.scale.x = THREE.MathUtils.lerp(0.6, 1, explode.current);
  });
  return (
    <group ref={g}>
      <mesh geometry={geo} material={mat} />
      <mesh geometry={brine.geo} material={brineMat} />
    </group>
  );
}

function Driver({ target }: { target: number }) {
  const { explode, explodeTarget, reducedMotion } = useTwin();
  explodeTarget.current = target;
  useFrame((_, dt) => {
    explode.current = reducedMotion ? target : explode.current + (target - explode.current) * Math.min(1, dt * 3);
  });
  return null;
}

const STAGE_IDS = ["intake", "pretreatment", "hp_pumps", "membranes", "erd", "output"];

export function DesalModule() {
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [ref, inView] = useInView<HTMLDivElement>("150px");
  const [model, setModel] = useState<DesalModel | null>(null);
  const [production, setProduction] = useState(600);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>("hp_pumps");
  const [hovered, setHovered] = useState<string | null>(null);
  const [exploded, setExploded] = useState(true);
  const explode = useRef(1);
  const explodeTarget = useRef(1);

  useEffect(() => {
    const t = setTimeout(() => {
      api.desal(production).then((m) => { setModel(m); setError(null); })
        .catch((e) => setError(e instanceof ApiError ? e.message : "The simulation engine can't be reached."));
    }, 140);
    return () => clearTimeout(t);
  }, [production]);

  const op = model?.operating_point;
  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget, focusLayer: null, selected, hovered, select: setSelected, hover: setHovered,
    state: null, reducedMotion: reduced, showLabels: true, lockedValve: null, selectLayer: () => {},
  }), [selected, hovered, reduced]);

  const stage = model?.stages.find((s) => s.id === selected) ?? null;
  const curve = model?.curve ?? [];
  const markerIdx = curve.length ? curve.reduce((best, c, i) => (Math.abs(c.production_m3h - production) < Math.abs(curve[best].production_m3h - production) ? i : best), 0) : undefined;
  const models = [<IntakeModel key="i" />, <FilterBank key="f" />, <PumpSkid key="p" />, <MembraneRack key="m" />, <EnergyRecovery key="e" />, <ProductTank key="o" />];

  return (
    <section id="desalination" aria-labelledby="desal-title" className="bg-[var(--color-mist)] py-24">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-10">
        <h2 id="desal-title" className="type-h2 max-w-[18ch]">Inside the desalination plant.</h2>
        <p className="measure mt-5 text-[1.0625rem] leading-relaxed">
          Six stages turn seawater into drinking water. Most of the energy goes into one of them: the pumps that push water through the
          membranes. Move the production setting to see what each extra cubic metre costs.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div ref={ref} className="on-navy relative h-[56svh] min-h-[380px] overflow-hidden rounded-2xl bg-[var(--color-navy)]">
            {webgl ? (
              <TwinCanvas twin={twin} active={inView} label="Exploded 3D model of the reverse-osmosis plant" initial={{ pos: [0, 15, 49], fov: 34 }} minDistance={20} maxDistance={110}>
                <Driver target={exploded ? 1 : 0} />
                <IncidentCamera shot={{ pos: [0, 14, 48], target: [0, 2.4, 0] }} shotKey="desal" reducedMotion={reduced} />
                <ProcessLine speed={0.15 + production / 900} />
                {STAGE_IDS.map((id, i) => (
                  <Stage key={id} index={i} id={id} name={model?.stages[i]?.name ?? id} powerKw={op?.stage_power_kw[id]}>{models[i]}</Stage>
                ))}
              </TwinCanvas>
            ) : webgl === false ? (
              <p className="p-6 text-black">3D isn’t available in this browser. The process diagram below shows the same stages.</p>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setExploded((v) => !v)} disabled={!webgl}>{exploded ? "Assemble plant" : "Explode plant"}</button>
              <div role="group" aria-label="Plant stages" className="flex flex-wrap gap-1">
                {(model?.stages ?? []).map((s, i) => (
                  <button key={s.id} type="button" aria-pressed={selected === s.id} onClick={() => setSelected(s.id)}
                    className={`rounded-full px-2.5 py-1 text-[12.5px] font-[600] ${selected === s.id ? "bg-[var(--color-yellow)] text-black" : "text-black/85 hover:bg-black/10"}`}>
                    {i + 1}. {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6 rounded-2xl bg-[var(--color-paper)] p-6">
            {error && <ErrorNote>{error}</ErrorNote>}
            {stage && (
              <div aria-live="polite">
                <p className="text-[13px] text-[var(--color-muted)]">Stage {STAGE_IDS.indexOf(stage.id) + 1} of 6</p>
                <h3 className="type-h3 mt-0.5">{stage.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed">{stage.role}</p>
                <dl className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)] text-[14px]">
                  {stage.parameters.map((p) => (
                    <div key={p.label} className="flex justify-between gap-4 py-1.5"><dt className="text-[var(--color-muted)]">{p.label}</dt><dd className="font-[620]">{p.value}</dd></div>
                  ))}
                  {op && <div className="flex justify-between gap-4 py-1.5"><dt className="text-[var(--color-muted)]">Electrical load at this output</dt><dd className="font-[620]">{op.stage_power_kw[stage.id] ? `${op.stage_power_kw[stage.id].toLocaleString()} kW` : "None directly"}</dd></div>}
                </dl>
              </div>
            )}
            <div>
              <label htmlFor="prod" className="flex items-baseline justify-between text-[14px] font-[640]">
                Production setting <span className="type-figure text-[1.25rem]">{production} m³/h</span>
              </label>
              <input id="prod" type="range" min={model?.limits.min_m3h ?? 100} max={model?.limits.max_m3h ?? 800} step={25} value={production}
                onChange={(e) => setProduction(Number(e.target.value))} className="mt-2 w-full accent-[#003483]" />
              <div className="flex justify-between text-[12px] text-[var(--color-muted)]"><span>Minimum turndown</span><span>Nominal 600</span><span>Maximum</span></div>
            </div>
            {op && (
              <div className="grid grid-cols-2 gap-5">
                <Figure label="Plant load" value={op.power_kw.toLocaleString()} unit="kW" />
                <Figure label="Energy per m³" value={op.sec_kwh_m3.toFixed(2)} unit="kWh" />
                <Figure label="Cost per hour, peak" value={`$${op.cost_per_hour_peak_usd.toLocaleString()}`} emphasis />
                <Figure label="Cost per hour, off-peak" value={`$${op.cost_per_hour_offpeak_usd.toLocaleString()}`} />
              </div>
            )}
          </div>
        </div>

        {model && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="rounded-2xl bg-[var(--color-paper)] p-6">
              <LineChart
                title="Plant load against production"
                x={curve.map((c) => String(c.production_m3h))} unit="kW" yMin={0}
                series={[{ name: "Plant load", values: curve.map((c) => c.power_kw), color: SERIES.s1 }]}
                marker={markerIdx} format={(v) => v.toFixed(0)} height={220}
              />
              <p className="mt-2 text-[13px] text-[var(--color-muted)]">Production, m³/h. Fixed loads make low output less efficient per cubic metre; high flux raises membrane pressure.</p>
            </div>
            <div className="rounded-2xl bg-[var(--color-paper)] p-6">
              <ProcessDiagram feed={op!.feed_m3h} product={op!.production_m3h} brine={op!.brine_m3h} selected={selected} onSelect={setSelected} />
            </div>
          </div>
        )}
        {model && <div className="mt-4"><Authority text={model.note} /></div>}
      </div>
    </section>
  );
}

/** Simplified SWRO flow schematic with an isobaric energy-recovery loop. */
function ProcessDiagram({ feed, product, brine, selected, onSelect }: { feed: number; product: number; brine: number; selected: string | null; onSelect: (id: string) => void }) {
  const box = (id: string, x: number, y: number, w: number, label: string, sub?: string) => (
    <g role="button" tabIndex={0} aria-label={label} aria-pressed={selected === id} onClick={() => onSelect(id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }} className="cursor-pointer">
      <rect x={x} y={y} width={w} height="46" rx="6" fill={selected === id ? "#b2fc6f" : "#dff2f0"} stroke="#003483" strokeWidth="1.4" />
      <text x={x + w / 2} y={y + (sub ? 20 : 28)} textAnchor="middle" fontSize="13" fontWeight="650" fill="#04204f">{label}</text>
      {sub && <text x={x + w / 2} y={y + 36} textAnchor="middle" fontSize="11" fill={selected === id ? "#3d5a78" : "#3d5a78"}>{sub}</text>}
    </g>
  );
  const arrow = (d: string, color = "#003483", label?: string, lx = 0, ly = 0) => (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" markerEnd={`url(#ah-${color.slice(1)})`} />
      {label && <text x={lx} y={ly} fontSize="11.5" fill="#04204f">{label}</text>}
    </g>
  );
  return (
    <figure>
      <figcaption className="mb-2 text-[14px] font-[640]">Process flow at the current setting</figcaption>
      <svg viewBox="0 0 720 300" className="w-full" role="group" aria-label="Reverse-osmosis process flow diagram">
        <defs>
          {["03045e", "4b5563", "000000"].map((c) => (
            <marker key={c} id={`ah-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill={`#${c}`} /></marker>
          ))}
        </defs>
        {box("intake", 10, 40, 110, "Intake", "screens, pumps")}
        {box("pretreatment", 160, 40, 130, "Pretreatment", "DAF, filters, 5 µm")}
        {box("hp_pumps", 340, 10, 120, "HP pump", "~64 bar")}
        {box("erd", 340, 150, 120, "Energy recovery", "+ booster pump")}
        {box("membranes", 510, 80, 110, "Membranes", "RO vessels")}
        {box("output", 510, 230, 200, "Post-treatment", "remineralise, disinfect")}
        {arrow("M120 63H158", "#003483", `${feed.toLocaleString()} m³/h`, 116, 32)}
        {arrow("M290 55H315V33H338")}
        {arrow("M290 71H315V173H338", "#003483", "brine-side share", 222, 125)}
        {arrow("M460 33H485V95H508")}
        {arrow("M460 173H485V111H508")}
        {arrow("M620 103H660V228", "#003483", `${product.toLocaleString()} m³/h product`, 600, 70)}
        {arrow("M565 126V186H462", "#4b5563", "concentrate, high pressure", 474, 204)}
        {arrow("M380 196V270H30", "#4b5563", `${brine.toLocaleString()} m³/h brine to outfall`, 40, 290)}
      </svg>
    </figure>
  );
}
