"use client";

import { usePathname } from "next/navigation";
import { useScenario } from "@/components/ScenarioController";

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0c1b48" />
        <path d="M16 5c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11Z" fill="#62a7ea" />
        <path d="M7 24h18M9 27h14" stroke="#fff44f" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[1.15rem] font-[760] tracking-[-0.01em]" style={{ fontStretch: "118%" }}>AquaGrid</span>
    </span>
  );
}

const LINKS = [
  { href: "/#system", label: "The system" },
  { href: "/#incident", label: "The incident" },
  { href: "/#desalination", label: "Desalination" },
  { href: "/#storage", label: "Storage" },
];

export function SiteHeader() {
  const { state, offline } = useScenario();
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-black/10 bg-white/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded focus:bg-[var(--color-yellow)] focus:px-3 focus:py-2">Skip to content</a>
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-10">
        {/* Use document navigation between WebGL scenes and the control room.
            This avoids React teardown racing with third-party scene DOM cleanup. */}
        <a href="/" aria-label="AquaGrid home"><Logo /></a>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3 py-2 text-[14.5px] font-[560] hover:bg-[var(--color-mist)]">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-[13px] sm:flex" role="status">
            <span className={`h-2.5 w-2.5 rounded-full ${offline ? "bg-[var(--color-red)]" : state ? "bg-[var(--color-green)]" : "bg-[var(--color-line)]"}`} aria-hidden="true" />
            {offline ? "Engine offline" : state ? `Engine live, ${state.scene.clock}` : "Connecting"}
          </span>
          <a href={path === "/control" ? "/" : "/control"} className="btn btn-primary btn-sm">
            {path === "/control" ? "Back to the story" : "Control room"}
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="on-navy bg-[var(--color-navy)] text-white">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-16 sm:px-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-white/80">
            AquaGrid is a demonstration digital twin for the Water, Energy &amp; Climate Resilience challenge. It shows how a coastal
            city can weigh energy cost against water security, and keep people in charge of what changes on the network.
          </p>
          <a href="/control" className="btn btn-primary mt-6">Open the control room</a>
        </div>
        <div className="text-[14px] leading-relaxed text-white/80">
          <h2 className="text-[15px] font-[680] text-white">What’s real and what isn’t</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>All telemetry is synthetic and deterministic. Every operational value on these pages is computed by the Python simulation engine; the browser only draws it.</li>
            <li>Storage follows next volume = volume + production − demand − modelled loss, hourly, over 10,000 m³ with an illustrative 35% floor.</li>
            <li>Energy uses a plant curve calibrated to 3.5 kWh/m³ at 600 m³/h, with illustrative tariffs of $0.32 (14:00–20:00) and $0.12/kWh.</li>
            <li>Valve control is simulated. Proposals and valve states are signed by the backend; nothing connects to a real actuator, PLC or SCADA system.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
