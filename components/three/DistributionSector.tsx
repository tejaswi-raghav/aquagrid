"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ASSET_POS, BRANCH_RECT, HOSPITAL, SECTORS } from "@/lib/world";
import { Asset } from "./Asset";
import { COLORS, std, useTwin } from "./twin";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Building { x: number; z: number; w: number; d: number; h: number; inBranch: boolean }

/** Procedural Gulf urban massing: low villas, mid-rise blocks, and a few towers. */
function layout(id: string): Building[] {
  const { rect, towers, seed } = SECTORS[id];
  const [x0, x1, z0, z1] = rect;
  const r = rng(seed);
  const out: Building[] = [];
  const step = 2.3;
  for (let x = x0 + 1.2; x < x1 - 0.8; x += step) {
    for (let z = z0 + 1.2; z < z1 - 0.8; z += step) {
      // Streets every fourth plot.
      if (Math.round((x - x0) / step) % 4 === 3 || Math.round((z - z0) / step) % 4 === 3) continue;
      if (r() < 0.14) continue;
      const roll = r();
      let h: number, w: number, d: number;
      if (roll < towers) { h = 4.5 + r() * 8.5; w = 1.3 + r() * 0.5; d = 1.3 + r() * 0.5; }
      else if (roll < towers + 0.28) { h = 1.4 + r() * 1.8; w = 1.6 + r() * 0.4; d = 1.5 + r() * 0.5; }
      else { h = 0.55 + r() * 0.55; w = 1.2 + r() * 0.6; d = 1.1 + r() * 0.6; }
      const [bx0, bx1, bz0, bz1] = BRANCH_RECT;
      const inBranch = id === "SEC-04" && x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1;
      if (id === "SEC-04" && Math.abs(x - HOSPITAL[0]) < 3 && Math.abs(z - HOSPITAL[2]) < 2.6) continue;
      out.push({ x, z, w, d, h, inBranch });
    }
  }
  return out;
}

const tmp = new THREE.Object3D();
const c = new THREE.Color();

export function DistributionSector({ id }: { id: string }) {
  const { state, showLabels } = useTwin();
  const buildings = useMemo(() => layout(id), [id]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => std(COLORS.white, { roughness: 0.9 }), []);
  const footprintMat = useMemo(() => std(COLORS.navy3, { opacity: 0.55 }), []);
  const status = state?.asset_status[id];
  const branchStatus = state?.asset_status["BR-4H"];

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    buildings.forEach((b, i) => {
      tmp.position.set(b.x, b.h / 2, b.z);
      tmp.scale.set(b.w, b.h, b.d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      let col = COLORS.white;
      if (b.inBranch && branchStatus === "critical") col = "#f3b6b6";
      else if (b.inBranch && branchStatus === "isolated") col = "#a9b3c6";
      else if (status === "critical") col = "#f7dede";
      m.setColorAt(i, c.set(col));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [buildings, status, branchStatus]);

  const [x0, x1, z0, z1] = SECTORS[id].rect;
  const centre = ASSET_POS[id].p;
  return (
    <group>
      <mesh material={footprintMat} position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
      </mesh>
      <Asset id={id} position={[centre[0], 0, centre[2]]} ring={3.2} labelY={7}>
        <group position={[-centre[0], 0, -centre[2]]}>
          <instancedMesh ref={ref} args={[undefined, undefined, buildings.length]} material={mat}>
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        </group>
      </Asset>
      {/* Sector names are shown in the selected-asset inspector rather than
          simultaneously projected onto the same skyline. */}
    </group>
  );
}

export function Hospital() {
  const mats = useMemo(() => ({ main: std("#ffffff", { roughness: 0.7 }), cross: std(COLORS.red, { emissive: COLORS.red, emissiveIntensity: 0.4 }) }), []);
  return (
    <group position={HOSPITAL}>
      <mesh material={mats.main} position={[0, 1.4, 0]}><boxGeometry args={[4.2, 2.8, 3.2]} /></mesh>
      <mesh material={mats.main} position={[-0.6, 3.4, 0]}><boxGeometry args={[2, 1.2, 2]} /></mesh>
      <mesh material={mats.cross} position={[-0.6, 4.05, 0]}><boxGeometry args={[1, 0.06, 0.3]} /></mesh>
      <mesh material={mats.cross} position={[-0.6, 4.05, 0]}><boxGeometry args={[0.3, 0.06, 1]} /></mesh>
    </group>
  );
}
