"use client";

// app/components/pulse/BreathingRoomPulse.tsx
import React, { useCallback, useEffect, useState } from "react";
import PulseR3F from "./PulseR3F";
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

export default function BreathingRoomPulse({
  size = 210,
  className,
  disabled,

  beatToken: beatTokenProp,
  breathScale,
  breathScaleRef,

  onSwipeUp,
  onSwipeDown,
  onSpin,
  onSpinCommit,
  onTilt,

  lockVisualSpin,
}: Props) {
  const [beatTokenLocal, setBeatTokenLocal] = useState(0);

  const onBeat = useCallback(() => {
    setBeatTokenLocal((n) => (n + 1) % 1_000_000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof beatTokenProp === "number") return;

    const listener: EventListener = () => onBeat();
    window.addEventListener("pause-br-heartbeat", listener);
    return () => window.removeEventListener("pause-br-heartbeat", listener);
  }, [onBeat, beatTokenProp]);

  const beatToken =
    typeof beatTokenProp === "number" ? beatTokenProp : beatTokenLocal;

  return (
    <PulseR3F
      size={size}
      className={className}
      disabled={disabled}
      beatToken={beatToken}
      breathScale={breathScale}
      breathScaleRef={breathScaleRef}
      onSwipeUp={onSwipeUp}
      onSwipeDown={onSwipeDown}
      onSpin={onSpin}
      onSpinCommit={onSpinCommit}
      onTilt={onTilt}
      lockVisualSpin={lockVisualSpin}
    />
  );
}
