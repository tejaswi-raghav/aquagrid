"use client";

import type { SimState } from "@/lib/api";
import { ASSET_NAMES, statusLabel } from "@/lib/assets";
import { ASSET_POS, LAYERS, PIPES } from "@/lib/world";

const W = 1000;
const BAND = 104;
const TOP = 16;
const X0 = 170;

// Schematic x positions: process order left to right, evenly spaced for legibility.
const SX: Record<string, number> = {
  "INT-01": 300, "CHL-01": 380, "TURB-01": 520, "IPS-01": 600,
  "PT-01": 420, "SDI-01": 490, "HPP-01": 560, "RO-01": 640, "RO-02": 720, "ERD-01": 800, "COND-01": 880,
  "RES-01": 620, "RES-02": 720, "RES-03": 820,
  "PS-01": 380, "FM-PS": 450, "P-S3": 520, "V-04A": 600, "FM-S4": 670, "P-S4A": 740, "V-04B": 820, "P-S4B": 900,
  "SEC-01": 420, "SEC-02": 510, "SEC-03": 600, "SEC-05": 690, "SEC-04": 790, "BR-4H": 900,
};
const SENSORS = new Set(["CHL-01", "TURB-01", "SDI-01", "COND-01", "FM-PS", "P-S3", "FM-S4", "P-S4A", "P-S4B"]);

function sx(x: number) { return X0 + ((x + 46) / 92) * (W - X0 - 30); }
function bandY(layer: number) { return TOP + (layer - 1) * BAND; }

function colour(status?: string) {
  if (status === "critical" || status === "alarm") return "#b3001b";
  if (status === "warning" || status === "watch" || status === "fault" || status === "flatline") return "#c2410c";
  if (status === "quarantined" || status === "isolated") return "#4b5563";
  if (status === "closed") return "#000000";
  return "#03045e";
}

/** Accessible 2D section of the five layers. Every asset is a keyboard-focusable button. */
export function Schematic2D({ state, selected, onSelect, focusLayer, dark = true }: {
  state: SimState | null; selected: string | null; onSelect: (id: string) => void; focusLayer?: number | null; dark?: boolean;
}) {
  const ink = "#000000";
  const sub = "#08323d";
  const edges = Object.keys(PIPES).map((k) => k.split(">") as [string, string]);
  const centre = (id: string) => {
    const a = ASSET_POS[id];
    const sensor = SENSORS.has(id);
    return { x: SX[id] ?? sx(a.p[0]), y: bandY(a.layer) + BAND / 2 + (sensor ? -14 : 22) };
  };
  return (
    <svg viewBox={`0 0 ${W} ${TOP + BAND * 5 + 10}`} className="h-full w-full" role="group" aria-label="Two-dimensional section of the five infrastructure layers">
      {LAYERS.map((l) => {
        const y = bandY(l.id);
        const dim = focusLayer != null && focusLayer !== l.id;
        return (
          <g key={l.id} opacity={dim ? 0.35 : 1}>
            <rect x="8" y={y + 4} width={W - 16} height={BAND - 8} rx="6" fill={dark ? "rgba(255,255,255,0.18)" : "#eef4fb"} stroke={dark ? "rgba(3,4,94,0.3)" : "#c9d6e6"} />
            <text x="22" y={y + 34} fill={ink} fontSize="15" fontWeight="680">{l.id}. {l.short}</text>
            <text x="22" y={y + 54} fill={sub} fontSize="12">{l.name}</text>
          </g>
        );
      })}
      {edges.map(([a, b]) => {
        const p = centre(a), q = centre(b);
        const bad = state?.leak.active && b === "BR-4H";
        return <path key={`${a}${b}`} d={`M${p.x} ${p.y}V${(p.y + q.y) / 2}H${q.x}V${q.y}`} fill="none" stroke={bad ? "#b3001b" : dark ? "#03045e" : "#62a7ea"} strokeWidth="2" />;
      })}
      {Object.keys(ASSET_POS).map((id) => {
        const { x, y } = centre(id);
        const st = state?.asset_status[id];
        const isSel = selected === id;
        const dim = focusLayer != null && focusLayer !== ASSET_POS[id].layer;
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-label={`${ASSET_NAMES[id]} (${id}), ${statusLabel(st)}`}
            aria-pressed={isSel}
            transform={`translate(${x} ${y})`}
            opacity={dim ? 0.35 : 1}
            className="cursor-pointer focus:outline-none"
            onClick={() => onSelect(id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }}
          >
            {isSel && <circle r="15" fill="#fff44f" />}
            <circle r="8" fill={colour(st)} stroke={dark ? "#caf0f8" : "#fff"} strokeWidth="2" />
            <text y="-14" textAnchor="middle" fill={ink} fontSize="11" fontWeight="600">{id}</text>
          </g>
        );
      })}
    </svg>
  );
}
