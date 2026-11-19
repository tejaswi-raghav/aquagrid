"use client";

import type { SimState } from "@/lib/api";
import { ASSET_NAMES, ASSET_ROLE } from "@/lib/assets";
import { ASSET_POS, LAYERS } from "@/lib/world";
import { Figure, StatusChip } from "@/components/ui/bits";

function Spark({ values, color = "#03045e" }: { values: number[]; color?: string }) {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 200},${38 - ((v - lo) / span) * 34}`).join("");
  return <svg viewBox="0 0 200 40" className="h-10 w-full" aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="2" /></svg>;
}

function layerFigures(layer: number, s: SimState) {
  const sens = s.sensors;
  switch (layer) {
    case 1: return [
      { label: "Demand", value: s.demand_m3h, unit: "m³/h" },
      { label: "Sectors with an incident", value: ["SEC-01", "SEC-02", "SEC-03", "SEC-04", "SEC-05"].filter((x) => s.asset_status[x] === "critical").length },
    ];
    case 2: return [
      { label: "Pumping station outflow", value: sens["FM-PS"].value, unit: "m³/h" },
      { label: "Sector 4 inflow", value: sens["FM-S4"].value, unit: "m³/h", emphasis: s.leak.active },
    ];
    case 3: return [
      { label: "Combined storage", value: s.storage.pct.toFixed(1), unit: "%" },
      { label: "Safety floor", value: s.storage.floor_pct, unit: "%" },
    ];
    case 4: return [
      { label: "Production", value: s.production.m3h, unit: "m³/h" },
      { label: "Electrical load", value: s.production.power_kw.toLocaleString(), unit: "kW", emphasis: s.tariff.is_peak },
    ];
    default: return [
      { label: "Seawater drawn", value: s.production.feed_m3h.toLocaleString(), unit: "m³/h" },
      { label: "Chlorophyll-a", value: sens["CHL-01"].value, unit: "µg/L", emphasis: sens["CHL-01"].status === "warning" },
    ];
  }
}

export function InfoPanel({ selected, state, onSelect, onClose }: {
  selected: string; state: SimState | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  let body: React.ReactNode = null;
  let title = "";
  let overline = "";

  if (selected.startsWith("layer:")) {
    const n = Number(selected.slice(6));
    const l = LAYERS[n - 1];
    title = l.name;
    overline = `Layer ${n} of 5`;
    body = (
      <>
        <p className="text-[15px] leading-relaxed">{l.role}</p>
        {state && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {layerFigures(n, state).map((f) => <Figure key={f.label} {...f} />)}
          </div>
        )}
        <h4 className="mt-5 text-[13px] font-[640] text-[var(--color-muted)]">Assets in this layer</h4>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {l.assets.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)} className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[13px] hover:border-[var(--color-blue)]">
                {ASSET_NAMES[id]}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (selected.startsWith("pipe:")) {
    const [from, to] = selected.slice(5).split(">");
    const flow = state?.flows.find((f) => f.from === from && f.to === to);
    title = `${ASSET_NAMES[from] ?? from} to ${ASSET_NAMES[to] ?? to}`;
    overline = "Pipe";
    body = flow ? <Figure label="Modelled flow" value={flow.m3h} unit="m³/h" /> : null;
  } else {
    const id = selected;
    const sensor = state?.sensors[id];
    const layer = ASSET_POS[id]?.layer;
    title = ASSET_NAMES[id] ?? id;
    overline = `${id}${layer ? `, layer ${layer}` : ""}`;
    const tank = state?.storage.tanks.find((t) => t.id === id);
    const inflow = state?.flows.filter((f) => f.to === id).reduce((a, f) => a + f.m3h, 0);
    body = (
      <>
        <div className="mb-3"><StatusChip status={state?.asset_status[id]} /></div>
        <p className="text-[15px] leading-relaxed">{ASSET_ROLE[id]}</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {sensor && <Figure label={sensor.label} value={sensor.value} unit={sensor.unit} />}
          {tank && <Figure label="Storage" value={tank.pct.toFixed(1)} unit="%" note={`${tank.capacity_m3.toLocaleString()} m³ capacity`} />}
          {state?.valves[id] && <Figure label="Position" value={state.valves[id].position} />}
          {!sensor && !tank && inflow !== undefined && inflow > 0 && <Figure label="Modelled inflow" value={inflow.toFixed(0)} unit="m³/h" />}
        </div>
        {sensor && (
          <div className="mt-3">
            <Spark values={sensor.series.map((p) => p.v)} color={sensor.status === "normal" ? "#03045e" : "#c2410c"} />
            <div className="flex justify-between text-[11.5px] text-[var(--color-muted)]"><span>{sensor.series[0].t}</span><span>{sensor.series.at(-1)?.t}</span></div>
          </div>
        )}
      </>
    );
  }

  return (
    <aside aria-live="polite" className="w-full max-w-[380px] rounded-xl bg-[var(--color-paper)] p-5 text-black shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-[var(--color-muted)]">{overline}</div>
          <h3 className="type-h3 mt-0.5">{title}</h3>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--color-mist)]" aria-label="Close panel">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      </div>
      <div className="mt-3">{body}</div>
      {state && <p className="mt-4 border-t border-[var(--color-line)] pt-2 text-[12px] text-[var(--color-muted)]">Values from the simulation engine at {state.scene.clock}</p>}
    </aside>
  );
}
