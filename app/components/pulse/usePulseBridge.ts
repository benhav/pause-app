"use client";

// app/components/pulse/usePulseBridge.ts
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { PulseCoreProps } from "./types";
import { usePulseGestures } from "./usePulseGestures";

type BridgeOpts = {
  disabled?: boolean;

  beatToken?: number;
  breathScale?: number;
  breathScaleRef?: MutableRefObject<number>;

  onSwipeUp?: PulseCoreProps["onSwipeUp"];
  onSwipeDown?: PulseCoreProps["onSwipeDown"];
  onSpin?: PulseCoreProps["onSpin"];
  onSpinCommit?: PulseCoreProps["onSpinCommit"];
  onTilt?: PulseCoreProps["onTilt"];

  lockVisualSpin?: boolean;
};

const DEG2RAD = Math.PI / 180;

export function usePulseBridge(opts: BridgeOpts) {
  const {
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
  } = opts;

  // Refs that R3F reads every frame
  const spinRadRef = useRef(0);
  const tiltXRadRef = useRef(0);
  const tiltYRadRef = useRef(0);
  const beatRef = useRef(0);
  const fallbackBreathScaleRef = useRef(
    typeof breathScale === "number" ? breathScale : 1
  );
  const resolvedBreathScaleRef = breathScaleRef ?? fallbackBreathScaleRef;

  // Use the same gesture engine and forward interaction callbacks upstream.
  const api = usePulseGestures(
    useMemo(
      () => ({
        onSwipeUp,
        onSwipeDown,

        onSpin: (deg: number) => {
          onSpin?.(deg);
        },

        onSpinCommit: (deg: number) => {
          onSpinCommit?.(deg);
        },

        onTilt: (tx: number, ty: number) => {
          onTilt?.(tx, ty);
        },
      }),
      [onSwipeUp, onSwipeDown, onSpin, onSpinCommit, onTilt]
    )
  );

  // Keep bridge refs continuously synchronized with gesture state.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;

    const tick = () => {
      const s = api.state;

      spinRadRef.current = s.spinDeg * DEG2RAD;
      tiltXRadRef.current = s.tiltXDeg * DEG2RAD;
      tiltYRadRef.current = s.tiltYDeg * DEG2RAD;
      beatRef.current = s.beat;

      raf = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [api]);

  useEffect(() => {
    if (breathScaleRef) return;
    fallbackBreathScaleRef.current =
      typeof breathScale === "number" ? breathScale : 1;
  }, [breathScale, breathScaleRef]);

  // Drive beat from beatToken (preferred)
  const lastBeatToken = useRef<number | undefined>(beatToken);
  useEffect(() => {
    if (beatToken == null) return;
    if (lastBeatToken.current === beatToken) return;
    lastBeatToken.current = beatToken;

    api.triggerBeat(0.55);
  }, [beatToken, api]);

  // Fallback: if someone forgets beatToken, still react to window heartbeat
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof beatToken === "number") return;

    const onBeat: EventListener = () => api.triggerBeat(0.55);
    window.addEventListener("pause-br-heartbeat", onBeat);
    return () => window.removeEventListener("pause-br-heartbeat", onBeat);
  }, [api, beatToken]);

  return {
    // R3F reads these
    spinRadRef,
    tiltXRadRef,
    tiltYRadRef,
    beatRef,
    breathScaleRef: resolvedBreathScaleRef,
    breatheScaleRef: resolvedBreathScaleRef,

    // Handlers must be attached to the same DOM element that wraps Canvas
    handlers: disabled ? {} : api.handlers,

    // Flags
    lockVisualSpin: !!lockVisualSpin,
  };
}
