import type { ReactNode } from "react";

export default function Title({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={[
        "font-display font-semibold tracking-tight text-center text-[var(--text)]",
        "leading-[1.05]",
        // Mobil
        "text-5xl",
        // Tablet
        "md:text-7xl",
        // ✅ allow overrides/extensions where needed
        className,
      ].join(" ")}
    >
      {children}
    </h1>
  );
}