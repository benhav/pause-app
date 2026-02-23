import type { ReactNode } from "react";

export default function Question({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        "text-center text-[var(--muted)]",
        // spacing
        "mt-3",
        // type scale (litt under Subtitle)
        "text-sm",
        "md:text-base",
        // lesbarhet
        "leading-relaxed",
      ].join(" ")}
    >
      {children}
    </div>
  );
}