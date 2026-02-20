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
        label: isDark
          ? t.themeNightpro
          : `${t.themeNightpro} • ${t.themeNightproNote}`,
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

  const {
    proDemo,
    setProDemo,
    skin,
    setSkin,
    isDark,
  } = useAppPrefs();

  const [showProHint, setShowProHint] = useState(false);

  const items: ThemeSkin[] = useMemo(
    () => ["classic", "floating", "nature", "nightpro"],
    []
  );

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
        className="absolute inset-0 bg-black/30"
      />

      {/* sheet */}
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[var(--sheet-bg)] text-[var(--text)] shadow-xl ring-1 ring-[color:var(--border)] p-4">

        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            {t.themeTitle}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-sm underline underline-offset-4 text-[var(--muted)]"
          >
            {t.close}
          </button>
        </div>

        <div className="mt-3 space-y-3">

          {items.map((s) => {

            const m = skinMeta(t, s, isDark);

            const active = skin === s;

            const locked = s !== "classic" && !proDemo;

            const previewStyle: React.CSSProperties =
              s === "classic"
                ? {
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                  }
                : {
                    background:
                      s === "floating"
                        ? "linear-gradient(180deg, rgba(14,165,233,0.20), rgba(255,255,255,0.55))"
                        : s === "nature"
                        ? "linear-gradient(180deg, rgba(47,133,90,0.22), rgba(255,255,255,0.55))"
                        : "linear-gradient(180deg, rgba(96,165,250,0.16), rgba(17,24,39,0.55))",

                    borderColor: m.accent,
                  };

            return (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className={[
                  "w-full rounded-2xl px-4 py-4 text-left text-sm border",
                  active ? "ring-2 ring-[color:var(--ring)]" : "",
                  locked ? "opacity-90" : "",
                ].join(" ")}
                style={previewStyle}
                aria-label={m.label}
              >

                <div className="flex items-center justify-between gap-4">

                  <div className="min-w-0">

                    <div className="truncate">
                      {m.label}
                    </div>

                    {locked && (
                      <div className="mt-2 text-xs text-[var(--muted)]">
                        {t.themeProLocked}
                      </div>
                    )}

                  </div>

                  {/* Active indicator */}
                  <div
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border flex items-center justify-center shrink-0 border-[color:var(--border)] bg-transparent"
                  >
                    {active && (
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: m.accent }}
                      />
                    )}
                  </div>

                </div>

              </button>
            );
          })}
        </div>

        <div className="mt-4">

          <button
            type="button"
            onClick={() => {

              const next = !proDemo;

              setProDemo(next);

              setShowProHint(false);

              if (!next) {
                setSkin("classic");
              }
            }}
            className="w-full rounded-2xl px-4 py-4 text-sm border bg-[var(--surface)] text-[var(--text)] border-[color:var(--border)] hover:bg-[var(--surface-hover)]"
          >
            {proDemo
              ? t.themeDeactivateProDemo
              : t.themeActivateProDemo}
          </button>

          {showProHint && (
            <div className="mt-2 text-center text-xs text-[var(--muted)]">
              {t.themeProLocked}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}