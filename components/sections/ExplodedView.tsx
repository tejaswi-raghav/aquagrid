"use client";

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
  const labels = false;
  const [explore, setExplore] = useState(false);
  const [shotKey, setShotKey] = useState("home");
  const manual = useRef(false);
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
        const [e, layer] = mapProgress(self.progress);
        if (!manual.current) { explodeTarget.current = e; setExploded(e > 0.5); }
        if (!manual.current) { setNarr(layer); setIntro(self.progress < 0.08); }
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
    setExploded(next > 0.5);
    setIntro(next === 0);
    setNarr(null);
    setSelected(null);
  }, []);

  const selectLayer = useCallback((l: number) => setSelected((s) => (s === `layer:${l}` ? null : `layer:${l}`)), []);

  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget, focusLayer: selected ? null : narr, selected, hovered,
    select: setSelected, hover: setHovered, state, reducedMotion: reduced, showLabels: labels,
    lockedValve: null, selectLayer,
  }), [selected, hovered, narr, state, reduced, labels, selectLayer]);

  const layerNotes = [
    "Homes, businesses and essential services.",
    "Pipes, pumps and valves deliver water.",
    "Reservoirs buffer demand and protect reserves.",
    "Reverse osmosis turns seawater into freshwater.",
    "Offshore intake and source-quality monitoring.",
  ];
  const showLayers = exploded || !intro;
  const heroShot = exploded ? EXPLODED_SHOT : { ...HOME_SHOT, target: [0, -2, 0] as [number, number, number] };

  return (
    <section id="system" ref={sectionRef} aria-labelledby="hero-title" className={reduced ? "relative" : "relative h-[340vh]"}>
      <div className="on-navy system-stage">
        <h1 id="hero-title" className="sr-only">The city beneath the city</h1>
        <div className={`system-composition ${showLayers ? 'is-exploded' : 'is-intro'}`}>
          <aside className="system-caption">
            {selected && !selected.startsWith('layer:') ? (
              <div className="system-asset-details"><InfoPanel selected={selected} state={state} onSelect={setSelected} onClose={() => setSelected(null)} /></div>
            ) : showLayers ? (
              <>
                <p className="system-eyebrow">THE SYSTEM, LAYER BY LAYER</p>
                <nav className="system-layer-key" aria-label="Infrastructure layers and descriptions">
                  {LAYERS.map((layer, index) => <button key={layer.id} type="button"
                    aria-pressed={selected === `layer:${layer.id}` || (!selected && narr === layer.id)}
                    onClick={() => selectLayer(layer.id)}>
                    <span className="system-layer-number">{layer.id}</span>
                    <span><strong>{layer.name}</strong><small>{layerNotes[index]}</small></span>
                  </button>)}
                </nav>
              </>
            ) : (
              <div className="system-introduction">
                <p className="system-eyebrow">AQUAGRID / COAST TO CITY</p>
                <h2>The city beneath the city.</h2>
                <p>A coastal city runs on water it cannot see: drawn offshore, desalinated, stored and pumped under every street.</p>
                <span>{reduced ? 'Separate the layers to explore.' : 'Scroll to uncover the five layers.'}</span>
              </div>
            )}
          </aside>
          <div className="system-model">
            {use3d ? (webgl === null ? null : (
              <TwinCanvas twin={twin} active={inView} enableZoom={explore} maxDistance={450} fogRange={[350, 600]} label="Interactive 3D model of the AquaGrid coastal water system in five layers">
                <ExplodeDriver />
                <ViewBridge apiRef={view} />
                <IncidentCamera shot={heroShot} shotKey={`${shotKey}-${exploded}`} fitViewport={exploded ? .95 : 1.6} reducedMotion={reduced} duration={1.4} />
                <CoastalCity />
              </TwinCanvas>
            )) : (
              <div className="h-full w-full p-3"><Schematic2D state={state} selected={selected} onSelect={(id) => setSelected((current) => current === id ? null : id)} focusLayer={narr} /></div>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="system-toolbar flex flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={toggleExplode} disabled={!use3d}>
              {exploded ? "Collapse layers" : "Separate layers"}
            </button>

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
                <button type="button" className="btn btn-ghost btn-sm text-white" onClick={() => { setShotKey(`home-${Date.now()}`); setSelected(null); }}>
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
          <p className="absolute left-4 top-20 rounded bg-[var(--color-paper)] px-3 py-2 text-[14px] text-white">This browser can’t show 3D, so you’re seeing the 2D section view.</p>
        )}
      </div>
    </section>
  );
}
