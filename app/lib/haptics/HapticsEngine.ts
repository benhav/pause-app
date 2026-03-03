import { hasVibration, stopVibration, vibrate } from "./HapticsPlatform";
import {
  getIntensityParams,
  getPhasePulseSpec,
  scalePulseMs,
} from "./HapticsPatterns";
import { onHapticsPrefsChanged, readHapticsPrefs } from "./HapticsSettings";
import { WakeLockManager } from "./WakeLock";
import type { HapticsIntensity, HapticsMode, HapticsPrefs } from "./types";

type TimerId = number;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type HoldBottomRange = { minMs: number; maxMs: number };

type BreathPreset = "standard" | "release" | "deep-calm" | "stillness";

export class HapticsEngine {
  private mounted = false;
  private unsubscribe: (() => void) | null = null;

  private prefs: HapticsPrefs = readHapticsPrefs();

  // Breath engine controls
  private mode: HapticsMode = "off";
  private voiceActive = false; // BR can tell us when voice guide is toggled
  private premiumBreathEnabled = false; // set from BR (isPro)

  // Phase durations (source of truth for scheduling)
  private inhaleMs = 2800;
  private holdTopMs = 1200;
  private exhaleMs = 3200;
  private holdBottom: number | HoldBottomRange = 2600;

  // Best-effort preset detection from phase durations
  private preset: BreathPreset = "standard";

  private loopTimer: TimerId | null = null;

  // ✅ Phase timers (so we can cancel them on restart/disable)
  private phaseTimers: TimerId[] = [];

  // Slider tick throttling
  private sliderTickThrottleMs = 85;
  private lastSliderTickAt = 0;

  // Wake lock (best-effort)
  private wakeLock = new WakeLockManager();

  attach() {
    if (this.mounted) return;
    this.mounted = true;

    this.prefs = readHapticsPrefs();
    this.recomputeModeAndApply();

    this.unsubscribe = onHapticsPrefsChanged(() => {
      this.prefs = readHapticsPrefs();
      this.recomputeModeAndApply();
    });

    this.wakeLock.attach();
  }

  detach() {
    this.mounted = false;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.stopBreathLoop();
    stopVibration();

    this.wakeLock.detach();
  }

  /**
   * Pro gate: breath-follow scheduling should only run in Pro.
   * (UI feedback like tick/wosh can still run – controlled by prefs.enabled)
   */
  setPremiumEnabledForBreath(isPro: boolean) {
    this.premiumBreathEnabled = !!isPro;
    this.recomputeModeAndApply();
  }

  /**
   * BR calls this whenever voice guide is toggled.
   * (Keeps engines independent: voice engine doesn’t know us; BR is the mediator.)
   */
  setVoiceActive(active: boolean) {
    this.voiceActive = !!active;
    this.recomputeModeAndApply();
  }

  /**
   * Backward-compatible: Standard slider still calls this.
   * Keeps old ratios (0.28/0.12/0.32 + rest).
   */
  setCycleSeconds(seconds: number) {
    const s = clamp(seconds, 4, 30);
    const cycleMs = Math.round(s * 1000);

    const inhaleMs = Math.round(s * 0.28 * 1000);
    const holdTopMs = Math.round(s * 0.12 * 1000);
    const exhaleMs = Math.round(s * 0.32 * 1000);
    const holdBottomMs = Math.max(0, cycleMs - inhaleMs - holdTopMs - exhaleMs);

    this.setPhaseDurations({
      inhaleMs,
      holdTopMs,
      exhaleMs,
      holdBottomMs,
    });
  }

  /**
   * ⭐ New: Explicit phase durations (used by Release / Deep calm / Stillness)
   * holdBottom can be fixed (number) OR a range for subtle variation per cycle.
   */
  setPhaseDurations(d: {
    inhaleMs: number;
    holdTopMs: number;
    exhaleMs: number;
    holdBottomMs: number | HoldBottomRange;
  }) {
    this.inhaleMs = clamp(Math.round(d.inhaleMs), 0, 120000);
    this.holdTopMs = clamp(Math.round(d.holdTopMs), 0, 120000);
    this.exhaleMs = clamp(Math.round(d.exhaleMs), 0, 120000);

    if (typeof d.holdBottomMs === "number") {
      this.holdBottom = clamp(Math.round(d.holdBottomMs), 0, 120000);
    } else {
      const minMs = clamp(Math.round(d.holdBottomMs.minMs), 0, 120000);
      const maxMs = clamp(Math.round(d.holdBottomMs.maxMs), minMs, 120000);
      this.holdBottom = { minMs, maxMs };
    }

    // --- preset detection (best-effort, local only) ---
    this.preset = this.detectPreset();

    if (this.mode !== "off") {
      this.stopBreathLoop();
      this.startBreathLoop();
    }
  }

  setSliderTickThrottle(ms: number) {
    this.sliderTickThrottleMs = clamp(ms, 30, 200);
  }

  // ------------------------------------------------------------
  // Public UI-feedback haptics (always independent)
  // ------------------------------------------------------------

  tick() {
    this.vibrateTick(12);
  }

  sliderStepTick() {
    const now = Date.now();
    if (now - this.lastSliderTickAt < this.sliderTickThrottleMs) return;
    this.lastSliderTickAt = now;
    this.vibrateTick(10);
  }

  woshHide() {
    this.vibratePattern([26, 16, 18, 14, 12]);
  }

  woshShow() {
    this.vibratePattern([12, 14, 18, 16, 26]);
  }

  /**
   * Small confirmation pulse when enabling haptics.
   * Soft double tap that respects current intensity.
   */
  confirmEnabled() {
    if (!this.canVibrate()) return;

    const { mult, maxPulse } = getIntensityParams(this.prefs.intensity);

    const p1 = scalePulseMs(14, mult, maxPulse);
    const p2 = scalePulseMs(10, mult, maxPulse);

    vibrate([p1, 70, p2]);
  }

  /**
   * Small confirmation when breath-follow vibration is enabled.
   * Feels like a mini inhale cue.
   */
  confirmBreathEnabled() {
    if (!this.canVibrate()) return;

    const { mult, maxPulse } = getIntensityParams(this.prefs.intensity);

    const p1 = scalePulseMs(10, mult, maxPulse);
    const p2 = scalePulseMs(16, mult, maxPulse);
    const p3 = scalePulseMs(22, mult, maxPulse);

    // gentle ramp up (mini inhale)
    vibrate([p1, 60, p2, 60, p3]);
  }

  /**
   * Intensity preview for settings screen.
   * Runs a 2s demo pulse pattern.
   */
  previewIntensity(intensity: HapticsIntensity) {
    if (!this.canVibrate()) return;

    const { mult, maxPulse } = getIntensityParams(intensity);

    const duration = 2000;
    const pattern: number[] = [];

    const basePulse =
      intensity === "low" ? 10 : intensity === "high" ? 22 : 16;

    const basePause =
      intensity === "low" ? 180 : intensity === "high" ? 90 : 130;

    let spent = 0;

    while (spent < duration) {
      const pulse = scalePulseMs(basePulse, mult, maxPulse);
      pattern.push(pulse);
      spent += pulse;

      if (spent + basePause > duration) break;

      pattern.push(basePause);
      spent += basePause;
    }

    vibrate(pattern);
  }

  // ------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------

  private canVibrate() {
    return typeof window !== "undefined" && hasVibration() && this.prefs.enabled;
  }

  private vibrateTick(basePulseMs: number) {
    if (!this.canVibrate()) return;

    const { mult, maxPulse } = getIntensityParams(this.prefs.intensity);
    const pulse = scalePulseMs(basePulseMs, mult, maxPulse);
    vibrate(pulse);
  }

  private vibratePattern(pattern: number[]) {
    if (!this.canVibrate()) return;

    const { mult, maxPulse } = getIntensityParams(this.prefs.intensity);

    // scale even indexes (pulses), keep odd indexes (pauses)
    const out = pattern.map((n, i) =>
      i % 2 === 0 ? scalePulseMs(n, mult, maxPulse) : n
    );
    vibrate(out);
  }

  private recomputeModeAndApply() {
    const nextMode = this.computeMode();

    if (nextMode === this.mode) {
      if (this.mode === "off") this.wakeLock.setEnabled(false);
      else this.wakeLock.setEnabled(true);
      return;
    }

    this.mode = nextMode;

    if (this.mode === "off") {
      this.stopBreathLoop();
      stopVibration();
      this.wakeLock.setEnabled(false);
      return;
    }

    this.wakeLock.setEnabled(true);
    this.wakeLock.request(); // best-effort

    this.stopBreathLoop();
    this.startBreathLoop();
  }

  private computeMode(): HapticsMode {
    // master off OR unsupported
    if (!this.prefs.enabled) return "off";
    if (typeof window === "undefined") return "off";
    if (!hasVibration()) return "off";

    // Breath-follow is premium-gated + user-gated
    const canRunBreath =
      (this.prefs as any).breathEnabled && this.premiumBreathEnabled;

    if (!canRunBreath) {
      return "off";
    }

    // Optional voice-sync behavior (future)
    if ((this.prefs as any).voiceSyncEnabled && this.voiceActive) {
      return "voice";
    }

    return "breath";
  }

  private clearPhaseTimers() {
    if (!this.phaseTimers.length) return;
    for (const id of this.phaseTimers) {
      window.clearTimeout(id);
    }
    this.phaseTimers = [];
  }

  private stopBreathLoop() {
    if (this.loopTimer) {
      window.clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.clearPhaseTimers();
  }

  private sampleHoldBottomMs(): number {
    if (typeof this.holdBottom === "number") return this.holdBottom;

    const { minMs, maxMs } = this.holdBottom;

    // subtle variation per cycle (stillness)
    if (maxMs <= minMs) return minMs;

    const span = maxMs - minMs;
    const r = Math.random();
    return minMs + Math.round(span * r);
  }

  private detectPreset(): BreathPreset {
    const i = this.inhaleMs;
    const ht = this.holdTopMs;
    const e = this.exhaleMs;

    // Presets all have holdTop = 0 in your design
    if (ht !== 0) return "standard";

    if (i === 6000 && e === 8000) return "release";
    if (i === 8000 && e === 14000) return "deep-calm";
    if (i === 10000 && e === 20000) return "stillness";

    return "standard";
  }

  private startBreathLoop() {
    if (!this.mounted) return;
    if (this.mode === "off") return;
    if (!this.canVibrate()) return;

    const firePhase = (
      phase: "in" | "out" | "holdTop" | "holdBottom",
      durationMs: number,
      opts?: { bottomCalm?: boolean }
    ) => {
      if (!this.canVibrate()) return;

      // TS compat: patterns accept legacy "hold" for holdTop
      const phaseForPatterns =
        phase === "holdTop" ? ("hold" as const) : (phase as any);

      const spec = getPhasePulseSpec(
        phaseForPatterns as any,
        this.prefs.intensity as HapticsIntensity,
        this.mode === "voice" ? "voice" : "breath",
        durationMs,
        {
          ...opts,
          preset: this.preset,
        } as any
      );

      // ✅ heartbeat events (holdBottom only) - use beatIndexes if provided
      if (phase === "holdBottom" && typeof window !== "undefined") {
        try {
          const beats =
            Array.isArray((spec as any).beatIndexes) &&
            (spec as any).beatIndexes.length
              ? ((spec as any).beatIndexes as number[])
              : null;

          if (beats) {
            for (const beatIdx of beats) {
              let t = 0;
              for (let i = 0; i < beatIdx; i++) {
                t += Math.max(0, Number(spec.pattern[i] ?? 0));
              }

              this.phaseTimers.push(
                window.setTimeout(() => {
                  try {
                    window.dispatchEvent(new CustomEvent("pause-br-heartbeat"));
                  } catch {}
                }, Math.max(0, t))
              );
            }
          } else {
            // fallback: pulses at even indexes
            let t = 0;
            for (let i = 0; i < spec.pattern.length; i += 2) {
              const pulseMs = Number(spec.pattern[i] ?? 0);
              const pauseMs = Number(spec.pattern[i + 1] ?? 0);

              this.phaseTimers.push(
                window.setTimeout(() => {
                  try {
                    window.dispatchEvent(new CustomEvent("pause-br-heartbeat"));
                  } catch {}
                }, Math.max(0, t))
              );

              t += Math.max(0, pulseMs) + Math.max(0, pauseMs);
            }
          }
        } catch {
          // ignore – haptics should never crash
        }
      }

      vibrate(spec.pattern);
    };

    const run = () => {
      // Re-check mode each cycle (prefs/voice may have changed)
      this.recomputeModeAndApply();
      if (this.mode === "off") return;

      this.clearPhaseTimers();

      const inhaleMs = Math.max(0, this.inhaleMs);
      const holdTopMs = Math.max(0, this.holdTopMs);
      const exhaleMs = Math.max(0, this.exhaleMs);
      const holdBottomMs = Math.max(0, this.sampleHoldBottomMs());

      // 1) INHALE
      firePhase("in", inhaleMs);

      // 2) HOLD TOP
      if (holdTopMs > 0) {
        this.phaseTimers.push(
          window.setTimeout(() => firePhase("holdTop", holdTopMs), inhaleMs)
        );
      }

      // 3) EXHALE
      this.phaseTimers.push(
        window.setTimeout(
          () => firePhase("out", exhaleMs),
          inhaleMs + holdTopMs
        )
      );

      // 4) HOLD BOTTOM
      if (holdBottomMs > 0) {
        this.phaseTimers.push(
          window.setTimeout(
            () => firePhase("holdBottom", holdBottomMs, { bottomCalm: true }),
            inhaleMs + holdTopMs + exhaleMs
          )
        );
      }

      const cycle = inhaleMs + holdTopMs + exhaleMs + holdBottomMs;
      this.loopTimer = window.setTimeout(run, Math.max(120, cycle));
    };

    this.loopTimer = window.setTimeout(run, 60);
  }
}