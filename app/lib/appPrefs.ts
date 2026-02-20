// app/lib/appPrefs.ts

export type ThemeSkin = "classic" | "floating" | "nature" | "nightpro";

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

/**
 * Vi lagrer ThemeSkin i LS som: "classic" | "floating" | "nature" | "nightpro"
 * men CSS-selectors bruker kebab-case for night pro:
 * html[data-skin="night-pro"]
 */
export function skinToCssValue(
  s: ThemeSkin
): "classic" | "floating" | "nature" | "night-pro" {
  return s === "nightpro" ? "night-pro" : s;
}

export function applySkinToHtml(s: ThemeSkin) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;

  // CSS matcher: html[data-skin="..."]
  el.dataset.skin = skinToCssValue(s);
}

/**
 * Tidligere hadde vi "night-first" som auto-falt tilbake til classic i light.
 * Nå er "nightpro" et helt vanlig skin (som floating/nature).
 *
 * Vi beholder funksjonen for å slippe å endre kallsteder,
 * men den gjør ingen spesial-logikk lenger.
 */
export function resolveSkinForMode(s: ThemeSkin, _isDark: boolean): ThemeSkin {
  return s;
}