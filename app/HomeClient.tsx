// app/HomeClient.tsx
"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ProgressDots from "./components/ProgressDots";
import Title from "./components/Title";
import Card from "./components/Card";
import TopRow from "./components/TopRow";
import Subtitle from "./components/Subtitle";
import Question from "./components/Question";
import PrimaryButton from "./components/PrimaryButton";
import { ChoiceButton } from "./components/ChoiceButton";
import ThemeToggle from "./components/ThemeToggle";
import SecondaryButton from "./components/SecondaryButton";
import ThemeSheet from "./components/ThemeSheet";

import type { Choice, Step } from "./lib/pauseTypes";
import { getEndText, getGentleAdvice, getValidationText } from "./lib/pauseTextLogic";
import { UI_TEXT, type Locale } from "./data/uiText";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const STORAGE_KEY = "pause-state";
const STORAGE_VERSION = 1;
const LOCALE_KEY = "pause-locale";

type ResultText = {
  validation: string;
  advice: string;
  end: string;
};

const DEFAULT_CHOICE: Choice = {
  capacity: "Very low",
  load: null,
  boundary: "",
};

export default function HomeClient({ initialLocale }: { initialLocale: Locale }) {
  const doneRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const [step, setStep] = useState<Step>("welcome");
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE);
  const [resultText, setResultText] = useState<ResultText | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);

  const t = UI_TEXT[locale];

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);

    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {}

    try {
      document.cookie = `${LOCALE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {}
  }, []);

  const resetToStart = useCallback(() => {
    setStep("welcome");
    setChoice(DEFAULT_CHOICE);
    setResultText(null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Mount: sync locale from client storage once
  useEffect(() => {
    if (!mounted) return;

    try {
      const savedLocale = localStorage.getItem(LOCALE_KEY);
      if (savedLocale === "en" || savedLocale === "no") {
        setLocaleState(savedLocale);
      }
    } catch {}
  }, [mounted]);

  // Query param wins when present
  useEffect(() => {
    if (!mounted) return;

    const q = searchParams.get("lang");
    if (q === "en" || q === "no") {
      setLocale(q);
    }
  }, [mounted, searchParams, setLocale]);

  // Browser cache restore / pageshow sync
  useEffect(() => {
    if (!mounted) return;

    const sync = () => {
      try {
        const saved = localStorage.getItem(LOCALE_KEY);
        if (saved === "en" || saved === "no") {
          setLocaleState(saved);
        }
      } catch {}
    };

    window.addEventListener("pageshow", sync);
    return () => window.removeEventListener("pageshow", sync);
  }, [mounted]);

  // Keep storage + cookie in sync whenever locale changes after mount
  useEffect(() => {
    if (!mounted) return;

    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {}

    try {
      document.cookie = `${LOCALE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {}
  }, [mounted, locale]);

  // Load pause state on mount
  useEffect(() => {
    if (!mounted) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);

      if (parsed?.version !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (parsed?.day !== todayKey()) {
        localStorage.removeItem(STORAGE_KEY);
        resetToStart();
        return;
      }

      if (parsed?.step) setStep(parsed.step);
      if (parsed?.choice) setChoice(parsed.choice);
      if (parsed?.resultText) setResultText(parsed.resultText);
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, [mounted, resetToStart]);

  // Persist pause state
  useEffect(() => {
    if (!mounted) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          day: todayKey(),
          step,
          choice,
          resultText,
        })
      );
    } catch {}
  }, [mounted, step, choice, resultText]);

  // Generate result text when entering result
  useEffect(() => {
    if (step !== "result") {
      setResultText(null);
      return;
    }

    setResultText({
      validation: getValidationText(locale, choice),
      advice: getGentleAdvice(locale, choice),
      end: getEndText(locale),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Refresh result text if locale/choice changes while on result
  useEffect(() => {
    if (step !== "result") return;

    setResultText({
      validation: getValidationText(locale, choice),
      advice: getGentleAdvice(locale, choice),
      end: getEndText(locale),
    });
  }, [locale, choice, step]);

  const footer = (
    <div className="mt-6 text-center text-xs text-neutral-400 md:text-sm">
      {t.phaseLine}
      <button
        onClick={() => {
          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LOCALE_KEY);
          } catch {}

          setLocale("no");
          resetToStart();
        }}
        className="ml-2 underline underline-offset-2 hover:text-neutral-600"
        aria-label="Clear saved data"
        type="button"
      >
        {t.clearData}
      </button>
    </div>
  );

  const safeResult = useMemo(() => {
    return resultText ?? { validation: "", advice: "", end: "" };
  }, [resultText]);

  const hasBoundary = !!choice.boundary.trim();

  return (
    <main
      className={[
        "min-h-[100svh] w-full",
        "px-0 py-0",
        "md:flex md:items-center md:justify-center md:px-10 md:py-10",
        "xl:px-4 xl:py-6 xl:pt-6",
      ].join(" ")}
    >
      <div
        className={[
          "w-full pb-[env(safe-area-inset-bottom)]",
          "md:w-full md:max-w-[820px]",
          "xl:max-w-md",
        ].join(" ")}
      >
        <Card>
          {step === "welcome" && (
            <>
              <div className="pt-16 md:pt-16 xl:pt-0" />

              <div className="text-center">
                <Title>Pause</Title>
              </div>

              <div className="pt-3" />
              <div className="text-center text-lg md:text-xl xl:text-base">
                <Subtitle>{t.subtitle}</Subtitle>
              </div>

              <div className="absolute bottom-6 left-0 right-0 px-6 md:px-10">
                <button
                  type="button"
                  onClick={() => setThemeOpen(true)}
                  className={[
                    "w-full rounded-2xl px-5 py-3 text-sm md:text-sm",
                    "ring-1 ring-[color:var(--border)] border border-transparent",
                    "bg-[var(--surface)] text-[var(--text)]",
                    "hover:bg-[var(--surface-hover)] transition",
                  ].join(" ")}
                  aria-label={t.themeTitle}
                >
                  {t.themeTitle}
                </button>
              </div>

              <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} locale={locale} />

              <div className="absolute left-3 top-2">
                <button
                  type="button"
                  onClick={() => router.push(`/breathingroom?lang=${locale}`)}
                  aria-label={locale === "no" ? "Åpne pusterom" : "Open breathing room"}
                  className={[
                    "h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-full",
                    "border border-[color:var(--border)]",
                    "bg-[var(--surface)]",
                    "hover:bg-[var(--surface-hover)]",
                    "transition",
                  ].join(" ")}
                >
                  🫁
                </button>
              </div>

              <div className="absolute right-3 top-2 flex items-center gap-3">
                {mounted ? (
                  <>
                    <ThemeToggle />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLocale("no")}
                        aria-label="Switch to Norwegian"
                        className={[
                          "rounded-full p-0.5",
                          locale === "no"
                            ? "ring-2 ring-[color:var(--ring)]"
                            : "ring-1 ring-[color:var(--border)]",
                        ].join(" ")}
                      >
                        <img
                          src="/flags/nor.svg"
                          alt="Norsk"
                          className="h-6 w-6 md:h-7 md:w-7 rounded-full"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocale("en")}
                        aria-label="Switch to English"
                        className={[
                          "rounded-full p-0.5",
                          locale === "en"
                            ? "ring-2 ring-[color:var(--ring)]"
                            : "ring-1 ring-[color:var(--border)]",
                        ].join(" ")}
                      >
                        <img
                          src="/flags/gb-eng.svg"
                          alt="English"
                          className="h-6 w-6 md:h-7 md:w-7 rounded-full"
                        />
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex items-center gap-3 opacity-0 pointer-events-none"
                  >
                    <div className="h-9 w-12 md:h-10 md:w-14 rounded-full" />
                    <div className="flex gap-2">
                      <div className="h-7 w-7 md:h-8 md:w-8 rounded-full" />
                      <div className="h-7 w-7 md:h-8 md:w-8 rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-8 md:pt-10" />

              <div className="mt-4 text-center text-sm md:text-base xl:text-base text-[var(--muted)]">
                {t.justForTodayA}
                <br />
                <div className="pt-2" />
                {t.justForTodayB}
              </div>

              <div className="mt-10 md:mt-12">
                <PrimaryButton onClick={() => setStep("capacity")} ariaLabel={t.begin}>
                  {t.begin}
                </PrimaryButton>
              </div>
            </>
          )}

          {step === "capacity" && (
            <div
              className={[
                "fade-in flex flex-col",
                "min-h-[100svh]",
                "md:min-h-0",
              ].join(" ")}
            >
              <TopRow
                onBack={() => setStep("welcome")}
                onHome={() => setStep("welcome")}
                showHome
                locale={locale}
              />
              <ProgressDots current={1} total={4} />

              <div className="mt-1 mb-4 md:mt-4 md:mb-6" />

              <div className="text-center">
                <Title>{t.today}</Title>
              </div>
              <div className="text-center">
                <Question>{t.qCapacity}</Question>
              </div>

              <div className="mt-10 md:mt-8" />

              <div className="space-y-3 md:space-y-5">
                <ChoiceButton
                  selected={choice.capacity === "Very low"}
                  onClick={() => {
                    setChoice((c) => ({ ...c, capacity: "Very low" }));
                    setTimeout(() => setStep("load"), 300);
                  }}
                >
                  {t.capacityOptions["Very low"]}
                </ChoiceButton>

                <ChoiceButton
                  selected={choice.capacity === "Low"}
                  onClick={() => {
                    setChoice((c) => ({ ...c, capacity: "Low" }));
                    setTimeout(() => setStep("load"), 300);
                  }}
                >
                  {t.capacityOptions["Low"]}
                </ChoiceButton>

                <ChoiceButton
                  selected={choice.capacity === "Some"}
                  onClick={() => {
                    setChoice((c) => ({ ...c, capacity: "Some" }));
                    setTimeout(() => setStep("load"), 300);
                  }}
                >
                  {t.capacityOptions["Some"]}
                </ChoiceButton>
              </div>

              <div className="h-10 md:h-6" />
            </div>
          )}

          {step === "load" && (
            <div
              className={[
                "fade-in flex flex-col",
                "min-h-[100svh]",
                "md:min-h-0",
              ].join(" ")}
            >
              <TopRow
                onBack={() => setStep("capacity")}
                onHome={() => setStep("welcome")}
                showHome
                locale={locale}
              />
              <ProgressDots current={2} total={4} />

              <div className="mt-1 mb-4 md:mt-4 md:mb-6" />

              <div className="text-center">
                <Title>{t.today}</Title>
              </div>
              <div className="text-center">
                <Question>{t.qLoad}</Question>
              </div>

              <div className="mt-6 md:mt-8" />

              <div className="space-y-3 md:space-y-5">
                {(
                  [
                    "Mind racing",
                    "Body heavy",
                    "Expectations",
                    "Brain Fog",
                    "Everything feels heavy",
                    "I feel a little okay today",
                  ] as const
                ).map((item) => (
                  <ChoiceButton
                    key={item}
                    selected={choice.load === item}
                    onClick={() => {
                      setChoice((c) => ({ ...c, load: item }));
                      setTimeout(() => setStep("boundary"), 200);
                    }}
                  >
                    {t.loadOptions[item]}
                  </ChoiceButton>
                ))}
              </div>

              <div className="h-10 md:h-6" />

              <div className="mt-6 xl:hidden">
                <SecondaryButton onClick={() => setStep("capacity")} ariaLabel={t.goBack}>
                  {t.goBack}
                </SecondaryButton>
              </div>
            </div>
          )}

          {step === "boundary" && (
            <div className="fade-in">
              <TopRow
                onBack={() => setStep("load")}
                onHome={() => setStep("welcome")}
                showHome
                locale={locale}
              />
              <ProgressDots current={3} total={4} />
              <div className="mt-1 mb-4 md:mt-4 md:mb-6" />

              <div className="text-center">
                <Title>{t.today}</Title>
              </div>
              <div className="text-center">
                <Question>{t.qBoundary}</Question>
              </div>

              <div className="mt-4 text-sm md:text-base text-[var(--muted)] text-center">
                {t.optional}
              </div>

              <div className="mt-6 pb-40 sm:pb-0 md:mt-10">
                <textarea
                  aria-label="Boundary"
                  className={[
                    "w-full rounded-xl p-3 md:p-4 text-base md:text-lg leading-6 outline-none",
                    "border",
                    "bg-[color:var(--field-bg,rgba(255,255,255,0.72))]",
                    "text-[color:var(--field-text,rgba(10,14,20,0.92))]",
                    "placeholder:text-[color:var(--field-placeholder,rgba(10,14,20,0.55))]",
                    "border-[color:var(--field-border,rgba(255,255,255,0.85))]",
                    "caret-[color:var(--field-text,rgba(10,14,20,0.92))]",
                    "focus:ring-2 focus:ring-[color:var(--field-border,rgba(255,255,255,0.85))]",
                    "dark:bg-[color:var(--field-bg,rgba(0,0,0,0.42))]",
                    "dark:text-[color:var(--field-text,rgba(255,255,255,0.92))]",
                    "dark:placeholder:text-[color:var(--field-placeholder,rgba(255,255,255,0.55))]",
                    "dark:border-[color:var(--field-border,rgba(255,255,255,0.55))]",
                    "dark:focus:ring-[color:var(--field-border,rgba(255,255,255,0.55))]",
                  ].join(" ")}
                  rows={4}
                  placeholder={t.boundaryPlaceholder}
                  value={choice.boundary}
                  onChange={(e) => setChoice((c) => ({ ...c, boundary: e.target.value }))}
                  onFocus={() => {
                    setTimeout(() => {
                      doneRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                      });
                    }, 350);
                  }}
                />
              </div>

              <div className="mt-8">
                <div ref={doneRef}>
                  <PrimaryButton
                    onClick={() => setTimeout(() => setStep("result"), 300)}
                    ariaLabel={t.done}
                  >
                    {t.done}
                  </PrimaryButton>
                </div>

                <div className="mt-6 xl:hidden">
                  <SecondaryButton onClick={() => setStep("load")} ariaLabel={t.goBack}>
                    {t.goBack}
                  </SecondaryButton>
                </div>
              </div>
            </div>
          )}

          {step === "result" && (
            <div className="fade-in">
              <TopRow
                onBack={() => setStep("boundary")}
                onHome={() => setStep("welcome")}
                showHome
                locale={locale}
              />
              <ProgressDots current={4} total={4} />
              <div className="mt-1 mb-4 md:mt-4 md:mb-6" />

              <div className="text-center">
                <Title>{t.today}</Title>
              </div>

              <div className="mt-5 rounded-2xl bg-neutral-50 p-5 md:p-6">
                <div className="text-sm md:text-base text-neutral-700">
                  <b>{safeResult.validation}</b>
                </div>

                <div className="mt-5 text-xs md:text-sm text-neutral-500 tracking-wide">
                  {t.gentleLabel}
                </div>
                <div className="mt-2 text-sm md:text-base text-neutral-700">
                  {safeResult.advice}
                </div>

                {hasBoundary ? (
                  <>
                    <div className="mt-6 text-xs md:text-sm text-neutral-500 tracking-wide">
                      {t.doNotPushLabel}
                    </div>
                    <div className="mt-2 text-sm md:text-base text-neutral-700">
                      {choice.boundary.trim()}
                    </div>
                  </>
                ) : (
                  <div className="mt-6 text-center text-xs md:text-sm text-neutral-400">
                    {t.nothingAddedHint}
                  </div>
                )}
              </div>

              <div className="mt-4 text-sm md:text-base text-[var(--muted)] text-center">
                {safeResult.end}
              </div>

              <div className="mt-6 space-y-3 md:space-y-5">
                <PrimaryButton
                  onClick={() => router.push(`/breathingroom?lang=${locale}`)}
                  ariaLabel={t.openBreathingRoom}
                >
                  {t.breathingRoom}
                </PrimaryButton>

                <PrimaryButton
                  onClick={() => {
                    setStep("welcome");
                    setChoice(DEFAULT_CHOICE);
                    setResultText(null);
                  }}
                  ariaLabel={t.close}
                >
                  {t.close}
                </PrimaryButton>
              </div>
            </div>
          )}
        </Card>

        {footer}
      </div>
    </main>
  );
}