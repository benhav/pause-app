// app/lib/haptics/HapticsSettings.ts
import type { HapticsIntensity, HapticsMode } from "./types";

// These keys MUST match what you already use in BR:
const BR_HAPTICS_KEY = "pause-br-haptics"; // "1" | "0"
const BR_HAPTICS_INTENSITY_KEY = "pause-br-haptics-intensity"; // "low" | "med" | "high"
const BR_BREATH_HAPTICS_KEY = "pause-br-breath-haptics"; // "1" | "0" (pro)
const BR_HAPTICS_VOICE_SYNC_KEY = "pause-br-haptics-voice-sync"; // "1" | "0" (optional, future)

export type HapticsPrefs = {
  enabled: boolean; // master haptics on/off
  intensity: HapticsIntensity;
  breathEnabled: boolean; // breath-follow vibration (pro feature toggle)
  voiceSyncEnabled: boolean; // optional: breathe vibration while voice guide is on
  mode: HapticsMode; // engine mode (internal)
};

function isIntensity(v: string): v is HapticsIntensity {
  return v === "low" || v === "med" || v === "high";
}

export function readHapticsPrefs(): HapticsPrefs {
  // SSR safe defaults
  if (typeof window === "undefined") {
    return {
      enabled: true,
      intensity: "med",
      breathEnabled: false, // IMPORTANT: breath haptics NOT default on
      voiceSyncEnabled: false,
      mode: "off",
    };
  }

  let enabled = true;
  try {
    const raw = localStorage.getItem(BR_HAPTICS_KEY);
    if (raw === "0") enabled = false;
    if (raw === "1") enabled = true;
  } catch {}

  let intensity: HapticsIntensity = "med";
  try {
    const raw = (localStorage.getItem(BR_HAPTICS_INTENSITY_KEY) || "med")
      .trim()
      .toLowerCase();
    intensity = isIntensity(raw) ? raw : "med";
  } catch {}

  let breathEnabled = false;
  try {
    breathEnabled = localStorage.getItem(BR_BREATH_HAPTICS_KEY) === "1";
  } catch {}

  let voiceSyncEnabled = false;
  try {
    voiceSyncEnabled = localStorage.getItem(BR_HAPTICS_VOICE_SYNC_KEY) === "1";
  } catch {}

  // mode is derived by engine; default off until enabled AND breathEnabled / voiceSync triggers.
  const mode: HapticsMode = "off";

  return { enabled, intensity, breathEnabled, voiceSyncEnabled, mode };
}

/**
 * Subscribe to "pause-br-settings-changed" which you already dispatch from settings.
 * Returns an unsubscribe function.
 */
export function onHapticsPrefsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => cb();

  window.addEventListener("pause-br-settings-changed", handler);
  return () => window.removeEventListener("pause-br-settings-changed", handler);
}