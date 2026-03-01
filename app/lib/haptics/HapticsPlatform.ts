// app/lib/haptics/HapticsPlatform.ts

/**
 * Browser vibration API wrapper.
 * - Safe for SSR
 * - No-ops if unsupported
 */

export function hasVibration(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as any;
  return typeof nav?.vibrate === "function";
}

export function vibrate(pattern: number | number[]): boolean {
  if (!hasVibration()) return false;
  try {
    return (window.navigator as any).vibrate(pattern as any) === true;
  } catch {
    return false;
  }
}

export function stopVibration(): void {
  if (!hasVibration()) return;
  try {
    (window.navigator as any).vibrate(0);
  } catch {
    // ignore
  }
}