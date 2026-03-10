"use client";

// app/components/pulse/PulseOrbR3F.tsx

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import BreathingRoomPulse from "./BreathingRoomPulse";

type Props = {
  size?: number;
  className?: string;
  disabled?: boolean;

  circleStyle?: React.CSSProperties;

  visualPulseEnabled: boolean;
  pulseNonce: number;
  keyframesName: string;

  showCue: boolean;
  cueText: string;

  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSpin?: (deg: number) => void;
  onSpinCommit?: (deg: number) => void;
};

function OrbScene({
  sizePx,
  coreSizePx,
  disabled,
  onSwipeUp,
  onSwipeDown,
  onSpin,
  onSpinCommit,
}: {
  sizePx: number;
  coreSizePx: number;
  disabled?: boolean;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSpin?: (deg: number) => void;
  onSpinCommit?: (deg: number) => void;
}) {
  // We rotate the 3D shell based on core gestures
  const spinDegRef = useRef(0);
  const tiltXDegRef = useRef(0);
  const tiltYDegRef = useRef(0);

  const groupRef = useRef<THREE.Group | null>(null);

  // Geometry/material created once
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1.0, 64, 64), []);
  const shellMat = useMemo(() => {
    // Glassy + very subtle (avoid “robot”)
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#dfe9ff"),
      transparent: true,
      opacity: 0.18,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 1.0,
      thickness: 0.25,
      ior: 1.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      specularIntensity: 1.0,
      depthWrite: false, // important for transparency stability
      depthTest: true,
    });
  }, []);

  // Depth-mask disc to “punch a hole” so shell never covers core
  // Ratio is based on diameters: coreSizePx / sizePx
  const maskRadius = useMemo(() => {
    const ratio = coreSizePx / sizePx; // 0.80 by your model
    // Sphere radius is 1.0, so mask radius should match the same ratio
    return Math.max(0.001, Math.min(0.999, ratio)) * 1.0;
  }, [coreSizePx, sizePx]);

  const maskGeo = useMemo(() => new THREE.CircleGeometry(1, 64), []);
  const maskMat = useMemo(() => {
    // Writes only to depth buffer (invisible), so sphere fragments behind fail depth test
    return new THREE.MeshBasicMaterial({
      color: 0x000000,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
    });
  }, []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    // Convert degrees -> radians
    const spinY = (spinDegRef.current * Math.PI) / 180;
    const tiltX = (tiltXDegRef.current * Math.PI) / 180;
    const tiltY = (tiltYDegRef.current * Math.PI) / 180;

    // Subtle, tasteful tilt; spin drives navigation feel
    g.rotation.set(tiltX, spinY, 0);
    // Optional: tiny Y-tilt as well (kept small)
    g.rotation.y = spinY + tiltY * 0.12;
  });

  return (
    <>
      {/* Lights tuned to feel like your glass UI (not “tech render”) */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[2.4, 2.0, 3.2]} intensity={1.15} />
      <directionalLight position={[-2.2, 0.5, 2.2]} intensity={0.45} />
      <directionalLight position={[0.0, -2.6, -2.2]} intensity={0.55} />

      {/* 3D shell group */}
      <group ref={groupRef}>
        {/* Depth mask FIRST (renderOrder lower): “punch hole” */}
        <mesh
          geometry={maskGeo}
          material={maskMat}
          renderOrder={1}
          // Slightly in front of shell so it reliably wins depth
          position={[0, 0, 0.35]}
          scale={[maskRadius, maskRadius, 1]}
        />

        {/* Shell sphere SECOND */}
        <mesh
          geometry={sphereGeo}
          material={shellMat}
          renderOrder={2}
          // slightly bigger than core by design (true shell feeling)
          scale={[1.12, 1.12, 1.12]}
        />

        {/* Optional: a soft rim ring to help readability when spinning */}
        <mesh renderOrder={3} scale={[1.13, 1.13, 1.13]}>
          <torusGeometry args={[1.0, 0.012, 10, 220]} />
          <meshBasicMaterial
            transparent
            opacity={0.12}
            color={"#ffffff"}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* CORE (DOM) on top – never affected by shell */}
      <Html
        transform={false}
        occlude={false}
        center
        style={{
          width: coreSizePx,
          height: coreSizePx,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            width: coreSizePx,
            height: coreSizePx,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BreathingRoomPulse
            size={coreSizePx}
            disabled={disabled}
            onSwipeUp={onSwipeUp}
            onSwipeDown={onSwipeDown}
            onSpin={(deg) => {
              spinDegRef.current = deg;
              onSpin?.(deg);
            }}
            onSpinCommit={(deg) => {
              onSpinCommit?.(deg);
            }}
            onTilt={(tx, ty) => {
              // Clamp tastefully
              tiltXDegRef.current = Math.max(-12, Math.min(12, tx));
              tiltYDegRef.current = Math.max(-12, Math.min(12, ty));
            }}
            // IMPORTANT: core should NOT visually spin if orb is the “navigator”
            lockVisualSpin
          />
        </div>
      </Html>
    </>
  );
}

export default function PulseOrbR3F({
  size = 320,
  className,
  disabled,
  circleStyle,
  visualPulseEnabled,
  pulseNonce,
  keyframesName,
  showCue,
  cueText,
  onSwipeUp,
  onSwipeDown,
  onSpin,
  onSpinCommit,
}: Props) {
  // Your sizing model:
  // core ≈ 80% of orb diameter
  const coreSizePx = Math.round(size * 0.8);

  return (
    <div
      className={["relative rounded-full overflow-hidden", className ?? ""].join(" ")}
      style={{
        ...(circleStyle ?? {}),
        width: size,
        height: size,

        // Keep your BR skin base
        background: "var(--breath-fill)",
        boxShadow: "var(--breath-shadow), inset 0 2px 10px rgba(255,255,255,0.12)",
        touchAction: "none",

        // ✅ CRITICAL: prevents blend/compositing from leaking and flipping theme
        isolation: "isolate",
      }}
      aria-label="Pulse orb"
    >
      {/* Canvas: pointer-events none; core receives gestures */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        <Canvas
          style={{ width: "100%", height: "100%" }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, premultipliedAlpha: true }}
          camera={{ fov: 30, position: [0, 0, 3.1], near: 0.1, far: 50 }}
        >
          <OrbScene
            sizePx={size}
            coreSizePx={coreSizePx}
            disabled={disabled}
            onSwipeUp={onSwipeUp}
            onSwipeDown={onSwipeDown}
            onSpin={onSpin}
            onSpinCommit={onSpinCommit}
          />
        </Canvas>
      </div>

      {/* ✅ pulse overlay (kept, but now isolated inside orb only) */}
      {visualPulseEnabled && (
        <div
          key={`pulse-${pulseNonce}`}
          className="absolute inset-0 pointer-events-none"
          data-br-pulse
          style={{
            zIndex: 6,
            borderRadius: "9999px",
            backgroundImage:
              "radial-gradient(circle at 50% 22%, rgba(255,255,255,0.55), transparent 58%)," +
              "radial-gradient(circle at 50% 78%, rgba(255,255,255,0.38), transparent 62%)",
            mixBlendMode: "overlay",
            opacity: 0,
            animation: `${keyframesName}_flash 260ms ease-out`,
          }}
        />
      )}

      {/* Cue text */}
      {showCue && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 12 }}
        >
          <div
            className={[
              "italic text-[var(--muted)] select-none",
              "whitespace-nowrap",
              "text-[clamp(12px,3.2vmin,18px)] md:text-[clamp(12px,2.2vmin,20px)]",
            ].join(" ")}
          >
            {cueText}
          </div>
        </div>
      )}
    </div>
  );
}