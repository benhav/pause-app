"use client";

// app/components/pulse/PulseR3F.tsx
import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import PulseScene from "./PulseScene";
import { usePulseBridge } from "./usePulseBridge";
import type { PulseCoreProps } from "./types";

type Props = {
  size?: number;
  className?: string;
  disabled?: boolean;
  beatToken?: number;
  breathScale?: number;
  breathScaleRef?: React.MutableRefObject<number>;
  onSwipeUp?: PulseCoreProps["onSwipeUp"];
  onSwipeDown?: PulseCoreProps["onSwipeDown"];
  onSpin?: PulseCoreProps["onSpin"];
  onSpinCommit?: PulseCoreProps["onSpinCommit"];
  onTilt?: PulseCoreProps["onTilt"];
  lockVisualSpin?: boolean;
};

export default function PulseR3F({
  size = 300,
  className,
  disabled,
  beatToken,
  breathScale,
  breathScaleRef,
  onSwipeUp,
  onSwipeDown,
  onSpin,
  onSpinCommit,
  onTilt,
  lockVisualSpin,
}: Props) {
  const bridge = usePulseBridge({
    disabled: !!disabled,
    beatToken,
    breathScale,
    breathScaleRef,
    onSwipeUp,
    onSwipeDown,
    onSpin,
    onSpinCommit,
    onTilt,
    lockVisualSpin: !!lockVisualSpin,
  });

  const px = useMemo(() => Math.max(140, Math.round(size)), [size]);

  return (
    <div
      className={className}
      style={{
        width: px,
        height: px,
        position: "relative",
        touchAction: "none",
        overflow: "visible",
        background: "transparent",
      }}
      {...bridge.handlers}
    >
      <Canvas
        camera={{ position: [0, 0, 3.24], fov: 33, near: 0.1, far: 20 }}
        dpr={[1.2, 2.2]}
        gl={{
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: "high-performance",
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          background: "transparent",
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          scene.background = null;
        }}
      >
        <Environment resolution={256}>
          <Lightformer
            intensity={2.35}
            position={[3.1, 2.7, 2.5]}
            rotation={[0, -0.64, 0]}
            scale={[9, 9, 1]}
            color="#f6fbff"
          />
          <Lightformer
            intensity={1.1}
            position={[-3.3, -2.0, 1.6]}
            rotation={[0, 0.54, 0]}
            scale={[7.6, 7.6, 1]}
            color="#dbe9ff"
          />
          <Lightformer
            intensity={0.6}
            position={[0, 0.9, -3.4]}
            scale={[10, 6, 1]}
            color="#cfe0ff"
          />
        </Environment>

        <PulseScene bridge={bridge} />

        <EffectComposer multisampling={8}>
          <Bloom
            intensity={0.08}
            luminanceThreshold={0.82}
            luminanceSmoothing={0.22}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

