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

import { getHaptics } from "../lib/haptics";

// ✅ Same key as HomeClient
const LOCALE_KEY = "pause-locale";

// ✅ BreathingRoom day/night override (local only)
const BR_MODE_KEY = "pause-br-mode"; // "follow" | "light" | "dark"

// ✅ Personal Settings keys
const BR_PAUSE_PREFS_KEY = "pause-br-pause-prefs";
const BR_VOICE_GENDER_KEY = "pause-br-voice-gender"; // "female" | "male"

// ✅ Haptics (local only, BR only)
const BR_HAPTICS_KEY = "pause-br-haptics"; // "1" | "0"
const BR_HAPTICS_INTENSITY_KEY = "pause-br-haptics-intensity"; // "low" | "med" | "high"
const BR_BREATH_HAPTICS_KEY = "pause-br-breath-haptics"; // "1" | "0" (pro)

// Slider: TOPP = raskest, BUNN = tregest
const MIN_SECONDS = 6; // raskest
const MAX_SECONDS = 16; // tregest
const DEFAULT_SECONDS = 10; // default

type VoicePhase = "in" | "hold" | "out";
type BrMode = "follow" | "light" | "dark";

type PausePreset = "none" | "alwaysHideAll" | "alwaysShowAll";
type VoiceGender = "female" | "male";
type HapticsIntensity = "low" | "med" | "high";

type BrPausePrefs = {
  preset: PausePreset;
  hideText: boolean;
  hideMenuButtons: boolean;
  hideSpeedBar: boolean;
  hideVoiceToggle: boolean;
};

// ✅ Default for Personal Settings.
const DEFAULT_BR_PAUSE_PREFS: BrPausePrefs = {
  preset: "none",
  hideText: false,
  hideMenuButtons: false,
  hideSpeedBar: false,
  hideVoiceToggle: false,
};

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

    // ✅ Voice gender affects pitch (keeps signature unchanged)
    let gender: VoiceGender = "female";
    try {
      const raw = localStorage.getItem(BR_VOICE_GENDER_KEY);
      const g = (raw || "").trim().toLowerCase();
      if (g === "male" || g === "female") gender = g;
    } catch {}

    u.rate = 0.88;
    u.pitch = gender === "male" ? 0.84 : 0.98;
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

function safeReadPausePrefs(): BrPausePrefs {
  try {
    const raw = localStorage.getItem(BR_PAUSE_PREFS_KEY);
    if (!raw) return DEFAULT_BR_PAUSE_PREFS;

    const parsed = JSON.parse(raw) as Partial<BrPausePrefs>;
    const preset =
      parsed.preset === "alwaysHideAll" ||
      parsed.preset === "alwaysShowAll" ||
      parsed.preset === "none"
        ? parsed.preset
        : "none";

    return {
      preset,
      hideText: !!parsed.hideText,
      hideMenuButtons: !!parsed.hideMenuButtons,
      hideSpeedBar: !!parsed.hideSpeedBar,
      hideVoiceToggle: !!parsed.hideVoiceToggle,
    };
  } catch {
    return DEFAULT_BR_PAUSE_PREFS;
  }
}

function safeWritePausePrefs(p: BrPausePrefs) {
  try {
    localStorage.setItem(BR_PAUSE_PREFS_KEY, JSON.stringify(p));
  } catch {}
}

function isIntensity(v: string): v is HapticsIntensity {
  return v === "low" || v === "med" || v === "high";
}

// ✅ apply preset rules to an arbitrary prefs object (used for auto-apply)
function applyPresetRules(p: BrPausePrefs): BrPausePrefs {
  if (p.preset === "alwaysHideAll") {
    return {
      preset: "alwaysHideAll",
      hideText: true,
      hideMenuButtons: true,
      hideSpeedBar: true,
      hideVoiceToggle: true,
    };
  }
  if (p.preset === "alwaysShowAll") {
    return {
      preset: "alwaysShowAll",
      hideText: false,
      hideMenuButtons: false,
      hideSpeedBar: false,
      hideVoiceToggle: false,
    };
  }
  return p;
}

export default function BreathingRoomClient() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("no");

  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS);

  // ✅ Pause-mode (Eye toggle)
  const [pauseMode, setPauseMode] = useState(false);

  // ✅ Personal Settings master
  const [brPausePrefs, setBrPausePrefs] = useState<BrPausePrefs>(
    DEFAULT_BR_PAUSE_PREFS
  );

  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");

  // ✅ Haptics master (local state mirrors settings; engine reads localStorage too)
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [hapticsIntensity, setHapticsIntensity] =
    useState<HapticsIntensity>("med");
  const [breathHapticsEnabled, setBreathHapticsEnabled] = useState(false);

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

  // --- Press & hold (2s) toggle ---
  const holdTimerRef = useRef<number | null>(null);
  const holdFiredRef = useRef(false);

  // --- Guard: cancel hold if user moves (scroll/drag) ---
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // --- Hold ticks (each second) ---
  const holdTickRef = useRef<number | null>(null);
  const holdSecondsRef = useRef(0);

  // --- Short hint (2s) after entering pause-mode ---
  const [showHoldHint, setShowHoldHint] = useState(false);
  const hintTimerRef = useRef<number | null>(null);

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


/**
 * UX RULE:
 * When breath-follow vibration is active,
 * slider vibration must be disabled.
 *
 * Otherwise the two patterns collide and feel chaotic.
 *
 * Slider haptics is default ON when breath-follow is OFF.
 */



  // ✅ Attach haptics engine (UI haptics allowed by default; breathing haptics stays premium-gated)
  useEffect(() => {
    if (!mounted) return;

    const h = getHaptics();
    h.attach();

    // Slider step feel (premium)
    h.setSliderTickThrottle(85);

    // Breathing haptics is premium/pro-demo gated (UI ticks/wosh are NOT)
    h.setPremiumEnabledForBreath(isPro);

    return () => {
      h.detach();
    };
  }, [mounted, isPro]);

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

  // ✅ Read/persist pause prefs + auto-apply pause-mode immediately
  useEffect(() => {
    if (!mounted) return;

    const p = safeReadPausePrefs();
    setBrPausePrefs(p);

    const applied = applyPresetRules(p);

    const anyToHide =
      applied.preset === "alwaysHideAll" ||
      applied.hideText ||
      applied.hideMenuButtons ||
      applied.hideSpeedBar ||
      applied.hideVoiceToggle;

    setPauseMode(anyToHide);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    safeWritePausePrefs(brPausePrefs);
  }, [mounted, brPausePrefs]);

  // ✅ Read voice gender (local)
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(BR_VOICE_GENDER_KEY);
      const v = (raw || "").trim().toLowerCase();
      if (v === "male" || v === "female") setVoiceGender(v);
    } catch {}
  }, [mounted]);

  // ✅ Persist voice gender (local)
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(BR_VOICE_GENDER_KEY, voiceGender);
    } catch {}
  }, [mounted, voiceGender]);

  // ✅ Read haptics enabled (local)
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(BR_HAPTICS_KEY);
      if (raw === "0") setHapticsEnabled(false);
      else if (raw === "1") setHapticsEnabled(true);
      else setHapticsEnabled(true);
    } catch {
      setHapticsEnabled(true);
    }
  }, [mounted]);

  // ✅ Persist haptics enabled (local)
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(BR_HAPTICS_KEY, hapticsEnabled ? "1" : "0");
    } catch {}
  }, [mounted, hapticsEnabled]);

  // ✅ Read haptics intensity + breath haptics (local)
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = (localStorage.getItem(BR_HAPTICS_INTENSITY_KEY) || "med")
        .trim()
        .toLowerCase();
      setHapticsIntensity(isIntensity(raw) ? raw : "med");
    } catch {
      setHapticsIntensity("med");
    }

    try {
      const raw = localStorage.getItem(BR_BREATH_HAPTICS_KEY);
      setBreathHapticsEnabled(raw === "1");
    } catch {
      setBreathHapticsEnabled(false);
    }
  }, [mounted]);

  // ✅ Listen for settings changes (instant apply + auto-pause when relevant)
  useEffect(() => {
    if (!mounted) return;

    const reload = () => {
      const nextRaw = safeReadPausePrefs();
      const next = applyPresetRules(nextRaw);
      setBrPausePrefs(nextRaw);

      const anyToHide =
        next.preset === "alwaysHideAll" ||
        next.hideText ||
        next.hideMenuButtons ||
        next.hideSpeedBar ||
        next.hideVoiceToggle;

      setPauseMode(anyToHide);

      try {
        const rawVG = localStorage.getItem(BR_VOICE_GENDER_KEY);
        const vg = (rawVG || "").trim().toLowerCase();
        if (vg === "male" || vg === "female") setVoiceGender(vg);
      } catch {}

      try {
        const rawH = localStorage.getItem(BR_HAPTICS_KEY);
        setHapticsEnabled(rawH !== "0");
      } catch {}

      try {
        const rawI = (localStorage.getItem(BR_HAPTICS_INTENSITY_KEY) || "med")
          .trim()
          .toLowerCase();
        setHapticsIntensity(isIntensity(rawI) ? rawI : "med");
      } catch {
        setHapticsIntensity("med");
      }

      try {
        const rawB = localStorage.getItem(BR_BREATH_HAPTICS_KEY);
        setBreathHapticsEnabled(rawB === "1");
      } catch {
        setBreathHapticsEnabled(false);
      }
    };

    window.addEventListener("pause-br-settings-changed", reload);
    return () => window.removeEventListener("pause-br-settings-changed", reload);
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
  const effectiveBrIsDark = useMemo(() => {
    if (brMode === "follow") return appIsDark;
    return brMode === "dark";
  }, [brMode, appIsDark]);

  // ✅ Effective BreathingRoom skin:
  const effectiveBrSkin: ThemeSkin = useMemo(() => {
    if (isPro && breathingRoomSkin) return breathingRoomSkin;
    return appSkin;
  }, [isPro, breathingRoomSkin, appSkin]);

  /**
   * ⭐ APPLY BR SKIN TO WHOLE APP WHILE IN BREATHINGROOM
   */
  useEffect(() => {
    if (!mounted) return;

    setHtmlSkinOverride(effectiveBrSkin);

    return () => setHtmlSkinOverride(null);
  }, [mounted, effectiveBrSkin, setHtmlSkinOverride]);

  /**
   * ⭐ APPLY BR MODE (day/night) TO <html class="dark"> WHILE IN BREATHINGROOM
   */
  useEffect(() => {
    if (!mounted) return;
    enteredModeRef.current = appMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    if (brMode === "follow") {
      setMode(enteredModeRef.current);
      return;
    }

    setMode(brMode === "dark" ? "dark" : "light");

    return () => {
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


/**
 * Haptics Engine Sync
 *
 * BR is the single source of truth.
 * Engines (voice + haptics) are independent and never know about each other.
 *
 * BR mediates:
 * - slider timing
 * - pro gating
 * - voice active state
 */



// ⭐ HAPTICS ENGINE SYNC (independent engine)

useEffect(() => {
  if (!mounted) return;

  const h = getHaptics();

  h.attach(); // safe singleton attach

  return () => {
    h.detach(); // cleanup when leaving BR
  };
}, [mounted]);

// slider speed → haptics breathing math
useEffect(() => {
  if (!mounted) return;

  const h = getHaptics();
  h.setCycleSeconds(seconds);
}, [mounted, seconds]);

// voice toggle → optional voice sync mode
useEffect(() => {
  if (!mounted) return;

  const h = getHaptics();
  h.setVoiceActive(voiceEnabled);
}, [mounted, voiceEnabled]);

// Pro gating (premium breath haptics)
useEffect(() => {
  if (!mounted) return;

  const h = getHaptics();
  h.setPremiumEnabledForBreath(isPro);
}, [mounted, isPro]);








  // ✅ Short hint (2s then gone)
  const showHoldHintFor2s = useCallback(() => {
    setShowHoldHint(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      setShowHoldHint(false);
      hintTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
      if (holdTickRef.current) window.clearTimeout(holdTickRef.current);
    };
  }, []);

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

  // ✅ Hint chip (single-line)
  const hintChip = [
    "inline-flex items-center justify-center",
    "rounded-full",
    "border border-white/35",
    "px-5 py-2.5",
    "text-xs md:text-sm",
    "font-semibold",
    "whitespace-nowrap",
    "shadow-[0_18px_50px_rgba(0,0,0,0.35)]",
    "backdrop-blur-2xl",
  ].join(" ");

  const circleCue =
    locale === "no" ? "Pust i rytmen" : "Breathe with the rhythm";

  const holdHintText =
    locale === "no"
      ? "Trykk på skjermen i 2 sek for å vise alt igjen"
      : "Press for 2s on the screen to show everything again";

  const openBrTheme = () => {
    setBrThemeOpen(true);
  };

  const closeBrTheme = () => {
    setBrThemeOpen(false);
  };

  const setFollowAppTheme = () => {
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

  const appThemeLabel = useMemo(() => {
    return brThemeLabel(locale, appSkin);
  }, [locale, appSkin]);

  // ✅ Apply preset rules (master)
  const effectivePausePrefs = useMemo<BrPausePrefs>(() => {
    return applyPresetRules(brPausePrefs);
  }, [brPausePrefs]);

  // ✅ Does user have explicit selection? (if not -> eye/hold hides ALL)
  const hasExplicitPauseSelection = useMemo(() => {
    if (effectivePausePrefs.preset !== "none") return true;
    return (
      effectivePausePrefs.hideText ||
      effectivePausePrefs.hideMenuButtons ||
      effectivePausePrefs.hideSpeedBar ||
      effectivePausePrefs.hideVoiceToggle
    );
  }, [effectivePausePrefs]);

  // ✅ If paused with NO selection -> hide everything
  const hideAllWhenPaused = useMemo(() => {
    return pauseMode && !hasExplicitPauseSelection;
  }, [pauseMode, hasExplicitPauseSelection]);

  // ✅ What is visible while pauseMode is ON
  const showText = useMemo(() => {
    if (!pauseMode) return true;
    if (hideAllWhenPaused) return false;
    return !effectivePausePrefs.hideText;
  }, [pauseMode, hideAllWhenPaused, effectivePausePrefs.hideText]);

  const showMenuButtons = useMemo(() => {
    if (!pauseMode) return true;
    if (hideAllWhenPaused) return false;
    return !effectivePausePrefs.hideMenuButtons;
  }, [pauseMode, hideAllWhenPaused, effectivePausePrefs.hideMenuButtons]);

  const showSpeedBar = useMemo(() => {
    if (!pauseMode) return true;
    if (hideAllWhenPaused) return false;
    return !effectivePausePrefs.hideSpeedBar;
  }, [pauseMode, hideAllWhenPaused, effectivePausePrefs.hideSpeedBar]);

  const showVoiceToggle = useMemo(() => {
    if (!pauseMode) return true;
    if (hideAllWhenPaused) return false;
    return !effectivePausePrefs.hideVoiceToggle;
  }, [pauseMode, hideAllWhenPaused, effectivePausePrefs.hideVoiceToggle]);

  // ✅ Back button visibility follows menu/buttons logic
  const showBackButton = useMemo(() => {
    if (!pauseMode) return true;
    if (hideAllWhenPaused) return false;
    return !effectivePausePrefs.hideMenuButtons;
  }, [pauseMode, hideAllWhenPaused, effectivePausePrefs.hideMenuButtons]);

  // ✅ Eye is only visible when SOMETHING else is visible
  const anythingVisible = useMemo(() => {
    return (
      showText ||
      showMenuButtons ||
      showSpeedBar ||
      showVoiceToggle ||
      showBackButton
    );
  }, [showText, showMenuButtons, showSpeedBar, showVoiceToggle, showBackButton]);

  const showEyeButton = anythingVisible;

  // ✅ Hint ONLY when ALL is hidden (i.e. no eye + nothing else visible)
  useEffect(() => {
    if (!mounted) return;

    const allHidden = pauseMode && !anythingVisible;

    if (allHidden) {
      showHoldHintFor2s();
      return;
    }

    // otherwise: ensure hint is not shown
    setShowHoldHint(false);
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, [mounted, pauseMode, anythingVisible, showHoldHintFor2s]);

  const enterPauseMode = useCallback(() => {
    setPauseMode(true);
  }, []);

  const exitPauseMode = useCallback(() => {
    setPauseMode(false);
    setShowHoldHint(false);
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  // --- Hold tick scheduler (1s, 2s) ---
  const stopHoldTicks = useCallback(() => {
    if (holdTickRef.current) {
      window.clearTimeout(holdTickRef.current);
      holdTickRef.current = null;
    }
    holdSecondsRef.current = 0;
  }, []);

  const startHoldTicks = useCallback(() => {
    stopHoldTicks();
    holdSecondsRef.current = 0;

    const step = () => {
      holdSecondsRef.current += 1;
      getHaptics().tick();
      holdTickRef.current = window.setTimeout(step, 1000);
    };

    holdTickRef.current = window.setTimeout(step, 1000);
  }, [stopHoldTicks]);

  // ✅ Press & hold handlers (2s)
  const endHold = useCallback(() => {
    stopHoldTicks();
    pointerStartRef.current = null;

    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, [stopHoldTicks]);

  const startHold = useCallback(
    (clientX: number, clientY: number) => {
      holdFiredRef.current = false;
      pointerStartRef.current = { x: clientX, y: clientY };

      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      startHoldTicks();

      holdTimerRef.current = window.setTimeout(() => {
        holdFiredRef.current = true;

        if (pauseMode) {
          getHaptics().woshShow();
          exitPauseMode();
        } else {
          getHaptics().woshHide();
          enterPauseMode();
        }

        stopHoldTicks();
        holdTimerRef.current = null;
      }, 2000);
    },
    [pauseMode, enterPauseMode, exitPauseMode, startHoldTicks, stopHoldTicks]
  );

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
            touchAction: "manipulation",
          }}
          // ✅ press & hold anywhere
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.buttons !== 1) return;
            startHold(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            const start = pointerStartRef.current;
            if (!start) return;

            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) > 12) endHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
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

          {/* ✅ Eye toggle (pause-mode) */}
          {showEyeButton && (
            <button
              type="button"
              onClick={() => {
                endHold();

                if (pauseMode) {
                  getHaptics().woshShow();
                  exitPauseMode();
                } else {
                  getHaptics().woshHide();
                  enterPauseMode();
                }
              }}
              aria-label={
                pauseMode
                  ? locale === "no"
                    ? "Vis elementer"
                    : "Show elements"
                  : locale === "no"
                  ? "Skjul elementer"
                  : "Hide elements"
              }
              className={[
                "absolute left-5 top-5 md:left-6 md:top-6",
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
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            >
              {pauseMode ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 md:h-[22px] md:w-[22px]"
                  fill="none"
                >
                  <path
                    d="M4 12c2.2-3.5 5-5.25 8-5.25S17.8 8.5 20 12c-2.2 3.5-5 5.25-8 5.25S6.2 15.5 4 12Z"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 17.5 17 6.5"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 md:h-[22px] md:w-[22px]"
                  fill="none"
                >
                  <path
                    d="M4 12c2.2-3.5 5-5.25 8-5.25S17.8 8.5 20 12c-2.2 3.5-5 5.25-8 5.25S6.2 15.5 4 12Z"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 9.5c1.4 0 2.5 1.1 2.5 2.5S13.4 14.5 12 14.5 9.5 13.4 9.5 12 10.6 9.5 12 9.5Z"
                    fill="rgba(255,255,255,0.70)"
                  />
                </svg>
              )}
            </button>
          )}

          {/* ✅ Settings (hamburger) — controlled by pause prefs */}
          {showMenuButtons && (
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
              onPointerDown={(e) => {
                e.stopPropagation();
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
          )}

          {/* ✅ Short hint (2s) — ONLY when ALL is hidden */}
          {showHoldHint && (
            <div
              className="absolute left-1/2 top-[76px] -translate-x-1/2"
              style={{ zIndex: 9999 }}
            >
              <div
                className={hintChip}
                style={{
                  color: "rgba(255,255,255,0.95)",
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.34))",
                  boxShadow:
                    "0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)",
                }}
              >
                {holdHintText}
              </div>
            </div>
          )}

          {/* Layout: top / middle / bottom */}
          <div
            className="relative flex-1 grid grid-rows-[clamp(150px,20vh,200px)_1fr_clamp(190px,26vh,260px)] md:grid-rows-[clamp(150px,18vh,210px)_1fr_clamp(210px,28vh,300px)]"
            style={{ zIndex: 1 }}
          >
            {/* TOP */}
            <div className="pt-12 text-center md:pt-12">
              {showText ? (
                <div className="flex justify-center">
                  <div className="max-w-full">
                    <div className="md:hidden whitespace-nowrap">
                      <Title className="hero-title text-4xl leading-none">
                        {t.breathingRoomTitle}
                      </Title>
                    </div>
                    <div className="hidden md:block">
                      <Title className="hero-title">{t.breathingRoomTitle}</Title>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full" />
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

                {showText && (
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
              {showSpeedBar || showVoiceToggle || showMenuButtons ? (
                <div className="w-full max-w-[360px] px-2 md:max-w-[520px] md:px-6">
                  {showSpeedBar && (
                    <>
                      <input
                        type="range"
                        min={MIN_SECONDS}
                        max={MAX_SECONDS}
                        value={sliderValue}
                        onChange={(e) => {
                          const next = Number(e.target.value);

                          // ✅ Premium slider “steps” (engine throttles internally)
                          getHaptics().sliderStepTick();

                          onSliderChange(next);
                        }}
                        className="pause-range w-full"
                        aria-label={t.speedAria}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          endHold();
                        }}
                        onPointerMove={(e) => {
                          e.stopPropagation();
                          endHold();
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          endHold();
                        }}
                        onPointerCancel={(e) => {
                          e.stopPropagation();
                          endHold();
                        }}
                      />

                      {seconds !== DEFAULT_SECONDS && (
                        <div className="mt-3 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setSeconds(DEFAULT_SECONDS)}
                            className={smallPill}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {t.resetSpeed}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {(showVoiceToggle || showMenuButtons) && (
                    <div className="mt-6 flex flex-col items-center gap-3 md:gap-4">
                      {showVoiceToggle && (
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
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <span aria-hidden="true">
                            {voiceEnabled && isPro ? "🔊" : "🔇"}
                          </span>
                          <span>
                            {locale === "no" ? "Stemmeguiding" : "Voice guidance"}
                          </span>
                        </button>
                      )}

                      {!isPro && showVoiceToggle && (
                        <div className="text-center text-xs md:text-sm text-[var(--muted)]">
                          {locale === "no"
                            ? "Stemmeguiding er tilgjengelig i Pro-versjonen."
                            : "Voice guidance is available in the Pro version."}
                        </div>
                      )}

                      {showMenuButtons && (
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
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {isPro
                            ? locale === "no"
                              ? "Deaktiver pro-demo"
                              : "Deactivate pro-demo"
                            : locale === "no"
                            ? "Aktiver pro-demo"
                            : "Activate pro-demo"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full" />
              )}
            </div>
          </div>

          {/* Go back pinned bottom */}
          {showBackButton && (
            <div className="relative mt-6 md:mt-10" style={{ zIndex: 1 }}>
              <button
                type="button"
                onClick={() => router.push(`/`)}
                className={surfaceButton}
                aria-label={t.goBack}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {t.goBack}
              </button>
            </div>
          )}

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
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "radial-gradient(1200px 500px at 50% -180px, rgba(255,255,255,0.20), transparent 55%)",
                      opacity: 0.9,
                    }}
                  />

                  {/* ✅ Top row (minimal): day/night, close */}
                  <div className="relative flex items-center justify-between px-5 pt-5 pb-3 sm:px-6">
                    <div className="h-5" aria-hidden="true" />

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label={
                          locale === "no" ? "Bytt dag/natt" : "Toggle day/night"
                        }
                        onClick={toggleBrDayNight}
                        className="relative rounded-full h-8 w-[72px] md:h-10 md:w-[84px] p-1 border border-[color:var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                        onPointerDown={(e) => e.stopPropagation()}
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
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {locale === "no" ? "Lukk" : "Close"}
                      </button>
                    </div>
                  </div>

                  {/* ✅ Scrollable content (whole sheet) */}
                  <div className="relative px-5 pb-6 sm:px-6 overflow-y-auto max-h-[calc(88svh-64px)] sm:max-h-[calc(80svh-64px)]">
                    <div className="pt-2">
                      <div className="text-sm md:text-base font-medium mb-3">
                        {locale === "no"
                          ? "Pusterom-tema"
                          : "Breathing room theme"}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          endHold();
                          closeBrTheme();
                          router.push("/breathingroom/settings");
                        }}
                        className={[
                          "w-full rounded-2xl px-4 py-3.5 md:px-5 md:py-4",
                          "text-sm md:text-base",
                          "border border-[color:var(--border)]",
                          "bg-[var(--surface)] text-[var(--text)]",
                          "hover:bg-[var(--surface-hover)]",
                          "transition",
                        ].join(" ")}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {locale === "no"
                          ? "Personlige innstillinger"
                          : "Personal settings"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFollowAppTheme();
                          setFollowAppMode();
                          closeBrTheme();
                        }}
                        className={[
                          "mt-3 w-full rounded-2xl px-4 py-3.5 md:px-5 md:py-4",
                          "text-sm md:text-base",
                          "border border-[color:var(--border)]",
                          "bg-[var(--surface)] text-[var(--text)]",
                          "hover:bg-[var(--surface-hover)]",
                          "transition",
                          "text-left",
                        ].join(" ")}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="font-medium">
                          {locale === "no"
                            ? "Følg appens tema"
                            : "Follow app theme"}
                        </div>
                        <div className="mt-1 text-xs md:text-sm text-[var(--muted)]">
                          {locale === "no"
                            ? `App-tema: ${appThemeLabel}`
                            : `App theme: ${appThemeLabel}`}
                        </div>
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
                              onPointerDown={(e) => e.stopPropagation()}
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
                  {/* end scroll */}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}