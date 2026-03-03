"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppPrefs } from "../../AppProviders";
import type { Locale } from "../../data/uiText";
import { UI_TEXT } from "../../data/uiText";

import { getHaptics } from "../../lib/haptics";

// ✅ NEW: unified info toggle (uses InfoButton)
import InfoToggle from "../../components/InfoToggle";

import { IconDot, IconLeaf, IconMoon, IconZen } from "../../components/BreathModeIcons";


// Same keys as in BR client
const LOCALE_KEY = "pause-locale";

const BR_PAUSE_PREFS_KEY = "pause-br-pause-prefs";
const BR_VOICE_GENDER_KEY = "pause-br-voice-gender"; // "female" | "male"

// Haptics base toggle (already used in BR)
const BR_HAPTICS_KEY = "pause-br-haptics"; // "1" | "0"

// New keys for settings
const BR_HAPTICS_INTENSITY_KEY = "pause-br-haptics-intensity"; // "low" | "med" | "high"
const BR_BREATH_HAPTICS_KEY = "pause-br-breath-haptics"; // "1" | "0" (pro)

// New Breathingmodes
const BR_BREATH_MODE_KEY = "pause-br-breath-mode"; // "standard" | "release" | "deep-calm" | "stillness"

// Visual pulse toggle
const BR_VISUAL_PULSE_KEY = "pause-br-visual-pulse"; // "1" | "0"

type BreathMode = "standard" | "release" | "deep-calm" | "stillness";

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

const DEFAULT_BR_PAUSE_PREFS: BrPausePrefs = {
  preset: "none",
  hideText: false,
  hideMenuButtons: false,
  hideSpeedBar: false,
  hideVoiceToggle: false,
};

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function safeWriteJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

function safeReadStr(key: string, fallback: string) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return raw;
  } catch {
    return fallback;
  }
}
function safeWriteStr(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { }
}

function isIntensity(v: string): v is HapticsIntensity {
  return v === "low" || v === "med" || v === "high";
}

function announceSettingsChanged() {
  try {
    window.dispatchEvent(new Event("pause-br-settings-changed"));
  } catch { }
}

function EyeIcon({
  closed,
  className,
  stroke = "rgba(255,255,255,0.90)",
}: {
  closed: boolean;
  className?: string;
  stroke?: string;
}) {
  return closed ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      fill="none"
    >
      <path
        d="M4 12c2.2-3.5 5-5.25 8-5.25S17.8 8.5 20 12c-2.2 3.5-5 5.25-8 5.25S6.2 15.5 4 12Z"
        stroke={stroke}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M7 17.5 17 6.5"
        stroke={stroke}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      fill="none"
    >
      <path
        d="M4 12c2.2-3.5 5-5.25 8-5.25S17.8 8.5 20 12c-2.2 3.5-5 5.25-8 5.25S6.2 15.5 4 12Z"
        stroke={stroke}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.4c1.45 0 2.6 1.16 2.6 2.6S13.45 14.6 12 14.6 9.4 13.45 9.4 12 10.55 9.4 12 9.4Z"
        fill="rgba(255,255,255,0.72)"
      />
    </svg>
  );
}

/**
 * EyeToggle (pause-mode rows only)
 * checked=true means "hide enabled" => CLOSED eye (invertIcon=true)
 */
function EyeToggle({
  checked,
  onToggle,
  disabled,
  ariaLabel,
  invertIcon,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel: string;
  invertIcon?: boolean;
}) {
  const isDisabled = !!disabled;
  const closed = invertIcon ? checked : !checked;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        if (isDisabled) return;
        onToggle();
      }}
      disabled={isDisabled}
      className={[
        "relative shrink-0",
        "h-11 w-11 md:h-12 md:w-12",
        "rounded-full",
        "grid place-items-center",
        "transition",
        isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
      ].join(" ")}
      style={{
        border: "1px solid rgba(255,255,255,0.26)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.22))",
        boxShadow:
          "0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.16)",
      }}
    >
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(18px 14px at 35% 28%, rgba(255,255,255,0.20), transparent 60%)",
        }}
      />
      <span
        className="absolute inset-[3px] rounded-full pointer-events-none"
        style={{
          border: closed
            ? "1px solid rgba(255,255,255,0.22)"
            : "1px solid rgba(255,255,255,0.32)",
          boxShadow: closed
            ? "inset 0 1px 0 rgba(255,255,255,0.10)"
            : "0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14)",
        }}
      />
      <EyeIcon closed={closed} />
    </button>
  );
}

function SaveBar({
  onSave,
  label,
  disabled,
}: {
  onSave: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="px-4 pb-4 md:px-5 md:pb-5">
      <div className="pt-3 flex justify-start">
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            onSave();
          }}
          disabled={disabled}
          className={[
            "rounded-full",
            "px-8 md:px-10 py-3 md:py-3.5",
            "text-sm md:text-base font-medium",
            "transition",
            "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
            disabled ? "cursor-not-allowed opacity-55" : "active:scale-[0.99]",
          ].join(" ")}
          style={{
            minWidth: "168px",
            border: "1px solid rgba(255,255,255,0.26)",
            background: disabled
              ? "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.20))"
              : "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.18))",
            boxShadow: disabled
              ? "inset 0 1px 0 rgba(255,255,255,0.10)"
              : "0 16px 34px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.16)",
            color: "var(--text)",
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}

function pausePrefsEqual(a: BrPausePrefs, b: BrPausePrefs) {
  return (
    a.preset === b.preset &&
    a.hideText === b.hideText &&
    a.hideMenuButtons === b.hideMenuButtons &&
    a.hideSpeedBar === b.hideSpeedBar &&
    a.hideVoiceToggle === b.hideVoiceToggle
  );
}

export default function BreathingroomSettings() {
  const router = useRouter();
  const { proDemo: isPro } = useAppPrefs();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("no");
  const t = useMemo(() => UI_TEXT[locale], [locale]);

  // ✅ One place for all infotoggle texts (UPDATED per your new “master” rules)
  const INFO = useMemo(
    () =>
      ({
        section: {
          pauseMode: {
            no: "Velg hva som skjules når du går inn i pause-modus.\nTips: Trykk på skjermen i 2 sek for å få alt tilbake.",
            en: "Choose what hides when you enter pause mode.\nTip: press screen for 2s to show everything again.",
          },

          // ✅ MASTER: all breathing modes info lives here now
          breathingMode: {
            no:
              "Standard: Din standard pause-opplevelse.\n" +
              "Slipp: For når tankene går fort.\n" +
              "Dyp ro: For når kroppen er urolig.\n" +
              "Stillhet: For når du vil helt ned i hvile.",
            en:
              "Standard: Your standard pause experience.\n" +
              "Release: When your thoughts won’t slow down.\n" +
              "Deep calm: When your body feels unsettled.\n" +
              "Stillness: When you want to sink into deep rest.",
          },

          visualPulse: {
            no: "Rolige visuelle blink synket med vibrasjon.\nSlå av om du vil ha helt rolig skjerm.",
            en: "Soft visual flashes synced with haptics.\nTurn off for a calmer screen.",
          },

          // ✅ MASTER: haptics + breath haptics baked into this one
          haptics: {
            no:
              "Telefonen kan guide pusten din med vibrasjon.\n" +
              "Tips: legg telefonen på brystet for en avslappet pusteopplevelse.\n" +
              "Vibrasjonen følger inn og utpust.\n" +
              "OBS: Fungerer kun på mobiltelefon.",
            en:
              "Your phone can guide your breathing with vibration.\n" +
              "Tip: Place your phone on your chest for a more relaxed experience.\n\n" +
              "The vibration follows inhale and exhale.n" +
              " Vibration only works on cellphhones"
          },

          voice: {
            no: "Velg stemmen som føles trygg.\nLagres lokalt på enheten.",
            en: "Choose the voice that feels safe.\nStored locally on this device.",
          },
        },
      }) as const,
    []
  );

  // Breath mode + persisted snapshot
  const [breathMode, setBreathMode] = useState<BreathMode>("standard");
  const persistedBreathModeRef = useRef<BreathMode>("standard");

  // Visual pulse (default ON)
  const [visualPulseEnabled, setVisualPulseEnabled] = useState(true);
  const persistedVisualPulseRef = useRef(true);

  // Draft state (NOT persisted until Save)
  const [pausePrefs, setPausePrefs] = useState<BrPausePrefs>(
    DEFAULT_BR_PAUSE_PREFS
  );
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [hapticsIntensity, setHapticsIntensity] =
    useState<HapticsIntensity>("med");
  const [breathHapticsEnabled, setBreathHapticsEnabled] = useState(false);

  // Persisted snapshots (for dirty/Save enabled)
  const persistedPauseRef = useRef<BrPausePrefs>(DEFAULT_BR_PAUSE_PREFS);
  const persistedVoiceRef = useRef<VoiceGender>("female");
  const persistedHapticsRef = useRef<{
    enabled: boolean;
    intensity: HapticsIntensity;
    breath: boolean;
  }>({ enabled: true, intensity: "med", breath: false });

  // ✅ Infotoggle open state (shared; only one open at a time)
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);

  // 🔒 IMPORTANT: force re-render after saving (so Save disables immediately)
  const [persistVersion, setPersistVersion] = useState(0);

  // Toast (ALWAYS above everything)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2000);
  };

  // Locale
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem(LOCALE_KEY);
      if (saved === "en" || saved === "no") setLocale(saved as Locale);
    } catch { }
  }, [mounted]);

  // Load initial values once
  useEffect(() => {
    if (!mounted) return;

    // Breath mode
    const bmRaw = safeReadStr(BR_BREATH_MODE_KEY, "standard")
      .trim()
      .toLowerCase();
    const loadedMode: BreathMode =
      bmRaw === "release" || bmRaw === "deep-calm" || bmRaw === "stillness"
        ? (bmRaw as BreathMode)
        : "standard";
    persistedBreathModeRef.current = loadedMode;
    setBreathMode(loadedMode);

    // Visual pulse (default ON)
    const vpRaw = safeReadStr(BR_VISUAL_PULSE_KEY, "1");
    const loadedVP = vpRaw !== "0";
    persistedVisualPulseRef.current = loadedVP;
    setVisualPulseEnabled(loadedVP);

    // Pause prefs
    const p = safeReadJson<Partial<BrPausePrefs>>(
      BR_PAUSE_PREFS_KEY,
      DEFAULT_BR_PAUSE_PREFS
    );
    const preset: PausePreset =
      p.preset === "alwaysHideAll" ||
        p.preset === "alwaysShowAll" ||
        p.preset === "none"
        ? p.preset
        : "none";

    const loadedPause: BrPausePrefs = {
      preset,
      hideText: !!p.hideText,
      hideMenuButtons: !!p.hideMenuButtons,
      hideSpeedBar: !!p.hideSpeedBar,
      hideVoiceToggle: !!p.hideVoiceToggle,
    };
    persistedPauseRef.current = loadedPause;
    setPausePrefs(loadedPause);

    // Voice gender
    const vg = safeReadStr(BR_VOICE_GENDER_KEY, "female").toLowerCase();
    const loadedVoice: VoiceGender =
      vg === "male" || vg === "female" ? vg : "female";
    persistedVoiceRef.current = loadedVoice;
    setVoiceGender(loadedVoice);

    // Haptics enabled
    const heRaw = safeReadStr(BR_HAPTICS_KEY, "1");
    const loadedEnabled = heRaw !== "0";
    setHapticsEnabled(loadedEnabled);

    // Haptics intensity
    const hiRaw = safeReadStr(BR_HAPTICS_INTENSITY_KEY, "med").toLowerCase();
    const loadedIntensity: HapticsIntensity = isIntensity(hiRaw) ? hiRaw : "med";
    setHapticsIntensity(loadedIntensity);

    // Breath haptics
    const bhRaw = safeReadStr(BR_BREATH_HAPTICS_KEY, "0");
    const loadedBreath = bhRaw === "1";
    setBreathHapticsEnabled(loadedBreath);

    persistedHapticsRef.current = {
      enabled: loadedEnabled,
      intensity: loadedIntensity,
      breath: loadedBreath,
    };
  }, [mounted]);

  const title =
    locale === "no" ? "Personlige innstillinger" : "Personal settings";

  const sectionTitle = "text-sm md:text-base font-medium text-[var(--text)]";
  const sectionDesc = "text-xs md:text-sm text-[var(--muted)] leading-snug";

  const glassCard = [
    "w-full max-w-full",
    "rounded-2xl",
    "border border-[rgba(255,255,255,0.18)]",
    "backdrop-blur-xl",
    "overflow-hidden",
  ].join(" ");

  const cardInner = "px-4 py-4 md:px-5 md:py-5";
  const divider = "h-px bg-[rgba(255,255,255,0.10)]";

  const rowBase = [
    "w-full max-w-full",
    "flex items-center justify-between gap-3",
    "py-3.5 md:py-4",
    "transition",
    "hover:bg-[rgba(255,255,255,0.06)]",
    "active:scale-[0.998]",
    "px-4 md:px-5",
    "overflow-hidden",
  ].join(" ");

  const rowLabel = "text-sm md:text-base text-[var(--text)]";
  const rowSub = "text-xs md:text-sm text-[var(--muted)] leading-snug";

  // Premium pills (glass)
  const pillBase = [
    "inline-flex items-center justify-center gap-2",
    "rounded-full",
    "px-4 py-2 md:px-5",
    "text-sm md:text-base font-medium",
    "select-none",
    "transition",
    "max-w-full",
  ].join(" ");

  const pillOn = "ring-2 ring-[rgba(255,255,255,0.36)]";

  const pillStyle = (active: boolean) => ({
    border: active
      ? "1px solid rgba(255,255,255,0.42)"
      : "1px solid rgba(255,255,255,0.26)",
    background: active
      ? "linear-gradient(180deg, rgba(255,255,255,0.20), rgba(0,0,0,0.14))"
      : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.22))",
    boxShadow: active
      ? "0 20px 44px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,0.22)"
      : "0 12px 28px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.12)",
    color: "var(--text)",
  });

  const canUseBreathHaptics = isPro && hapticsEnabled;

  const pauseDesc =
    pausePrefs.preset === "alwaysHideAll"
      ? locale === "no"
        ? "I pusterom: hold en finger i 2 sek på skjermen for å vise elementene igjen."
        : "In Breathing Room: Press and hold anywhere on the screen for 2s to show elements again."
      : locale === "no"
        ? "Velg hva som skjules når du går inn i pause-modus."
        : "Choose what hides when you enter pause mode.";

  const isPauseDirty = useMemo(() => {
    return !pausePrefsEqual(pausePrefs, persistedPauseRef.current);
  }, [pausePrefs, persistVersion]);

  const isVoiceDirty = useMemo(() => {
    return voiceGender !== persistedVoiceRef.current;
  }, [voiceGender, persistVersion]);

  const isHapticsDirty = useMemo(() => {
    const p = persistedHapticsRef.current;
    return (
      hapticsEnabled !== p.enabled ||
      hapticsIntensity !== p.intensity ||
      breathHapticsEnabled !== p.breath
    );
  }, [hapticsEnabled, hapticsIntensity, breathHapticsEnabled, persistVersion]);

  const isBreathModeDirty = useMemo(() => {
    return (
      breathMode !== persistedBreathModeRef.current ||
      visualPulseEnabled !== persistedVisualPulseRef.current
    );
  }, [breathMode, visualPulseEnabled, persistVersion]);

  const savePauseSection = () => {
    if (!isPauseDirty) return;
    safeWriteJson(BR_PAUSE_PREFS_KEY, pausePrefs);
    persistedPauseRef.current = pausePrefs;
    setPersistVersion((v) => v + 1);
    announceSettingsChanged();
    showToast(locale === "no" ? "Innstillinger lagret" : "Settings saved");
  };

  const saveHapticsSection = () => {
    if (!isHapticsDirty) return;
    safeWriteStr(BR_HAPTICS_KEY, hapticsEnabled ? "1" : "0");
    safeWriteStr(BR_HAPTICS_INTENSITY_KEY, hapticsIntensity);
    safeWriteStr(BR_BREATH_HAPTICS_KEY, breathHapticsEnabled ? "1" : "0");
    persistedHapticsRef.current = {
      enabled: hapticsEnabled,
      intensity: hapticsIntensity,
      breath: breathHapticsEnabled,
    };
    setPersistVersion((v) => v + 1);
    announceSettingsChanged();
    showToast(locale === "no" ? "Innstillinger lagret" : "Settings saved");
  };

  const saveBreathModeSection = () => {
    if (!isBreathModeDirty) return;

    safeWriteStr(BR_BREATH_MODE_KEY, breathMode);
    persistedBreathModeRef.current = breathMode;

    safeWriteStr(BR_VISUAL_PULSE_KEY, visualPulseEnabled ? "1" : "0");
    persistedVisualPulseRef.current = visualPulseEnabled;

    setPersistVersion((v) => v + 1);
    announceSettingsChanged();
    showToast(locale === "no" ? "Innstillinger lagret" : "Settings saved");
  };

  const saveVoiceSection = () => {
    if (!isVoiceDirty) return;
    safeWriteStr(BR_VOICE_GENDER_KEY, voiceGender);
    persistedVoiceRef.current = voiceGender;
    setPersistVersion((v) => v + 1);
    announceSettingsChanged();
    showToast(locale === "no" ? "Innstillinger lagret" : "Settings saved");
  };

  const resetBreathingRoomSettings = () => {
    const nextPause: BrPausePrefs = DEFAULT_BR_PAUSE_PREFS;
    const nextVoice: VoiceGender = "female";
    const nextEnabled = true;
    const nextIntensity: HapticsIntensity = "med";
    const nextBreath = false;

    // Reset breath mode + visual pulse
    const nextBreathMode: BreathMode = "standard";
    const nextVisualPulse = true;

    setBreathMode(nextBreathMode);
    setVisualPulseEnabled(nextVisualPulse);
    safeWriteStr(BR_BREATH_MODE_KEY, nextBreathMode);
    safeWriteStr(BR_VISUAL_PULSE_KEY, "1");
    persistedBreathModeRef.current = nextBreathMode;
    persistedVisualPulseRef.current = nextVisualPulse;

    setPausePrefs(nextPause);
    setVoiceGender(nextVoice);
    setHapticsEnabled(nextEnabled);
    setHapticsIntensity(nextIntensity);
    setBreathHapticsEnabled(nextBreath);

    safeWriteJson(BR_PAUSE_PREFS_KEY, nextPause);
    safeWriteStr(BR_VOICE_GENDER_KEY, nextVoice);
    safeWriteStr(BR_HAPTICS_KEY, "1");
    safeWriteStr(BR_HAPTICS_INTENSITY_KEY, nextIntensity);
    safeWriteStr(BR_BREATH_HAPTICS_KEY, "0");

    persistedPauseRef.current = nextPause;
    persistedVoiceRef.current = nextVoice;
    persistedHapticsRef.current = {
      enabled: nextEnabled,
      intensity: nextIntensity,
      breath: nextBreath,
    };

    setPersistVersion((v) => v + 1);

    announceSettingsChanged();
    showToast(locale === "no" ? "Innstillinger lagret" : "Settings saved");
  };

  if (!mounted) return <main className="min-h-[100svh]" />;

  // ✅ locked alignment params
  const infoRowWrap = "flex items-stretch gap-3 w-full";
  const infoRightCol =
    "w-[44px] shrink-0 flex items-center justify-center overflow-visible";

  return (
    <main
      className={[
        "min-h-[100dvh] w-full overflow-x-hidden",
        "pb-[max(16px,env(safe-area-inset-bottom))]",
      ].join(" ")}
      style={{
        background:
          "radial-gradient(1200px 520px at 50% -140px, rgba(255,255,255,0.12), transparent 55%), var(--br-grain)",
      }}
    >
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            zIndex: 999999,
            top: "calc(env(safe-area-inset-top) + 16px)",
          }}
        >
          <div
            className={[
              "inline-flex items-center justify-center",
              "rounded-full px-4 py-2",
              "text-xs md:text-sm",
              "border border-[rgba(255,255,255,0.22)]",
              "text-[var(--text)]",
            ].join(" ")}
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.26), rgba(0,0,0,0.12))",
              boxShadow:
                "0 18px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10)",
              backdropFilter: "blur(16px)",
            }}
          >
            {toast}
          </div>
        </div>
      )}

      <div
        className={[
          "sticky top-0",
          "backdrop-blur-xl",
          "bg-[rgba(0,0,0,0.18)]",
          "border-b border-[rgba(255,255,255,0.10)]",
        ].join(" ")}
        style={{
          zIndex: 60,
          minHeight: "calc(env(safe-area-inset-top) + 72px)",
          boxShadow:
            "0 18px 45px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.10)",
        }}
      >
        <div
          className={["max-w-2xl mx-auto", "px-4 md:px-8", "pb-5"].join(" ")}
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/breathingroom")}
              className={[
                "rounded-full px-6 py-3 md:px-7 md:py-3.5",
                "text-sm md:text-base font-medium",
                "transition",
                "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
              ].join(" ")}
              style={{
                border: "1px solid rgba(255,255,255,0.26)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.22))",
                boxShadow:
                  "0 12px 28px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.12)",
                color: "var(--text)",
              }}
              aria-label={locale === "no" ? "Tilbake" : "Back"}
            >
              {locale === "no" ? "Tilbake" : "Back"}
            </button>

            <div className="text-sm md:text-base font-medium text-[var(--text)]">
              {title}
            </div>

            <div className="w-[92px]" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8">
        <div className="mt-4 md:mt-6 grid gap-4 md:gap-5 max-w-2xl mx-auto">
          {/* Pause-mode */}
          <section
            className={glassCard}
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.18))",
              boxShadow:
                "0 18px 55px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <div className={cardInner}>
              <div className={infoRowWrap}>
                <div className="flex-1 min-w-0">
                  <div className={sectionTitle}>
                    {locale === "no" ? "Pause-modus" : "Pause mode"}
                  </div>
                </div>

                <div className={infoRightCol}>
                  <InfoToggle
                    id="info-section-pause"
                    locale={locale}
                    openId={openInfoId}
                    setOpenId={setOpenInfoId}
                    textNo={INFO.section.pauseMode.no}
                    textEn={INFO.section.pauseMode.en}
                  />
                </div>
              </div>

              <div className={[sectionDesc, "mt-1"].join(" ")}>{pauseDesc}</div>

              <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
                <button
                  type="button"
                  className={[
                    pillBase,
                    "w-full sm:w-auto",
                    pausePrefs.preset === "alwaysHideAll" ? pillOn : "",
                  ].join(" ")}
                  style={pillStyle(pausePrefs.preset === "alwaysHideAll")}
                  onClick={() =>
                    setPausePrefs({
                      preset: "alwaysHideAll",
                      hideText: true,
                      hideMenuButtons: true,
                      hideSpeedBar: true,
                      hideVoiceToggle: true,
                    })
                  }
                >
                  <span>{locale === "no" ? "Skjul alt" : "Hide all"}</span>
                  <EyeIcon closed className="h-4 w-4 opacity-95" />
                </button>

                <button
                  type="button"
                  className={[
                    pillBase,
                    "w-full sm:w-auto",
                    pausePrefs.preset === "alwaysShowAll" ? pillOn : "",
                  ].join(" ")}
                  style={pillStyle(pausePrefs.preset === "alwaysShowAll")}
                  onClick={() =>
                    setPausePrefs({
                      preset: "alwaysShowAll",
                      hideText: false,
                      hideMenuButtons: false,
                      hideSpeedBar: false,
                      hideVoiceToggle: false,
                    })
                  }
                >
                  <span>{locale === "no" ? "Vis alt" : "Show all"}</span>
                  <EyeIcon closed={false} className="h-4 w-4 opacity-95" />
                </button>

                <button
                  type="button"
                  className={[
                    pillBase,
                    "w-full sm:w-auto",
                    pausePrefs.preset === "none" ? pillOn : "",
                  ].join(" ")}
                  style={pillStyle(pausePrefs.preset === "none")}
                  onClick={() => setPausePrefs((p) => ({ ...p, preset: "none" }))}
                >
                  <span>{locale === "no" ? "Tilpass" : "Customize"}</span>
                  <span
                    className="inline-flex items-center gap-1 opacity-95"
                    aria-hidden="true"
                  >
                    <EyeIcon closed={false} className="h-4 w-4" />
                    <EyeIcon closed className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </div>

            <div className={divider} />

            <div className="py-1">
              {(
                [
                  {
                    key: "hideText",
                    label: locale === "no" ? "Skjul tekst" : "Hide text",
                    value: pausePrefs.hideText,
                  },
                  {
                    key: "hideMenuButtons",
                    label:
                      locale === "no"
                        ? "Skjul meny/knapper"
                        : "Hide menu/buttons",
                    value: pausePrefs.hideMenuButtons,
                  },
                  {
                    key: "hideSpeedBar",
                    label: locale === "no" ? "Skjul hastighet" : "Hide speed bar",
                    value: pausePrefs.hideSpeedBar,
                  },
                  {
                    key: "hideVoiceToggle",
                    label:
                      locale === "no" ? "Skjul stemme-knapp" : "Hide voice toggle",
                    value: pausePrefs.hideVoiceToggle,
                  },
                ] as Array<{
                  key: keyof BrPausePrefs;
                  label: string;
                  value: boolean;
                }>
              ).map((it, idx, arr) => (
                <div key={String(it.key)}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={rowBase}
                    onClick={() =>
                      setPausePrefs((p) => ({
                        ...p,
                        preset: "none",
                        [it.key]: !p[it.key],
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPausePrefs((p) => ({
                          ...p,
                          preset: "none",
                          [it.key]: !p[it.key],
                        }));
                      }
                    }}
                    aria-label={it.label}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className={rowLabel}>{it.label}</div>
                    </div>

                    <EyeToggle
                      checked={it.value}
                      onToggle={() =>
                        setPausePrefs((p) => ({
                          ...p,
                          preset: "none",
                          [it.key]: !p[it.key],
                        }))
                      }
                      ariaLabel={it.label}
                      invertIcon
                    />
                  </div>

                  {idx !== arr.length - 1 && <div className={divider} />}
                </div>
              ))}
            </div>

            <SaveBar
              onSave={savePauseSection}
              label={locale === "no" ? "Lagre" : "Save"}
              disabled={!isPauseDirty}
            />
          </section>

          {/* Breath mode */}
          <section
            className={glassCard}
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.20))",
              boxShadow:
                "0 18px 55px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <div className={cardInner}>
              <div className={infoRowWrap}>
                <div className="flex-1 min-w-0">
                  <div className={sectionTitle}>
                    {locale === "no" ? "Pustemodus" : "Breathing mode"}
                  </div>
                </div>

                {/* ✅ MASTER ONLY */}
                <div className={infoRightCol}>
                  <InfoToggle
                    id="info-section-breathingmode"
                    locale={locale}
                    openId={openInfoId}
                    setOpenId={setOpenInfoId}
                    textNo={INFO.section.breathingMode.no}
                    textEn={INFO.section.breathingMode.en}
                  />
                </div>
              </div>

              <div className={[sectionDesc, "mt-1"].join(" ")}>
                {locale === "no"
                  ? "Hvilken modus føles komfortabelt i dag?."
                  : "Which mode feels more comfortable now?"}
              </div>

              {/* ✅ NO per-mode info toggles anymore */}
              <div className="mt-4 flex flex-col gap-2">
                {(
                  [
                    {
                      id: "standard",
                      title: locale === "no" ? "Standard" : "Standard",
                      desc:
                        locale === "no"
                          ? "Din standard pause opplevelse."
                          : "Your standard pause experience.",
                      Icon: IconDot,
                    },
                    {
                      id: "release",
                      title: locale === "no" ? "Slipp" : "Release",
                      desc:
                        locale === "no"
                          ? "For når tankene går fort."
                          : "When your thoughts won’t slow down.",
                      Icon: IconLeaf,
                    },
                    {
                      id: "deep-calm",
                      title: locale === "no" ? "Dyp ro" : "Deep calm",
                      desc:
                        locale === "no"
                          ? "For når kroppen er urolig."
                          : "When your body feels unsettled.",
                      Icon: IconMoon,
                    },
                    {
                      id: "stillness",
                      title: locale === "no" ? "Stillhet" : "Stillness",
                      desc:
                        locale === "no"
                          ? "For når du vil helt ned i hvile."
                          : "When you want to sink into deep rest.",
                      Icon: IconZen,
                    },
                  ] as Array<{
                    id: BreathMode;
                    title: string;
                    desc: string;
                    Icon: React.ComponentType<{ className?: string }>;
                  }>
                ).map((m) => {
                  const active = breathMode === m.id;

                  return (
                    <div key={m.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={[
                          "w-full",
                          "min-w-0",
                          "text-left",
                          "rounded-2xl",
                          "px-4 py-3.5 md:px-5 md:py-4",
                          "border",
                          "transition",
                          active ? "ring-2 ring-[rgba(255,255,255,0.28)]" : "",
                        ].join(" ")}
                        style={{
                          border: active
                            ? "1px solid rgba(255,255,255,0.42)"
                            : "1px solid rgba(255,255,255,0.22)",
                          background: active
                            ? "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.14))"
                            : "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.20))",
                          boxShadow: active
                            ? "0 18px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)"
                            : "0 12px 28px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.10)",
                          color: "var(--text)",
                        }}
                        onClick={() => setBreathMode(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setBreathMode(m.id);
                          }
                        }}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="mt-[2px] shrink-0"
                            aria-hidden="true"
                          >
                            <m.Icon
                              className={[
                                "h-6 w-6 transition-opacity duration-200",
                                active ? "opacity-100" : "opacity-50",
                              ].join(" ")}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm md:text-base font-medium">
                              {m.title}
                            </div>
                            <div className="mt-0.5 text-xs md:text-sm text-[var(--muted)] leading-snug">
                              {m.desc}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Visual pulse toggle */}
              <div className="mt-4">
                <div className={infoRowWrap}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm md:text-base font-medium text-[var(--text)]">
                      {locale === "no"
                        ? "Lyspuls på sirkelen"
                        : "Circle light pulse"}
                    </div>
                  </div>

                  <div className={infoRightCol}>
                    <InfoToggle
                      id="info-section-visualpulse"
                      locale={locale}
                      openId={openInfoId}
                      setOpenId={setOpenInfoId}
                      textNo={INFO.section.visualPulse.no}
                      textEn={INFO.section.visualPulse.en}
                    />
                  </div>
                </div>

                <div className="mt-1 text-xs md:text-sm text-[var(--muted)] leading-snug">
                  {locale === "no"
                    ? "Rolige visuelle blink synket med vibrasjon"
                    : "Gentle visual flashes synced with haptics"}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      !visualPulseEnabled ? pillOn : "",
                    ].join(" ")}
                    style={pillStyle(!visualPulseEnabled)}
                    onClick={() => setVisualPulseEnabled(false)}
                  >
                    {locale === "no" ? "Av" : "Off"}
                  </button>

                  <button
                    type="button"
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      visualPulseEnabled ? pillOn : "",
                    ].join(" ")}
                    style={pillStyle(visualPulseEnabled)}
                    onClick={() => setVisualPulseEnabled(true)}
                  >
                    {locale === "no" ? "På" : "On"}
                  </button>
                </div>
              </div>
            </div>

            <SaveBar
              onSave={saveBreathModeSection}
              label={locale === "no" ? "Lagre" : "Save"}
              disabled={!isBreathModeDirty}
            />
          </section>

          {/* Haptics */}
          <section
            className={glassCard}
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.20))",
              boxShadow:
                "0 18px 55px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <div className={cardInner}>
              <div className={infoRowWrap}>
                <div className="flex-1 min-w-0">
                  <div className={sectionTitle}>
                    {locale === "no" ? "Vibrasjon" : "Haptics"}
                  </div>
                </div>

                {/* ✅ MASTER ONLY */}
                <div className={infoRightCol}>
                  <InfoToggle
                    id="info-section-haptics"
                    locale={locale}
                    openId={openInfoId}
                    setOpenId={setOpenInfoId}
                    textNo={INFO.section.haptics.no}
                    textEn={INFO.section.haptics.en}
                  />
                </div>
              </div>

              <div className={[sectionDesc, "mt-1"].join(" ")}>
                {locale === "no"
                  ? "Vibrasjons assistent for pusterom."
                  : "Vibration assist for Breathingroom."}
              </div>
            </div>

            <div className={divider} />

            <div className="py-1">
              <div
                className={rowBase}
                aria-label={locale === "no" ? "Vibrasjon" : "Vibration"}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className={rowLabel}>
                    {locale === "no" ? "Vibrasjon" : "Vibration"}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      !hapticsEnabled ? pillOn : "",
                    ].join(" ")}
                    style={pillStyle(!hapticsEnabled)}
                    onClick={() => setHapticsEnabled(false)}
                  >
                    {locale === "no" ? "Av" : "Off"}
                  </button>

                  <button
                    type="button"
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      hapticsEnabled ? pillOn : "",
                    ].join(" ")}
                    style={pillStyle(hapticsEnabled)}
                    onClick={() => {
                      setHapticsEnabled(true);
                      try {
                        getHaptics().confirmEnabled();
                      } catch { }
                    }}
                  >
                    {locale === "no" ? "På" : "On"}
                  </button>
                </div>
              </div>

              <div className={divider} />

              <div className={rowBase}>
                <div className="flex-1 min-w-0 pr-2">
                  <div className={rowLabel}>
                    {locale === "no" ? "Intensitet" : "Intensity"}
                  </div>

                  {!hapticsEnabled && (
                    <div className={rowSub}>
                      {locale === "no" ? "Vibrasjon påkrevd." : "Vibration required."}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(
                    [
                      ["low", locale === "no" ? "Lav" : "Low"],
                      ["med", locale === "no" ? "Medium" : "Medium"],
                      ["high", locale === "no" ? "Høy" : "High"],
                    ] as Array<[HapticsIntensity, string]>
                  ).map(([val, label]) => {
                    const active = hapticsIntensity === val;

                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={!hapticsEnabled}
                        className={[
                          pillBase,
                          "px-3 md:px-4",
                          active ? pillOn : "",
                          !hapticsEnabled ? "opacity-55 cursor-not-allowed" : "",
                        ].join(" ")}
                        style={pillStyle(active)}
                        onClick={() => {
                          if (!hapticsEnabled) return;

                          setHapticsIntensity(val);

                          try {
                            localStorage.setItem(BR_HAPTICS_INTENSITY_KEY, val);
                          } catch { }

                          announceSettingsChanged();

                          try {
                            getHaptics().previewIntensity(val);
                          } catch { }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={divider} />

              {/* ✅ Pustevibrasjon: NO individual info toggle anymore */}
              <div
                className={rowBase}
                aria-label={locale === "no" ? "Pustevibrasjon" : "Breath haptics"}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className={rowLabel}>
                    {locale === "no" ? "Pustevibrasjon" : "Breath haptics"}
                  </div>

                  <div className={rowSub}>
                    {!isPro
                      ? locale === "no"
                        ? "Pustevibrasjon er en Pro-funksjon."
                        : "Breath haptics is a Pro feature."
                      : !hapticsEnabled
                        ? locale === "no"
                          ? "Vibrasjon påkrevd."
                          : "Vibration required."
                        : locale === "no"
                          ? "Pust i vibrasjonsmønsteret."
                          : "Breathe to the vibration."}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!canUseBreathHaptics}
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      !breathHapticsEnabled ? pillOn : "",
                      !canUseBreathHaptics ? "opacity-55 cursor-not-allowed" : "",
                    ].join(" ")}
                    style={pillStyle(!breathHapticsEnabled)}
                    onClick={() => {
                      if (!canUseBreathHaptics) return;
                      setBreathHapticsEnabled(false);
                    }}
                  >
                    {locale === "no" ? "Av" : "Off"}
                  </button>

                  <button
                    type="button"
                    disabled={!canUseBreathHaptics}
                    className={[
                      pillBase,
                      "px-4 md:px-5",
                      breathHapticsEnabled ? pillOn : "",
                      !canUseBreathHaptics ? "opacity-55 cursor-not-allowed" : "",
                    ].join(" ")}
                    style={pillStyle(breathHapticsEnabled)}
                    onClick={() => {
                      if (!canUseBreathHaptics) return;

                      setBreathHapticsEnabled(true);
                      try {
                        getHaptics().confirmBreathEnabled();
                      } catch { }
                    }}
                  >
                    {locale === "no" ? "På" : "On"}
                  </button>
                </div>
              </div>
            </div>

            <SaveBar
              onSave={saveHapticsSection}
              label={locale === "no" ? "Lagre" : "Save"}
              disabled={!isHapticsDirty}
            />
          </section>

          {/* Voice */}
          <section
            className={glassCard}
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.20))",
              boxShadow:
                "0 18px 55px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <div className={cardInner}>
              <div className={infoRowWrap}>
                <div className="flex-1 min-w-0">
                  <div className={sectionTitle}>
                    {locale === "no" ? "Stemme" : "Voice"}
                  </div>
                </div>

                <div className={infoRightCol}>
                  <InfoToggle
                    id="info-section-voice"
                    locale={locale}
                    openId={openInfoId}
                    setOpenId={setOpenInfoId}
                    textNo={INFO.section.voice.no}
                    textEn={INFO.section.voice.en}
                  />
                </div>
              </div>

              <div className={[sectionDesc, "mt-1"].join(" ")}>
                {locale === "no"
                  ? "Valg lagres lokalt på enheten."
                  : "Saved locally on this device."}
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                {(
                  [
                    ["female", locale === "no" ? "Kvinne" : "Female"],
                    ["male", locale === "no" ? "Mann" : "Male"],
                  ] as Array<[VoiceGender, string]>
                ).map(([val, label]) => {
                  const active = voiceGender === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      className={[pillBase, active ? pillOn : ""].join(" ")}
                      style={pillStyle(active)}
                      onClick={() => setVoiceGender(val)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <SaveBar
              onSave={saveVoiceSection}
              label={locale === "no" ? "Lagre" : "Save"}
              disabled={!isVoiceDirty}
            />
          </section>

          {/* Reset section */}
          <section
            className={glassCard}
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.22))",
              boxShadow:
                "0 18px 55px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <div className={cardInner}>
              <div className={sectionTitle}>
                {locale === "no"
                  ? "Nullstill Pusterom innstillinger"
                  : "Reset Breathingroom settings"}
              </div>
              <div className={[sectionDesc, "mt-1"].join(" ")}>
                {locale === "no"
                  ? "Tilbakestiller innstillingene for Pusterom til standard (pause-modus, vibrasjon og stemme). Påvirker ikke språk, tema eller dag/natt."
                  : "Resets Breathing Room settings to default (pause mode, haptics and voice). Does not affect language, theme or day/night."}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={resetBreathingRoomSettings}
                  className={[
                    "rounded-full",
                    "px-8 md:px-10 py-3 md:py-3.5",
                    "text-sm md:text-base font-medium",
                    "transition",
                    "focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
                    "active:scale-[0.99]",
                  ].join(" ")}
                  style={{
                    minWidth: "168px",
                    border: "1px solid rgba(255,255,255,0.26)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.24))",
                    boxShadow:
                      "0 16px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)",
                    color: "var(--text)",
                  }}
                >
                  {locale === "no" ? "Nullstill" : "Reset"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}