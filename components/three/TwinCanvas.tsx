"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { COLORS, TwinContext, type TwinApi } from "./twin";

interface Props {
  twin: TwinApi;
  children: ReactNode;
  active: boolean;
  enableZoom?: boolean;
  minDistance?: number;
  maxDistance?: number;
  label: string;
  fogRange?: [number, number];
  initial?: { pos: [number, number, number]; fov?: number };
}

/** One WebGL canvas with lights, orbit controls and the twin context. */
export function TwinCanvas({ twin, children, active, enableZoom = false, minDistance = 8, maxDistance = 220, label, initial, fogRange = [140, 320] }: Props) {
  return (
    <Canvas
      role="img"
      aria-label={label}
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ position: initial?.pos ?? [68, 46, 92], fov: initial?.fov ?? 32, near: 0.5, far: 600 }}
      onPointerMissed={() => twin.select(null)}
      style={{ background: COLORS.navy }}
    >
      <TwinContext.Provider value={twin}>
        <fog attach="fog" args={[COLORS.navy, ...fogRange]} />
        <hemisphereLight args={["#ffffff", "#0077b6", 1.15]} />
        <directionalLight position={[40, 70, 30]} intensity={1.8} color="#ffffff" />
        <directionalLight position={[-50, 20, -40]} intensity={0.55} color="#9cc4ef" />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enableZoom={enableZoom}
          enablePan
          screenSpacePanning
          minDistance={minDistance}
          maxDistance={maxDistance}
          maxPolarAngle={Math.PI * 0.62}
        />
        <Suspense fallback={null}>{children}</Suspense>
      </TwinContext.Provider>
    </Canvas>
  );
}
