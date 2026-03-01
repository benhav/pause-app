/**
 * NOTE:
 * BreathPhase names must stay aligned with:
 * - HapticsEngine scheduling
 * - BreathingRoom animation timing
 *
 * Changing phase names requires updating engine + patterns.
 */



// app/lib/haptics/types.ts

export type HapticsIntensity = "low" | "med" | "high";

/**
 * MUST match BreathingRoom timing (voice + circle)
 */
export type BreathPhase = "in" | "hold" | "out";

/**
 * Engine mode (derived at runtime)
 * - off: no breath vibration scheduling
 * - breath: follow breathing cycle
 * - voice: follow breathing cycle, but only when voice guide is on (future option)
 */
export type HapticsMode = "off" | "breath" | "voice";

export type HapticsPrefs = {
  enabled: boolean; // pause-br-haptics ("1"/"0")
  intensity: HapticsIntensity; // pause-br-haptics-intensity
  breathEnabled: boolean; // pause-br-breath-haptics ("1"/"0") (pro)
  voiceSyncEnabled: boolean; // pause-br-haptics-voice-sync ("1"/"0") (future)
};

export type PhaseEventDetail = {
  phase: BreathPhase;
  durationMs?: number;
};