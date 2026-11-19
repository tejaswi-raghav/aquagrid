"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export const SERIES = { s1: "#62a7ea", s2: "#5ad7ae", s3: "#c4b5fd", reference: "#7d8699" };

export interface Series { name: string; values: number[]; color: string; dashed?: boolean }
export interface Threshold { value: number; label: string; color: string; dashed?: boolean }

interface Props {
  title?: string;
  x: string[];
  series: Series[];
  unit?: string;
  yMin?: number;
  yMax?: number;
  thresholds?: Threshold[];
  marker?: number;          // index of a vertical "now" marker
  band?: [number, number];  // shaded x-index range (e.g. peak tariff)
  bandLabel?: string;
  step?: boolean;
  height?: number;
  format?: (v: number) => string;
  xTickEvery?: number;
}

const PAD = { l: 44, r: 18, t: 14, b: 28 };

export function LineChart({
  title, x, series, unit = "", yMin, yMax, thresholds = [], marker, band, bandLabel, step, height = 220,
  format = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)), xTickEvery,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.values).concat(thresholds.map((t) => t.value));
  const lo = yMin ?? Math.min(...all);
  const hi = yMax ?? Math.max(...all);
  const span = hi - lo || 1;
  const n = x.length;
  const iw = w - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const sx = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const sy = (v: number) => PAD.t + ih - ((v - lo) / span) * ih;

  const ticks = useMemo(() => {
    const raw = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi + 1e-9; v += stepV) out.push(+v.toFixed(6));
    return out;
  }, [lo, hi, span]);

  const path = (vals: number[]) =>
    vals.map((v, i) => {
      if (!step || i === 0) return `${i === 0 ? "M" : "L"}${sx(i)},${sy(v)}`;
      return `H${sx(i)}V${sy(v)}`;
    }).join("");

  const every = xTickEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.round(Math.min(1, Math.max(0, px / r.width)) * (n - 1)));
  };


  return (
    <figure className="w-full min-w-0">
      {title && <figcaption className="mb-2 text-[14px] font-[640]">{title}</figcaption>}
      {(series.length > 0 || thresholds.length > 0) && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--color-muted)]" aria-hidden="true">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "4 3" : undefined} /></svg>
              {s.name}
            </li>
          ))}
          {thresholds.map(t=><li key={t.label} style={{color:t.color}}>{t.label} · {format(t.value)}{unit}</li>)}
        </ul>
      )}
      <div ref={wrap} className="relative w-full min-w-0 overflow-hidden">
        <svg width={w} height={height} role="img" aria-labelledby={`${id}-t`} className="block overflow-visible">
          <title id={`${id}-t`}>{title ?? series.map((s) => s.name).join(", ")}</title>
          {band && (
            <g>
              <rect x={sx(band[0])} y={PAD.t} width={sx(band[1]) - sx(band[0])} height={ih} fill="#fff44f" opacity="0.32" />
              {bandLabel && <text x={sx(band[0]) + 6} y={PAD.t + 14} fontSize="12" fill="#ffffff" fontWeight="600">{bandLabel}</text>}
            </g>
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + iw} y1={sy(t)} y2={sy(t)} stroke="#405583" />
              <text x={PAD.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11.5" fill="#b7c8e3">{format(t)}</text>
            </g>
          ))}
          {unit && <text x={PAD.l - 8} y={PAD.t - 2} textAnchor="end" fontSize="11" fill="#b7c8e3">{unit}</text>}
          {x.map((lbl, i) => ((i % every === 0 && (n-1-i>=every*.7)) || i === n - 1) && (
            <text key={i} x={sx(i)} y={height - 8} textAnchor="middle" fontSize="11.5" fill="#b7c8e3">{lbl}</text>
          ))}
          {thresholds.map((t) => (
            <g key={t.label}>
              <line x1={PAD.l} x2={PAD.l + iw} y1={sy(t.value)} y2={sy(t.value)} stroke={t.color} strokeWidth="1.5" strokeDasharray={t.dashed === false ? undefined : "6 4"} />

            </g>
          ))}
          {marker !== undefined && <line x1={sx(marker)} x2={sx(marker)} y1={PAD.t} y2={PAD.t + ih} stroke="#ffffff" strokeWidth="1.5" />}
          {series.map((s) => (
            <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "6 4" : undefined} />
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="#ffffff" strokeOpacity="0.35" />
              {series.map((s) => (
                <circle key={s.name} cx={sx(hover)} cy={sy(s.values[hover])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}
          <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-md bg-[var(--color-navy)] px-2.5 py-2 text-[12.5px] text-white shadow-lg"
            style={{ left: Math.min(sx(hover) + 10, w - 170), top: 8 }}
          >
            <div className="mb-1 font-[640]">{x[hover]}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="opacity-80">{s.name}</span>
                <span className="ml-auto pl-3 font-[640]">{format(s.values[hover])}{unit ? ` ${unit}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Time</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{x.map((l, i) => <tr key={i}><td>{l}</td>{series.map((s) => <td key={s.name}>{s.values[i]}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
