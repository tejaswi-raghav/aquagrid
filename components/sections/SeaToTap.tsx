"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks";

// Model constants, mirrored from backend/aquagrid/config.py. Explanatory, not live telemetry.
const STAGES = [
  {
    key: "sea", label: "Sea", title: "It starts 600 metres offshore.",
    body: "An intake on the seabed draws in seawater around the clock. Whatever happens in the Gulf, from algal blooms to storms, reaches the city through here first.",
    figure: "1,250", unit: "m³ of seawater an hour", risk: "Algal blooms can foul the plant",
  },
  {
    key: "plant", label: "Plant", title: "Making fresh water takes a lot of electricity.",
    body: "Reverse osmosis pushes seawater through membranes at about 64 bar. It is the city’s single biggest electrical load, so when the tariff spikes, so does the cost of every cubic metre.",
    figure: "3.5", unit: "kWh for every m³ produced", risk: "Peak tariff is 2.7× off-peak",
  },
  {
    key: "storage", label: "Storage", title: "Reservoirs are the safety margin.",
    body: "Three reservoirs hold the city’s buffer. Producing less saves money, but it draws this buffer down, and it must never fall below the strategic reserve kept for emergencies.",
    figure: "35%", unit: "minimum reserve, never crossed", risk: "Cutting production drains the buffer",
  },
  {
    key: "network", label: "Network", title: "Then it disappears under the streets.",
    body: "Pumps, pipes, valves and sensors carry water to every building. Leaks and faulty sensors hide here, and closing the wrong valve can cut off a hospital.",
    figure: "9", unit: "sensors watching the network", risk: "A frozen sensor can hide a leak",
  },
  {
    key: "city", label: "City", title: "Five districts. One hospital. No margin for guessing.",
    body: "Every decision upstream ends here, at someone’s tap. AquaGrid exists so that saving electricity is never traded for water security without anyone noticing.",
    figure: "550", unit: "m³ an hour of demand", risk: "Every shortfall reaches a tap",
  },
];

/** Pipe route through the five stages (viewBox 1000 × 260). */
const PATH = "M40 180 C 120 180, 140 120, 220 120 S 340 170, 420 150 S 540 90, 620 110 S 760 180, 820 140 S 920 90, 960 100";
const STOPS = [0.04, 0.24, 0.43, 0.66, 0.98];

function Icon({ k, active }: { k: string; active: boolean }) {
  const s = active ? "#000" : "#03045e";
  const common = { fill: "none", stroke: s, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "sea": return <g {...common}><path d="M-14 2q7-7 14 0t14 0" /><path d="M-14 9q7-7 14 0t14 0" /><path d="M0-14v10" /></g>;
    case "plant": return <g {...common}><rect x="-13" y="-8" width="26" height="16" rx="2" /><path d="M-13-1h26M-6-8v16M3-8v16" /></g>;
    case "storage": return <g {...common}><ellipse cx="0" cy="-8" rx="12" ry="4" /><path d="M-12-8v15c0 5 24 5 24 0V-8" /><path d="M-12 1c0 4 24 4 24 0" /></g>;
    case "network": return <g {...common}><path d="M-14 0h28M-6-10v20M6-6v12" /><circle cx="-6" cy="-10" r="2.5" /><circle cx="6" cy="6" r="2.5" /></g>;
    default: return <g {...common}><path d="M-13 12V-2h7v14M-6 12V-12h10v24M4 12V-5h9v17" /></g>;
  }
}

export function SeaToTap() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const drawn = useTransform(progress, [0.02, 0.92], [0, 1]);
  const [active, setActive] = useState(0);
  const [drop, setDrop] = useState<{ x: number; y: number }>({ x: 40, y: 180 });
  const [len, setLen] = useState(1);

  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);
  useMotionValueEvent(drawn, "change", (v) => {
    const p = pathRef.current;
    if (p) { const pt = p.getPointAtLength(Math.max(0, Math.min(1, v)) * len); setDrop({ x: pt.x, y: pt.y }); }
    let i = 0;
    STOPS.forEach((s, j) => { if (v >= s - 0.02) i = j; });
    setActive(i);
  });

  const stage = STAGES[active];

  if (reduced) {
    return (
      <section id="concept" aria-labelledby="concept-title" className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <h2 id="concept-title" className="type-h2 max-w-[18ch]">From the sea to your tap, in five steps.</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-5">
          {STAGES.map((s, i) => (
            <li key={s.key} className="rounded-2xl border border-[var(--color-line)] p-5">
              <p className="text-[13px] text-[var(--color-blue)]">{i + 1}. {s.label}</p>
              <h3 className="type-h3 mt-2">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section id="concept" ref={ref} aria-labelledby="concept-title" className="relative h-[460vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden pt-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_40%,rgba(255,255,255,0.28),transparent_70%)]" />
        <div className="relative mx-auto w-full max-w-[1400px] px-5 sm:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="concept-title" className="type-h2 max-w-[16ch]">From the sea to your tap, in five steps.</h2>
            <ol className="flex gap-1.5" aria-label="Steps">
              {STAGES.map((s, i) => (
                <li key={s.key} className={`rounded-full px-3 py-1.5 text-[13px] font-[640] transition-colors duration-300 ${i === active ? "bg-[var(--color-yellow)] text-black" : i < active ? "bg-[var(--color-navy-3)] text-black" : "text-black/55"}`}>
                  {s.label}
                </li>
              ))}
            </ol>
          </div>

          <figure className="mt-8 md:mt-10" aria-hidden="true">
            <svg viewBox="0 0 1000 260" className="h-auto w-full overflow-visible">
              <defs>
                <linearGradient id="seawater" x1="0" x2="1">
                  <stop offset="0" stopColor="#03045e" />
                  <stop offset="1" stopColor="#023e8a" />
                </linearGradient>
                <filter id="dropglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
              </defs>
              <rect x="0" y="150" width="150" height="110" fill="#0077b6" opacity="0.55" rx="6" />
              <path d={PATH} fill="none" stroke="#90e0ef" strokeOpacity="0.8" strokeWidth="14" strokeLinecap="round" />
              <motion.path ref={pathRef} d={PATH} fill="none" stroke="url(#seawater)" strokeWidth="14" strokeLinecap="round" style={{ pathLength: drawn }} />
              <circle cx={drop.x} cy={drop.y} r="14" fill="#ffffff" opacity="0.85" filter="url(#dropglow)" />
              <circle cx={drop.x} cy={drop.y} r="6" fill="#ffffff" stroke="#03045e" strokeWidth="2" />
              {STAGES.map((s, i) => {
                const p = pathRef.current && len > 1 ? pathRef.current.getPointAtLength(STOPS[i] * len) : { x: 40 + i * 230, y: 150 };
                const on = i <= active;
                return (
                  <g key={s.key} transform={`translate(${p.x} ${p.y - 58})`}>
                    <line x1="0" y1="26" x2="0" y2="50" stroke={on ? "#03045e" : "#0587a3"} strokeWidth="2" strokeDasharray="3 4" />
                    <motion.circle r="26" initial={false} animate={{ scale: i === active ? 1.12 : 1 }} fill={i === active ? "#fff44f" : on ? "#caf0f8" : "#48cae4"} stroke={on ? "#03045e" : "#0587a3"} strokeWidth="2" />
                    <Icon k={s.key} active={i === active} />
                    <text y="-38" textAnchor="middle" fill={on ? "#000" : "#0b4a5a"} fontSize="15" fontWeight="650">{s.label}</text>
                  </g>
                );
              })}
            </svg>
          </figure>

          <div className="mt-6 grid gap-8 md:mt-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-start">
            <AnimatePresence mode="wait">
              <motion.div key={stage.key} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                <p className="text-[14px] font-[640] text-[var(--color-blue)]">Step {active + 1} of 5</p>
                <h3 className="type-h2 mt-2 text-[clamp(1.6rem,2.8vw,2.5rem)]">{stage.title}</h3>
                <p className="measure mt-4 text-[1.0625rem] leading-relaxed text-black/85">{stage.body}</p>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div key={stage.key + "-fig"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: 0.05 }}
                className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-navy-2)] p-6">
                <div className="type-figure text-[clamp(2.6rem,5vw,4rem)] leading-none text-[var(--color-blue-deep)]">{stage.figure}</div>
                <div className="mt-2 text-[15px] text-black/80">{stage.unit}</div>
                <div className="mt-5 flex items-center gap-2 border-t border-[var(--color-line)] pt-4 text-[14px]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-amber)]" aria-hidden="true" />
                  <span><b className="font-[640]">What can go wrong:</b> {stage.risk}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
