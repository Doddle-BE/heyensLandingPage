import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useCompositionTime } from "@editframe/react/r3f";

const DURATION_MS = 30_000;

// ---------- Helpers ----------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// "Pulse" — 0 outside the window, smooth bell-curve inside [start, end].
const pulse = (t: number, start: number, end: number) => {
  if (t <= start || t >= end) return 0;
  const u = (t - start) / (end - start);
  return Math.sin(u * Math.PI);
};

// ---------- Stars (instanced points across multiple depth layers) ----------
function StarLayer({
  count,
  range,
  size,
  speed,
  brightness,
}: {
  count: number;
  range: number; // half-extent of cube
  size: number;
  speed: number;
  brightness: number;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const { timeMs } = useCompositionTime();

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // Warm cream palette with a few gold/blue accents.
    const palette = [
      [1.0, 0.95, 0.82], // cream
      [1.0, 0.88, 0.66], // warm gold
      [0.92, 0.92, 1.0], // cool white
      [1.0, 0.78, 0.5], // amber (rare)
    ];
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 2 * range;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * range;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * range;
      const p = palette[Math.random() < 0.05 ? 3 : Math.floor(Math.random() * 3)];
      const j = 0.7 + Math.random() * 0.3; // brightness jitter
      colors[i * 3 + 0] = p[0] * j;
      colors[i * 3 + 1] = p[1] * j;
      colors[i * 3 + 2] = p[2] * j;
    }
    return { positions, colors };
  }, [count, range]);

  useFrame(() => {
    if (!pointsRef.current) return;
    // Move stars toward the camera; when they pass behind, wrap to the back.
    const t = timeMs / 1000;
    const offset = (t * speed) % (range * 2);
    pointsRef.current.position.z = offset;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        sizeAttenuation
        vertexColors
        transparent
        opacity={brightness}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------- Distant nebula glow (large soft sprite quads) ----------
function NebulaGlow() {
  const { timeMs } = useCompositionTime();
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (!groupRef.current) return;
    const t = timeMs / 1000;
    groupRef.current.rotation.z = t * 0.01;
  });

  const blobs = useMemo(
    () => [
      { pos: [-30, 12, -90] as [number, number, number], color: "#3a1f5e", scale: 70 },
      { pos: [40, -18, -120] as [number, number, number], color: "#5e2a1a", scale: 90 },
      { pos: [-10, -25, -150] as [number, number, number], color: "#1a3a4a", scale: 80 },
    ],
    [],
  );

  return (
    <group ref={groupRef}>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <planeGeometry args={[b.scale, b.scale]} />
          <meshBasicMaterial
            color={b.color}
            transparent
            opacity={0.35}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------- Passing planet ----------
function PassingPlanet({
  startSec,
  endSec,
  startPos,
  endPos,
  radius,
  color,
  emissive,
}: {
  startSec: number;
  endSec: number;
  startPos: [number, number, number];
  endPos: [number, number, number];
  radius: number;
  color: string;
  emissive: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { timeMs } = useCompositionTime();

  useFrame(() => {
    if (!meshRef.current) return;
    const t = timeMs / 1000;
    const u = smoothstep(startSec, endSec, t);
    const visible = t >= startSec - 0.5 && t <= endSec + 0.5;
    meshRef.current.visible = visible;
    if (!visible) return;
    meshRef.current.position.set(
      lerp(startPos[0], endPos[0], u),
      lerp(startPos[1], endPos[1], u),
      lerp(startPos[2], endPos[2], u),
    );
    meshRef.current.rotation.y = t * 0.15;
    // Fade in/out at the edges of its window.
    const fade =
      smoothstep(startSec, startSec + 1.0, t) *
      (1 - smoothstep(endSec - 1.0, endSec, t));
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.opacity = fade;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={0.25}
        roughness={0.9}
        metalness={0.05}
        transparent
      />
    </mesh>
  );
}

// ---------- Asteroid field ----------
function AsteroidField({ startSec, endSec }: { startSec: number; endSec: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { timeMs } = useCompositionTime();

  const rocks = useMemo(() => {
    const out: {
      pos: [number, number, number];
      rot: [number, number, number];
      scale: number;
      spin: number;
    }[] = [];
    for (let i = 0; i < 25; i++) {
      out.push({
        pos: [
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 18,
          -60 - Math.random() * 40,
        ],
        rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
        scale: 0.3 + Math.random() * 1.2,
        spin: 0.2 + Math.random() * 0.6,
      });
    }
    return out;
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    const t = timeMs / 1000;
    const visible = t >= startSec - 0.3 && t <= endSec + 0.3;
    groupRef.current.visible = visible;
    if (!visible) return;
    // Drift the whole field toward camera during its window.
    const u = smoothstep(startSec, endSec, t);
    groupRef.current.position.z = lerp(0, 80, u);
    groupRef.current.rotation.z = t * 0.05;

    const fade =
      smoothstep(startSec, startSec + 0.6, t) *
      (1 - smoothstep(endSec - 0.6, endSec, t));
    groupRef.current.children.forEach((child, i) => {
      child.rotation.x += rocks[i].spin * 0.01;
      child.rotation.y += rocks[i].spin * 0.013;
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = fade;
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {rocks.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={r.rot} scale={r.scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#5a4a3a"
            roughness={1.0}
            metalness={0.1}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------- Mysterious monolith ----------
function Monolith({ startSec, endSec }: { startSec: number; endSec: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { timeMs } = useCompositionTime();

  useFrame(() => {
    if (!meshRef.current) return;
    const t = timeMs / 1000;
    const visible = t >= startSec - 0.3 && t <= endSec + 0.3;
    meshRef.current.visible = visible;
    if (!visible) return;
    const u = smoothstep(startSec, endSec, t);
    // Drifts past from far left to mid distance, slowly rotating.
    meshRef.current.position.set(lerp(-18, 8, u), lerp(2, -1, u), lerp(-70, -25, u));
    meshRef.current.rotation.y = t * 0.08;
    meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.05;
    const fade =
      smoothstep(startSec, startSec + 1.0, t) *
      (1 - smoothstep(endSec - 1.0, endSec, t));
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.opacity = fade;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <boxGeometry args={[1.2, 6, 0.4]} />
      <meshStandardMaterial
        color="#0a0a0f"
        emissive="#1a1f2e"
        emissiveIntensity={0.2}
        roughness={0.15}
        metalness={0.95}
        transparent
      />
    </mesh>
  );
}

// ---------- Camera flythrough + glitch shake ----------
function FlyCamera({ glitches }: { glitches: { at: number; dur: number }[] }) {
  const { camera } = useThree();
  const { timeMs } = useCompositionTime();

  useFrame(() => {
    const t = timeMs / 1000;
    // Slow forward drift creates the "flying" feel; stars do the heavy lifting.
    camera.position.x = Math.sin(t * 0.08) * 1.2;
    camera.position.y = Math.cos(t * 0.06) * 0.8;
    camera.position.z = 0;
    // Subtle roll
    camera.rotation.z = Math.sin(t * 0.05) * 0.04;

    // Glitch shake during anomaly windows.
    let shake = 0;
    for (const g of glitches) {
      shake += pulse(t, g.at, g.at + g.dur);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      camera.rotation.z += (Math.random() - 0.5) * shake * 0.05;
    }

    camera.lookAt(0, 0, -10);
  });

  return null;
}

// ---------- Glitch overlay (a colored plane in front of the camera) ----------
function GlitchOverlay({ glitches }: { glitches: { at: number; dur: number }[] }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { timeMs } = useCompositionTime();

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    const t = timeMs / 1000;
    let intensity = 0;
    for (const g of glitches) intensity = Math.max(intensity, pulse(t, g.at, g.at + g.dur));
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = intensity * 0.35;
    // Flicker color
    const flicker = Math.random() < 0.3 ? "#ff3366" : "#33ddff";
    mat.color.set(flicker);
    // Stick the plane to the camera.
    meshRef.current.position.copy(camera.position);
    meshRef.current.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.6));
    meshRef.current.quaternion.copy(camera.quaternion);
    meshRef.current.visible = intensity > 0.001;
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={9999}>
      <planeGeometry args={[3, 2]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------- Scene root ----------
export function StarfieldScene() {
  // Schedule of mysterious events across the 30s timeline.
  const glitches = [
    { at: 4.0, dur: 0.4 },
    { at: 11.5, dur: 0.6 },
    { at: 18.2, dur: 0.35 },
    { at: 24.8, dur: 0.5 },
  ];

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 5, 5]} intensity={0.4} color="#fff5e0" />
      <directionalLight position={[-8, -3, -2]} intensity={0.25} color="#5a7aff" />

      <NebulaGlow />

      <StarLayer count={2000} range={120} size={0.05} speed={2} brightness={0.45} />
      <StarLayer count={1200} range={80} size={0.12} speed={6} brightness={0.7} />
      <StarLayer count={600} range={50} size={0.22} speed={14} brightness={0.95} />
      <StarLayer count={120} range={30} size={0.4} speed={28} brightness={1.0} />

      {/* Passing planet — large warm gas giant drifting by */}
      <PassingPlanet
        startSec={6}
        endSec={12}
        startPos={[20, -3, -55]}
        endPos={[-8, -1, -20]}
        radius={3.2}
        color="#c87a3a"
        emissive="#3a1808"
      />

      {/* Smaller cool moon-like body later */}
      <PassingPlanet
        startSec={20}
        endSec={26}
        startPos={[-15, 5, -45]}
        endPos={[10, 2, -15]}
        radius={1.6}
        color="#8aa2c8"
        emissive="#0a1a2a"
      />

      <AsteroidField startSec={14} endSec={19} />
      <Monolith startSec={9} endSec={16} />

      <FlyCamera glitches={glitches} />
      <GlitchOverlay glitches={glitches} />
    </>
  );
}

export { DURATION_MS };
