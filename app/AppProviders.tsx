// app/AppProviders.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  PREFS_KEYS,
  type ThemeSkin,
  readLS,
  writeLS,
  applySkinToHtml,
  resolveSkinForMode,
} from "./lib/appPrefs";

type AppPrefs = {
  proDemo: boolean;
  setProDemo: (v: boolean) => void;
  skin: ThemeSkin; // "choice" (classic|floating|nature|nightfirst) - resolved via isDark
  setSkin: (s: ThemeSkin) => void;
  isDark: boolean;
};

const Ctx = createContext<AppPrefs | null>(null);

function getIsDarkNow(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [proDemo, _setProDemo] = useState(false);
  const [skin, _setSkin] = useState<ThemeSkin>("classic");
  const [isDark, setIsDark] = useState(false);

  // init on mount
  useEffect(() => {
    const darkNow = getIsDarkNow();
    setIsDark(darkNow);

    const savedPro = readLS(PREFS_KEYS.proDemo);
    _setProDemo(savedPro === "1");

    const savedSkin = readLS(PREFS_KEYS.themeSkin) as ThemeSkin | null;
    const initial: ThemeSkin =
      savedSkin === "classic" || savedSkin === "floating" || savedSkin === "nature" || savedSkin === "nightfirst"
        ? savedSkin
        : "classic";

    const resolved = resolveSkinForMode(initial, darkNow);
    _setSkin(resolved);
    applySkinToHtml(resolved);
  }, []);

  // keep isDark in sync if <html class="dark"> changes (ThemeToggle)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;

    const obs = new MutationObserver(() => {
      const nextDark = el.classList.contains("dark");
      setIsDark(nextDark);

      _setSkin((current) => {
        const resolved = resolveSkinForMode(current, nextDark);
        if (resolved !== current) {
          applySkinToHtml(resolved);
          writeLS(PREFS_KEYS.themeSkin, resolved);
          return resolved;
        }
        // selv om samme, sørg for at dataset matcher (nightfirst -> "night-first")
        applySkinToHtml(current);
        return current;
      });
    });

    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const setProDemo = (v: boolean) => {
    _setProDemo(v);
    writeLS(PREFS_KEYS.proDemo, v ? "1" : "0");
  };

  const setSkin = (s: ThemeSkin) => {
    const resolved = resolveSkinForMode(s, isDark);
    _setSkin(resolved);
    applySkinToHtml(resolved);
    writeLS(PREFS_KEYS.themeSkin, resolved);
  };

  const value = useMemo(() => ({ proDemo, setProDemo, skin, setSkin, isDark }), [proDemo, skin, isDark]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppPrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppPrefs must be used inside <AppProviders />");
  return v;
}
