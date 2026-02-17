import type { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        // Mobile: fullskjerm "sheet"
        "relative w-full min-h-[100svh] rounded-none p-6",
        "bg-[var(--surface)] text-[var(--text)]",

        // Desktop+: kort-stil
        "sm:min-h-0 sm:rounded-3xl sm:shadow-sm sm:ring-1 sm:ring-[color:var(--ring)]",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
