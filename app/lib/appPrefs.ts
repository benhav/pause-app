// app/lib/appPrefs.ts

export type ThemeMode = "light" | "dark";

export type ThemeSkin =
  | "classic"
  | "floating"
  | "nature"
  | "nightpro"
  | "desert"
  | "ocean"
  | "peaceful"
  | "winter";

/**
 * BreathingRoom kan enten følge app skin (null)
 * eller ha egen override.
 */
export type OptionalSkin = ThemeSkin | null;

export const PREFS_KEYS = {
  proDemo: "pause-pro-demo",

  // App theme
  themeMode: "pause-theme", // "light" | "dark"
  themeSkin: "pause-skin",

  // BreathingRoom override
  breathingRoomSkin: "pause-breathingroom-skin",
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

export function skinToCssValue(
  s: ThemeSkin
):
  | "classic"
  | "floating"
  | "nature"
  | "night-pro"
  | "desert"
  | "ocean"
  | "peaceful"
  | "winter" {
  return s === "nightpro" ? "night-pro" : s;
}

export function applySkinToHtml(s: ThemeSkin) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skinToCssValue(s);
}

/**
 * Setter <html class="dark"> når mode er "dark".
 * (Vi fjerner/legger IKKE til andre klasser enn "dark" – det holder for Tailwind.)
 */
export function applyThemeModeToHtml(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;

  if (mode === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
}

/**
 * Beholder funksjonssignatur for kompatibilitet med gamle kallsteder.
 * Ingen spesial-logikk nå.
 */
export function resolveSkinForMode(
  s: ThemeSkin,
  _isDark: boolean
): ThemeSkin {
  return s;
}

/**
 * ⭐ BreathingRoom skin resolver
 */
export function resolveBreathingRoomSkin(
  appSkin: ThemeSkin,
  override: OptionalSkin
): ThemeSkin {
  return override ?? appSkin;
}