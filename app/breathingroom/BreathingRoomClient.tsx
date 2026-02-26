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
import { useRouter } from "next/navigation";
import type { Locale } from "../data/uiText";
import { UI_TEXT } from "../data/uiText";
import { SoftBreath } from "../lib/softBreath";
import { useAppPrefs } from "../AppProviders";
import Title from "../components/Title";
import type { ThemeSkin } from "../lib/appPrefs";
import { PREFS_KEYS } from "../lib/appPrefs";

// ✅ Same key as HomeClient
const LOCALE_KEY = "pause-locale";

// ✅ BreathingRoom day/night override (local only)
const BR_MODE_KEY = "pause-br-mode"; // "follow" | "light" | "dark"

// Slider: TOPP = raskest, BUNN = tregest
const MIN_SECONDS = 6; // raskest
const MAX_SECONDS = 16; // tregest
const DEFAULT_SECONDS = 10; // default

type VoicePhase = "in" | "hold" | "out";
type BrMode = "follow" | "light" | "dark";

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
    const v = voices.find(
      (v) => /english|en/i.test(v.name) || /en/i.test(v.lang)
    );
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
  } catch {}
}

function isThemeSkin(v: string): v is ThemeSkin {
  return (
    v === "classic" ||
    v === "floating" ||
    v === "nature" ||
    v === "nightpro" ||
    v === "desert" ||
    v === "ocean" ||
    v === "peaceful" ||
    v === "winter"
  );
}

function isBrMode(v: string): v is BrMode {
  return v === "follow" || v === "light" || v === "dark";
}

function brThemeLabel(locale: Locale, skin: ThemeSkin) {
  const isNo = locale === "no";
  switch (skin) {
    case "classic":
      return isNo ? "Classic" : "Classic";
    case "floating":
      return isNo ? "Bølger" : "Waves";
    case "nature":
      return isNo ? "Natur" : "Nature";
    case "nightpro":
      return isNo ? "Rolig natt" : "Silent night";
    case "desert":
      return isNo ? "Stille sanddyner" : "Quiet dunes";
    case "ocean":
      return isNo ? "Rolig hav" : "Gentle ocean";
    case "peaceful":
      return isNo ? "Stille morgen" : "Morning meadow";
    case "winter":
      return isNo ? "Vinter skog" : "Winter silence";
  }
}

export default function BreathingRoomClient() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("no");

  const [showElements, setShowElements] = useState(true);
  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS);

  const {
    proDemo: isPro,
    setProDemo: setIsPro,

    // app global
    skin: appSkin,
    mode: appMode,
    isDark: appIsDark,
    setMode,

    // BR pro override (stored via AppProviders / PREFS_KEYS.breathingRoomSkin)
    breathingRoomSkin,
    setBreathingRoomSkin,

    // ⭐ runtime override for <html data-skin>
    setHtmlSkinOverride,
  } = useAppPrefs();

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [animNonce, setAnimNonce] = useState(0);
  const timersRef = useRef<number[]>([]);

  // --- SoftBreath (WebAudio) ---
  const breathRef = useRef<SoftBreath | null>(null);
  const scheduleTimerRef = useRef<number | null>(null);

  // --- BreathingRoom theme sheet ---
  const [brThemeOpen, setBrThemeOpen] = useState(false);

  // --- BreathingRoom day/night override (local) ---
  const [brMode, setBrMode] = useState<BrMode>("follow");
  const enteredModeRef = useRef(appMode);

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

  // ✅ Locale follows app (welcome selection). No language UI here.
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem(LOCALE_KEY);
      if (saved === "en" || saved === "no") setLocale(saved as Locale);
    } catch {}
  }, [mounted]);

  // ✅ Read breathingroom day/night override (local only)
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(BR_MODE_KEY);
      if (!raw) {
        setBrMode("follow");
        return;
      }
      const v = raw.trim().toLowerCase();
      if (isBrMode(v)) {
        setBrMode(v);
        return;
      }
      setBrMode("follow");
    } catch {
      setBrMode("follow");
    }
  }, [mounted]);

  const t = useMemo(() => UI_TEXT[locale], [locale]);

  const sliderValue = useMemo(
    () => MAX_SECONDS + MIN_SECONDS - seconds,
    [seconds]
  );

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

  // ✅ Effective day/night for BR:
  // - follow => app dark state
  // - otherwise use local override
  const effectiveBrIsDark = useMemo(() => {
    if (brMode === "follow") return appIsDark;
    return brMode === "dark";
  }, [brMode, appIsDark]);

  // ✅ Effective BreathingRoom skin:
  // - override only matters when Pro is enabled
  // - otherwise follow app skin
  const effectiveBrSkin: ThemeSkin = useMemo(() => {
    if (isPro && breathingRoomSkin) return breathingRoomSkin;
    return appSkin;
  }, [isPro, breathingRoomSkin, appSkin]);

  /**
   * ⭐ APPLY BR SKIN TO WHOLE APP WHILE IN BREATHINGROOM
   * This is the core fix for "only circle changes".
   */
  useEffect(() => {
    if (!mounted) return;

    // set html[data-skin] = effectiveBrSkin while in BR
    setHtmlSkinOverride(effectiveBrSkin);

    // cleanup: restore normal app skin when leaving BR
    return () => setHtmlSkinOverride(null);
  }, [mounted, effectiveBrSkin, setHtmlSkinOverride]);

  /**
   * ⭐ APPLY BR MODE (day/night) TO <html class="dark"> WHILE IN BREATHINGROOM
   * - If follow: do not override; restore mode we entered with
   * - If light/dark: override app mode while in BR
   */
  useEffect(() => {
    if (!mounted) return;

    // capture mode when entering BR
    enteredModeRef.current = appMode;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    if (brMode === "follow") {
      // restore the mode we had when we entered BR (and then follow normal app)
      setMode(enteredModeRef.current);
      return;
    }

    setMode(brMode === "dark" ? "dark" : "light");

    return () => {
      // if we leave while overriding, restore entry mode
      setMode(enteredModeRef.current);
    };
  }, [mounted, brMode, setMode]);

  // --- Voice schedule (unchanged) ---
  useEffect(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    if (!mounted) return;

    if (!isPro || !voiceEnabled) {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
      return;
    }

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

  useEffect(() => {
    if (!mounted) return;

    stopSoftBreath();
    if (!isPro || !voiceEnabled) return;

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

  useEffect(() => {
    return () => {
      stopSoftBreath();
    };
  }, [stopSoftBreath]);

  const surfaceButton = [
    "w-full rounded-2xl px-4 py-4 text-sm md:text-base md:py-5",
    "border bg-[var(--btn-bg)] text-[var(--text)]",
    "border-[color:var(--btn-border)]",
    "shadow-[var(--btn-shadow)]",
    "hover:bg-[var(--btn-bg-hover)]",
    "hover:shadow-[var(--btn-shadow-hover)]",
    "transition-transform duration-150 ease-out",
    "active:scale-[0.985] active:translate-y-[1px]",
    "active:shadow-[var(--btn-pressed-shadow)] active:bg-[var(--press)]",
  ].join(" ");

  const smallPill = [
    "inline-flex items-center justify-center gap-2",
    "rounded-full border px-3 py-2 text-xs md:text-sm md:px-4 md:py-2.5",
    "border-[color:var(--btn-border)] bg-[var(--btn-bg)] text-[var(--text)]",
    "shadow-[var(--btn-shadow)]",
    "hover:bg-[var(--btn-bg-hover)] hover:shadow-[var(--btn-shadow-hover)]",
    "transition",
  ].join(" ");

  const calmChip = [
    "inline-flex items-center justify-center",
    "rounded-full px-4 py-2 text-xs md:text-sm",
    "border border-[color:var(--btn-border)]",
    "bg-[var(--btn-bg)] text-[var(--muted)]",
    "shadow-[var(--btn-shadow)]",
    "hover:bg-[var(--btn-bg-hover)] hover:shadow-[var(--btn-shadow-hover)]",
    "transition",
  ].join(" ");

  const circleCue =
    locale === "no" ? "Pust i rytmen" : "Breathe with the rhythm";

  const openBrTheme = () => setBrThemeOpen(true);
  const closeBrTheme = () => setBrThemeOpen(false);

  const setFollowAppTheme = () => {
    // Pro-only override; follow app means clearing BR override
    setBreathingRoomSkin(null);
    try {
      localStorage.setItem(PREFS_KEYS.breathingRoomSkin, "");
    } catch {}
  };

  const setFollowAppMode = () => {
    try {
      localStorage.setItem(BR_MODE_KEY, "follow");
    } catch {}
    setBrMode("follow");
  };

  const selectBrSkin = (s: ThemeSkin) => {
    if (!isPro) return;
    setBreathingRoomSkin(s);
    try {
      localStorage.setItem(PREFS_KEYS.breathingRoomSkin, s);
    } catch {}
    closeBrTheme();
  };

  const toggleBrDayNight = () => {
    const nextIsDark = !effectiveBrIsDark;
    const nextMode: BrMode = nextIsDark ? "dark" : "light";
    try {
      localStorage.setItem(BR_MODE_KEY, nextMode);
    } catch {}
    setBrMode(nextMode);
  };

  const brThemes: ThemeSkin[] = useMemo(
    () => [
      "classic",
      "floating",
      "nature",
      "nightpro",
      "desert",
      "ocean",
      "peaceful",
      "winter",
    ],
    []
  );

  const currentSelectionLabel = useMemo(() => {
    if (isPro && breathingRoomSkin)
      return brThemeLabel(locale, breathingRoomSkin);
    return locale === "no" ? "Følg appens tema" : "Follow app theme";
  }, [isPro, breathingRoomSkin, locale]);

  // ✅ IMPORTANT: early return AFTER all hooks
  if (!mounted) return <main className="min-h-[100svh]" />;

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
        {/* ✅ Premium panel wrapper (tokens from globals.css) */}
        <div
          className={[
            "relative w-full h-[100svh] rounded-none p-6",
            "md:p-8",
            "bg-[var(--br-panel-bg)] text-[var(--text)] backdrop-blur-xl",
            "sm:rounded-3xl sm:ring-1 sm:ring-[color:var(--br-panel-border)]",
            "sm:max-h-[calc(100svh-3rem)]",
            "flex flex-col",
            "overflow-y-scroll",
          ].join(" ")}
          style={{
            scrollbarGutter: "stable both-edges",
            backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 50% -120px, rgba(255,255,255,0.10), transparent 55%), var(--br-grain)",
            backgroundBlendMode: "overlay",
            boxShadow: "var(--br-panel-shadow)",
          }}
        >
          {/* ✅ Grain layer BEHIND content */}
          <div
            className="pointer-events-none absolute inset-0 sm:rounded-3xl"
            style={{
              zIndex: 0,
              opacity: "var(--br-grain-opacity)",
              backgroundImage:
                "repeating-radial-gradient(circle at 35% 20%, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 10px, transparent 22px)",
              mixBlendMode: "overlay",
            }}
          />

          {/* ✅ Settings button (premium glass circle) */}
          <button
            type="button"
            onClick={openBrTheme}
            aria-label={
              locale === "no"
                ? "Velg tema for pusterom"
                : "Select breathing room theme"
            }
            className={[
              "absolute right-5 top-5 md:right-6 md:top-6",
              "h-10 w-10 md:h-11 md:w-11 rounded-full",
              "backdrop-blur-2xl",
              "ring-1 ring-white/18",
              "flex items-center justify-center",
              "transition-transform duration-150 ease-out",
              "active:scale-[0.97]",
            ].join(" ")}
            style={{
              zIndex: 3,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(0,0,0,0.18))",
              boxShadow:
                "0 10px 26px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5 md:h-[22px] md:w-[22px]"
              fill="none"
            >
              <path
                d="M5 7H19"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M5 12H19"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M5 17H19"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Layout: top / middle / bottom */}
          <div
            className="relative flex-1 grid grid-rows-[clamp(150px,20vh,200px)_1fr_clamp(190px,26vh,260px)] md:grid-rows-[clamp(150px,18vh,210px)_1fr_clamp(210px,28vh,300px)]"
            style={{ zIndex: 1 }}
          >
            {/* TOP */}
            <div className="pt-12 text-center md:pt-12">
              {showElements ? (
                <>
                  <div className="flex justify-center">
                    <div className="max-w-full">
                      <div className="md:hidden whitespace-nowrap">
                        <Title className="hero-title text-4xl leading-none">
                          {t.breathingRoomTitle}
                        </Title>
                      </div>
                      <div className="hidden md:block">
                        <Title className="hero-title">
                          {t.breathingRoomTitle}
                        </Title>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowElements(false)}
                      className={calmChip}
                    >
                      {t.hideElements}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowElements(true)}
                    className={calmChip}
                  >
                    {t.showElements}
                  </button>
                </div>
              )}
            </div>

            {/* MIDDLE */}
            <div className="flex items-center justify-center">
              <div
                key={animNonce}
                className={[
                  "relative rounded-full overflow-hidden will-change-transform",
                  "w-[55vmin] h-[55vmin] max-w-[320px] max-h-[320px]",
                  "md:w-[44vmin] md:h-[44vmin] md:max-w-[420px] md:max-h-[420px]",
                ].join(" ")}
                style={{
                  ...circleStyle,
                  background: "var(--breath-fill)",
                  boxShadow:
                    "var(--breath-shadow), inset 0 2px 10px rgba(255,255,255,0.12)",
                }}
                aria-label={
                  locale === "no" ? "Pusteindikator" : "Breathing indicator"
                }
              >
                {/* Rim-light + lens curvature */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    zIndex: 1,
                    borderRadius: "9999px",
                    backgroundImage:
                      "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.40), rgba(255,255,255,0) 52%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.10), rgba(0,0,0,0) 55%), linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0))",
                    mixBlendMode: "overlay",
                    opacity: 0.75,
                  }}
                />

                <div
                  className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
                  style={{ zIndex: 2 }}
                >
                  <div
                    className="absolute inset-[-15%]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), rgba(255,255,255,0) 60%)",
                      animation: "breathLightDrift 26s ease-in-out infinite",
                      mixBlendMode: "overlay",
                      opacity: 0.55,
                    }}
                  />

                  <div
                    className="absolute inset-0"
                    style={{
                      boxShadow: "inset 0 0 80px rgba(0,0,0,0.08)",
                      borderRadius: "9999px",
                      opacity: 0.95,
                    }}
                  />

                  <div
                    className="absolute inset-0"
                    style={{
                      borderRadius: "9999px",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.06)",
                      opacity: 0.9,
                    }}
                  />
                </div>

                {showElements && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ zIndex: 5 }}
                  >
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
                    className="pause-range w-full"
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

                  <div className="mt-6 flex flex-col items-center gap-3 md:gap-4">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isPro) return;

                        try {
                          const s = window.speechSynthesis;
                          s?.getVoices?.();
                        } catch {}

                        try {
                          if (!breathRef.current)
                            breathRef.current = new SoftBreath();
                          await breathRef.current.init();
                          breathRef.current.setVolume(0.18);
                        } catch {}

                        setAnimNonce((n) => n + 1);

                        if (voiceEnabled) stopSoftBreath();
                        setVoiceEnabled((v) => !v);
                      }}
                      aria-label={
                        locale === "no" ? "Stemmeguiding" : "Voice guidance"
                      }
                      className={[
                        smallPill,
                        !isPro ? "opacity-50 cursor-not-allowed" : "",
                      ].join(" ")}
                    >
                      <span aria-hidden="true">
                        {voiceEnabled && isPro ? "🔊" : "🔇"}
                      </span>
                      <span>
                        {locale === "no" ? "Stemmeguiding" : "Voice guidance"}
                      </span>
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
                <div className="w-full" />
              )}
            </div>
          </div>

          {/* Go back pinned bottom */}
          <div className="relative mt-6 md:mt-10" style={{ zIndex: 1 }}>
            <button
              type="button"
              onClick={() => router.push(`/`)}
              className={surfaceButton}
              aria-label={t.goBack}
            >
              {t.goBack}
            </button>
          </div>

          {/* BreathingRoom Theme Sheet */}
          {brThemeOpen && (
            <div className="fixed inset-0 z-[100]">
              <button
                type="button"
                aria-label={locale === "no" ? "Lukk" : "Close"}
                onClick={closeBrTheme}
                className="absolute inset-0 bg-black/35"
              />

              <div
                className={[
                  "absolute inset-x-0 bottom-0",
                  "sm:inset-0 sm:flex sm:items-center sm:justify-center",
                  "p-0 sm:p-6",
                ].join(" ")}
              >
                <div
                  className={[
                    "relative w-full",
                    "rounded-t-3xl sm:rounded-3xl",
                    "text-[var(--text)]",
                    "ring-1 ring-[color:var(--border)]",
                    "backdrop-blur-xl",
                    "max-h-[88svh] sm:max-h-[80svh]",
                    "overflow-hidden",
                  ].join(" ")}
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--app-bg) 86%, rgba(255,255,255,0.16))",
                    boxShadow:
                      "0 18px 55px rgba(0,0,0,0.22), 0 2px 0 rgba(255,255,255,0.12) inset",
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "radial-gradient(1200px 500px at 50% -180px, rgba(255,255,255,0.20), transparent 55%)",
                      opacity: 0.9,
                    }}
                  />

                  <div className="relative flex items-center justify-between px-5 pt-5 pb-4 sm:px-6">
                    <div className="text-sm md:text-base font-medium">
                      {locale === "no" ? "Pusterom-tema" : "Breathing room theme"}
                    </div>

                    <div className="flex items-center gap-3">
                      {/* ✅ Day/Night slider (local for BR) */}
                      <button
                        type="button"
                        aria-label={
                          locale === "no" ? "Bytt dag/natt" : "Toggle day/night"
                        }
                        onClick={toggleBrDayNight}
                        className="relative rounded-full h-8 w-[72px] md:h-10 md:w-[84px] p-1 border border-[color:var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                      >
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] opacity-55">
                          ☀️
                        </span>
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] opacity-55">
                          🌙
                        </span>
                        <span
                          className={[
                            "block rounded-full bg-[var(--app-bg)] shadow-sm",
                            "h-6 w-6 md:h-8 md:w-8",
                            "transition-transform duration-200",
                            effectiveBrIsDark
                              ? "translate-x-[calc(72px-24px-8px)] md:translate-x-[calc(84px-32px-8px)]"
                              : "translate-x-0",
                          ].join(" ")}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={closeBrTheme}
                        className="text-sm underline underline-offset-4 text-[var(--muted)] hover:opacity-90"
                      >
                        {locale === "no" ? "Lukk" : "Close"}
                      </button>
                    </div>
                  </div>

                  <div className="relative px-5 pb-5 sm:px-6">
                    <div className="text-xs md:text-sm text-[var(--muted)] mb-3">
                      {locale === "no"
                        ? `Valgt: ${currentSelectionLabel}`
                        : `Selected: ${currentSelectionLabel}`}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFollowAppTheme();
                        setFollowAppMode();
                        closeBrTheme();
                      }}
                      className={[
                        "w-full rounded-2xl px-4 py-3.5 md:px-5 md:py-4",
                        "text-sm md:text-base",
                        "border border-[color:var(--border)]",
                        "bg-[var(--surface)] text-[var(--text)]",
                        "hover:bg-[var(--surface-hover)]",
                        "transition",
                      ].join(" ")}
                    >
                      {locale === "no" ? "Følg appens tema" : "Follow app theme"}
                    </button>

                    <div className="mt-4 grid grid-cols-2 gap-3 md:gap-4">
                      {brThemes.map((s) => {
                        const selected = isPro && breathingRoomSkin === s;
                        const locked = !isPro;

                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => selectBrSkin(s)}
                            className={[
                              "relative rounded-2xl px-4 py-3.5 md:px-5 md:py-4",
                              "text-sm md:text-base",
                              "border border-[color:var(--border)]",
                              "bg-[var(--surface)] text-[var(--text)]",
                              "hover:bg-[var(--surface-hover)]",
                              "transition",
                              locked ? "opacity-60 cursor-not-allowed" : "",
                              selected ? "ring-2 ring-[color:var(--ring)]" : "",
                            ].join(" ")}
                            aria-label={brThemeLabel(locale, s)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate">
                                {brThemeLabel(locale, s)}
                              </div>

                              {selected ? (
                                <div
                                  className="h-5 w-5 rounded-full bg-white/20 ring-1 ring-white/25 flex items-center justify-center"
                                  aria-hidden="true"
                                >
                                  <div className="h-2.5 w-2.5 rounded-full bg-white/85" />
                                </div>
                              ) : locked ? (
                                <div
                                  className="h-5 w-5 rounded-full bg-black/10 ring-1 ring-black/10 flex items-center justify-center"
                                  aria-hidden="true"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                  >
                                    <path
                                      d="M7.5 10V8.2C7.5 5.6 9.4 3.75 12 3.75C14.6 3.75 16.5 5.6 16.5 8.2V10"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M7.2 10H16.8C18 10 18.75 10.75 18.75 11.95V17.8C18.75 19 18 19.75 16.8 19.75H7.2C6 19.75 5.25 19 5.25 17.8V11.95C5.25 10.75 6 10 7.2 10Z"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <div className="h-5 w-5" aria-hidden="true" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {!isPro && (
                      <div className="mt-3 text-center text-xs md:text-sm text-[var(--muted)]">
                        {locale === "no"
                          ? "Pusterom-tema er tilgjengelig i Pro-versjonen."
                          : "Breathing room theme is available in the Pro version."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}