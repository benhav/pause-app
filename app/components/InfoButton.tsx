// app/components/InfoButton.tsx
"use client";

import * as React from "react";

type InfoButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md";
};

const sizes = {
  sm: {
    btn: "h-9 w-9",
    icon: "h-4 w-4",
  },
  md: {
    btn: "h-10 w-10",
    icon: "h-[18px] w-[18px]",
  },
} as const;

export const InfoButton = React.forwardRef<HTMLButtonElement, InfoButtonProps>(
  function InfoButton({ size = "sm", className, ...props }, ref) {
    const s = sizes[size];

    return (
      <button
        ref={ref}
        type="button"
        aria-label={props["aria-label"] ?? "Info"}
        className={[
          // stable layout (no collapse / no clipping)
          "relative shrink-0 grid place-items-center",
          s.btn,
          "rounded-full",
          "overflow-visible",

          // glass look (keeps it neutral across skins)
          "bg-white/8 dark:bg-white/6",
          "backdrop-blur-md",
          "border border-white/14 dark:border-white/10",
          "shadow-[0_10px_30px_rgba(0,0,0,0.18)]",

          // interaction
          "hover:bg-white/10 dark:hover:bg-white/8",
          "active:scale-[0.98]",
          "transition",

          // focus
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",

          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        <InfoIcon className={[s.icon, "text-[var(--text)] opacity-90"].join(" ")} />
      </button>
    );
  }
);

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.95" />
      <circle cx="12" cy="8.1" r="1.15" fill="currentColor" opacity="0.95" />
      <path
        d="M12 11v7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.95"
      />
    </svg>
  );
}