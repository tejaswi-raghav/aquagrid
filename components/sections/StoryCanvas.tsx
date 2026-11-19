"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CoastalCity } from "@/components/three/CoastalCity";
import { ExplodeDriver } from "@/components/three/Bridges";
import { IncidentCamera } from "@/components/three/IncidentCamera";
import { TwinCanvas } from "@/components/three/TwinCanvas";
import type { TwinApi } from "@/components/three/twin";
import type { SimState } from "@/lib/api";
import { SCENE_SHOTS } from "@/lib/world";
import { InfoPanel } from "./InfoPanel";
import { Schematic2D } from "./Schematic2D";

export function StoryCanvas({ scene, state, active, reduced, use3d, lockedValve, projectedStoragePct }: {
  scene: number; state: SimState | null; active: boolean; reduced: boolean; use3d: boolean;
  lockedValve: string | null; projectedStoragePct: number | null;
}) {
  const shot = SCENE_SHOTS[scene];
  const explode = useRef(shot.explode);
  const explodeTarget = useRef(shot.explode);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Stepping back (scrolling up) cuts to the earlier shot instead of animating in reverse.
  const [prevScene, setPrevScene] = useState(scene);
  const [backward, setBackward] = useState(false);
  if (scene !== prevScene) { setPrevScene(scene); setBackward(scene < prevScene); }

  useEffect(() => {
    explodeTarget.current = shot.explode;
    if (backward) explode.current = shot.explode;
    setSelected(null);
    setHovered(shot.asset ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  // Scene 6: show the backend-projected minimum in the reservoirs when asked.
  const shown = useMemo<SimState | null>(() => {
    if (!state || projectedStoragePct == null) return state;
    return { ...state, storage: { ...state.storage, tanks: state.storage.tanks.map((t) => ({ ...t, pct: projectedStoragePct })) } };
  }, [state, projectedStoragePct]);

  const twin: TwinApi = useMemo(() => ({
    explode, explodeTarget, focusLayer: shot.focus, selected, hovered,
    select: setSelected, hover: (id: string | null) => setHovered(id ?? shot.asset ?? null), state: shown, reducedMotion: reduced, showLabels: scene === 1,
    lockedValve, selectLayer: (l: number) => setSelected(`layer:${l}`),
  }), [shot, selected, hovered, shown, reduced, scene, lockedValve]);

  return (
    <div className="relative h-full w-full">
      {use3d ? (
        <TwinCanvas twin={twin} active={active} enableZoom={false} label={`3D model focused on scene ${scene}`} initial={{ pos: shot.pos }}>
          <ExplodeDriver />
          <IncidentCamera shot={shot} shotKey={String(scene)} reducedMotion={reduced} instant={backward} duration={2} />
          <CoastalCity />
        </TwinCanvas>
      ) : (
        <div className="h-full p-3">
          <Schematic2D state={shown} selected={selected} onSelect={setSelected} focusLayer={shot.focus} />
        </div>
      )}
      {selected && (
        <div className="absolute bottom-3 right-3 z-20 w-[min(360px,calc(100%-1.5rem))]">
          <InfoPanel selected={selected} state={shown} onSelect={setSelected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
