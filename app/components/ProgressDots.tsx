export default function ProgressDots({
  current,
  total,
}: {
  current: number; // 1-basert (1..total)
  total: number;
}) {
  return (
    <div
      className="mt-3 md:mt-4 flex justify-center gap-2 md:gap-2.5"
      aria-label={`Step ${current} of ${total}`}
      role="status"
    >
      <span className="sr-only">{`Step ${current} of ${total}`}</span>

      <div aria-hidden="true" className="flex justify-center gap-2 md:gap-2.5">
        {Array.from({ length: total }).map((_, i) => {
          const isActive = i + 1 === current;

          return (
            <span
              key={i}
              className={[
                "rounded-full transition-all duration-300",
                // size
                "h-2 w-2 md:h-2.5 md:w-2.5",
                isActive
                  ? "bg-[var(--text)] scale-110 animate-[dotPulse_12.8s_ease-in-out_infinite] opacity-85"
                  : "bg-[var(--muted)] scale-100 opacity-25",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}