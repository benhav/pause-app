"use client";

import { useEffect, useState } from "react";
import { useAppPrefs } from "../AppProviders";

const THEME_KEY = "pause-theme"; // "light" | "dark" | null(system)

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function applyHtmlTheme(mode: Theme | null) {
  const el = document.documentElement;

  // reset først
  el.classList.remove("dark");
  el.classList.remove("light");

  // null = system (ingen class)
  if (!mode) return;

  el.classList.add(mode);
}

export default function ThemeToggle() {
  // les valgt skin
  const { skin } = useAppPrefs();

  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  // Mount + init theme
  useEffect(() => {
    setMounted(true);

    const saved = (() => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    })();

    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      applyHtmlTheme(saved);
      return;
    }

    // Følg systemet
    const sys = getSystemTheme();
    setTheme(sys);
    applyHtmlTheme(null);
  }, []);

  // Følg system hvis ikke manuelt valgt
  useEffect(() => {
    if (!mounted) return;

    const saved = (() => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    })();

    if (saved === "light" || saved === "dark") return;

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;

    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setTheme(next);
      applyHtmlTheme(null);
    };

    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [mounted]);

  // Night Pro styrer egen stemning → toggle skjules
  if (skin === "nightpro") return null;

  const isDark = theme === "dark";

  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    applyHtmlTheme(next);

    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  // Placeholder (hydration safe) – matcher app-stil
  if (!mounted) {
    return (
      <div
        className={[
          "h-9 w-12 md:h-10 md:w-14 rounded-full",
          "border border-[color:var(--border)]",
          "bg-[var(--surface)]",
          "opacity-60",
        ].join(" ")}
        aria-hidden="true"
      />
    );
  }

  return (
  <button
    type="button"
    onClick={toggle}
    aria-label="Toggle theme"
    className={[
      "relative rounded-full",
      // ✅ Track større enn knob + padding inni
      "h-8 w-[72px] md:h-10 md:w-[84px] p-1",
      "border border-[color:var(--border)]",
      "bg-[var(--surface)] text-[var(--text)]",
      "hover:bg-[var(--surface-hover)]",
      "transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
    ].join(" ")}
  >
    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] opacity-55">
      ☀️
    </span>
    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] opacity-55">
      🌙
    </span>

    <span
      className={[
        // ✅ Knob mindre enn track innside
        "block rounded-full bg-[var(--app-bg)] shadow-sm",
        "h-6 w-6 md:h-8 md:w-8",
        "transition-transform duration-200",
        // ✅ Alltid helt til høyre: trackWidth - knobSize - (2 * padding)
        isDark
          ? "translate-x-[calc(72px-24px-8px)] md:translate-x-[calc(84px-32px-8px)]"
          : "translate-x-0",
      ].join(" ")}
    />
  </button>
);
  
}