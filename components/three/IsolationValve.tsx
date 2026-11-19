"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/world";
import { Asset } from "./Asset";
import { COLORS, std, useTwin } from "./twin";

/** Buried gate valve with a surface chamber, extension spindle and handwheel. */
export function IsolationValve({ id, position, rotationY = 0, locked = false }: { id: string; position: Vec3; rotationY?: number; locked?: boolean }) {
  const { state, reducedMotion } = useTwin();
  const closed = state?.valves[id]?.position === "closed";
  const wheel = useRef<THREE.Group>(null);
  const gate = useRef<THREE.Mesh>(null);
  const mats = useMemo(() => ({
    body: std("#3f5f9a", { metalness: 0.45, roughness: 0.45 }),
    wheel: std(COLORS.yellow, { metalness: 0.2, roughness: 0.5 }),
    spindle: std(COLORS.steel, { metalness: 0.6, roughness: 0.35 }),
    chamber: std(COLORS.concrete, { opacity: 0.28 }),
  }), []);

  useFrame((_, dt) => {
    const target = closed ? 1 : 0;
    if (!wheel.current || !gate.current) return;
    const cur = wheel.current.userData.t ?? 0;
    const next = reducedMotion ? target : cur + (target - cur) * Math.min(1, dt * 1.6);
    wheel.current.userData.t = next;
    wheel.current.rotation.y = next * Math.PI * 6;
    gate.current.position.y = 0.55 - next * 0.55;
  });

  return (
    <Asset id={id} position={position} ring={1.5} labelY={4.2}>
      <group rotation={[0, rotationY, 0]}>
        <mesh material={mats.body} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.5, 0.5, 1.4, 20]} /></mesh>
        <mesh material={mats.body} position={[0, 0.45, 0]}><boxGeometry args={[0.7, 0.6, 0.9]} /></mesh>
        <mesh ref={gate} material={mats.spindle} position={[0, 0.55, 0]}><boxGeometry args={[0.08, 0.7, 0.8]} /></mesh>
        <mesh material={mats.spindle} position={[0, 1.6, 0]}><cylinderGeometry args={[0.06, 0.06, 2.0, 8]} /></mesh>
        <group ref={wheel} position={[0, 2.65, 0]}>
          <mesh material={mats.wheel} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.55, 0.07, 8, 28]} /></mesh>
          <mesh material={mats.wheel}><boxGeometry args={[1.1, 0.06, 0.08]} /></mesh>
          <mesh material={mats.wheel}><boxGeometry args={[0.08, 0.06, 1.1]} /></mesh>
        </group>
        <mesh material={mats.chamber} position={[0, 1.2, 0]}><boxGeometry args={[2, 2.6, 2]} /></mesh>
      </group>
      {locked && <group position={[0, 4.2, 0]}>
        <mesh material={mats.wheel}><boxGeometry args={[.9, .7, .3]} /></mesh>
        <mesh material={mats.wheel} position={[0, .5, 0]}><torusGeometry args={[.3, .07, 8, 24, Math.PI]} /></mesh>
      </group>}

    </Asset>
  );
}
