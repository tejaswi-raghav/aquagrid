"use client";

import { AnimatePresence, motion } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoastalCity } from "@/components/three/CoastalCity";
import { ExplodeDriver, ViewBridge, type ViewApi } from "@/components/three/Bridges";
import { IncidentCamera } from "@/components/three/IncidentCamera";
import { TwinCanvas } from "@/components/three/TwinCanvas";
import type { TwinApi } from "@/components/three/twin";
import { useScenario } from "@/components/ScenarioController";
import { useInView, useReducedMotion, useWebGL } from "@/lib/hooks";
import { EXPLODED_SHOT, HOME_SHOT, LAYERS } from "@/lib/world";
import { InfoPanel } from "./InfoPanel";
import { Schematic2D } from "./Schematic2D";

/** Scroll progress → [explode amount, narrated layer]. */
function mapProgress(p: number): [number, number | null] {
  const explode = Math.min(1, Math.max(0, (p - 0.06) / 0.3));
  if (p < 0.4 || p > 0.97) return [explode, null];
  return [explode, Math.min(5, 1 + Math.floor(((p - 0.4) / 0.57) * 5))];
}

export function ExplodedView() {
  const { state } = useScenario();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [flat, setFlat] = useState(false);
  const [sectionRef, inView, sectionEl] = useInView<HTMLElement>("100px");
  const explode = useRef(0);
  const explodeTarget = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [narr, setNarr] = useState<number | null>(null);
  const [intro, setIntro] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [labels, setLabels] = useState(true);
  const [explore, setExplore] = useState(false);
  const [shotKey, setShotKey] = useState("home");
  const manual = useRef(false);
  // Furthest scroll progress reached: the sequence only plays forward.
  const maxProgress = useRef(0);
  const [snap, setSnap] = useState(false);
  const view = useRef<ViewApi | null>(null);

  const use3d = webgl !== false && !flat;

  useEffect(() => {
    if (reduced) return;
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionEl;
    if (!el) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        if (self.direction < 0) {
          // Scrolling up: no rewind, the model stays as it is. Back at the top,
          // cut straight to the intro so the next scroll down plays it again.
          if (p < 0.08 && maxProgress.current >= 0.08) {
            maxProgress.current = 0;
            manual.current = false;
            explodeTarget.current = 0;
            explode.current = 0;
            setSnap(true);
            setExploded(false);
            setNarr(null);
            setIntro(true);
          }
          return;
        }
        if (p <= maxProgress.current) return;
        maxProgress.current = p;
        setSnap(false);
        const [e, layer] = mapProgress(p);
        if (!manual.current) { explodeTarget.current = e; setExploded(e > 0.5); }
        setNarr(layer);
        setIntro(p < 0.08);
      },
      onLeave: () => { manual.current = false; },
      onLeaveBack: () => { manual.current = false; },
    });
    return () => st.kill();
  }, [reduced, sectionEl]);

  const toggleExplode = useCallback(() => {
    manual.current = true;
    const next = explodeTarget.current > 0.5 ? 0 : 1;
    explodeTarget.current = next;
    setSnap(false);
    setExploded(next > 0.5);
    setIntro(false);
  }, []);

  const selectLayer = useCallback((l: number) => setSelected((s) => (s === `layer:${l}` ? null : `layer:${l}`)), []);

  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget, focusLayer: selected ? null : narr, selected, hovered,
    select: setSelected, hover: setHovered, state, reducedMotion: reduced, showLabels: labels,
    lockedValve: null, selectLayer,
  }), [selected, hovered, narr, state, reduced, labels, selectLayer]);

  const narrLayer = narr ? LAYERS[narr - 1] : null;

  return (
    <section id="system" ref={sectionRef} aria-labelledby="hero-title" className={reduced ? "relative" : "relative h-[340vh]"}>
      <div className="on-navy sticky top-0 h-[100svh] overflow-hidden bg-[var(--color-navy)] text-white">
        <div className="absolute inset-0">
          {use3d ? (
            webgl === null ? null : (
              <TwinCanvas twin={twin} active={inView} enableZoom={explore} label="Interactive 3D model of the AquaGrid coastal water system in five layers">
                <ExplodeDriver />
                <ViewBridge apiRef={view} />
                <IncidentCamera shot={exploded ? EXPLODED_SHOT : HOME_SHOT} shotKey={`${shotKey}-${exploded}`} reducedMotion={reduced} instant={snap} duration={1.4} />
                <CoastalCity />
              </TwinCanvas>
            )
          ) : (
            <div className="flex h-full items-center justify-center px-4 pb-24 pt-24">
              <div className="h-full w-full max-w-6xl">
                <Schematic2D state={state} selected={selected} onSelect={(id) => setSelected((s) => (s === id ? null : id))} focusLayer={narr} />
              </div>
            </div>
          )}
        </div>

        {!intro && <h1 id="hero-title" className="sr-only">The city beneath the city</h1>}
        {/* Narrative overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-36 px-5 sm:bottom-28 sm:px-10">
          <AnimatePresence mode="wait">
            {intro ? (
              <motion.div key="intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: reduced ? 0 : 0.5 }} className="max-w-[46rem]">
                <h1 id={intro ? "hero-title" : undefined} className="type-display">The city beneath the city.</h1>
                <p className="mt-5 max-w-[34rem] text-[1.125rem] leading-relaxed text-white/85">
                  A coastal city runs on water it cannot see: seawater drawn offshore, desalinated, stored and pumped under every street.
                  {reduced ? " Use “Separate layers” to take it apart." : " Scroll to take it apart, layer by layer."}
                </p>
              </motion.div>
            ) : narrLayer ? (
              <motion.div key={narrLayer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.35 }} className="max-w-[30rem]">
                <p className="text-[15px] text-[var(--color-blue)]">Layer {narrLayer.id} of 5</p>
                <h2 className="type-h2 mt-1">{narrLayer.name}</h2>
                <p className="mt-3 text-[1.0625rem] leading-relaxed text-white/85">{narrLayer.role}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Editorial info panel */}
        <AnimatePresence>
          {selected && (
            <motion.div
              key="panel"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
              transition={{ duration: reduced ? 0 : 0.28 }}
              className="absolute right-4 top-20 z-20 w-[calc(100%-2rem)] max-w-[380px] sm:right-8 sm:top-24"
            >
              <InfoPanel selected={selected} state={state} onSelect={setSelected} onClose={() => setSelected(null)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 bg-[rgba(12,27,72,0.82)] px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={toggleExplode} disabled={!use3d}>
              {exploded ? "Collapse layers" : "Separate layers"}
            </button>
            <div role="group" aria-label="Layers" className="hidden items-center gap-1 md:flex">
              {LAYERS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => selectLayer(l.id)}
                  aria-pressed={selected === `layer:${l.id}`}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-[600] transition-colors ${selected === `layer:${l.id}` ? "bg-[var(--color-yellow)] text-black" : "text-white/85 hover:bg-white/10"}`}
                >
                  {l.short}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {use3d && (
              <>
                <button type="button" className="tool max-sm:hidden" aria-label="Zoom in" onClick={() => view.current?.zoom(0.8)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
                <button type="button" className="tool max-sm:hidden" aria-label="Zoom out" onClick={() => view.current?.zoom(1.25)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
                <button type="button" className="tool max-sm:hidden" aria-pressed={explore} aria-label="Scroll-wheel zoom" title="Let the mouse wheel zoom the model" onClick={() => setExplore((v) => !v)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v4" stroke="currentColor" strokeWidth="1.8" /></svg>
                </button>
                <button type="button" className="tool max-sm:hidden" aria-pressed={labels} aria-label="Sector labels" onClick={() => setLabels((v) => !v)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" stroke="currentColor" strokeWidth="1.8" /></svg>
                </button>
                <button type="button" className="btn btn-ghost btn-sm text-white" onClick={() => { setSnap(false); setShotKey(`home-${Date.now()}`); setSelected(null); }}>
                  Reset view
                </button>
              </>
            )}
            {webgl !== false && (
              <button type="button" className="btn btn-ghost btn-sm text-white" aria-pressed={flat} onClick={() => setFlat((v) => !v)}>
                {flat ? "3D view" : "2D view"}
              </button>
            )}
          </div>
        </div>
        {webgl === false && (
          <p className="absolute left-4 top-20 rounded bg-white px-3 py-2 text-[14px] text-black">This browser can’t show 3D, so you’re seeing the 2D section view.</p>
        )}
      </div>
    </section>
  );
}
