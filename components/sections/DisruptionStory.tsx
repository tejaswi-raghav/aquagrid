"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScenario } from "@/components/ScenarioController";
import type { SimState } from "@/lib/api";
import { useInView, useReducedMotion, useWebGL } from "@/lib/hooks";
import { StoryCanvas } from "./StoryCanvas";
import { SceneBloom, SceneControl, SceneDecision, SceneFlatline, SceneLeak, SceneNormal, SceneTariff } from "./Scenes";

const SCENES = [
  { id: 1, clock: "13:00", title: "Normal operations", summary: "Production, storage and demand in balance." },
  { id: 2, clock: "14:00", title: "The tariff spike", summary: "Electricity jumps to the peak rate. Making water suddenly costs far more." },
  { id: 3, clock: "14:06", title: "A leak in Sector 4", summary: "A main breaks under the Harbour branch." },
  { id: 4, clock: "14:09", title: "A sensor that lies", summary: "One pressure sensor stops moving." },
  { id: 5, clock: "14:12", title: "Algal-bloom warning", summary: "The sea at the intake is changing." },
  { id: 6, clock: "14:15", title: "The unsafe decision", summary: "An AI agent proposes cutting production to save money." },
  { id: 7, clock: "14:20", title: "Human control", summary: "Isolating the leak needs a person’s approval." },
];

export function DisruptionStory() {
  const { scene, setScene, state, loading, offline, retry } = useScenario();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [stageRef, inView] = useInView<HTMLDivElement>("0px");
  const cards = useRef<(HTMLElement | null)[]>([]);
  const [lockedValve, setLockedValve] = useState<string | null>(null);
  const [projection, setProjection] = useState<number | null>(null);
  const onLock = useCallback((v: string | null) => setLockedValve(v), []);
  const onProjection = useCallback((p: number | null) => setProjection(p), []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setScene(Number((e.target as HTMLElement).dataset.scene));
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    cards.current.forEach((c) => c && io.observe(c));
    return () => io.disconnect();
  }, [setScene]);

  const goTo = (n: number) => {
    setScene(n);
    cards.current[n - 1]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const live = state && state.scene.id === scene ? state : null;
  // Keep each step's last backend snapshot mounted so cards never shrink as you scroll past.
  const [snapshots, setSnapshots] = useState<Record<number, SimState>>({});
  useEffect(() => { if (live) setSnapshots((m) => (m[live.scene.id] === live ? m : { ...m, [live.scene.id]: live })); }, [live]);

  return (
    <section id="incident" aria-labelledby="story-title" className="bg-[var(--color-paper)]">
      <header className="mx-auto max-w-[1400px] px-5 pb-10 pt-24 sm:px-10">
        <h2 id="story-title" className="type-display max-w-[14ch]">One city. Four disruptions.</h2>
        <p className="measure mt-6 text-[1.125rem] leading-relaxed">
          Between 14:00 and 14:20 a tariff spike, a burst main, a frozen sensor and an algal bloom arrive together. Step through what
          the control room sees, what the simulation engine checks, and the one decision it refuses to let through.
        </p>
      </header>

      <div className="mx-auto flex max-w-[1400px] flex-col md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-10 md:px-10">
        {/* Sticky viewport */}
        <div ref={stageRef} className="sticky top-16 z-10 h-[42svh] min-w-0 md:top-20 md:h-[calc(100svh-6rem)]">
          <div className="on-navy relative h-full overflow-hidden bg-[var(--color-navy)] md:rounded-2xl">
            {webgl !== null && (
              <StoryCanvas
                scene={scene} state={live} active={inView} reduced={reduced} use3d={webgl}
                lockedValve={scene === 7 ? lockedValve : null} projectedStoragePct={scene === 6 ? projection : null}
              />
            )}
            <nav aria-label="Scenario steps" className="absolute inset-x-0 top-0 flex gap-1 overflow-x-auto bg-gradient-to-b from-[rgba(12,27,72,0.92)] to-transparent p-3 text-white">
              {SCENES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(s.id)}
                  aria-current={scene === s.id ? "step" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-[640] transition-colors ${scene === s.id ? "bg-[var(--color-yellow)] text-black" : "text-white/80 hover:bg-white/10"}`}
                >
                  {s.clock}
                </button>
              ))}
            </nav>
            {live && live.alerts.length > 0 && (
              <ul className="absolute bottom-3 left-3 hidden max-w-[60%] space-y-1.5 md:block" aria-label="Active alerts">
                {live.alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-md bg-[rgba(12,27,72,0.86)] px-2.5 py-1.5 text-[12.5px] text-white">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.severity === "critical" ? "#d33a3f" : a.severity === "warning" ? "#e8892b" : "#62a7ea" }} aria-hidden="true" />
                    <span className="font-[600]">{a.title}</span>
                    <span className="opacity-60">{a.raised_at}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Scene cards */}
        <ol className="relative z-0 min-w-0 px-5 md:px-0">
          {SCENES.map((s) => {
            const active = scene === s.id;
            const ready = (active && live) || snapshots[s.id];
            return (
              <li
                key={s.id}
                ref={(el) => { cards.current[s.id - 1] = el; }}
                data-scene={s.id}
                aria-current={active ? "step" : undefined}
                className="scroll-mt-[50svh] border-t border-[var(--color-line)] py-14 md:min-h-[88svh] md:scroll-mt-24"
              >
                <div className="flex items-baseline gap-4">
                  <span className={`type-figure text-[2.5rem] leading-none ${active ? "marker" : "text-[var(--color-muted)]"}`}>{s.clock}</span>
                  <span className="text-[14px] text-[var(--color-muted)]">Step {s.id} of 7</span>
                </div>
                <h3 className="type-h2 mt-4 text-[clamp(1.75rem,2.6vw,2.4rem)]">{s.title}</h3>
                <div className="mt-6 space-y-6">
                  {!ready && (
                    <p className="text-[1.0625rem] leading-relaxed text-[var(--color-muted)]">
                      {s.summary} {active && loading ? "Loading the simulation…" : ""}
                    </p>
                  )}
                  {active && offline && (
                    <div className="rounded-lg bg-[var(--color-red-pale)] p-4 text-[14.5px]">
                      <p className="font-[680]">The simulation engine isn’t responding.</p>
                      <p className="mt-1">Every value on this page comes from it, so nothing is shown in its place. Start it with <code>npm run dev:api</code>, then try again.</p>
                      <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={retry}>Try again</button>
                    </div>
                  )}
                  {ready && s.id === 1 && <SceneNormal s={ready} />}
                  {ready && s.id === 2 && <SceneTariff s={ready} />}
                  {ready && s.id === 3 && <SceneLeak s={ready} />}
                  {ready && s.id === 4 && <SceneFlatline s={ready} active={active} />}
                  {ready && s.id === 5 && <SceneBloom s={ready} />}
                  {ready && s.id === 6 && <SceneDecision s={ready} active={active} onProjection={onProjection} />}
                  {ready && s.id === 7 && <SceneControl s={ready} onLock={onLock} />}
                </div>
                <div className="mt-8 flex gap-2">
                  {s.id > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(s.id - 1)}>Previous step</button>}
                  {s.id < 7 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(s.id + 1)}>Next step</button>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
