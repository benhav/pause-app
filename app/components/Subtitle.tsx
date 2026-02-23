import type { ReactNode } from "react";

export default function Subtitle({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        "text-center text-[var(--muted)]",
        // spacing
        "mt-4",
        // type scale
        "text-base",
        "md:text-lg",
        // a touch more “calm”
        "leading-relaxed",
      ].join(" ")}
    >
      {children}
    </div>
  );
}