// app/components/ThemePicker.tsx
"use client";

import { useState } from "react";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";
import ThemeSheet from "./ThemeSheet";

export default function ThemePicker({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const t = UI_TEXT[locale];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
        }
        aria-label={t.themeTitle}
      >
        {t.themeTitle}
      </button>

      <ThemeSheet open={open} onClose={() => setOpen(false)} locale={locale} />
    </div>
  );
}
