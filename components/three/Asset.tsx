"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/world";
import { COLORS, std, useTwin } from "./twin";
import { ASSET_NAMES, statusLabel } from "@/lib/assets";

interface AssetProps {
  id: string;
  position?: Vec3;
  ring?: number;
  labelY?: number;
  label?: boolean;
  children: ReactNode;
}

/** Wraps an asset's geometry with selection, hover and an editorial label. */
export function Asset({ id, position = [0, 0, 0], ring = 1.6, labelY = 3, label = true, children }: AssetProps) {
  const { selected, hovered, select, hover, state } = useTwin();
  const isSel = selected === id;
  const isHover = hovered === id;
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => std(COLORS.yellow, { emissive: COLORS.yellow, emissiveIntensity: 0.6, roughness: 0.4 }), []);

  useFrame(({ clock }) => {
    if (ringRef.current) ringRef.current.rotation.z = clock.elapsedTime * 0.35;
  });

  const status = state?.asset_status[id];
  return (
    <group position={position}>
      <group
        onClick={(e) => { e.stopPropagation(); select(isSel ? null : id); }}
        onPointerOver={(e) => { e.stopPropagation(); hover(id); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { hover(null); document.body.style.cursor = ""; }}
      >
        {children}
      </group>
      {(isSel || isHover) && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} material={ringMat}>
          <ringGeometry args={[ring, ring + (isSel ? 0.22 : 0.12), 48, 1, 0, Math.PI * 1.8]} />
        </mesh>
      )}

    </group>
  );
}
