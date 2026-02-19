// app/lib/appPrefs.ts
export type ThemeSkin = "classic" | "floating" | "nature" | "nightfirst";

export const PREFS_KEYS = {
  proDemo: "pause-pro-demo",
  themeSkin: "pause-skin",
} as const;

export function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Lagres i LS som "nightfirst", men CSS-selectors i globals.css er "night-first" :contentReference[oaicite:7]{index=7}
export function skinToCssValue(s: ThemeSkin): "classic" | "floating" | "nature" | "night-first" {
  return s === "nightfirst" ? "night-first" : s;
}

export function applySkinToHtml(s: ThemeSkin) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;

  // Dette er det CSS faktisk matcher på (html[data-skin="..."]) :contentReference[oaicite:8]{index=8}
  el.dataset.skin = skinToCssValue(s);
}

/**
 * Night-first skal bare være aktiv i dark. I light faller den tilbake til classic.
 * (Vi lar "nightfirst" fortsatt være valget i sheet, men resolved blir classic i light)
 */
export function resolveSkinForMode(s: ThemeSkin, isDark: boolean): ThemeSkin {
  if (s === "nightfirst") return isDark ? "nightfirst" : "classic";
  return s;
}
