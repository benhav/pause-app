"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "pause-theme"; // "light" | "dark" | null(system)

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function applyHtmlTheme(mode: Theme | null) {
  const el = document.documentElement;

  // Reset først
  el.classList.remove("dark");
  el.classList.remove("light");

  // Null = system (ingen class)
  if (!mode) return;

  el.classList.add(mode);
}

export default function ThemeToggle() {
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

    // Følg systemet (ingen class)
    const sys = getSystemTheme();
    setTheme(sys);
    applyHtmlTheme(null);
  }, []);

  // Følg systemet hvis brukeren IKKE har lagret valg
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
      applyHtmlTheme(null); // fortsatt system (ingen class)
    };

    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [mounted]);

  const isDark = theme === "dark";

  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    applyHtmlTheme(next);

    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  // Placeholder for å unngå hydration mismatch + layout jump
  if (!mounted) {
    return <div className="h-8 w-[72px] rounded-full bg-neutral-100" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={[
        "relative h-8 w-[72px] rounded-full p-1",
        "bg-neutral-100 shadow-sm ring-1 ring-neutral-200",
      ].join(" ")}
    >
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-60">☀️</span>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60">🌙</span>

      <span
        className={[
          "block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200",
          isDark ? "translate-x-[40px]" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
