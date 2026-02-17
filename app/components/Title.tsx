import type { ReactNode } from "react";

export default function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-6xl sm:text-5xl font-semibold text-center tracking-tight">
      {children}
    </h1>
  );
}
