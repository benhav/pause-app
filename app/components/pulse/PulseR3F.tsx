"use client";

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
        camera={{ position: [0, 0, 3.4], fov: 31, near: 0.1, far: 20 }}
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
          gl.toneMappingExposure = 0.9;
          scene.background = null;
        }}
      >
        <Environment resolution={256}>
          <Lightformer
            intensity={1.55}
            position={[3.6, 2.1, 2.9]}
            rotation={[0, -0.72, 0]}
            scale={[10, 10, 1]}
            color="#ffffff"
          />
          <Lightformer
            intensity={0.62}
            position={[-3.2, -1.8, 2.1]}
            rotation={[0, 0.58, 0]}
            scale={[8.2, 8.2, 1]}
            color="#dcecff"
          />
          <Lightformer
            intensity={0.28}
            position={[0.1, 1.0, -3.6]}
            scale={[10, 6.4, 1]}
            color="#c5dcff"
          />
          <Lightformer
            intensity={0.12}
            position={[-0.8, -3.2, 1.5]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[5.2, 5.2, 1]}
            color="#9ec8e2"
          />
        </Environment>

        <PulseScene bridge={bridge} />

        <EffectComposer multisampling={8}>
          <Bloom
            intensity={0.04}
            luminanceThreshold={0.92}
            luminanceSmoothing={0.12}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}






