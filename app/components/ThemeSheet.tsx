"use client";

import React, { useMemo, useState } from "react";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";
import { useAppPrefs } from "../AppProviders";
import type { ThemeSkin } from "../lib/appPrefs";

type UIText = typeof UI_TEXT["en"];

function skinMeta(t: UIText, skin: ThemeSkin, isDark: boolean) {
  switch (skin) {
    case "classic":
      return { label: t.themeClassic, accent: "#0ea5e9" };
    case "floating":
      return { label: t.themeFloating, accent: "#0ea5e9" };
    case "nature":
      return { label: t.themeNature, accent: "#2f855a" };
    case "nightpro":
      return {
        label: isDark ? t.themeNightpro : `${t.themeNightpro} • ${t.themeNightproNote}`,
        accent: "#60a5fa",
      };
  }
}

export default function ThemeSheet({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
}) {
  const t = UI_TEXT[locale] as UIText;

  const { proDemo, setProDemo, skin, setSkin, isDark } = useAppPrefs();

  const [showProHint, setShowProHint] = useState(false);

  const items: ThemeSkin[] = useMemo(() => ["classic", "floating", "nature", "nightpro"], []);

  if (!open) return null;

  const pick = (next: ThemeSkin) => {
    const isProSkin = next !== "classic";

    if (isProSkin && !proDemo) {
      setShowProHint(true);
      return;
    }

    setShowProHint(false);
    setSkin(next);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
      />

      {/* sheet */}
      <div
        className={[
          "absolute bottom-0 left-0 right-0",
          "rounded-t-3xl",
          "bg-[var(--sheet-bg)] text-[var(--text)]",
          "shadow-xl ring-1 ring-[color:var(--border)]",
          "p-4 md:p-6",
        ].join(" ")}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm md:text-base font-medium">{t.themeTitle}</div>

          <button
            type="button"
            onClick={onClose}
            className="text-sm underline underline-offset-4 text-[var(--muted)] hover:opacity-90"
          >
            {t.close}
          </button>
        </div>

        <div className="mt-4 space-y-3 md:space-y-4">
          {items.map((s) => {
            const m = skinMeta(t, s, isDark);
            const active = skin === s;
            const locked = s !== "classic" && !proDemo;

            // Mer “Pause”: roligere previews, mindre “glorete”
            const previewStyle: React.CSSProperties =
              s === "classic"
                ? { background: "var(--surface)", borderColor: "var(--border)" }
                : {
                    background:
                      s === "floating"
                        ? "linear-gradient(180deg, rgba(14,165,233,0.14), rgba(255,255,255,0.40))"
                        : s === "nature"
                        ? "linear-gradient(180deg, rgba(47,133,90,0.14), rgba(255,255,255,0.40))"
                        : "linear-gradient(180deg, rgba(96,165,250,0.12), rgba(17,24,39,0.40))",
                    borderColor: "var(--border)",
                  };

            return (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className={[
                  "w-full rounded-2xl text-left border",
                  "px-4 py-4 md:px-5 md:py-5",
                  "text-sm md:text-base",
                  "transition",
                  "hover:opacity-95",
                  active ? "ring-2 ring-[color:var(--ring)]" : "",
                  locked ? "opacity-90" : "",
                ].join(" ")}
                style={previewStyle}
                aria-label={m.label}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate">{m.label}</div>

                    {locked && (
                      <div className="mt-2 text-xs md:text-sm text-[var(--muted)]">
                        {t.themeProLocked}
                      </div>
                    )}
                  </div>

                  {/* Active indicator */}
                  <div
                    aria-hidden="true"
                    className={[
                      "h-5 w-5 md:h-6 md:w-6 rounded-full",
                      "border border-[color:var(--border)]",
                      "flex items-center justify-center shrink-0",
                      "bg-transparent",
                    ].join(" ")}
                  >
                    {active && (
                      <div
                        className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full"
                        style={{ background: m.accent }}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 md:mt-6">
          <button
            type="button"
            onClick={() => {
              const next = !proDemo;
              setProDemo(next);
              setShowProHint(false);

              if (!next) setSkin("classic");
            }}
            className={[
              "w-full rounded-2xl px-4 py-4 md:px-5 md:py-5",
              "text-sm md:text-base",
              "border border-[color:var(--border)]",
              "bg-[var(--surface)] text-[var(--text)]",
              "hover:bg-[var(--surface-hover)]",
              "transition",
            ].join(" ")}
          >
            {proDemo ? t.themeDeactivateProDemo : t.themeActivateProDemo}
          </button>

          {showProHint && (
            <div className="mt-2 text-center text-xs md:text-sm text-[var(--muted)]">
              {t.themeProLocked}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}