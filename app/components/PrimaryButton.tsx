"use client";

import type { ReactNode } from "react";

export default function PrimaryButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      type="button"
      className={[
        /* =========================================================
           Layout/size (UNCHANGED)
           ========================================================= */
        "w-full inline-flex items-center justify-center",
        "min-h-[56px] md:min-h-[66px]",
        "rounded-2xl px-6",
        "text-center font-medium",
        "text-base md:text-lg leading-snug",

        /* =========================================================
           Premium glass look (NEW — uses global --btn-* tokens)
           ========================================================= */
        "text-[var(--text)]",
        "border border-[color:var(--btn-border)]",
        "bg-[var(--btn-bg)]",
        "backdrop-blur-xl",
        "shadow-[var(--btn-shadow)]",
        "hover:bg-[var(--btn-bg-hover)]",
        "hover:shadow-[var(--btn-shadow-hover)]",

        /* =========================================================
           Press (UNCHANGED behavior)
           ========================================================= */
        "transition-transform duration-150 ease-out",
        "active:scale-[0.985] active:translate-y-[1px]",
        "active:shadow-[var(--btn-pressed-shadow)]",
        "active:bg-[var(--press)]",

        /* =========================================================
           Focus (UNCHANGED intent, uses btn ring)
           ========================================================= */
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--btn-ring)]",
      ].join(" ")}
      style={{
        // Subtle top highlight (Apple-ish) without breaking themes
        backgroundImage:
          "linear-gradient(to bottom, var(--btn-highlight), rgba(255,255,255,0))",
        backgroundBlendMode: "overlay",
      }}
    >
      {children}
    </button>
  );
}