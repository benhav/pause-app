// app/lib/haptics/index.ts
import { HapticsEngine } from "./HapticsEngine";

let singleton: HapticsEngine | null = null;

export function getHaptics(): HapticsEngine {
  if (!singleton) {
    singleton = new HapticsEngine();
  }
  return singleton;
}

export * from "./types";