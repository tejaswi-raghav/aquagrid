"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type SimState, type Topology } from "@/lib/api";
import { ASSET_NAMES, ASSET_ROLE, statusLabel } from "@/lib/assets";
import { useScenario } from "@/components/ScenarioController";
import { Figure, StatusChip } from "@/components/ui/bits";

const POS: Record<string, [number, number]> = {
  "INT-01": [70, 320], "IPS-01": [165, 320], "PT-01": [265, 320], "HPP-01": [355, 320],
  "RO-01": [445, 235], "RO-02": [445, 405], "ERD-01": [445, 320],
  "RES-01": [565, 140], "RES-02": [565, 320], "RES-03": [565, 500], "PS-01": [675, 320],
  "V-04A": [765, 450], "SEC-01": [875, 95], "SEC-02": [875, 205], "SEC-03": [875, 320],
  "SEC-04": [845, 470], "V-04B": [880, 545], "BR-4H": [905, 615], "SEC-05": [765, 600],
  "CHL-01": [70, 255], "TURB-01": [165, 255], "SDI-01": [355, 255], "COND-01": [515, 190],
  "FM-PS": [705, 270], "FM-S4": [800, 420], "P-S3": [930, 350], "P-S4A": [800, 505], "P-S4B": [940, 565],
};

function glyph(type: string) {
  const s: Record<string, string> = {
    intake: "M-12 4q6-8 12 0t12 0M-12 10q6-8 12 0t12 0M0-13v12m-5-4 5 5 5-5",
    pump: "M0-11a11 11 0 1 0 .01 0ZM-5-6 7 0-5 6Z",
    pretreatment: "M-12-9h24v18h-24ZM-12-3h24M-12 3h24",
    membrane: "M-13-8h26M-13-3h26M-13 2h26M-13 7h26",
    erd: "M-12-5h24v10h-24ZM-4-5v10M4-5v10",
    reservoir: "M-12-8c0-5 24-5 24 0v16c0 5-24 5-24 0ZM-12-8c0 5 24 5 24 0",
    valve: "m-12-8 24 16V-8L-12 8ZM0 0v-14m-6 0h12",
    sector: "M-12 11V-2h7v13m0 0V-12h10v23m0 0V-5h7v16",
    branch: "M-10 10V0h6v10m4 0V-6h6v16",
  };
  return s[type] ?? "M0-4a4 4 0 1 0 .01 0Z";
}

function colour(status?: string) {
  if (status === "critical" || status === "alarm") return "#b3001b";
  if (status === "warning" || status === "watch" || status === "fault" || status === "flatline") return "#c2410c";
  if (status === "quarantined" || status === "isolated") return "#4b5563";
  if (status === "closed") return "#000000";
  return "#03045e";
}

export function NetworkTwin({operationalState,selectedAsset,onAssetSelect,hideInspector=false}: {
  operationalState?:SimState; selectedAsset?:string; onAssetSelect?:(id:string)=>void;hideInspector?:boolean;
}={}) {
  const { state:storyState } = useScenario();
  const state=operationalState ?? storyState;
  const [topo, setTopo] = useState<Topology | null>(null);
  const [selected, setSelectedRaw] = useState("RES-02");
  const setSelected=(id:string)=>{setSelectedRaw(id);onAssetSelect?.(id)};
  useEffect(()=>{if(selectedAsset)setSelectedRaw(selectedAsset)},[selectedAsset]);
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState(false);
  const [flow, setFlow] = useState(true);
  const [labels, setLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const lastFocus = useRef(selectedAsset);
  useEffect(()=>{if(selectedAsset && lastFocus.current!==selectedAsset){const p=POS[selectedAsset];if(p){setZoom(1.2);setPan({x:490-p[0]*1.2,y:340-p[1]*1.2})}lastFocus.current=selectedAsset}},[selectedAsset]);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => { api.network().then(setTopo).catch(() => setTopo(null)); }, []);

  const upstream = useMemo(() => {
    if (!topo || !trace) return null;
    const parents: Record<string, string[]> = {};
    topo.edges.forEach((e) => (parents[e.to] ??= []).push(e.from));
    const start = topo.sensor_attachment[selected] ?? selected;
    const seen = new Set([start, selected]);
    const q = [start];
    while (q.length) for (const p of parents[q.shift()!] ?? []) if (!seen.has(p)) { seen.add(p); q.push(p); }
    return seen;
  }, [topo, trace, selected]);

  const assets = topo?.assets ?? [];
  const match = (id: string, name: string) => !query || `${id} ${name}`.toLowerCase().includes(query.toLowerCase());

  const onSearch = (v: string) => {
    setQuery(v);
    const q = v.trim().toLowerCase();
    const hits = q ? assets.filter((a) => `${a.id} ${a.name}`.toLowerCase().includes(q)) : [];
    if (hits.length === 1) setSelected(hits[0].id);
  };

  const sel = assets.find((a) => a.id === selected);
  const sensor = state?.sensors[selected];
  const flowFor = (from: string, to: string) => state?.flows.find((f) => f.from === from && f.to === to)?.m3h ?? 0;

  return (
    <div className={hideInspector ? "min-w-0" : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"}>
      <div className="on-navy overflow-hidden rounded-2xl bg-[var(--color-navy)] text-black">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/10 p-3">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search assets</span>
            <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search assets, e.g. V-04B or reservoir"
              className="w-full rounded-full border border-black/20 bg-black/5 px-4 py-2 text-[14px] text-black placeholder:text-black/50" />
          </label>
          {[["Flow", flow, setFlow], ["Labels", labels, setLabels], ["Trace upstream", trace, setTrace]].map(([l, v, set]) => (
            <button key={l as string} type="button" aria-pressed={v as boolean} onClick={() => (set as (f: (x: boolean) => boolean) => void)((x) => !x)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-[620] ${v ? "bg-[var(--color-yellow)] text-black" : "bg-black/10 text-black"}`}>
              {l as string}
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <button type="button" className="tool" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(z * 1.2, 2.6))}>+</button>
            <button type="button" className="tool" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(z / 1.2, 0.6))}>−</button>
            <button type="button" className="btn btn-ghost btn-sm text-black" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
          </div>
        </div>
        <svg
          ref={svg}
          viewBox="0 0 980 680"
          className="block h-[62svh] min-h-[420px] w-full touch-none select-none"
          role="group"
          aria-label="Network map. Drag to pan."
          onPointerDown={(e) => { if ((e.target as Element).closest("[data-node]")) return; drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; svg.current?.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current || !svg.current) return;
            const k = 980 / svg.current.getBoundingClientRect().width;
            setPan({ x: drag.current.px + (e.clientX - drag.current.x) * k, y: drag.current.py + (e.clientY - drag.current.y) * k });
          }}
          onPointerUp={() => { drag.current = null; }}
        >
          <defs>
            <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#90e0ef" /></pattern>
            <style>{`@keyframes dash{to{stroke-dashoffset:-40}} .flow{stroke-dasharray:6 14;animation:dash linear infinite} @keyframes nodepulse{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.9);opacity:0}} .node-pulse{transform-box:fill-box;transform-origin:center;animation:nodepulse 1.6s ease-out infinite} @media (prefers-reduced-motion: reduce){.flow,.node-pulse{animation:none}}`}</style>
          </defs>
          <rect width="980" height="680" fill="url(#dots)" />
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <path d="M0 0h120q-30 120-8 220t-12 220 10 240H0Z" fill="#0077b6" opacity="0.6" />
            {topo?.edges.map((e) => {
              const a = POS[e.from], b = POS[e.to];
              if (!a || !b) return null;
              const m3h = flowFor(e.from, e.to);
              const bad = state?.leak.active && ["V-04B", "BR-4H"].includes(e.to);
              const dim = upstream && !(upstream.has(e.from) && upstream.has(e.to));
              const d = `M${a[0]} ${a[1]}H${(a[0] + b[0]) / 2}V${b[1]}H${b[0]}`;
              return (
                <g key={`${e.from}${e.to}`} opacity={dim ? 0.12 : 1}>
                  <path d={d} fill="none" stroke={bad ? "#b3001b" : "#0a6e85"} strokeWidth="3" />
                  {flow && m3h > 0 && <path className="flow" d={d} fill="none" stroke={bad ? "#ffd0d5" : "#ffffff"} strokeWidth="3" style={{ animationDuration: `${Math.max(0.6, 900 / m3h).toFixed(2)}s` }} />}
                </g>
              );
            })}
            {topo && Object.entries(topo.sensor_attachment).map(([s, host]) => POS[s] && POS[host] && (
              <line key={s} x1={POS[s][0]} y1={POS[s][1]} x2={POS[host][0]} y2={POS[host][1]} stroke="#0a6e85" strokeDasharray="2 4" />
            ))}
            {assets.map((a) => {
              const p = POS[a.id];
              if (!p) return null;
              const st = state?.asset_status[a.id];
              const dim = !match(a.id, a.name) || (upstream && !upstream.has(a.id));
              const isSensor = a.type === "sensor";
              return (
                <g key={a.id} data-node role="button" tabIndex={0} aria-pressed={selected === a.id}
                  aria-label={`${a.name} (${a.id}), ${statusLabel(st)}`}
                  transform={`translate(${p[0]} ${p[1]})`} opacity={dim ? 0.18 : 1} className="cursor-pointer"
                  onClick={() => setSelected(a.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(a.id); } }}>
                  {(st === "critical" || st === "alarm" || st === "warning" || st === "fault" || st === "flatline") && (
                    <circle className="node-pulse" r={isSensor ? 9 : 24} fill="none" stroke={colour(st)} strokeWidth="2" />
                  )}
                  {selected === a.id && <circle r={isSensor ? 13 : 30} fill="#fff44f" stroke="#000" strokeWidth="2" />}
                  {isSensor ? (
                    <circle r="7" fill={colour(st)} stroke="#caf0f8" strokeWidth="2" />
                  ) : (
                    <>
                      <circle r="23" fill="#caf0f8" stroke={colour(st)} strokeWidth="2" />
                      <path d={glyph(a.type)} fill="none" stroke={colour(st)} strokeWidth="1.6" strokeLinejoin="round" />
                    </>
                  )}
                  {((labels && !isSensor) || selected === a.id) && <text y={isSensor ? -12 : 40} textAnchor="middle" fill="#000" fontSize="11.5" fontWeight="600">{a.id}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {!hideInspector && <aside className="rounded-2xl border border-[var(--color-line)] p-5" aria-live="polite">
        {sel ? (
          <>
            <p className="text-[13px] text-[var(--color-muted)]">{sel.id}, {sel.type}</p>
            <h2 className="type-h3 mt-1">{ASSET_NAMES[sel.id] ?? sel.name}</h2>
            <div className="mt-3"><StatusChip status={state?.asset_status[sel.id]} /></div>
            <p className="mt-3 text-[14.5px] leading-relaxed">{ASSET_ROLE[sel.id]}</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {sensor && <Figure label={sensor.label} value={sensor.value} unit={sensor.unit} />}
              {state?.valves[sel.id] && <Figure label="Position" value={state.valves[sel.id].position} />}
              {state?.storage.tanks.find((t) => t.id === sel.id) && <Figure label="Storage" value={state.storage.pct.toFixed(1)} unit="%" />}
              {(() => { const q = state?.flows.filter((f) => f.to === sel.id).reduce((s, f) => s + f.m3h, 0) ?? 0; return q > 0 ? <Figure label="Modelled inflow" value={q.toFixed(0)} unit="m³/h" /> : null; })()}
            </div>
            <h3 className="mt-5 text-[13px] font-[640] text-[var(--color-muted)]">Connected</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {topo?.edges.filter((e) => e.from === sel.id || e.to === sel.id).map((e) => {
                const other = e.from === sel.id ? e.to : e.from;
                return <button key={other} type="button" onClick={() => setSelected(other)} className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[13px] hover:border-[var(--color-blue)]">{other}</button>;
              })}
            </div>
            <button type="button" className="btn btn-ghost btn-sm mt-5" onClick={() => setTrace((t) => !t)}>{trace ? "Clear upstream trace" : "Trace where its water comes from"}</button>
          </>
        ) : <p>Select an asset on the map.</p>}
      </aside>}
    </div>
  );
}
