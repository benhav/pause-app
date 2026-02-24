"use client";

import type { ReactNode } from "react";

export function ChoiceButton({
  children,
  onClick,
  selected,
}: {
  children: ReactNode;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={[
        /* =========================================================
           Layout/size (UNCHANGED)
           ========================================================= */
        "w-full inline-flex items-center justify-center",
        "min-h-[56px] md:min-h-[66px]",
        "rounded-2xl px-6",
        "text-center",
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
           Selected (UNCHANGED intent, uses btn ring)
           ========================================================= */
        selected ? "ring-2 ring-[color:var(--btn-ring)]" : "",
      ].join(" ")}
      style={{
        backgroundImage:
          "linear-gradient(to bottom, var(--btn-highlight), rgba(255,255,255,0))",
        backgroundBlendMode: "overlay",
      }}
    >
      {children}
    </button>
  );
}