export default function ProgressDots({
  current,
  total,
}: {
  current: number; // 1-basert (1..total)
  total: number;
}) {
  return (
    <div
      className="mt-3 flex justify-center gap-2"
      aria-label={`Step ${current} of ${total}`}
      role="status"
    >
      {/* Skjult tekst for skjermleser */}
      <span className="sr-only">{`Step ${current} of ${total}`}</span>

      {/* Selve prikkene er dekorative */}
      <div aria-hidden="true" className="flex justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => {
          const isActive = i + 1 === current;

          return (
            <span
              key={i}
              className={[
                "h-2 w-2 rounded-full transition-all duration-300",
                isActive
                  ? "bg-[var(--text)] scale-110 animate-[dotPulse_12.8s_ease-in-out_infinite] opacity-90"
                  : "bg-[var(--muted)] scale-100 opacity-35",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}
