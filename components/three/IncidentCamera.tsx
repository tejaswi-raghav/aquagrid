"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CameraShot } from "@/lib/world";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Flies the camera to a shot whenever `shot` (identified by `shotKey`) changes,
 * then hands control back to the user's orbit controls.
 */
export function IncidentCamera({ shot, shotKey, duration = 1.8, reducedMotion, fitViewport = false }: { shot: CameraShot; shotKey: string; duration?: number; reducedMotion: boolean; fitViewport?: boolean | number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const flight = useRef<{ t: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const toPos = new THREE.Vector3(...shot.pos);
    const toTarget = new THREE.Vector3(...shot.target);
    if (fitViewport) toPos.sub(toTarget).multiplyScalar(Math.max(1, (typeof fitViewport === "number" ? fitViewport : 1.1) / (size.width / size.height))).add(toTarget);
    if (reducedMotion || !controls) {
      camera.position.copy(toPos);
      if (controls) { controls.target.copy(toTarget); controls.update(); }
      else camera.lookAt(toTarget);
      flight.current = null;
      return;
    }
    flight.current = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotKey, controls, fitViewport, size.width, size.height]);

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f || !controls) return;
    f.t = Math.min(1, f.t + dt / duration);
    const k = ease(f.t);
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    controls.update();
    if (f.t >= 1) flight.current = null;
  });
  return null;
}
