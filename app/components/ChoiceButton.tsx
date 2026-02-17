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
        "w-full rounded-2xl px-4 py-4 sm:py-3 text-left text-sm",

        // Base style (theme-vars)
        "border bg-[var(--surface)] text-[var(--text)]",
        "border-[color:var(--border)]",
        "hover:bg-[var(--surface-hover)]",

        // Press animation (beholdt)
        "transition-transform duration-150 ease-out",
        "active:scale-[0.985] active:translate-y-[1px]",
        "active:shadow-inner active:bg-[var(--press)]",

        // Selected state (litt tydeligere i dark også)
        selected ? "ring-2 ring-[color:var(--ring)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
