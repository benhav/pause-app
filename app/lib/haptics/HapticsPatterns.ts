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

// app/lib/haptics/HapticsPatterns.ts
import type { BreathPhase, HapticsIntensity } from "./types";

type PhasePulseSpec = { pattern: number[] };

// Backward compat (if engine still uses old strings)
type LegacyPhase = "in" | "hold" | "out";

// Accept both
type AnyPhase = BreathPhase | LegacyPhase;

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
    // How often we want a “tick” feeling (lower => more ticks)
    targetTickEveryMs: number;
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
    } = opts;

    // More spacing when phases are long (less aggressive on slow tempo)
    // ~1.0 around 1200ms, up to ~1.8 on very slow breaths
    const pauseScale = clamp(durationMs / 1200, 0.95, 1.8);

    const steps = clamp(Math.round(durationMs / targetTickEveryMs), 5, 26);

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

        // Keep adding pauses until we almost fill the duration
        if (i < steps - 1 && spent + pause < durationMs) {
            pattern.push(pause);
            spent += pause;
        }
    }

    // If pattern is too short, add one tiny pulse
    if (pattern.length === 0 && durationMs > 0) {
        pattern.push(scalePulseMs(12, mult, maxPulse));
    }

    return pattern;
}

/**
 * Soft “waiting pulses” for bottom hold:
 * More pulses when duration is longer (slow slider).
 */

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
}) {
    const { durationMs, mult, maxPulse, intensity } = opts;

    // Slightly fewer pulses = calmer feeling
    const div = intensity === "high" ? 920 : intensity === "low" ? 1250 : 1080;
    const count = clamp(Math.round(durationMs / div), 2, 8);

    // Softer pulses (less "train engine")
    const p1 = scalePulseMs(11, mult, maxPulse);
    const p2 = scalePulseMs(8, mult, maxPulse);

    // Leave a gentle buffer before inhale starts
    const usable = Math.max(0, durationMs - Math.round(durationMs * 0.14));

    // --- BONUS: subtle timing jitter ---
    // Keep this small. If iOS feels too "nervous", reduce ranges a bit.
    const jitter = (base: number, range: number) => {
        const j = Math.round((Math.random() * 2 - 1) * range);
        return clamp(base + j, 0, 2000);
    };

    // Inside-pair air (slightly varied)
    const baseInnerPause = 110;

    // Cluster takes: p1 + innerPause + p2
    const clusterMs = p1 + baseInnerPause + p2;

    const remaining = Math.max(0, usable - count * clusterMs);

    // Calmer spacing between wait pulses - "resting pulse"
    const baseGap = clamp(
        Math.round(remaining / Math.max(1, count - 1)),
        440,
        1200
    );

    const pattern: number[] = [];

    for (let i = 0; i < count; i++) {
        pattern.push(p1);

        // "dum .... dum" (micro-variation)
        pattern.push(jitter(baseInnerPause, 14));

        pattern.push(p2);

        if (i < count - 1) {
            // More organic waiting (micro-variation)
            pattern.push(jitter(baseGap, 10));
        }
    }

    return pattern;
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

    // Place ticks in the first ~70% of hold, then stay silent.
    const active = Math.round(durationMs * 0.7);

    if (active < 380) return [scalePulseMs(12, mult, maxPulse)];

    if (active < 850) {
        // two ticks, then silence
        return [
            scalePulseMs(12, mult, maxPulse),
            Math.round(active * 0.55),
            scalePulseMs(10, mult, maxPulse),
        ];
    }

    // three ticks, then silence
    return [
        scalePulseMs(12, mult, maxPulse),
        Math.round(active * 0.33),
        scalePulseMs(11, mult, maxPulse),
        Math.round(active * 0.33),
        scalePulseMs(10, mult, maxPulse),
    ];
}

export function getPhasePulseSpec(
    phase: AnyPhase,
    intensity: HapticsIntensity,
    mode: "breath" | "voice",
    durationMs?: number
): PhasePulseSpec {
    const { mult, maxPulse } = getIntensityParams(intensity);

    // voice mode slightly softer
    const m = mode === "voice" ? mult * 0.9 : mult;

    const d = Math.max(250, durationMs ?? 900);
    const p = normalizePhase(phase);

    if (p === "holdTop") {
        return { pattern: buildHoldTopPattern({ durationMs: d, mult: m, maxPulse }) };
    }

    if (p === "holdBottom") {
        return {
            pattern: buildBottomWaitPattern({
                durationMs: d,
                mult: m,
                maxPulse,
                intensity,
            }),
        };
    }

    // Inhale / Exhale: more ticks across whole phase + tempo-aware spacing
    const targetTickEveryMs =
        intensity === "high" ? 170 : intensity === "low" ? 240 : 200;

    // ✅ BONUS: intensity-specific breath profiles (stronger separation in real cycles)
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
        // weak → strong (profile depends on intensity)
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

    // exhale: strong → weak (profile depends on intensity)
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