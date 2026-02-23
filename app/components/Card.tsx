import type { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        // Mobile: full høyde, layout kan "pinnes" uten absolute-hacks
        "relative w-full min-h-[100svh] flex flex-col",

        // Padding som føles lik på tvers av skjermstørrelser
        "px-6 pt-10 pb-8",
        "md:px-10 md:pt-12 md:pb-10",

        // Viktig: fortsatt IKKE “kort”
        "bg-transparent",
      ].join(" ")}
    >
      {children}
    </div>
  );
}