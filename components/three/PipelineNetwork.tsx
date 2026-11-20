"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { PIPES, type Vec3 } from "@/lib/world";
import { COLORS, useTwin } from "./twin";

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFlow;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLength;
  uniform float uOpacity;
  uniform float uActive;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec3 l = normalize(vec3(0.4, 0.9, 0.5));
    float diff = 0.45 + 0.55 * max(dot(vNormal, l), 0.0);
    float d = vUv.x * uLength;
    float phase = fract(d / 3.6 - uTime * uSpeed);
    float pulse = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.12, 0.42, phase));
    vec3 base = uColor * diff;
    vec3 col = mix(base, uFlow, pulse * 0.55 * uActive);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function makeFlowMaterial(color: string) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uFlow: { value: new THREE.Color(COLORS.blue) },
      uTime: { value: 0 },
      uSpeed: { value: 0.5 },
      uLength: { value: 10 },
      uOpacity: { value: 1 },
      uActive: { value: 1 },
    },
  });
  m.userData.baseOpacity = 1;
  return m;
}

export function pathGeometry(pts: Vec3[], radius: number) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < pts.length - 1; i++) {
    path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
  }
  const segs = Math.max(8, Math.round(path.getLength() * 3));
  const geo = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, segs, radius, 10, false);
  return { geo, length: path.getLength() };
}

interface FlowPipeProps { edge: string; pts: Vec3[]; r: number }

function FlowPipe({ edge, pts, r }: FlowPipeProps) {
  const { state, reducedMotion, select, hover } = useTwin();
  const { geo, length } = useMemo(() => pathGeometry(pts, r), [pts, r]);
  const mat = useMemo(() => makeFlowMaterial(COLORS.steel), []);
  const [from, to] = edge.split(">");
  const flow = state?.flows.find((f) => f.from === from && f.to === to);
  const leaking = edge === "V-04B>BR-4H" && !!state?.leak.active;
  const feedsLeak = !!state?.leak.active && ["PS-01>V-04A", "V-04A>SEC-04", "SEC-04>V-04B"].includes(edge);
  const isolated = edge === "V-04B>BR-4H" && !!state?.leak.isolated;

  useFrame((_, dt) => {
    const u = mat.uniforms;
    const m3h = flow?.m3h ?? 0;
    u.uLength.value = length;
    u.uSpeed.value = reducedMotion ? 0 : 0.18 + Math.min(m3h, 1300) / 900;
    u.uTime.value += dt;
    u.uActive.value = isolated || !state ? 0 : 1;
    (u.uFlow.value as THREE.Color).set(leaking ? COLORS.red : feedsLeak ? "#03b5d0" : COLORS.blue);
    (u.uColor.value as THREE.Color).set(leaking ? "#b9898e" : isolated ? COLORS.grey : COLORS.steel);
  });

  return (
    <mesh
      geometry={geo}
      material={mat}
      onClick={(e) => { e.stopPropagation(); select(`pipe:${edge}`); }}
      onPointerOver={(e) => { e.stopPropagation(); hover(`pipe:${edge}`); }}
      onPointerOut={() => hover(null)}
    />
  );
}

export function PipelineNetwork({ layer }: { layer: number }) {
  return (
    <group>
      {Object.entries(PIPES)
        .filter(([, p]) => p.layer === layer)
        .map(([edge, p]) => <FlowPipe key={edge} edge={edge} pts={p.pts} r={p.r} />)}
    </group>
  );
}
