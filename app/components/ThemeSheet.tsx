"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";
import { useAppPrefs } from "../AppProviders";
import type { ThemeSkin } from "../lib/appPrefs";

type UIText = typeof UI_TEXT["en"];

function isProSkin(s: ThemeSkin) {
  return s !== "classic";
}

function previewSrc(s: ThemeSkin) {
  return `/theme-previews/${s}-preview.webp`;
}

/**
 * Kun for ThemeSheet-tags (ikke UI ellers).
 * Beholder ønskede navn-overstyringer.
 */
function sheetBaseName(locale: Locale, t: UIText, skin: ThemeSkin) {
  const isNo = locale === "no";

  switch (skin) {
    case "classic":
      return t.themeClassic;

    case "floating":
      return isNo ? "Bølger" : "Waves";

    case "nature":
      return isNo ? "Natur" : t.themeNature;

    case "nightpro":
      return isNo ? "Rolig natt" : "Silent night";

    case "desert":
      return t.themeDesert;

    case "ocean":
      return t.themeOcean;

    case "peaceful":
      return isNo ? "Stille morgen" : t.themePeaceful;

    case "winter":
      return isNo ? "Vinter skog" : t.themeWinter;
  }
}

/**
 * Fjerner eventuelle eksisterende "(Pro)/(Free)/(Gratis)" i UI_TEXT,
 * så vi unngår dobbelt-suffix.
 */
function stripAnySuffix(label: string) {
  return (label || "")
    .replace(/\s*\((pro|free|gratis)\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function suffixForCard(locale: Locale, skin: ThemeSkin, proDemo: boolean) {
  if (proDemo) return "";
  if (skin === "classic") return locale === "no" ? " (Gratis)" : " (Free)";
  return " (Pro)";
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
  const { proDemo, setProDemo, skin, setSkin } = useAppPrefs();

  const [pendingSkin, setPendingSkin] = useState<ThemeSkin | null>(null);

  // ⭐ Hero zoom animation (sheet open)
  const [animateIn, setAnimateIn] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!open) {
      setAnimateIn(false);
      return;
    }

    let rm = false;
    try {
      rm =
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    } catch {}
    setReduceMotion(rm);

    if (rm) {
      setAnimateIn(true);
      return;
    }

    // start "from" state, then flip next frame (smooth on iOS/Android + tablets)
    setAnimateIn(false);
    const id = window.requestAnimationFrame(() => setAnimateIn(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const allItems: ThemeSkin[] = useMemo(
    () => [
      "classic",
      "floating",
      "nature",
      "nightpro",
      "desert",
      "ocean",
      "peaceful",
      "winter",
    ],
    []
  );

  // Valgt theme først + resten i original rekkefølge
  const items: ThemeSkin[] = useMemo(() => {
    const rest = allItems.filter((x) => x !== skin);
    return [skin, ...rest];
  }, [allItems, skin]);

  if (!open) return null;

  const pick = (next: ThemeSkin) => {
    if (isProSkin(next) && !proDemo) {
      setPendingSkin(next);
      return;
    }

    setPendingSkin(null);
    setSkin(next);
    onClose();
  };

  const activateProAndApply = () => {
    setProDemo(true);

    if (pendingSkin) {
      setSkin(pendingSkin);
      setPendingSkin(null);
      onClose();
    }
  };

  const LockIcon = () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 md:h-[18px] md:w-[18px]"
      fill="none"
    >
      <path
        d="M7.5 10V8.2C7.5 5.6 9.4 3.75 12 3.75C14.6 3.75 16.5 5.6 16.5 8.2V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7.2 10H16.8C18 10 18.75 10.75 18.75 11.95V17.8C18.75 19 18 19.75 16.8 19.75H7.2C6 19.75 5.25 19 5.25 17.8V11.95C5.25 10.75 6 10 7.2 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );

  // Backdrop fade (subtle)
  const backdropStyle: React.CSSProperties = reduceMotion
    ? { opacity: 1 }
    : {
        opacity: animateIn ? 1 : 0,
        transition: "opacity 220ms cubic-bezier(0.2,0.9,0.2,1)",
      };

  // Hero zoom + lift (calm Apple-like)
  const panelAnimStyle: React.CSSProperties = reduceMotion
    ? {}
    : {
        transform: animateIn
          ? "translate3d(0,0,0) scale(1)"
          : "translate3d(0,10px,0) scale(0.985)",
        opacity: animateIn ? 1 : 0,
        transition:
          "transform 280ms cubic-bezier(0.2,0.9,0.2,1), opacity 220ms cubic-bezier(0.2,0.9,0.2,1)",
        willChange: "transform, opacity",
      };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        style={backdropStyle}
      />

      <div
        className={[
          "absolute inset-x-0 bottom-0",
          "sm:inset-0 sm:flex sm:items-center sm:justify-center",
          "p-0 sm:p-6",
        ].join(" ")}
      >
        <div
          className={[
            "relative w-full",
            "rounded-t-3xl sm:rounded-3xl",
            "text-[var(--text)]",
            "ring-1 ring-[color:var(--border)]",
            "backdrop-blur-xl",
            "max-h-[90svh] sm:max-h-[88svh]",
            "overflow-hidden",
          ].join(" ")}
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--app-bg) 86%, rgba(255,255,255,0.16))",
            boxShadow:
              "0 18px 55px rgba(0,0,0,0.22), 0 2px 0 rgba(255,255,255,0.12) inset",
            ...panelAnimStyle,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1200px 500px at 50% -180px, rgba(255,255,255,0.20), transparent 55%)",
              opacity: 0.9,
            }}
          />

          {/* Header */}
          <div className="relative flex items-center justify-between px-5 pt-5 pb-4 sm:px-6">
            <div className="text-sm md:text-base font-medium">{t.themeTitle}</div>

            <button
              type="button"
              onClick={onClose}
              className="text-sm underline underline-offset-4 text-[var(--muted)] hover:opacity-90"
            >
              {t.close}
            </button>
          </div>

          {/* Grid */}
          <div className="relative px-5 pb-5 sm:px-6">
            <div
              className={[
                "grid grid-cols-2 gap-3 md:gap-4",
                "max-h-[62svh] sm:max-h-[60svh]",
                "overflow-y-auto overscroll-contain",
                "pr-1",
              ].join(" ")}
            >
              {items.map((s) => {
                const active = skin === s;
                const pro = isProSkin(s);

                // Låst: kun når pro ikke er aktivert
                const locked = pro && !proDemo;
                const showPending = pendingSkin === s;

                const base = stripAnySuffix(sheetBaseName(locale, t, s));
                const tagText = `${base}${suffixForCard(locale, s, proDemo)}`;

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pick(s)}
                    className={[
                      "relative w-full overflow-hidden",
                      "rounded-3xl",
                      "ring-1 ring-[color:var(--border)]",
                      "transition-transform duration-150 ease-out",
                      "active:scale-[0.99]",
                      active ? "ring-2 ring-[color:var(--ring)]" : "",
                      locked ? "opacity-[0.92]" : "",
                    ].join(" ")}
                    // ⭐ Selected theme subtle glow (Photos-style, calm)
                    style={
                      active
                        ? {
                            boxShadow:
                              "0 14px 38px rgba(0,0,0,0.16), 0 0 0 1px color-mix(in srgb, var(--ring) 55%, rgba(255,255,255,0.20))",
                          }
                        : undefined
                    }
                    aria-label={base}
                  >
                    <div className="relative aspect-[4/5] w-full">
                      <img
                        src={previewSrc(s)}
                        alt={base}
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                      />

                      {/* ⭐ Subtle “selected glow” overlay (very soft, not loud) */}
                      {active && (
                        <div
                          className="pointer-events-none absolute inset-0"
                          aria-hidden="true"
                          style={{
                            backgroundImage:
                              "radial-gradient(700px 420px at 50% 20%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(900px 520px at 50% 110%, color-mix(in srgb, var(--ring) 22%, transparent), transparent 55%)",
                            opacity: 0.95,
                          }}
                        />
                      )}

                      {/* Top overlay */}
                      <div className="absolute inset-x-0 top-0 p-3 flex items-start justify-between">
                        {/* Selected indicator */}
                        <div
                          className={[
                            "h-6 w-6 md:h-7 md:w-7 rounded-full",
                            "backdrop-blur-xl",
                            "bg-black/15",
                            "ring-1 ring-white/20",
                            "flex items-center justify-center",
                            active ? "opacity-100" : "opacity-0",
                            "transition-opacity",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-white/85" />
                        </div>

                        {/* ✅ Lock: kun når pro IKKE er aktivert */}
                        {pro && !proDemo && (
                          <div
                            className={[
                              "h-7 w-7 md:h-8 md:w-8 rounded-full",
                              "backdrop-blur-xl",
                              "bg-black/18",
                              "ring-1 ring-white/18",
                              "flex items-center justify-center",
                              locked ? "text-white/90" : "text-white/70",
                            ].join(" ")}
                            aria-label="Pro"
                          >
                            <LockIcon />
                          </div>
                        )}
                      </div>

                      {/* Bottom tag */}
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <div
                          className={[
                            "w-full rounded-2xl",
                            "px-3 py-2 md:px-3.5 md:py-2.5",
                            "text-center",
                            "backdrop-blur-2xl",
                            "ring-1 ring-white/18",
                          ].join(" ")}
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.22))",
                            boxShadow:
                              "0 10px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.10)",
                          }}
                        >
                          <div
                            className={[
                              "font-medium text-white/92",
                              "text-[13px] leading-[1.1]",
                              "md:text-[15px]",
                            ].join(" ")}
                            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.28)" }}
                          >
                            {tagText}
                          </div>

                          {showPending && locked && (
                            <div className="mt-1 text-[11px] md:text-xs text-white/75">
                              {t.themeProLocked}
                            </div>
                          )}
                        </div>
                      </div>

                      {locked && (
                        <div
                          className="absolute inset-0 bg-black/10"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom action */}
            <div className="mt-4 sm:mt-5">
              {!proDemo ? (
                <button
                  type="button"
                  onClick={activateProAndApply}
                  className={[
                    "w-full rounded-2xl px-4 py-4 md:px-5 md:py-5",
                    "text-sm md:text-base font-medium",
                    "border border-[color:var(--btn-border)]",
                    "bg-[var(--btn-bg)] text-[var(--text)]",
                    "shadow-[var(--btn-shadow)]",
                    "hover:bg-[var(--btn-bg-hover)] hover:shadow-[var(--btn-shadow-hover)]",
                    "transition-transform duration-150 ease-out",
                    "active:scale-[0.985] active:translate-y-[1px]",
                    "active:shadow-[var(--btn-pressed-shadow)] active:bg-[var(--press)]",
                  ].join(" ")}
                >
                  {locale === "no" ? "Aktiver pro" : "Activate pro"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProDemo(false);
                    setPendingSkin(null);
                    setSkin("classic");
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
                  {locale === "no" ? "Deaktiver pro" : "Deactivate pro"}
                </button>
              )}

              {pendingSkin && !proDemo && (
                <div className="mt-2 text-center text-xs md:text-sm text-[var(--muted)]">
                  {t.themeProLocked}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}