// app/lib/haptics/HapticsEngine.ts
import { hasVibration, stopVibration, vibrate } from "./HapticsPlatform";
import {
  getIntensityParams,
  getPhasePulseSpec,
  scalePulseMs,
} from "./HapticsPatterns";
import { onHapticsPrefsChanged, readHapticsPrefs } from "./HapticsSettings";
import { WakeLockManager } from "./WakeLock";
import type {
  BreathPhase,
  HapticsIntensity,
  HapticsMode,
  HapticsPrefs,
} from "./types";

type TimerId = number;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export class HapticsEngine {
  private mounted = false;
  private unsubscribe: (() => void) | null = null;

  private prefs: HapticsPrefs = readHapticsPrefs();

  // Breath engine controls
  private mode: HapticsMode = "off";
  private voiceActive = false; // BR can tell us when voice guide is toggled
  private premiumBreathEnabled = false; // set from BR (isPro)

  private cycleSeconds = 10; // will be set by BR
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
   * (UI feedback like tick/wosh can still run if you want – that’s controlled by prefs.enabled)
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
   * BR calls this on slider change / seconds change.
   */
  setCycleSeconds(seconds: number) {
    this.cycleSeconds = clamp(seconds, 4, 30);
    if (this.mode !== "off") {
      // restart loop so it instantly matches slider
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

  // Create a calm repeating pulse for preview
  const basePulse =
    intensity === "low" ? 10 :
    intensity === "high" ? 22 :
    16;

  const basePause =
    intensity === "low" ? 180 :
    intensity === "high" ? 90 :
    130;

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
      // Still ensure wake lock state is correct
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

    // breath/voice mode
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
    // NOTE: expects prefs.breathEnabled to exist (your settings layer controls this)
    const canRunBreath = (this.prefs as any).breathEnabled && this.premiumBreathEnabled;

    if (!canRunBreath) {
      return "off";
    }

    // Optional voice-sync behavior (future)
    if ((this.prefs as any).voiceSyncEnabled && this.voiceActive) {
      return "voice";
    }

    return "breath";
  }


/**
 * Phase timers must always be cleared on restart.
 * Otherwise slider changes can cause overlapping vibration phases.
 *
 * This prevents "vibration stacking".
 */

  
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
    // ✅ also cancel any scheduled phase vibrations
    this.clearPhaseTimers();
  }


/**
 * IMPORTANT:
 * Breath loop mirrors the visual + voice timing (0.28 / 0.12 / 0.32 + rest).
 *
 * Do NOT change ratios here unless you also change:
 * - Breathing circle animation
 * - Voice timing schedule
 *
 * Haptics must stay phase-locked with visual + audio.
 */

  private startBreathLoop() {
    if (!this.mounted) return;
    if (this.mode === "off") return;
    if (!this.canVibrate()) return;

    // Match your existing math (voice + CSS)
    const cycleMs = Math.round(this.cycleSeconds * 1000);
    const inhaleMs = Math.round(this.cycleSeconds * 0.28 * 1000);
    const holdTopMs = Math.round(this.cycleSeconds * 0.12 * 1000);
    const exhaleMs = Math.round(this.cycleSeconds * 0.32 * 1000);

    // ✅ Bottom rest (this is where we add “waiting pulses”)
    const holdBottomMs = Math.max(0, cycleMs - inhaleMs - holdTopMs - exhaleMs);

    const firePhase = (phase: any, durationMs: number) => {
      if (!this.canVibrate()) return;

      const spec = getPhasePulseSpec(
        phase,
        this.prefs.intensity as HapticsIntensity,
        this.mode === "voice" ? "voice" : "breath",
        durationMs
      );

      vibrate(spec.pattern);
    };

    const run = () => {
      // Re-check mode each cycle (prefs/voice may have changed)
      this.recomputeModeAndApply();
      if (this.mode === "off") return;

      // Make sure previous scheduled timers are cleared (important on slider change)
      this.clearPhaseTimers();

      // 1) INHALE
      firePhase("in", inhaleMs);

      // 2) HOLD TOP (ticks early + silence before exhale -> "opphold"-følelse)
      this.phaseTimers.push(
        window.setTimeout(() => firePhase("holdTop", holdTopMs), inhaleMs)
      );

      // 3) EXHALE
      this.phaseTimers.push(
        window.setTimeout(
          () => firePhase("out", exhaleMs),
          inhaleMs + holdTopMs
        )
      );

      // 4) HOLD BOTTOM (ventepulser mellom utpust og neste innpust)
      if (holdBottomMs > 0) {
        this.phaseTimers.push(
          window.setTimeout(
            () => firePhase("holdBottom", holdBottomMs),
            inhaleMs + holdTopMs + exhaleMs
          )
        );
      }

      // next cycle
      this.loopTimer = window.setTimeout(
        run,
        inhaleMs + holdTopMs + exhaleMs + holdBottomMs
      );
    };

    // start quickly
    this.loopTimer = window.setTimeout(run, 60);
  }
}