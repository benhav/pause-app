// app/components/InfoToggle.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Locale } from "../data/uiText";
import { InfoButton } from "./InfoButton";

type Props = {
  id: string;
  locale: Locale | "no" | "en" | string;

  openId: string | null;
  setOpenId: (id: string | null) => void;

  textNo: string;
  textEn: string;

  stopPropagation?: boolean;
};

export default function InfoToggle({
  id,
  locale,
  openId,
  setOpenId,
  textNo,
  textEn,
  stopPropagation,
}: Props) {
  const isOpen = openId === id;

  const text = useMemo(() => {
    const raw = locale === "no" ? textNo : textEn;
    return (raw ?? "").trim();
  }, [locale, textNo, textEn]);

  const hasText = text.length > 0;

  const close = () => setOpenId(null);

  // Prevent background scroll while open + ESC + Back button closes (premium)
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.documentElement.style.overflow;
    const prevOverscroll = (document.documentElement.style as any).overscrollBehaviorY;

    document.documentElement.style.overflow = "hidden";
    (document.documentElement.style as any).overscrollBehaviorY = "none";

    // ⭐ Premium: push a history state so Android/Browser Back closes the modal
    try {
      history.pushState({ __pause_info: true, id }, "");
    } catch {
      // ignore
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    const onPopState = () => close();

    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      (document.documentElement.style as any).overscrollBehaviorY = prevOverscroll ?? "";

      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ✅ Prevent click-through: eat the gesture and delay closing until after the browser finishes the tap/click sequence.
  const closeScheduledRef = useRef(false);

  const scheduleCloseAfterGesture = () => {
    if (closeScheduledRef.current) return;
    closeScheduledRef.current = true;

    // Wait 2 RAFs so we definitely close AFTER pointerup/click has been fully resolved.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        closeScheduledRef.current = false;
        close();
      });
    });
  };

  const eatEvent = (e: any) => {
    if (stopPropagation) e.stopPropagation();
    e.preventDefault?.();
    e.stopPropagation?.();
  };

  return (
    <>
      <InfoButton
        size="sm"
        aria-label={locale === "no" ? "Info" : "Info"}
        aria-expanded={isOpen}
        disabled={!hasText}
        onClick={(e) => {
          if (!hasText) return;
          if (stopPropagation) e.stopPropagation();
          setOpenId(isOpen ? null : id);
        }}
      />

      {isOpen && hasText && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 999999, touchAction: "none" }}
          role="dialog"
          aria-label={locale === "no" ? "Info" : "Info"}
          // Capture early so nothing underneath ever sees the gesture
          onPointerDownCapture={(e) => {
            eatEvent(e);
            // do NOT close here (closing here is what causes click-through)
          }}
          onPointerUpCapture={(e) => {
            eatEvent(e);
            scheduleCloseAfterGesture();
          }}
          onClickCapture={(e) => {
            // Some browsers still fire click; eat it too.
            eatEvent(e);
            scheduleCloseAfterGesture();
          }}
        >
          {/* Backdrop + fade in */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-[infoFade_140ms_ease-out]" />

          {/* Centered glass panel */}
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div
              className={[
                "w-full",
                "max-w-[360px]",
                "rounded-2xl",
                "px-4 py-3",
                "border",
                "text-sm md:text-base",
                "leading-snug",
                "whitespace-pre-line",
                "animate-[infoPop_160ms_ease-out]",
              ].join(" ")}
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,18,22,0.74), rgba(10,10,14,0.66))",
                borderColor: "rgba(255,255,255,0.16)",
                boxShadow:
                  "0 26px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
                backdropFilter: "blur(20px)",
                color: "rgba(255,255,255,0.92)",
                maxHeight: "min(42vh, 320px)",
                overflow: "auto",
              }}
            >
              <div>{text}</div>
              <div className="mt-2 text-xs md:text-sm opacity-75">
                {locale === "no" ? "Trykk hvor som helst for å lukke" : "Tap anywhere to close"}
              </div>
            </div>
          </div>

          <style jsx>{`
            @keyframes infoFade {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes infoPop {
              from {
                opacity: 0;
                transform: translateY(10px) scale(0.985);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}