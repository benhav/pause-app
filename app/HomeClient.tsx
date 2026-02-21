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
import { useAppPrefs } from "./AppProviders";

import type { Choice, Step } from "./lib/pauseTypes";
import { getEndText, getGentleAdvice, getValidationText } from "./lib/pauseTextLogic";
import { UI_TEXT, type Locale } from "./data/uiText";

function todayKey() {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
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

    const [locale, _setLocale] = useState<Locale>(initialLocale);

    function setLocale(next: Locale) {
        _setLocale(next);

        // localStorage (offline/klient)
        try {
            localStorage.setItem(LOCALE_KEY, next);
        } catch { }

        // cookie (for SSR)
        try {
            document.cookie = `${LOCALE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
        } catch { }
    }

    // Hvis vi kommer inn med ?lang=, bruk den
    useEffect(() => {
        const q = searchParams.get("lang");
        if (q === "en" || q === "no") setLocale(q);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Mobil: sync språk når siden gjenopprettes fra cache
    useEffect(() => {
        const sync = () => {
            try {
                const saved = localStorage.getItem(LOCALE_KEY);
                if (saved === "en" || saved === "no") _setLocale(saved);
            } catch { }
        };

        window.addEventListener("pageshow", sync);
        return () => window.removeEventListener("pageshow", sync);
    }, []);

    const t = UI_TEXT[locale];

    const [step, setStep] = useState<Step>("welcome");
    const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE);
    const [resultText, setResultText] = useState<ResultText | null>(null);

    const [themeOpen, setThemeOpen] = useState(false);

    // ✅ FIX: hent også setProDemo (du bruker den i ThemeSheet-props)
    const { proDemo, setProDemo } = useAppPrefs();

    const resetToStart = useCallback(() => {
        setStep("welcome");
        setChoice(DEFAULT_CHOICE);
        setResultText(null);
    }, []);

    // 1) Sync locale fra localStorage når vi er på klient (dersom bruker har valgt før)
    useEffect(() => {
        try {
            const savedLocale = localStorage.getItem(LOCALE_KEY);
            if (savedLocale === "en" || savedLocale === "no") {
                _setLocale(savedLocale);
            }
        } catch { }
    }, []);

    // 2) Sørg for at både localStorage + cookie følger locale når den endres
    useEffect(() => {
        try {
            localStorage.setItem(LOCALE_KEY, locale);
        } catch { }
        try {
            document.cookie = `${LOCALE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
        } catch { }
    }, [locale]);

    // Load state on mount (with version + day guard)
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        try {
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
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [resetToStart]);

    // Persist state
    useEffect(() => {
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
    }, [step, choice, resultText]);

    // Freeze randomized result texts (generate only on client, only when entering result)
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

    // If user changes language while on result, refresh frozen texts in that language
    useEffect(() => {
        if (step !== "result") return;

        setResultText({
            validation: getValidationText(locale, choice),
            advice: getGentleAdvice(locale, choice),
            end: getEndText(locale),
        });
    }, [locale, choice.load, step, choice.capacity, choice.boundary]);

    const footer = (
        <div className="mt-6 text-center text-xs text-neutral-400 md:text-sm">
            {t.phaseLine}
            <button
                onClick={() => {
                    try {
                        localStorage.removeItem(STORAGE_KEY);
                        localStorage.removeItem(LOCALE_KEY);
                    } catch { }
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
                // Mobil (default): uendret
                "px-0 py-0",
                // ✅ Tablet: litt “luft” + mer sentrert opplevelse uten å bli “desktop-kort”
                "md:px-8 md:py-10",
                // ✅ Kun store skjermer: valgfritt “kort i midten” (desktop er uinteressant, så vi skyver det opp)
                "xl:flex xl:items-center xl:justify-center xl:px-4 xl:py-6 xl:pt-6",
            ].join(" ")}
        >
            <div
                className={[
                    "w-full pb-[env(safe-area-inset-bottom)]",
                    // ✅ Tablet: begrens bredde litt + sentrer
                    "md:max-w-[680px] md:mx-auto",
                    // ✅ Desktop (om du bryr deg): samme som før
                    "xl:max-w-md",
                ].join(" ")}
            >
                <Card>
                    {step === "welcome" && (
                        <>
                            {/* Mobil: som før. Tablet: litt mindre “luft” på toppen */}
                            <div className="pt-16 md:pt-10 xl:pt-0" />

                            <Title>Pause</Title>

                            <div className="pt-3" />
                            <div className="text-center text-lg md:text-xl xl:text-base">
                                <Subtitle>{t.subtitle}</Subtitle>
                            </div>

                            {/* Theme button pinned bottom (kun welcome) */}
                            <div className="absolute bottom-6 left-0 right-0 px-6 md:px-10">
                                <button
                                    type="button"
                                    onClick={() => setThemeOpen(true)}
                                    className="w-full rounded-2xl px-4 py-4 md:py-5 md:text-base text-sm border bg-[var(--surface)] text-[var(--text)] border-[color:var(--border)]"
                                    aria-label={t.themeTitle}
                                >
                                    {t.themeTitle}
                                </button>
                            </div>

                            <ThemeSheet
                                open={themeOpen}
                                onClose={() => setThemeOpen(false)}
                                locale={locale}
                            />

                            {/* Breathing room shortcut */}
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

                            {/* Language + dark or light toggle */}
                            <div className="absolute right-3 top-2 flex items-center gap-3">
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
                                        <img src="/flags/nor.svg" alt="Norsk" className="h-6 w-6 md:h-7 md:w-7 rounded-full" />
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
                                        <img src="/flags/gb-eng.svg" alt="English" className="h-6 w-6 md:h-7 md:w-7 rounded-full" />
                                    </button>
                                </div>
                            </div>

                            <div className="pt-8 md:pt-10" />

                            <div className="mt-4 text-center text-sm md:text-base xl:text-base text-[var(--muted)]">
                                {t.justForTodayA}
                                <br />
                                <div className="pt-2" />
                                {t.justForTodayB}
                            </div>

                            <div className="mt-8 md:mt-10">
                                <PrimaryButton onClick={() => setStep("capacity")} ariaLabel={t.begin}>
                                    {t.begin}
                                </PrimaryButton>
                            </div>
                        </>
                    )}

                    {step === "capacity" && (
                        <div className="fade-in">
                            <TopRow onBack={() => setStep("welcome")} onHome={() => setStep("welcome")} showHome locale={locale} />
                            <ProgressDots current={1} total={4} />
                            <div className="mt-1 mb-4" />

                            <Title>{t.today}</Title>
                            <Question>{t.qCapacity}</Question>

                            <div className="mt-10 md:mt-20 space-y-3 md:space-y-6">
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
                        </div>
                    )}

                    {step === "load" && (
                        <div className="fade-in">
                            <TopRow onBack={() => setStep("capacity")} onHome={() => setStep("welcome")} showHome locale={locale} />
                            <ProgressDots current={2} total={4} />
                            <div className="mt-1 mb-4" />

                            <Title>{t.today}</Title>
                            <Question>{t.qLoad}</Question>

                            <div className="mt-6 md:mt-20 space-y-3 md:space-y-6">
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

                            <div className="mt-6 x1:hidden">
                                <SecondaryButton onClick={() => setStep("capacity")} ariaLabel={t.goBack}>
                                    {t.goBack}
                                </SecondaryButton>
                            </div>
                        </div>
                    )}

                    {step === "boundary" && (
                        <div className="fade-in">
                            <TopRow onBack={() => setStep("load")} onHome={() => setStep("welcome")} showHome locale={locale} />
                            <ProgressDots current={3} total={4} />
                            <div className="mt-1 mb-4" />

                            <Title>{t.today}</Title>
                            <Question>{t.qBoundary}</Question>

                            <div className="mt-4 text-sm md:text-base text-neutral-600">{t.optional}</div>

                            <div className="mt-6 pb-40 sm:pb-0 md:mt-20">
                                <textarea
                                    aria-label="Boundary"
                                    className={[
                                        "w-full rounded-xl p-3 md:p-4 text-base md:text-lg leading-6 outline-none",
                                        "border border-neutral-200 bg-[var(--app-bg)] text-neutral-900 placeholder-neutral-400",
                                        "focus:ring-2 focus:ring-neutral-200",

                                        // Dark mode
                                        "dark:border-neutral-700 dark:bg-neutral-600 dark:text-neutral-50 dark:placeholder-neutral-500",
                                        "dark:focus:ring-neutral-600",
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
                                    <PrimaryButton onClick={() => setTimeout(() => setStep("result"), 300)} ariaLabel={t.done}>
                                        {t.done}
                                    </PrimaryButton>
                                </div>

                                <div className="mt-6 x1:hidden">
                                    <SecondaryButton onClick={() => setStep("load")} ariaLabel={t.goBack}>
                                        {t.goBack}
                                    </SecondaryButton>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === "result" && (
                        <div className="fade-in">
                            <TopRow onBack={() => setStep("boundary")} onHome={() => setStep("welcome")} showHome locale={locale} />
                            <ProgressDots current={4} total={4} />
                            <div className="mt-1 mb-4 md:mt-2" />

                            <Title>{t.today}</Title>

                            <div className="mt-5 rounded-2xl bg-neutral-50 p-5 md:p-6">
                                <div className="text-sm md:text-base text-neutral-700">
                                    <b>{safeResult.validation}</b>
                                </div>

                                <div className="mt-5 text-xs md:text-sm text-neutral-500 tracking-wide">{t.gentleLabel}</div>
                                <div className="mt-2 text-sm md:text-base text-neutral-700">{safeResult.advice}</div>

                                {hasBoundary ? (
                                    <>
                                        <div className="mt-6 text-xs md:text-sm text-neutral-500 tracking-wide">{t.doNotPushLabel}</div>
                                        <div className="mt-2 text-sm md:text-base text-neutral-700">{choice.boundary.trim()}</div>
                                    </>
                                ) : (
                                    <div className="mt-6 text-center text-xs md:text-sm text-neutral-400">{t.nothingAddedHint}</div>
                                )}
                            </div>

                            <div className="mt-6 text-center text-sm md:text-base text-neutral-600">{safeResult.end}</div>

                            <div className="mt-6 space-y-3 md:space-y-6">
                                <PrimaryButton onClick={() => router.push(`/breathingroom?lang=${locale}`)} ariaLabel={t.openBreathingRoom}>
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