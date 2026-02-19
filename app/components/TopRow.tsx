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
    <div className="relative mb-5 flex w-full items-center justify-center">
      {/* Home (skal vises på mobil + desktop, men kun på bestemte steg) */}
      {showHome && onHome && (
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className="absolute left-0 inline-flex items-center justify-center rounded-full hover:bg-neutral-50"
        >
          <img
            src="/icons/home.svg"
            alt=""
            className="h-7 w-7"
            draggable={false}
          />
        </button>
      )}

      {/* Back vises kun på desktop */}
      <button
        onClick={onBack}
        className={[
          "hidden sm:inline-flex absolute rounded-xl px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50",
          showHome ? "left-10" : "left-0",
        ].join(" ")}
        aria-label={t.goBack}
        type="button"
      >
        ← {t.goBack}
      </button>

      <div className="text-xs text-neutral-400 text-center">{t.appNameLine}</div>

      {/* Vis valgt språk som ett lite flagg */}
      <div className="absolute right-0">
        <img
          src={flagSrc}
          alt={flagAlt}
          className="h-6 w-6 rounded-full border border-neutral-200"
          draggable={false}
        />
      </div>
    </div>
  );
}

