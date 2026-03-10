import type React from "react";

export type PulseState = {
  spinDeg: number;
  spinVelDegPerSec: number;
  tiltXDeg: number;
  tiltYDeg: number;
  beat: number;
  lastTs: number;
};

export type PulseConfig = {
  sizePx: number;
  perspectivePx: number;
  maxTiltDeg: number;
  tiltResponse: number;
  friction: number;
  velClamp: number;
  swipeToVel: number;
  minVelStop: number;

  beatKick: number;
  beatDecayPerSec: number;

  swipeUpDownThresholdPx: number;
  swipeUpDownMinVelPxPerSec: number;
  swipeDominanceRatio: number;

  reducedMotion: boolean;

  onSwipeUp?: () => void;
  onSwipeDown?: () => void;

  onSpin?: (spinDeg: number) => void;
  onSpinCommit?: (spinDeg: number) => void;

  onTilt?: (tiltXDeg: number, tiltYDeg: number) => void;
};

export type PulseGestureHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

export type PulseAPI = {
  state: PulseState;
  setSpinDeg: (deg: number) => void;
  addSpinVelocity: (degPerSec: number) => void;
  triggerBeat: (strength?: number) => void;
  handlers: PulseGestureHandlers;
};

export type PulseCoreProps = {
  size?: number;
  className?: string;
  beatToken?: number;
  disabled?: boolean;
  variant?: "glass" | "plain";
  breathScale?: number;
  breathScaleRef?: React.MutableRefObject<number>;

  onSwipeUp?: () => void;
  onSwipeDown?: () => void;

  onSpin?: (spinDeg: number) => void;
  onSpinCommit?: (spinDeg: number) => void;

  onTilt?: (tiltXDeg: number, tiltYDeg: number) => void;

  /**
   * When true, visual Y-spin is locked while beat, tilt and interaction stay active.
   */
  lockVisualSpin?: boolean;
};
