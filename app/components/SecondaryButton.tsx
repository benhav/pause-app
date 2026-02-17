"use client";

import type { ReactNode } from "react";

export default function SecondaryButton({
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
        "w-full rounded-2xl px-4 py-4 sm:py-3 text-center text-sm",

        // Base style (theme-vars) – identisk grunnstil som ChoiceButton
        "border bg-[var(--surface)] text-[var(--text)]",
        "border-[color:var(--border)]",
        "hover:bg-[var(--surface-hover)]",

        // Press animation
        "transition-transform duration-150 ease-out",
        "active:scale-[0.985] active:translate-y-[1px]",
        "active:shadow-inner active:bg-[var(--press)]",

        // Fokus
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
