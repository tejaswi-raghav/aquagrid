import type { ReactNode } from "react";
import type { Check, Status } from "@/lib/api";
import { STATUS_TONE } from "@/lib/assets";

export function StatusChip({ status }: { status: Status | string | undefined }) {
  const tone = STATUS_TONE[status ?? "normal"] ?? STATUS_TONE.normal;
  const dot = status === "critical" || status === "alarm" ? "#b3001b"
    : status === "warning" || status === "watch" || status === "fault" || status === "flatline" ? "#c2410c"
    : status === "quarantined" || status === "isolated" ? "#4b5563"
    : status === "closed" ? "#000" : "#03045e";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-[620]" style={{ background: tone.bg, color: tone.fg }}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

export function Figure({ label, value, unit, note, emphasis }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-[var(--color-muted)]">{label}</div>
      <div className="type-figure mt-0.5 text-[1.65rem] leading-none">
        <span className={emphasis ? "marker" : undefined}>{value}</span>
        {unit && <span className="ml-1 text-[0.9rem] font-[560] tracking-normal text-[var(--color-muted)]">{unit}</span>}
      </div>
      {note && <div className="mt-1 text-[12.5px] text-[var(--color-muted)]">{note}</div>}
    </div>
  );
}

export function Verdict({ kind, headline, children }: { kind: "rejected" | "hold" | "accepted" | "locked"; headline: string; children?: ReactNode }) {
  const styles = {
    rejected: "bg-[var(--color-red)] text-white",
    hold: "bg-[var(--color-amber-pale)] text-black border border-[var(--color-amber)]",
    accepted: "bg-[var(--color-blue-pale)] text-black",
    locked: "bg-[var(--color-yellow)] text-black border border-black",
  }[kind];
  const icon = {
    rejected: <path d="M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 8h2v2h-2v-2Z" fill="currentColor" />,
    hold: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v6h-2V7Zm0 8h2v2h-2v-2Z" fill="currentColor" />,
    accepted: <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" fill="currentColor" />,
    locked: <path d="M6 10V7a6 6 0 1 1 12 0v3h1v12H5V10h1Zm2 0h8V7a4 4 0 1 0-8 0v3Z" fill="currentColor" />,
  }[kind];
  return (
    <div role="status" className={`rounded-lg px-4 py-3.5 ${styles}`}>
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
        <span className="text-[1.05rem] font-[760] tracking-[0.02em]" style={{ fontStretch: "115%" }}>{headline}</span>
      </div>
      {children && <div className="mt-1.5 text-[14px] leading-snug opacity-95">{children}</div>}
    </div>
  );
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
      {checks.map((c) => {
        const failed = c.passed === false || c.fault_indicated === true;
        const advisory = c.severity === "advisory";
        return (
          <li key={c.id} className="flex gap-3 py-2.5 text-[14px]">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-[800] ${
                failed ? (advisory ? "bg-[var(--color-amber)] text-black" : "bg-[var(--color-red)] text-white") : "bg-[var(--color-blue-deep)] text-white"
              }`}
              aria-label={failed ? (advisory ? "Needs review" : "Failed") : "Passed"}
            >
              {failed ? (advisory ? "!" : "×") : "✓"}
            </span>
            <span className="min-w-0">
              <span className="font-[620]">{c.label}</span>
              {(c.detail || c.result) && <span className="block text-[13px] text-[var(--color-muted)]">{c.detail ?? c.result}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Authority({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4V4Zm0 6h16v4H4v-4Zm0 6h16v4H4v-4Z" fill="#03045e" /></svg>
      {text}
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md bg-[var(--color-red-pale)] px-3 py-2 text-[14px] text-black">{children}</p>;
}
