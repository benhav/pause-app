// app/components/BreathModeIcons.tsx
"use client";

type IconProps = { className?: string };

const base = "opacity-90";
const stroke = 1.7;

export function IconDot({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={[base, className].filter(Boolean).join(" ")} fill="none">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth={stroke} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export function IconLeaf({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={[base, className].filter(Boolean).join(" ")} fill="none">
      <path
        d="M19 5c-6.5 0-12 5.2-12 11.7V19c6.5 0 12-5.2 12-11.7V5Z"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      <path
        d="M7 18c4.2-4.2 7.5-6.4 12-8"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={[base, className].filter(Boolean).join(" ")} fill="none">
      <path
        d="M15.5 3.5c-4.6 1.3-7.6 6.1-6.3 10.7 1.1 4 5 6.6 9.1 6.1-1.6.9-3.4 1.3-5.3 1.1-5.2-.6-8.9-5.3-8.3-10.5C5.4 6.3 10 2.6 15.5 3.5Z"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconZen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={[base, className].filter(Boolean).join(" ")} fill="none">
      <path
        d="M6 12c2.2-2 4.5-3 6-3s3.8 1 6 3"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d="M6 15c2.2-1.6 4.5-2.4 6-2.4s3.8.8 6 2.4"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}