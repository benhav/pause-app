/**
 * NOTE:
 * Breath timing intentionally uses organic micro jitter.
 * Do NOT "clean up" randomness unless testing UX impact.
 */
/**
 * HAPTICS DESIGN NOTES
 *
 * This file intentionally uses:
 * - tempo-scaled spacing
 * - organic micro-jitter in bottom hold
 * - non-linear pulse ramps
 * - intensity-specific profiles (NOT just a multiplier)
 *
 * DO NOT "simplify" patterns into constant intervals.
 * Mechanical timing feels robotic and breaks body perception.
 *
 * All timing decisions are UX-driven, not purely mathematical.
 */

import type { BreathPhase, HapticsIntensity } from "./types";

type PhasePulseSpec = { pattern: number[]; beatIndexes?: number[] };

// Backward compat (if engine still uses old strings)
type LegacyPhase = "in" | "hold" | "out";

// Accept both
type AnyPhase = BreathPhase | LegacyPhase;

type BreathPreset = "standard" | "release" | "deep-calm" | "stillness";

export function getIntensityParams(intensity: HapticsIntensity) {
  switch (intensity) {
    case "low":
      return { mult: 0.55, maxPulse: 34 };
    case "high":
      return { mult: 1.55, maxPulse: 85 };
    case "med":
    default:
      return { mult: 1.0, maxPulse: 55 };
  }
}

export function scalePulseMs(ms: number, mult: number, maxPulse: number) {
  const v = Math.round(ms * mult);
  return Math.max(6, Math.min(maxPulse, v));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normalizePhase(
  p: AnyPhase
): "inhale" | "holdTop" | "exhale" | "holdBottom" {
  if (p === "in") return "inhale";
  if (p === "hold") return "holdTop";
  if (p === "out") return "exhale";
  return p as any;
}

function safePreset(v: any): BreathPreset {
  if (v === "release" || v === "deep-calm" || v === "stillness") return v;
  if (v === "standard") return "standard";
  return "standard";
}

/**
 * Builds a pulse+pause pattern that tries to span the whole duration,
 * while changing pulse/pause over time (ramp).
 */
function buildRampPattern(opts: {
  durationMs: number;
  startPulse: number;
  endPulse: number;
  startPause: number;
  endPause: number;
  mult: number;
  maxPulse: number;
  targetTickEveryMs: number;

  // NEW: allow calmer/less aggressive pause scaling for presets
  pauseScaleMax?: number;
}) {
  const {
    durationMs,
    startPulse,
    endPulse,
    startPause,
    endPause,
    mult,
    maxPulse,
    targetTickEveryMs,
    pauseScaleMax = 1.8,
  } = opts;

  // More spacing when phases are long (less aggressive on slow tempo)
  const pauseScale = clamp(durationMs / 1200, 0.95, pauseScaleMax);

  const steps = clamp(Math.round(durationMs / targetTickEveryMs), 5, 32);

  const pattern: number[] = [];
  let spent = 0;

  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 1 : i / (steps - 1);

    const pulseRaw = Math.round(startPulse + (endPulse - startPulse) * t);
    const pauseRaw = Math.round(startPause + (endPause - startPause) * t);

    const pulse = scalePulseMs(pulseRaw, mult, maxPulse);
    const pause = Math.round(pauseRaw * pauseScale);

    if (spent + pulse > durationMs) break;

    pattern.push(pulse);
    spent += pulse;

    // add pause if room
    if (i < steps - 1 && spent + pause < durationMs) {
      pattern.push(pause);
      spent += pause;
    }
  }

  if (pattern.length === 0 && durationMs > 0) {
    pattern.push(scalePulseMs(12, mult, maxPulse));
    spent = pattern[0];
  }

  // ✅ IMPORTANT: fill the remaining time so phase lasts the full duration
  const remaining = Math.max(0, durationMs - spent);
  if (remaining > 0) {
    if (pattern.length % 2 === 1) {
      // ends with a pulse -> add a final pause
      pattern.push(remaining);
    } else {
      // ends with a pause -> extend last pause
      pattern[pattern.length - 1] = Math.max(
        0,
        pattern[pattern.length - 1] + remaining
      );
    }
  }

  return pattern;
}

/**
 * Bottom hold = psychological anticipation phase.
 *
 * Pulses here must:
 * - feel organic (micro variation)
 * - never feel like a metronome
 * - never be too dense (avoid "engine/train" sensation)
 *
 * Subtle > precise.
 */
function buildBottomWaitPattern(opts: {
  durationMs: number;
  mult: number;
  maxPulse: number;
  intensity: HapticsIntensity;
  // when true: calmer heartbeat feel (for Release/Deep calm/Stillness)
  calm?: boolean;
}) {
  const { durationMs, mult, maxPulse, intensity, calm } = opts;

  const baseDiv =
    intensity === "high" ? 920 : intensity === "low" ? 1250 : 1080;

  const div = calm ? Math.round(baseDiv * 1.25) : baseDiv;

  const count = clamp(Math.round(durationMs / div), 2, calm ? 6 : 8);

  const p1Base = calm ? 10 : 11;
  const p2Base = calm ? 7 : 8;

  const p1 = scalePulseMs(p1Base, mult, maxPulse);
  const p2 = scalePulseMs(p2Base, mult, maxPulse);

  const tailPulse = scalePulseMs(calm ? 14 : 12, mult, maxPulse);
  const tailPause = calm ? 58 : 52;

  const usable = Math.max(
    0,
    durationMs - Math.round(durationMs * (calm ? 0.18 : 0.14))
  );

  const jitter = (base: number, range: number) => {
    const j = Math.round((Math.random() * 2 - 1) * range);
    return clamp(base + j, 0, 2000);
  };

  const baseInnerPause = calm ? 125 : 110;

  const clusterMs = p1 + baseInnerPause + p2 + tailPause + tailPulse;

  const remaining = Math.max(0, usable - count * clusterMs);

  const baseGap = clamp(
    Math.round(remaining / Math.max(1, count - 1)),
    calm ? 520 : 440,
    calm ? 1400 : 1200
  );

  const pattern: number[] = [];
  const beatIndexes: number[] = [];

  const push = (n: number) => {
    pattern.push(n);
  };

  for (let i = 0; i < count; i++) {
    beatIndexes.push(pattern.length);
    push(p1);

    push(jitter(baseInnerPause, calm ? 12 : 14));

    beatIndexes.push(pattern.length);
    push(p2);

    push(jitter(tailPause, calm ? 10 : 12));
    push(tailPulse);

    if (i < count - 1) {
      push(jitter(baseGap, calm ? 8 : 10));
    }
  }

  return { pattern, beatIndexes };
}

/**
 * HoldTop countdown feel:
 * ticks early + silence before exhale to create a real "pause" sensation.
 */
function buildHoldTopPattern(opts: {
  durationMs: number;
  mult: number;
  maxPulse: number;
}) {
  const { durationMs, mult, maxPulse } = opts;

  const active = Math.round(durationMs * 0.7);

  if (active < 380) return { pattern: [scalePulseMs(12, mult, maxPulse)] };

  if (active < 850) {
    return {
      pattern: [
        scalePulseMs(12, mult, maxPulse),
        Math.round(active * 0.55),
        scalePulseMs(10, mult, maxPulse),
      ],
    };
  }

  return {
    pattern: [
      scalePulseMs(12, mult, maxPulse),
      Math.round(active * 0.33),
      scalePulseMs(11, mult, maxPulse),
      Math.round(active * 0.33),
      scalePulseMs(10, mult, maxPulse),
    ],
  };
}

/**
 * Preset inhale/exhale:
 * SAME PRINCIPLE AS STANDARD (ramp ticks across entire phase),
 * but slower/airier so it never becomes "barbermaskin".
 */
function getPresetTickEveryMs(preset: BreathPreset, durationMs: number) {
  // release: a bit more tactile than deep-calm/stillness
  const base =
    preset === "release" ? 560 : preset === "deep-calm" ? 700 : 820;

  // scale slightly with phase length (10s gets more air than 6s)
  const scaled = Math.round(base * clamp(durationMs / 7000, 0.85, 1.25));

  return clamp(scaled, 480, 1100);
}

function getPresetProfiles(intensity: HapticsIntensity) {
  // Presets should be calmer than standard:
  // - longer pauses
  // - slightly softer pulse ramp
  const inProfile =
    intensity === "low"
      ? { startPulse: 7, endPulse: 14, startPause: 190, endPause: 110 }
      : intensity === "high"
      ? { startPulse: 10, endPulse: 24, startPause: 150, endPause: 88 }
      : { startPulse: 8, endPulse: 18, startPause: 170, endPause: 96 };

  const outProfile =
    intensity === "low"
      ? { startPulse: 14, endPulse: 7, startPause: 110, endPause: 190 }
      : intensity === "high"
      ? { startPulse: 24, endPulse: 10, startPause: 88, endPause: 150 }
      : { startPulse: 18, endPulse: 8, startPause: 96, endPause: 170 };

  return { inProfile, outProfile };
}

export function getPhasePulseSpec(
  phase: AnyPhase,
  intensity: HapticsIntensity,
  mode: "breath" | "voice",
  durationMs?: number,
  opts?: { bottomCalm?: boolean; preset?: BreathPreset }
): PhasePulseSpec {
  const { mult, maxPulse } = getIntensityParams(intensity);

  // voice mode slightly softer
  const m = mode === "voice" ? mult * 0.9 : mult;

  const d = Math.max(250, durationMs ?? 900);
  const p = normalizePhase(phase);

  const preset = safePreset(opts?.preset);

  if (p === "holdTop") {
    return buildHoldTopPattern({ durationMs: d, mult: m, maxPulse });
  }

  // 🔒 LOCK: bottom hold remains the heartbeat/organic phase (all modes)
  if (p === "holdBottom") {
    const built = buildBottomWaitPattern({
      durationMs: d,
      mult: m,
      maxPulse,
      intensity,
      calm: !!opts?.bottomCalm,
    });
    return { pattern: built.pattern, beatIndexes: built.beatIndexes };
  }

  const isPreset =
    mode === "breath" &&
    (preset === "release" || preset === "deep-calm" || preset === "stillness");

  // ✅ Presets: ramp across whole inhale/exhale (same principle as standard)
  if (isPreset && (p === "inhale" || p === "exhale")) {
    const { inProfile, outProfile } = getPresetProfiles(intensity);
    const targetTickEveryMs = getPresetTickEveryMs(preset, d);

    if (p === "inhale") {
      return {
        pattern: buildRampPattern({
          durationMs: d,
          mult: m,
          maxPulse,
          targetTickEveryMs,
          pauseScaleMax: 1.25,
          ...inProfile,
        }),
      };
    }

    return {
      pattern: buildRampPattern({
        durationMs: d,
        mult: m,
        maxPulse,
        targetTickEveryMs,
        pauseScaleMax: 1.25,
        ...outProfile,
      }),
    };
  }

  // --- Standard inhale/exhale: ramp ticks across whole phase ---
  const targetTickEveryMs =
    intensity === "high" ? 170 : intensity === "low" ? 240 : 200;

  // ✅ intensity-specific breath profiles
  const inProfile =
    intensity === "low"
      ? { startPulse: 8, endPulse: 18, startPause: 110, endPause: 48 }
      : intensity === "high"
      ? { startPulse: 12, endPulse: 34, startPause: 85, endPause: 28 }
      : { startPulse: 10, endPulse: 26, startPause: 95, endPause: 34 };

  const outProfile =
    intensity === "low"
      ? { startPulse: 18, endPulse: 8, startPause: 48, endPause: 110 }
      : intensity === "high"
      ? { startPulse: 34, endPulse: 12, startPause: 28, endPause: 85 }
      : { startPulse: 26, endPulse: 10, startPause: 34, endPause: 95 };

  if (p === "inhale") {
    return {
      pattern: buildRampPattern({
        durationMs: d,
        mult: m,
        maxPulse,
        targetTickEveryMs,
        ...inProfile,
      }),
    };
  }

  return {
    pattern: buildRampPattern({
      durationMs: d,
      mult: m,
      maxPulse,
      targetTickEveryMs,
      ...outProfile,
    }),
  };
}