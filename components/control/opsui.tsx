"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Check } from "@/lib/operations";

/** Counts smoothly from the previous value to the new one. */
export function CountUp({ value, digits = 1 }: { value: number; digits?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{shown.toFixed(digits)}</>;
}

export type Tone = "normal" | "warning" | "critical" | "attention";

export function Kpi({ label, value, unit, digits = 1, tone = "normal", children, hint }: {
  label: string; value: number; unit?: string; digits?: number; tone?: Tone; children?: ReactNode; hint?: string;
}) {
  return (
    <div className={`kpi kpi-${tone}`} title={hint}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {tone !== "normal" && <span className="kpi-dot" aria-hidden="true" />}
      </div>
      <div className="kpi-value">
        <CountUp value={value} digits={digits} />
        {unit && <small>{unit}</small>}
      </div>
      {children}
      {tone !== "normal" && <span className="sr-only">{tone === "critical" ? "Critical" : tone === "warning" ? "Warning" : "Needs attention"}</span>}
    </div>
  );
}

/** Reserve gauge with the safety floor marked. */
export function ReserveGauge({ pct, floor = 35 }: { pct: number; floor?: number }) {
  return (
    <div className="gauge" role="img" aria-label={`Reserve ${pct.toFixed(1)}%, floor ${floor}%`}>
      <motion.span className="gauge-fill" initial={false} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ background: pct < floor ? "var(--color-red)" : pct < floor + 8 ? "var(--color-amber)" : "var(--color-blue)" }} />
      <span className="gauge-floor" style={{ left: `${floor}%` }} />
    </div>
  );
}

/** A small live heartbeat trace that keeps moving while the backend is connected. */
export function Heartbeat({ live }: { live: boolean }) {
  return (
    <svg className={`heartbeat ${live ? "is-live" : ""}`} viewBox="0 0 120 24" aria-hidden="true">
      <path d="M0 12h30l4-8 5 16 5-14 4 6h22l4-8 5 16 5-14 4 6h32" />
    </svg>
  );
}

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time className="live-clock" suppressHydrationWarning>{now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</time>;
}

export function Checks({ items }: { items: Check[] }) {
  return (
    <ul className="ops-checks">
      {items.map((c, i) => (
        <motion.li key={c.id} className={c.passed ? "pass" : "fail"} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
          <b aria-label={c.passed ? "Passed" : "Failed"}>{c.passed ? "✓" : "×"}</b>
          <span>{c.detail}</span>
        </motion.li>
      ))}
    </ul>
  );
}

export function Pair({ label, value }: { label: string; value: ReactNode }) {
  return <div className="ops-pair"><span>{label}</span><strong>{value}</strong></div>;
}

export interface DrillStep { key: string; title: string; detail: string; done: boolean; onGo: () => void }

/** The guided workflow: what to do next, and what has already been done. */
export function DrillStepper({ steps }: { steps: DrillStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className="drill">
      <div className="drill-head">
        <span>Guided drill</span>
        <span className="drill-count">{done} of {steps.length} complete</span>
      </div>
      <div className="drill-track" aria-hidden="true">
        <motion.span className="drill-progress" initial={false} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
      </div>
      <ol className="drill-steps">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={s.onGo} className={`drill-step ${s.done ? "is-done" : ""} ${i === next ? "is-next" : ""}`} aria-current={i === next ? "step" : undefined}>
              <span className="drill-num">{s.done ? "✓" : i + 1}</span>
              <span className="drill-text"><b>{s.title}</b><small>{s.detail}</small></span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface Toast { id: number; tone: "info" | "success" | "danger"; title: string; detail?: string }

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div key={t.id} layout className={`toast toast-${t.tone}`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }}>
            <div><b>{t.title}</b>{t.detail && <p>{t.detail}</p>}</div>
            <button type="button" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Fades and lifts a panel in when its key changes. */
export function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
