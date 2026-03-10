"use client";

// app/components/pulse/usePulseGestures.ts

import { useEffect, useMemo, useRef, useState } from "react";
import type { PulseAPI, PulseConfig, PulseState } from "./types";
import { clamp, damp, wrapDeg } from "./pulseMath";

type Pt = { x: number; y: number; t: number };

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function usePulseGestures(opts?: Partial<PulseConfig>): PulseAPI {
  const reducedMotion = prefersReducedMotion();

  const config: PulseConfig = useMemo(
    () => ({
      sizePx: 180,
      perspectivePx: 900,
      maxTiltDeg: 12,
      tiltResponse: 0.85,

      friction: 0.86,
      velClamp: 720,
      swipeToVel: 0.55,
      minVelStop: 6,

      beatKick: 0.55,
      beatDecayPerSec: 2.8,

      // swipe up/down detection (tuned for mobile)
      swipeUpDownThresholdPx: 64,
      swipeUpDownMinVelPxPerSec: 520,
      swipeDominanceRatio: 1.15,

      reducedMotion,
      ...opts,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reducedMotion]
  );

  const [state, setState] = useState<PulseState>(() => ({
    spinDeg: 0,
    spinVelDegPerSec: 0,
    tiltXDeg: 0,
    tiltYDeg: 0,
    beat: 0,
    lastTs: typeof performance !== "undefined" ? performance.now() : 0,
  }));

  const rafRef = useRef<number | null>(null);

  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const lastRef = useRef<Pt | null>(null);
  const velSamplesRef = useRef<number[]>([]);

  const totalDxRef = useRef(0);
  const totalDyRef = useRef(0);
  const swipeActionFiredRef = useRef(false);

  // latest spin, always (avoid stale state on commit)
  const latestSpinRef = useRef(0);

  // gesture intent lock
  const intentRef = useRef<"none" | "spin" | "vertical">("none");

  const setSpinDeg = (deg: number) => {
    const w = wrapDeg(deg);
    latestSpinRef.current = w;
    setState((s) => ({ ...s, spinDeg: w }));
    config.onSpin?.(w);
  };

  const addSpinVelocity = (degPerSec: number) => {
    setState((s) => ({
      ...s,
      spinVelDegPerSec: clamp(s.spinVelDegPerSec + degPerSec, -config.velClamp, config.velClamp),
    }));
  };

  const triggerBeat = (strength?: number) => {
    const kick = clamp(strength ?? config.beatKick, 0, 1);
    setState((s) => ({ ...s, beat: clamp(s.beat + kick, 0, 1) }));
  };

  // physics loop
  useEffect(() => {
    if (config.reducedMotion) return;

    const tick = (ts: number) => {
      setState((s) => {
        const dt = Math.min(0.05, Math.max(0.001, (ts - (s.lastTs || ts)) / 1000));

        const nextBeat = clamp(s.beat - config.beatDecayPerSec * dt, 0, 1);

        let spinVel = s.spinVelDegPerSec;
        let spin = s.spinDeg;

        if (!draggingRef.current) {
          spinVel *= Math.pow(config.friction, dt * 60);
          if (Math.abs(spinVel) < config.minVelStop) spinVel = 0;

          spin = wrapDeg(spin + spinVel * dt);

          latestSpinRef.current = spin;
          config.onSpin?.(spin);
        }

        // Tilt eases back to 0 when not dragging
        const targetTiltX = draggingRef.current ? s.tiltXDeg : 0;
        const targetTiltY = draggingRef.current ? s.tiltYDeg : 0;

        const tiltX = damp(s.tiltXDeg, targetTiltX, 14, dt);
        const tiltY = damp(s.tiltYDeg, targetTiltY, 14, dt);

        // ✅ allow Orb to follow tilt & spring-back
        config.onTilt?.(tiltX, tiltY);

        return {
          ...s,
          spinDeg: spin,
          spinVelDegPerSec: clamp(spinVel, -config.velClamp, config.velClamp),
          tiltXDeg: tiltX,
          tiltYDeg: tiltY,
          beat: nextBeat,
          lastTs: ts,
        };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [config]);

  const onPointerDown = (e: any) => {
    if (e.button === 2) return; // ignore right click
    draggingRef.current = true;
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    velSamplesRef.current = [];
    lastRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };

    totalDxRef.current = 0;
    totalDyRef.current = 0;
    swipeActionFiredRef.current = false;

    latestSpinRef.current = state.spinDeg;
    intentRef.current = "none";

    // Stop inertia immediately
    setState((s) => ({ ...s, spinVelDegPerSec: 0 }));
  };

  const maybeFireVerticalSwipe = (vyPxPerSec: number) => {
    if (swipeActionFiredRef.current) return;

    const dx = totalDxRef.current;
    const dy = totalDyRef.current;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (intentRef.current === "spin") return;

    if (absDy < config.swipeUpDownThresholdPx) return;
    if (absDy < absDx * config.swipeDominanceRatio) return;
    if (Math.abs(vyPxPerSec) < config.swipeUpDownMinVelPxPerSec) return;

    swipeActionFiredRef.current = true;
    intentRef.current = "vertical";

    if (dy < 0) config.onSwipeUp?.();
    else config.onSwipeDown?.();
  };

  const onPointerMove = (e: any) => {
    if (!draggingRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;

    const prev = lastRef.current;
    const nowT = performance.now();
    if (!prev) {
      lastRef.current = { x: e.clientX, y: e.clientY, t: nowT };
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    const dtMs = Math.max(1, nowT - prev.t);

    totalDxRef.current += dx;
    totalDyRef.current += dy;

    const absTotalDx = Math.abs(totalDxRef.current);
    const absTotalDy = Math.abs(totalDyRef.current);

    // Intent lock (early)
    if (intentRef.current === "none") {
      const INTENT_MIN = 10; // px
      if (absTotalDx + absTotalDy >= INTENT_MIN) {
        if (absTotalDy > absTotalDx * config.swipeDominanceRatio) {
          intentRef.current = "vertical";
        } else if (absTotalDx > absTotalDy * config.swipeDominanceRatio) {
          intentRef.current = "spin";
        }
      }
    }

    // Vertical swipe path
    if (intentRef.current === "vertical") {
      const vy = (dy / dtMs) * 1000;
      maybeFireVerticalSwipe(vy);

      // keep subtle tilt feedback
      setState((s) => {
        const nx = clamp(dx / 220, -1, 1) * config.maxTiltDeg * config.tiltResponse;
        const ny = clamp(dy / 220, -1, 1) * config.maxTiltDeg * config.tiltResponse;

        const tiltX = clamp(-ny, -config.maxTiltDeg, config.maxTiltDeg);
        const tiltY = clamp(nx, -config.maxTiltDeg, config.maxTiltDeg);

        // ✅ live tilt callback while dragging
        config.onTilt?.(tiltX, tiltY);

        return {
          ...s,
          tiltXDeg: tiltX,
          tiltYDeg: tiltY,
        };
      });

      lastRef.current = { x: e.clientX, y: e.clientY, t: nowT };
      return;
    }

    // Spin path (default)
    const spinDelta = dx * 0.35;

    setState((s) => {
      const nextSpin = wrapDeg(s.spinDeg + spinDelta);
      latestSpinRef.current = nextSpin;
      config.onSpin?.(nextSpin);
      return { ...s, spinDeg: nextSpin };
    });

    // Tilt from drag delta (subtle)
    setState((s) => {
      const nx = clamp(dx / 220, -1, 1) * config.maxTiltDeg * config.tiltResponse;
      const ny = clamp(dy / 220, -1, 1) * config.maxTiltDeg * config.tiltResponse;

      const tiltX = clamp(-ny, -config.maxTiltDeg, config.maxTiltDeg);
      const tiltY = clamp(nx, -config.maxTiltDeg, config.maxTiltDeg);

      config.onTilt?.(tiltX, tiltY);

      return {
        ...s,
        tiltXDeg: tiltX,
        tiltYDeg: tiltY,
      };
    });

    // velocity sample for inertia (spin only)
    const pxPerSecX = (dx / dtMs) * 1000;
    const degPerSec = pxPerSecX * config.swipeToVel;
    velSamplesRef.current.push(degPerSec);
    if (velSamplesRef.current.length > 6) velSamplesRef.current.shift();

    lastRef.current = { x: e.clientX, y: e.clientY, t: nowT };
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    config.onSpinCommit?.(latestSpinRef.current);

    pointerIdRef.current = null;

    if (swipeActionFiredRef.current) return;
    if (intentRef.current === "vertical") return;

    const samples = velSamplesRef.current;
    if (!samples.length) return;

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    setState((s) => ({
      ...s,
      spinVelDegPerSec: clamp(avg, -config.velClamp, config.velClamp),
    }));
  };

  const onPointerUp = (e: any) => {
    if (pointerIdRef.current !== e.pointerId) return;
    endDrag();
  };

  const onPointerCancel = (e: any) => {
    if (pointerIdRef.current !== e.pointerId) return;
    endDrag();
  };

  return {
    state,
    setSpinDeg,
    addSpinVelocity,
    triggerBeat,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}