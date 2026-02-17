import type { ReactNode } from "react";

export default function Question({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 text-center text-sm sm:text-base text-[var(--muted)]">
      {children}
    </div>
  );
}
