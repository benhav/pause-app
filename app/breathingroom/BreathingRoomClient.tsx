// app/breathingroom/BreathingRoomClient.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";
import { SoftBreath } from "../lib/softBreath";
import { useAppPrefs } from "../AppProviders";
import Title from "../components/Title";

const STORAGE_KEY = "pause-locale";

// Slider: TOPP = raskest, BUNN = tregest
const MIN_SECONDS = 6; // raskest
const MAX_SECONDS = 16; // tregest
const DEFAULT_SECONDS = 10; // default

type VoicePhase = "in" | "hold" | "out";

function getVoiceText(locale: Locale, phase: VoicePhase) {
  if (locale === "no") {
    if (phase === "in") return "Pust inn";
    if (phase === "hold") return "Hold";
    return "Pust ut";
  }
  if (phase === "in") return "Breathe in";
  if (phase === "hold") return "Hold";
  return "Breathe out";
}

// --- pickVoice + improved speak (drop-in) ---
function pickVoice(locale: Locale) {
  const synth = window.speechSynthesis;
  const voices = synth?.getVoices?.() ?? [];
  if (!voices.length) return null;

  const wanted =
    locale === "no" ? ["nb-NO", "no-NO", "nb", "no"] : ["en-GB", "en-US", "en"];

  const norm = (s: string) => (s || "").toLowerCase();

  // 1) exact lang match
  for (const w of wanted) {
    const v = voices.find((v) => norm(v.lang) === norm(w));
    if (v) return v;
  }

  // 2) prefix lang match
  for (const w of wanted) {
    const v = voices.find((v) => norm(v.lang).startsWith(norm(w)));
    if (v) return v;
  }

  // 3) name-ish heuristic
  if (locale === "no") {
    const v = voices.find(
      (v) => /nor|norsk|bokm|nb/i.test(v.name) || /no/i.test(v.lang)
    );
    if (v) return v;
  } else {
    const v = voices.find((v) => /english|en/i.test(v.name) || /en/i.test(v.lang));
    if (v) return v;
  }

  return voices[0] ?? null;
}

function speak(text: string, locale: Locale) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);

    u.lang = locale === "no" ? "nb-NO" : "en-GB";

    const v = pickVoice(locale);
    if (v) u.voice = v;

    u.rate = 0.88;
    u.pitch = 0.95;
    u.volume = 0.85;

    synth.speak(u);
  } catch { }
}

export default function BreathingRoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("no");

  const [showElements, setShowElements] = useState(true);
  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS);

  const { proDemo: isPro, setProDemo: setIsPro } = useAppPrefs();
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const [animNonce, setAnimNonce] = useState(0);

  const timersRef = useRef<number[]>([]);

  // --- SoftBreath (WebAudio) ---
  const breathRef = useRef<SoftBreath | null>(null);
  const scheduleTimerRef = useRef<number | null>(null);

  const stopSoftBreath = useCallback(() => {
    if (scheduleTimerRef.current) {
      window.clearTimeout(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }
  }, []);

  const scheduleSoftBreath = useCallback(() => {
    const eng = breathRef.current;
    if (!eng) return;

    const inhale = seconds * 0.28;
    const hold = seconds * 0.12;
    const exhale = seconds * 0.32;

    const now = eng.now();
    const start = now + 0.06;

    eng.chime(start, 528, 0.09);
    eng.breath(start, inhale, "in");

    eng.chime(start + inhale, 432, 0.07);

    eng.breath(start + inhale + hold, exhale, "out");
    eng.chime(start + inhale + hold + exhale, 396, 0.07);

    const nextInMs = Math.max(250, (seconds - 0.15) * 1000);
    scheduleTimerRef.current = window.setTimeout(() => {
      scheduleSoftBreath();
    }, nextInMs);
  }, [seconds]);

  useEffect(() => setMounted(true), []);

  function warmUpVoices() {
    const s = window.speechSynthesis;
    s?.getVoices?.();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    warmUpVoices();

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => warmUpVoices();
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const q = searchParams.get("lang");
    const qLocale: Locale | null = q === "en" || q === "no" ? (q as Locale) : null;

    if (qLocale) {
      setLocale(qLocale);
      try {
        localStorage.setItem(STORAGE_KEY, qLocale);
      } catch { }
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "no") setLocale(saved as Locale);
    } catch { }
  }, [mounted, searchParams]);

  const t = useMemo(() => UI_TEXT[locale], [locale]);

  const sliderValue = useMemo(() => MAX_SECONDS + MIN_SECONDS - seconds, [seconds]);

  const onSliderChange = (v: number) => {
    const inverted = MAX_SECONDS + MIN_SECONDS - v;
    setSeconds(inverted);
  };

  useEffect(() => {
    setAnimNonce((n) => n + 1);
  }, [seconds]);

  const circleStyle: CSSProperties = useMemo(() => {
    return {
      animation: `breatheHold ${seconds}s ease-in-out infinite`,
    };
  }, [seconds]);

  useEffect(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    if (!mounted) return;

    if (!isPro || !voiceEnabled) {
      try {
        window.speechSynthesis?.cancel();
      } catch { }
      return;
    }

    const inhale = Math.round(seconds * 0.28 * 1000);
    const hold = Math.round(seconds * 0.12 * 1000);
    const cycle = Math.round(seconds * 1000);

    const runCycle = () => {
      speak(getVoiceText(locale, "in"), locale);

      timersRef.current.push(
        window.setTimeout(() => speak(getVoiceText(locale, "hold"), locale), inhale)
      );

      timersRef.current.push(
        window.setTimeout(
          () => speak(getVoiceText(locale, "out"), locale),
          inhale + hold
        )
      );

      timersRef.current.push(window.setTimeout(runCycle, cycle));
    };

    const start = window.setTimeout(runCycle, 50);
    timersRef.current.push(start);

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      try {
        window.speechSynthesis?.cancel();
      } catch { }
    };
  }, [mounted, isPro, voiceEnabled, seconds, locale, animNonce]);

  useEffect(() => {
    if (!mounted) return;

    stopSoftBreath();
    if (!isPro || !voiceEnabled) return;

    if (breathRef.current) {
      scheduleSoftBreath();
    }

    return () => stopSoftBreath();
  }, [mounted, isPro, voiceEnabled, seconds, locale, animNonce, scheduleSoftBreath, stopSoftBreath]);

  useEffect(() => {
    return () => {
      stopSoftBreath();
    };
  }, [stopSoftBreath]);

  if (!mounted) return <main className="min-h-[100svh]" />;

  const langBtnClass = (active: boolean) =>
    [
      "rounded-full p-0.5",
      active ? "ring-2 ring-[color:var(--text)]" : "ring-1 ring-[color:var(--border)]",
    ].join(" ");

  const surfaceButton = [
    "w-full rounded-2xl px-4 py-4 text-sm md:text-base md:py-5",
    "border bg-[var(--surface)] text-[var(--text)]",
    "border-[color:var(--border)]",
    "hover:bg-[var(--surface-hover)]",
    "transition-transform duration-150 ease-out",
    "active:scale-[0.985] active:translate-y-[1px]",
    "active:shadow-inner active:bg-[var(--press)]",
  ].join(" ");

  const smallPill = [
    "inline-flex items-center justify-center gap-2",
    "rounded-full border px-3 py-2 text-xs md:text-sm md:px-4 md:py-2.5",
    "border-[color:var(--border)] bg-[var(--surface)] text-[var(--text)]",
    "hover:bg-[var(--surface-hover)]",
  ].join(" ");

  // Ny “cue” i sirkelen
  const circleCue = locale === "no" ? "Pust i rytmen" : "Breathe with the rhythm";

  return (
    <main
      className={[
        "h-[100svh] w-full overflow-hidden",
        "px-0 py-0",
        "md:px-6 md:py-6",
        "sm:flex sm:items-center sm:justify-center sm:px-4 sm:py-6 sm:pt-6",
      ].join(" ")}
    >
      <div
        className={[
          "w-full pb-[env(safe-area-inset-bottom)]",
          "md:max-w-3xl md:mx-auto",
          "sm:max-w-md",
        ].join(" ")}
      >
        <div

          className={[
            
            "relative w-full h-[100svh] rounded-none p-6",
            "md:p-8",
            "bg-[var(--surface)] text-[var(--text)] backdrop-blur-xl",
            "sm:rounded-3xl sm:shadow-sm sm:ring-1 sm:ring-[color:var(--border)]",
            "sm:max-h-[calc(100svh-3rem)] ", // ✅ viktig
            "flex flex-col",
            "overflow-y-scroll",            // ✅ viktig
          ].join(" ")}
          style={{ scrollbarGutter: "stable both-edges" }} // ✅ best effort
        >

          {/* Top controls */}
          <div className="absolute right-3 top-2 flex items-center gap-3 md:right-5 md:top-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocale("no");
                  try {
                    localStorage.setItem(STORAGE_KEY, "no");
                  } catch { }
                }}
                aria-label="Switch to Norwegian"
                className={langBtnClass(locale === "no")}
              >
                <img
                  src="/flags/nor.svg"
                  alt="Norsk"
                  className="h-6 w-6 md:h-7 md:w-7 rounded-full"
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocale("en");
                  try {
                    localStorage.setItem(STORAGE_KEY, "en");
                  } catch { }
                }}
                aria-label="Switch to English"
                className={langBtnClass(locale === "en")}
              >
                <img
                  src="/flags/gb-eng.svg"
                  alt="English"
                  className="h-6 w-6 md:h-7 md:w-7 rounded-full"
                />
              </button>
            </div>
          </div>

          {/* Layout: top / middle / bottom */}
          <div className="flex-1 grid grid-rows-[clamp(150px,20vh,200px)_1fr_clamp(190px,26vh,260px)] md:grid-rows-[clamp(150px,18vh,210px)_1fr_clamp(210px,28vh,300px)]">
            {/* TOP */}
            <div className="pt-12 text-center md:pt-12">
              {showElements ? (
                <>
                  {/* ✅ Identisk font som resten */}
                  <div className="flex justify-center">
                    <div className="max-w-full">
                      {/* Mobil: mindre + en linje */}
                      <div className="md:hidden whitespace-nowrap">
                        <Title className="text-4xl leading-none">{t.breathingRoomTitle}</Title>
                      </div>
                      {/* Tablet/desktop: som før */}
                      <div className="hidden md:block">
                        <Title>{t.breathingRoomTitle}</Title>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowElements(false)}
                    className="mt-3 text-sm md:text-base text-[var(--muted)] underline underline-offset-4 hover:opacity-90"
                  >
                    {t.hideElements}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowElements(true)}
                  className="text-sm md:text-base text-[var(--muted)] underline underline-offset-4 hover:opacity-90"
                >
                  {t.showElements}
                </button>
              )}
            </div>

            {/* MIDDLE */}
            <div className="flex items-center justify-center">
              <div
                key={animNonce}
                className={[
                  "relative rounded-full will-change-transform",
                  "w-[55vmin] h-[55vmin] max-w-[320px] max-h-[320px]",
                  "md:w-[44vmin] md:h-[44vmin] md:max-w-[420px] md:max-h-[420px]",
                ].join(" ")}
                style={{
                  ...circleStyle,
                  background: "var(--breath-fill)",
                  boxShadow: "var(--breath-shadow)",
                }}
                aria-label={locale === "no" ? "Pusteindikator" : "Breathing indicator"}
              >
                {/* ✅ Cue inni sirkelen – men skjules når showElements=false */}
                {showElements && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className={[
                        "italic text-[var(--muted)] select-none",
                        "whitespace-nowrap",
                        "text-[clamp(12px,3.2vmin,18px)] md:text-[clamp(12px,2.2vmin,20px)]",
                      ].join(" ")}
                    >
                      {circleCue}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM */}
            <div className="flex flex-col items-center justify-start pt-6 md:pt-7">
              {showElements ? (
                <div className="w-full max-w-[360px] px-2 md:max-w-[520px] md:px-6">
                  <input
                    type="range"
                    min={MIN_SECONDS}
                    max={MAX_SECONDS}
                    value={sliderValue}
                    onChange={(e) => onSliderChange(Number(e.target.value))}
                    className="w-full accent-[color:var(--accent)]"
                    aria-label={t.speedAria}
                  />

                  {seconds !== DEFAULT_SECONDS && (
                    <div className="mt-3 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setSeconds(DEFAULT_SECONDS)}
                        className={smallPill}
                      >
                        {t.resetSpeed}
                      </button>
                    </div>
                  )}

                  {/* Voice toggle */}
                  <div className="mt-6 flex flex-col items-center gap-3 md:gap-4">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isPro) return;

                        try {
                          const s = window.speechSynthesis;
                          s?.getVoices?.();
                        } catch { }

                        try {
                          if (!breathRef.current) breathRef.current = new SoftBreath();
                          await breathRef.current.init();
                          breathRef.current.setVolume(0.18);
                        } catch { }

                        setAnimNonce((n) => n + 1);

                        if (voiceEnabled) stopSoftBreath();
                        setVoiceEnabled((v) => !v);
                      }}
                      aria-label={locale === "no" ? "Stemmeguiding" : "Voice guidance"}
                      className={[smallPill, !isPro ? "opacity-50 cursor-not-allowed" : ""].join(" ")}
                    >
                      <span aria-hidden="true">{voiceEnabled && isPro ? "🔊" : "🔇"}</span>
                      <span>{locale === "no" ? "Stemmeguiding" : "Voice guidance"}</span>
                    </button>

                    {!isPro && (
                      <div className="text-center text-xs md:text-sm text-[var(--muted)]">
                        {locale === "no"
                          ? "Stemmeguiding er tilgjengelig i Pro-versjonen."
                          : "Voice guidance is available in the Pro version."}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsPro(!isPro);
                        setVoiceEnabled(false);
                        setAnimNonce((n) => n + 1);
                        stopSoftBreath();
                        try {
                          window.speechSynthesis?.cancel();
                        } catch { }
                      }}
                      className={smallPill}
                    >
                      {isPro
                        ? locale === "no"
                          ? "Deaktiver pro-demo"
                          : "Deactivate pro-demo"
                        : locale === "no"
                          ? "Aktiver pro-demo"
                          : "Activate pro-demo"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full" />
              )}
            </div>
          </div>

          {/* Go back pinned bottom */}
          <div className="mt-6 md:mt-10">
            <button
              type="button"
              onClick={() => router.push(`/?lang=${locale}`)}
              className={surfaceButton}
              aria-label={t.goBack}
            >
              {t.goBack}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}