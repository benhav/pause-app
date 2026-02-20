// app/AppProviders.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  PREFS_KEYS,
  type ThemeSkin,
  readLS,
  writeLS,
  applySkinToHtml,
} from "./lib/appPrefs";

type AppPrefs = {
  proDemo: boolean;
  setProDemo: (v: boolean) => void;

  // valgt skin (classic|floating|nature|nightpro)
  skin: ThemeSkin;
  setSkin: (s: ThemeSkin) => void;

  // dark mode state (kommer fra <html class="dark">)
  isDark: boolean;
};

const Ctx = createContext<AppPrefs | null>(null);

function getIsDarkNow(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function isThemeSkin(v: string | null): v is ThemeSkin {
  return v === "classic" || v === "floating" || v === "nature" || v === "nightpro";
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

    const savedSkinRaw = readLS(PREFS_KEYS.themeSkin);
    const initial: ThemeSkin = isThemeSkin(savedSkinRaw) ? savedSkinRaw : "classic";

    _setSkin(initial);
    applySkinToHtml(initial);
  }, []);

  // keep isDark in sync if <html class="dark"> changes (ThemeToggle)
  // IMPORTANT: do NOT change skin here — only update isDark + re-apply dataset
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;

    const obs = new MutationObserver(() => {
      const nextDark = el.classList.contains("dark");
      setIsDark(nextDark);

      // keep dataset in sync (nightpro -> night-pro mapping)
      applySkinToHtml(skin);
    });

    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
    // intentionally depend on `skin` so dataset is correct after skin changes too
  }, [skin]);

  const setProDemo = (v: boolean) => {
    _setProDemo(v);
    writeLS(PREFS_KEYS.proDemo, v ? "1" : "0");
  };

  const setSkin = (s: ThemeSkin) => {
    _setSkin(s);
    applySkinToHtml(s);
    writeLS(PREFS_KEYS.themeSkin, s);
  };

  const value = useMemo(
    () => ({ proDemo, setProDemo, skin, setSkin, isDark }),
    [proDemo, skin, isDark]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppPrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppPrefs must be used inside <AppProviders />");
  return v;
}