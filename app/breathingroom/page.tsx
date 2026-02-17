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
import ThemeToggle from "../components/ThemeToggle";
import { SoftBreath } from "../lib/softBreath";

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

function speak(text: string, locale: Locale) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "no" ? "nb-NO" : "en-GB";

    // Mykere/roligere
    u.rate = 0.88;
    u.pitch = 0.95;
    u.volume = 0.85;

    synth.speak(u);
  } catch {}
}

export default function BreathingRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("no");

  const [showElements, setShowElements] = useState(true);
  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS);

  // Voice / Pro
  const [isPro, setIsPro] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // For å kunne “resette” animasjonen (og synce voice 1:1)
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

    // Synk med keyframes:
    // 0->28% inn, 28->40% hold, 40->72% ut, resten tilbake/ro
    const inhale = seconds * 0.28;
    const hold = seconds * 0.12;
    const exhale = seconds * 0.32;

    const now = eng.now();
    const start = now + 0.06; // liten buffer

    // Svake markører + myk pust (noise-formet)
    eng.chime(start, 528, 0.09);
    eng.breath(start, inhale, "in");

    eng.chime(start + inhale, 432, 0.07);

    eng.breath(start + inhale + hold, exhale, "out");
    eng.chime(start + inhale + hold + exhale, 396, 0.07);

    // Reschedule før neste runde
    const nextInMs = Math.max(250, (seconds - 0.15) * 1000);
    scheduleTimerRef.current = window.setTimeout(() => {
      scheduleSoftBreath();
    }, nextInMs);
  }, [seconds]);

  useEffect(() => setMounted(true), []);

  // Språk: query param først (?lang=no|en), ellers localStorage
  useEffect(() => {
    if (!mounted) return;

    const q = searchParams.get("lang");
    const qLocale: Locale | null =
      q === "en" || q === "no" ? (q as Locale) : null;

    if (qLocale) {
      setLocale(qLocale);
      try {
        localStorage.setItem(STORAGE_KEY, qLocale);
      } catch {}
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "no") setLocale(saved as Locale);
    } catch {}
  }, [mounted, searchParams]);

  const t = useMemo(() => UI_TEXT[locale], [locale]);

  // Bunn=tregest, topp=raskest.
  const sliderValue = useMemo(
    () => MAX_SECONDS + MIN_SECONDS - seconds,
    [seconds]
  );

  const onSliderChange = (v: number) => {
    const inverted = MAX_SECONDS + MIN_SECONDS - v;
    setSeconds(inverted);
  };

  // Når hastigheten endres: restart animasjon (og dermed voice sync)
  useEffect(() => {
    setAnimNonce((n) => n + 1);
  }, [seconds]);

  const circleStyle: CSSProperties = useMemo(() => {
    return {
      animation: `breatheHold ${seconds}s ease-in-out infinite`,
    };
  }, [seconds]);

  // Voice loop (kun når pro + voiceEnabled)
  useEffect(() => {
    // rydd gamle timere
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    if (!mounted) return;

    if (!isPro || !voiceEnabled) {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
      return;
    }

    // Synk med keyframes:
    // 0->28% inn, 28->40% hold, 40->72% ut, resten tilbake/ro
    const inhale = Math.round(seconds * 0.28 * 1000);
    const hold = Math.round(seconds * 0.12 * 1000);
    const cycle = Math.round(seconds * 1000);

    const runCycle = () => {
      speak(getVoiceText(locale, "in"), locale);

      timersRef.current.push(
        window.setTimeout(
          () => speak(getVoiceText(locale, "hold"), locale),
          inhale
        )
      );

      timersRef.current.push(
        window.setTimeout(
          () => speak(getVoiceText(locale, "out"), locale),
          inhale + hold
        )
      );

      timersRef.current.push(window.setTimeout(runCycle, cycle));
    };

    // Start syklusen “fra start” (matcher animNonce-restart av sirkelen)
    const start = window.setTimeout(runCycle, 50);
    timersRef.current.push(start);

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, [mounted, isPro, voiceEnabled, seconds, locale, animNonce]);

  // --- SoftBreath: init + scheduling (kun når pro + voiceEnabled) ---
  useEffect(() => {
    if (!mounted) return;

    // stopp alltid først (også ved re-render)
    stopSoftBreath();

    if (!isPro || !voiceEnabled) return;

    // må være init'et via user gesture (vi gjør det i onClick),
    // men om den finnes og er klar: schedule nå
    if (breathRef.current) {
      scheduleSoftBreath();
    }

    return () => stopSoftBreath();
  }, [
    mounted,
    isPro,
    voiceEnabled,
    seconds,
    locale,
    animNonce,
    scheduleSoftBreath,
    stopSoftBreath,
  ]);

  // cleanup på unmount
  useEffect(() => {
    return () => {
      stopSoftBreath();
    };
  }, [stopSoftBreath]);

  if (!mounted) return <main className="min-h-[100svh]" />;

  const langBtnClass = (active: boolean) =>
    [
      "rounded-full p-0.5",
      active
        ? "ring-2 ring-[color:var(--text)]"
        : "ring-1 ring-[color:var(--border)]",
    ].join(" ");

  const surfaceButton = [
    "w-full rounded-2xl px-4 py-4 text-sm",
    "border bg-[var(--surface)] text-[var(--text)]",
    "border-[color:var(--border)]",
    "hover:bg-[var(--surface-hover)]",
    "transition-transform duration-150 ease-out",
    "active:scale-[0.985] active:translate-y-[1px]",
    "active:shadow-inner active:bg-[var(--press)]",
  ].join(" ");

  const smallPill = [
    "inline-flex items-center justify-center gap-2",
    "rounded-full border px-3 py-2 text-xs",
    "border-[color:var(--border)] bg-[var(--surface)] text-[var(--text)]",
    "hover:bg-[var(--surface-hover)]",
  ].join(" ");

  return (
    <main className="min-h-[100svh] w-full px-0 py-0 sm:flex sm:items-center sm:justify-center sm:px-4 sm:py-6 sm:pt-6">
      <div className="w-full sm:max-w-md pb-[env(safe-area-inset-bottom)]">
        <div
          className={[
            "relative w-full min-h-[100svh] rounded-none p-6",
            "bg-[var(--app-bg)] text-[var(--text)]",
            "sm:min-h-0 sm:rounded-3xl sm:shadow-sm sm:ring-1 sm:ring-[color:var(--border)]",
            "flex flex-col",
          ].join(" ")}
        >
          {/* Top controls (som welcome) */}
          <div className="absolute right-3 top-2 flex items-center gap-3">
            <ThemeToggle />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocale("no");
                  try {
                    localStorage.setItem(STORAGE_KEY, "no");
                  } catch {}
                }}
                aria-label="Switch to Norwegian"
                className={langBtnClass(locale === "no")}
              >
                <img
                  src="/flags/nor.svg"
                  alt="Norsk"
                  className="h-6 w-6 rounded-full"
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocale("en");
                  try {
                    localStorage.setItem(STORAGE_KEY, "en");
                  } catch {}
                }}
                aria-label="Switch to English"
                className={langBtnClass(locale === "en")}
              >
                <img
                  src="/flags/gb-eng.svg"
                  alt="English"
                  className="h-6 w-6 rounded-full"
                />
              </button>
            </div>
          </div>

          {/* Layout: top / middle / bottom (sirkelen holder midten) */}
          <div className="flex-1 grid grid-rows-[clamp(150px,20vh,200px)_1fr_clamp(190px,26vh,260px)]">
            {/* TOP (fast høyde => ingen hopp når show/hide) */}
            <div className="pt-12 text-center">
              {showElements ? (
                <>
                  <div className="text-2xl font-semibold text-[var(--text)]">
                    {t.breathingRoomTitle}
                  </div>
                  <div className="mt-1 text-sm italic text-[var(--muted)]">
                    {t.followRhythm}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowElements(false)}
                    className="mt-3 text-sm text-[var(--muted)] underline underline-offset-4 hover:opacity-90"
                  >
                    {t.hideElements}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowElements(true)}
                  className="text-sm text-[var(--muted)] underline underline-offset-4 hover:opacity-90"
                >
                  {t.showElements}
                </button>
              )}
            </div>

            {/* MIDDLE (sirkelen alltid sentrert) */}
            <div className="flex items-center justify-center">
              <div
                key={animNonce} // restart animasjon når tempo endres
                className="rounded-full bg-sky-200 shadow-sm w-[55vmin] h-[55vmin] max-w-[320px] max-h-[320px] will-change-transform"
                style={circleStyle}
                aria-label={locale === "no" ? "Pusteindikator" : "Breathing indicator"}
              />
            </div>

            {/* BOTTOM (fast høyde => sirkelen flytter seg ikke ved show/hide) */}
            <div className="flex flex-col items-center justify-start pt-6">
              {showElements ? (
                <div className="w-full max-w-[360px] px-2">
                  <input
                    type="range"
                    min={MIN_SECONDS}
                    max={MAX_SECONDS}
                    value={sliderValue}
                    onChange={(e) => onSliderChange(Number(e.target.value))}
                    className="w-full accent-sky-400"
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
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isPro) return;

                        // WebAudio må init'es på user gesture
                        try {
                          if (!breathRef.current) breathRef.current = new SoftBreath();
                          await breathRef.current.init();
                          breathRef.current.setVolume(0.18);
                        } catch {}

                        // Restart både anim og voice når du toggler
                        setAnimNonce((n) => n + 1);

                        // hvis vi skrur av: stopp SoftBreath scheduling umiddelbart
                        if (voiceEnabled) stopSoftBreath();

                        setVoiceEnabled((v) => !v);
                      }}
                      aria-label={locale === "no" ? "Stemmeguiding" : "Voice guidance"}
                      className={[
                        smallPill,
                        !isPro ? "opacity-50 cursor-not-allowed" : "",
                      ].join(" ")}
                    >
                      <span aria-hidden="true">
                        {voiceEnabled && isPro ? "🔊" : "🔇"}
                      </span>
                      <span>{locale === "no" ? "Stemmeguiding" : "Voice guidance"}</span>
                    </button>

                    {!isPro && (
                      <div className="text-center text-xs text-[var(--muted)]">
                        {locale === "no"
                          ? "Stemmeguiding er tilgjengelig i Pro-versjonen."
                          : "Voice guidance is available in the Pro version."}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsPro((p) => !p);
                        setVoiceEnabled(false);
                        setAnimNonce((n) => n + 1);
                        stopSoftBreath();
                        try {
                          window.speechSynthesis?.cancel();
                        } catch {}
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
                // “tomhøyde” så alt holder posisjon
                <div className="w-full" />
              )}
            </div>
          </div>

          {/* Go back pinned bottom */}
          <div className="mt-6">
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
