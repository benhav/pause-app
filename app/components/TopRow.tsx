"use client";

import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";

export default function TopRow({
  onBack,
  locale,
  showHome = false,
  onHome,
}: {
  onBack: () => void;
  locale: Locale;
  showHome?: boolean;
  onHome?: () => void;
}) {
  const t = UI_TEXT[locale];

  const flagSrc = locale === "no" ? "/flags/nor.svg" : "/flags/gb-eng.svg";
  const flagAlt = locale === "no" ? "Norsk" : "English";

  return (
    <div className="relative mb-5 md:mb-6 flex w-full items-center justify-center">
      {/* Home */}
      {showHome && onHome && (
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className={[
            "absolute left-0",
            "h-10 w-10 md:h-11 md:w-11",
            "inline-flex items-center justify-center rounded-full",
            "border border-[color:var(--border)]",
            "bg-transparent",
            "hover:bg-[var(--surface-hover)]",
            "transition",
          ].join(" ")}
        >
          <img src="/icons/home.svg" alt="" className="h-6 w-6 md:h-7 md:w-7" draggable={false} />
        </button>
      )}

      {/* Back (kun for store skjermer – men korrekt breakpoint) */}
      <button
        onClick={onBack}
        className={[
          "hidden xl:inline-flex absolute rounded-xl px-3 py-2 text-sm",
          "text-[var(--muted)] hover:bg-[var(--surface-hover)]",
          showHome ? "left-12" : "left-0",
        ].join(" ")}
        aria-label={t.goBack}
        type="button"
      >
        ← {t.goBack}
      </button>

      <div className="text-xs md:text-sm text-[var(--muted)] text-center">
        {t.appNameLine}
      </div>

      {/* Language flag */}
      <div className="absolute right-0">
        <img
          src={flagSrc}
          alt={flagAlt}
          className="h-6 w-6 md:h-7 md:w-7 rounded-full border border-[color:var(--border)]"
          draggable={false}
        />
      </div>
    </div>
  );
}