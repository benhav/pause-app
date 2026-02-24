// app/components/ThemePicker.tsx
"use client";

import { useState } from "react";
import ThemeSheet from "./ThemeSheet";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";

export default function ThemePicker({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = UI_TEXT[locale];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          [
            // shape + sizing
            "rounded-full px-5 py-3 md:py-3.5",
            "text-sm md:text-base font-medium",

            // colors from tokens
            "text-[var(--text)]",
            "bg-[var(--btn-bg)] hover:bg-[var(--btn-bg-hover)]",
            "border border-[color:var(--btn-border)]",

            // glass feel
            "backdrop-blur-xl",
            "shadow-[var(--btn-shadow)] hover:shadow-[var(--btn-shadow-hover)]",

            // subtle premium highlight (uses your --btn-highlight)
            "relative overflow-hidden",
            "before:content-[''] before:absolute before:inset-0",
            "before:bg-[radial-gradient(120%_80%_at_30%_20%,var(--btn-highlight),transparent_60%)]",
            "before:opacity-60 before:pointer-events-none",

            // interactions
            "transition-all duration-150 ease-out",
            "active:translate-y-[1px] active:scale-[0.985]",
            "active:shadow-[var(--btn-pressed-shadow)]",

            // focus
            "focus:outline-none focus:ring-2 focus:ring-[color:var(--btn-ring)]",
          ].join(" ")
        }
        aria-label={t.themeTitle}
      >
        {t.themeTitle}
      </button>

      <ThemeSheet open={open} onClose={() => setOpen(false)} locale={locale} />
    </div>
  );
}