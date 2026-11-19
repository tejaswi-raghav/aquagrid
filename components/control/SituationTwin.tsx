"use client";

import { useMemo, useRef, useState } from "react";
import { CoastalCity } from "@/components/three/CoastalCity";
import { ExplodeDriver, ViewBridge, type ViewApi } from "@/components/three/Bridges";
import { IncidentCamera } from "@/components/three/IncidentCamera";
import { TwinCanvas } from "@/components/three/TwinCanvas";
import type { TwinApi } from "@/components/three/twin";
import type { SimState } from "@/lib/api";
import { ASSET_NAMES, statusLabel } from "@/lib/assets";
import { useInView, useReducedMotion } from "@/lib/hooks";
import { ASSET_POS, EXPLODED_SHOT, EXPLODE_OFFSET, HOME_SHOT, LAYERS, type CameraShot } from "@/lib/world";

/** Live 3D view of the operational scenario. Selecting an asset flies the camera to it. */
export function SituationTwin({ state, selected, onSelect, lockedValve, active = true }: {
  state: SimState; selected: string; onSelect: (id: string) => void; lockedValve: string | null; active?: boolean;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>("120px");
  const [exploded, setExploded] = useState(true);
  const [follow, setFollow] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const explode = useRef(1);
  const explodeTarget = useRef(1);
  const view = useRef<ViewApi | null>(null);
  explodeTarget.current = exploded ? 1 : 0;

  const pos = ASSET_POS[selected];
  const shot: CameraShot = useMemo(() => {
    if (!follow || !pos) return exploded ? EXPLODED_SHOT : HOME_SHOT;
    const y = pos.p[1] + (exploded ? EXPLODE_OFFSET[pos.layer] : 0);
    const t: [number, number, number] = [pos.p[0], y, pos.p[2]];
    const far = selected.startsWith("SEC-") ? 1.7 : 1.35;
    return { target: t, pos: [t[0] + 22 * far, t[1] + 15 * far, t[2] + 28 * far] };
  }, [follow, pos, exploded, selected]);

  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget,
    focusLayer: exploded && follow && pos ? pos.layer : null,
    selected, hovered: null,
    select: (id) => { if (id && !id.startsWith("pipe:") && !id.startsWith("layer:")) onSelect(id); },
    hover: () => {}, state, reducedMotion: !!reduced, showLabels: false, lockedValve,
    selectLayer: (l) => onSelect(LAYERS[l - 1].assets[0]),
  }), [exploded, follow, pos, selected, onSelect, state, reduced, lockedValve]);

  const status = state.asset_status[selected];
  const layer = pos ? LAYERS[pos.layer - 1] : null;
  return (
    <div ref={ref} className="twin-stage on-navy">
      <TwinCanvas twin={twin} active={inView && active} label="Live 3D model of the operational scenario" initial={{ pos: EXPLODED_SHOT.pos }}>
        <ExplodeDriver />
        <ViewBridge apiRef={view} />
        <IncidentCamera shot={shot} shotKey={`${selected}-${exploded}-${follow}-${resetKey}`} reducedMotion={!!reduced} duration={1.6} fitViewport={1.3} />
        <CoastalCity />
      </TwinCanvas>

      <div className="twin-focus" aria-live="polite">
        {layer && <span className="twin-layer">Layer {layer.id}: {layer.short}</span>}
        <strong>{ASSET_NAMES[selected] ?? selected}</strong>
        <span className={`twin-status s-${status ?? "normal"}`}>{selected}, {statusLabel(status)}</span>
      </div>

      {state.alerts.length > 0 && (
        <ul className="twin-alerts" aria-label="Active incidents">
          {state.alerts.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onSelect(a.assets[0])} className={`sev-${a.severity}`}>
                <span className="pulse" aria-hidden="true" />{a.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="twin-tools">
        <button type="button" aria-pressed={exploded} onClick={() => setExploded((v) => !v)}>{exploded ? "Assemble layers" : "Separate layers"}</button>
        <button type="button" aria-pressed={follow} onClick={() => setFollow((v) => !v)}>Follow selection</button>
        <button type="button" className="round" aria-label="Zoom in" onClick={() => view.current?.zoom(0.8)}>+</button>
        <button type="button" className="round" aria-label="Zoom out" onClick={() => view.current?.zoom(1.25)}>−</button>
        <button type="button" onClick={() => { setFollow(false); setResetKey((k) => k + 1); }}>Overview</button>
      </div>
    </div>
  );
}
