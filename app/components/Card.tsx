import type { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        "relative w-full min-h-[100svh] rounded-none p-6",
        "bg-transparent", // <- nøkkel for å unngå “kort”
      ].join(" ")}
    >
      {children}
    </div>
  );
}