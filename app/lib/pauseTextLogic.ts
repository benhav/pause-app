import type { Choice, LoadCategory } from "./pauseTypes";
import type { Locale } from "../data/uiText";

import * as EN from "../data/textpacks.en";
import * as NO from "../data/textpacks.no";

type TextPacks = {
  END_TEXTS: readonly string[];
  EVERYTHING_HEAVY_VALIDATIONS: readonly string[];
  BODY_HEAVY_VALIDATIONS: readonly string[];
  BRAIN_FOG_VALIDATIONS: readonly string[];
  MIND_RACING_VALIDATIONS: readonly string[];
  EXPECTATIONS_VALIDATIONS: readonly string[];
  LITTLE_OKAY_VALIDATIONS: readonly string[];
  GENTLE_ADVICE_BY_LOAD: Record<LoadCategory, readonly string[]>;
};

function pickRandom(list: readonly string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function packs(locale: Locale): TextPacks {
  return (locale === "no" ? NO : EN) as unknown as TextPacks;
}

function validationMap(P: TextPacks): Record<LoadCategory, readonly string[]> {
  return {
    "Everything feels heavy": P.EVERYTHING_HEAVY_VALIDATIONS,
    "Body heavy": P.BODY_HEAVY_VALIDATIONS,
    "Brain Fog": P.BRAIN_FOG_VALIDATIONS,
    "Mind racing": P.MIND_RACING_VALIDATIONS,
    Expectations: P.EXPECTATIONS_VALIDATIONS,
    "I feel a little okay today": P.LITTLE_OKAY_VALIDATIONS,
  };
}

export function getEndText(locale: Locale) {
  const P = packs(locale);
  return pickRandom(P.END_TEXTS);
}

export function getValidationText(locale: Locale, choice: Choice) {
  const P = packs(locale);
  const VALIDATIONS_BY_LOAD = validationMap(P);

  const fallbackLoad: LoadCategory = "Everything feels heavy";
  const load = choice.load ?? fallbackLoad;

  const list =
    VALIDATIONS_BY_LOAD[load] ?? VALIDATIONS_BY_LOAD[fallbackLoad];

  return pickRandom(list);
}

export function getGentleAdvice(locale: Locale, choice: Choice) {
  const P = packs(locale);

  const fallbackLoad: LoadCategory = "Everything feels heavy";
  const load = choice.load ?? fallbackLoad;

  const list =
    P.GENTLE_ADVICE_BY_LOAD[load] ?? P.GENTLE_ADVICE_BY_LOAD[fallbackLoad];

  return pickRandom(list);
}
