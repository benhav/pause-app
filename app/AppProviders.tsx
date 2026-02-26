// app/AppProviders.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  PREFS_KEYS,
  type ThemeMode,
  type ThemeSkin,
  readLS,
  writeLS,
  applySkinToHtml,
  applyThemeModeToHtml,
} from "./lib/appPrefs";

type AppPrefs = {
  proDemo: boolean;
  setProDemo: (v: boolean) => void;

  // Theme mode (light/dark)
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;

  // valgt skin
  // classic|floating|nature|nightpro|desert|ocean|peaceful|winter
  skin: ThemeSkin;
  setSkin: (s: ThemeSkin) => void;

  /**
   * BreathingRoom override:
   * - null => følger app-skin (fallback/default)
   * - ThemeSkin => fast overstyring (Pro feature)
   */
  breathingRoomSkin: ThemeSkin | null;
  setBreathingRoomSkin: (s: ThemeSkin | null) => void;

  /**
   * ⭐ HTML skin override (runtime)
   * - null => følger appens skin
   * - ThemeSkin => overstyrer html[data-skin]
   */
  htmlSkinOverride: ThemeSkin | null;
  setHtmlSkinOverride: (s: ThemeSkin | null) => void;

  // derived
  isDark: boolean;
};

const Ctx = createContext<AppPrefs | null>(null);

/**
 * Normaliserer localStorage-verdi for skin.
 * Hindrer små avvik (whitespace / casing / kebab-case) i å trigge fallback.
 */
function normalizeThemeSkin(v: string | null): ThemeSkin | null {
  if (!v) return null;

  const s = v.trim().toLowerCase();

  if (s === "night-pro") return "nightpro";

  if (
    s === "classic" ||
    s === "floating" ||
    s === "nature" ||
    s === "nightpro" ||
    s === "desert" ||
    s === "ocean" ||
    s === "peaceful" ||
    s === "winter"
  ) {
    return s as ThemeSkin;
  }

  return null;
}

function normalizeThemeMode(v: string | null): ThemeMode | null {
  if (!v) return null;

  const s = v.trim().toLowerCase();

  if (s === "dark") return "dark";
  if (s === "light") return "light";

  return null;
}

/**
 * ⭐ Zen-init:
 * Leser fra <html> (som layout-bootstrap allerede har satt før paint),
 * så første render matcher det brukeren ser. Ingen "flash" på refresh.
 */
function readInitialFromHtml(): {
  isDark: boolean;
  skin: ThemeSkin;
} {
  if (typeof document === "undefined") {
    return { isDark: false, skin: "classic" };
  }

  const root = document.documentElement;

  const isDark = root.classList.contains("dark");

  // dataset.skin kan være kebab-case ("night-pro")
  const raw = root.dataset.skin ?? "classic";

  const normalized = normalizeThemeSkin(raw) ?? "classic";

  return {
    isDark,
    skin: normalized,
  };
}

function readInitialProDemo(): boolean {
  const saved = readLS(PREFS_KEYS.proDemo);
  return saved === "1";
}

function readInitialBreathingRoomSkin(
  proOn: boolean
): ThemeSkin | null {
  if (!proOn) return null;

  const raw = readLS(PREFS_KEYS.breathingRoomSkin);

  return normalizeThemeSkin(raw);
}

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ First render matches <html> (set by bootstrap)
  const initialHtml = useMemo(
    () => readInitialFromHtml(),
    []
  );

  const [isDark, setIsDark] = useState<boolean>(
    initialHtml.isDark
  );

  // mode er bare en “view” av dark/light her
  const [mode, _setMode] = useState<ThemeMode>(
    initialHtml.isDark ? "dark" : "light"
  );

  const [skin, _setSkin] = useState<ThemeSkin>(
    initialHtml.skin
  );

  // ✅ Pro + BR override init uten “flash”
  const initialPro = useMemo(
    () => readInitialProDemo(),
    []
  );

  const [proDemo, _setProDemo] =
    useState<boolean>(initialPro);

  const [breathingRoomSkin, _setBreathingRoomSkin] =
    useState<ThemeSkin | null>(() =>
      readInitialBreathingRoomSkin(initialPro)
    );

  // html override starter alltid av
  const [htmlSkinOverride, _setHtmlSkinOverride] =
    useState<ThemeSkin | null>(null);

  const effectiveSkin =
    htmlSkinOverride ?? skin;

  /**
   * ✅ Hold isDark/mode i sync hvis <html class="dark">
   * endres utenom provider
   * (ThemeToggle, layout bootstrap, osv).
   *
   * Viktig:
   * IKKE re-apply skin her (det kan gi “stomp”/blink).
   */
  useEffect(() => {
    if (typeof document === "undefined") return;

    const el = document.documentElement;

    const obs = new MutationObserver(() => {
      const nextDark =
        el.classList.contains("dark");

      setIsDark(nextDark);

      _setMode(
        nextDark ? "dark" : "light"
      );
    });

    obs.observe(el, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => obs.disconnect();
  }, []);

  /**
   * ✅ Når skin eller htmlSkinOverride endres,
   * skal html[data-skin] følge effectiveSkin.
   */
  useEffect(() => {
    applySkinToHtml(effectiveSkin);
  }, [effectiveSkin]);

  /**
   * ✅ Hvis Pro slås AV utenom vår setter,
   * sørg for at BR override nulles.
   */
  useEffect(() => {
    if (
      !proDemo &&
      breathingRoomSkin !== null
    ) {
      _setBreathingRoomSkin(null);
    }
  }, [proDemo, breathingRoomSkin]);

  const setProDemo = (v: boolean) => {
    _setProDemo(v);

    writeLS(
      PREFS_KEYS.proDemo,
      v ? "1" : "0"
    );

    if (!v) {
      _setBreathingRoomSkin(null);

      writeLS(
        PREFS_KEYS.breathingRoomSkin,
        ""
      );
    } else {
      // Hvis pro skrus på: les evt lagret BR override
      const raw = readLS(
        PREFS_KEYS.breathingRoomSkin
      );

      _setBreathingRoomSkin(
        normalizeThemeSkin(raw)
      );
    }
  };

  const setMode = (m: ThemeMode) => {
    _setMode(m);

    applyThemeModeToHtml(m);

    setIsDark(m === "dark");

    writeLS(
      PREFS_KEYS.themeMode,
      m
    );
  };

  const setSkin = (s: ThemeSkin) => {
    _setSkin(s);

    // effectiveSkin-effekten tar html[data-skin]
    writeLS(
      PREFS_KEYS.themeSkin,
      s
    );
  };

  const setBreathingRoomSkin = (
    s: ThemeSkin | null
  ) => {
    if (!proDemo) {
      _setBreathingRoomSkin(null);

      writeLS(
        PREFS_KEYS.breathingRoomSkin,
        ""
      );

      return;
    }

    _setBreathingRoomSkin(s);

    if (!s)
      writeLS(
        PREFS_KEYS.breathingRoomSkin,
        ""
      );
    else
      writeLS(
        PREFS_KEYS.breathingRoomSkin,
        s
      );
  };

  const setHtmlSkinOverride = (
    s: ThemeSkin | null
  ) => {
    _setHtmlSkinOverride(s);

    // effectiveSkin-effekten tar html[data-skin]
  };

  const value = useMemo(
    () => ({
      proDemo,
      setProDemo,

      mode,
      setMode,

      skin,
      setSkin,

      breathingRoomSkin,
      setBreathingRoomSkin,

      htmlSkinOverride,
      setHtmlSkinOverride,

      isDark,
    }),
    [
      proDemo,
      mode,
      skin,
      breathingRoomSkin,
      htmlSkinOverride,
      isDark,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppPrefs() {
  const v = useContext(Ctx);

  if (!v)
    throw new Error(
      "useAppPrefs must be used inside <AppProviders />"
    );

  return v;
}