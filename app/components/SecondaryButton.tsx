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
        "w-full inline-flex items-center justify-center",
        "min-h-[56px] md:min-h-[66px]",
        "rounded-2xl px-6",
        "text-center font-medium",
        "text-base md:text-lg leading-snug",

        // Base style
        "border bg-[var(--surface)] text-[var(--text)]",
        "border-[color:var(--border)]",
        "hover:bg-[var(--surface-hover)]",

        // Press
        "transition-transform duration-150 ease-out",
        "active:scale-[0.985] active:translate-y-[1px]",
        "active:shadow-inner active:bg-[var(--press)]",

        // Focus
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}