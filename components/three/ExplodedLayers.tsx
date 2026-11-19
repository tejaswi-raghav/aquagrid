"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { ASSET_POS, EXPLODE_OFFSET, LAYERS, RISERS } from "@/lib/world";
import { applyFade, COLORS, std, useTwin } from "./twin";

const SITE = { x0: -48, x1: 46, z0: -26, z1: 26 };

/** Moves a layer to its exploded height and fades it when another layer is in focus. */
export function LayerGroup({ layer, children }: { layer: number; children: ReactNode }) {
  const { explode, focusLayer, selected } = useTwin();
  const ref = useRef<THREE.Group>(null);
  const fade = useRef(1);
  const selectedLayer = selected?.startsWith("layer:") ? Number(selected.slice(6)) : null;
  const focus = focusLayer ?? selectedLayer;

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.y = EXPLODE_OFFSET[layer] * explode.current;
    const target = focus == null || focus === layer ? 1 : 0.16;
    const next = fade.current + (target - fade.current) * Math.min(1, dt * 4);
    const changed = Math.abs(next - fade.current) > 0.0005;
    fade.current = Math.abs(next - target) < 0.003 ? target : next;
    // Re-apply while faded so meshes mounted later (labels, rings) pick it up.
    if (changed || fade.current < 0.999 || g.userData.dirty !== false) {
      applyFade(g, fade.current);
      g.userData.dirty = false;
    }
  });
  return <group ref={ref} userData={{ layer }}>{children}</group>;
}

/** Translucent slab under each lifted layer, with its outline and a selectable label. */
export function LayerPlate({ layer }: { layer: number }) {
  const { explode } = useTwin();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.navy3, transparent: true, opacity: 0, depthWrite: false }), []);
  const edge = useMemo(() => new THREE.LineBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0 }), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(SITE.x1 - SITE.x0, 0.1, SITE.z1 - SITE.z0)), []);
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    const e = explode.current;
    if (ref.current) ref.current.position.y = EXPLODE_OFFSET[layer] * e - (layer === 2 ? 2.2 : 0.35);
    mat.opacity = (layer === 1 ? 0 : 0.42) * e;
    edge.opacity = 0.55 * e;
  });
  return (
    <group ref={ref}>
      <mesh material={mat} position={[(SITE.x0 + SITE.x1) / 2, 0, (SITE.z0 + SITE.z1) / 2]} raycast={() => null}>
        <boxGeometry args={[SITE.x1 - SITE.x0, 0.1, SITE.z1 - SITE.z0]} />
      </mesh>
      <lineSegments geometry={edges} material={edge} position={[(SITE.x0 + SITE.x1) / 2, 0, (SITE.z0 + SITE.z1) / 2]} raycast={() => null} />
      {/* Layer controls live in the fixed screen-space toolbar. Projected HTML
          pills collide with the narrative and with each other during camera moves. */}
    </group>
  );
}

/** Vertical links that keep the exploded layers visibly connected. */
export function Risers() {
  const { explode, focusLayer } = useTwin();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0, depthWrite: false }), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const e = explode.current;
    mat.opacity = (focusLayer == null ? 0.5 : 0.12) * Math.min(1, e * 1.5);
    RISERS.forEach(([, , from, to], i) => {
      const m = refs.current[i];
      if (!m) return;
      const yFrom = EXPLODE_OFFSET[from] * e + (from === 2 ? -1.1 : 0.3);
      const yTo = EXPLODE_OFFSET[to] * e + (to === 2 ? -1.1 : 0.3);
      const gap = Math.abs(yTo - yFrom);
      m.visible = gap > 0.6;
      m.scale.y = Math.max(gap, 0.001);
      m.position.y = (yFrom + yTo) / 2;
    });
  });
  return (
    <group>
      {RISERS.map(([x, z], i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} material={mat} position={[x, 0, z]} raycast={() => null}>
          <cylinderGeometry args={[0.045, 0.045, 1, 6]} />
        </mesh>
      ))}
    </group>
  );
}

export function Ground() {
  const mats = useMemo(() => ({
    land: std("#1b2f6b", { opacity: 0.86, roughness: 1 }),
    beach: std("#c9b98f", { roughness: 1 }),
    road: std("#2a3f80", { roughness: 1 }),
  }), []);
  return (
    <group>
      <mesh material={mats.land} position={[8, -0.06, 0]} receiveShadow><boxGeometry args={[76, 0.1, 52]} /></mesh>
      <mesh material={mats.beach} position={[-31, -0.08, 0]}><boxGeometry args={[2.2, 0.1, 52]} /></mesh>
      {/* Coastal road and ring road */}
      <mesh material={mats.road} position={[8, 0.0, 8]}><boxGeometry args={[76, 0.02, 0.9]} /></mesh>
      <mesh material={mats.road} position={[11.5, 0.0, 0]}><boxGeometry args={[0.9, 0.02, 52]} /></mesh>
    </group>
  );
}

export function Sea() {
  const mats = useMemo(() => ({
    sea: std(COLORS.sea, { opacity: 0.7, roughness: 0.85, metalness: 0 }),
    bed: std("#0f2559", { roughness: 1 }),
  }), []);
  return (
    <group>
      <mesh material={mats.sea} position={[-46, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[32, 52]} /></mesh>
      <mesh material={mats.bed} position={[-46, -2.3, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[32, 52]} /></mesh>
    </group>
  );
}

export function assetWorldY(id: string, explode: number) {
  const a = ASSET_POS[id];
  return a ? a.p[1] + EXPLODE_OFFSET[a.layer] * explode : 0;
}
