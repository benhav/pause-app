// app/lib/skin.ts
export type Skin = "classic" | "floating" | "nature" | "night-first";

export const SKIN_KEY = "pause-skin";

export function normalizeSkin(v: string | null | undefined): Skin {
  if (v === "classic" || v === "floating" || v === "nature" || v === "night-first") return v;
  // støtt gamle navn så du slipper kluss
  if (v === "nightfirst") return "night-first";
  return "classic";
}

export function getSavedSkin(): Skin {
  if (typeof window === "undefined") return "classic";
  try {
    return normalizeSkin(localStorage.getItem(SKIN_KEY));
  } catch {}
  return "classic";
}

function prefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export function getEffectiveSkin(skin: Skin): Skin {
  // Night-first: dark når system er dark, ellers classic
  if (skin === "night-first") return prefersDark() ? "night-first" : "classic";
  return skin;
}

export function applySkin(skin: Skin) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const effective = getEffectiveSkin(skin);

  // "valgt" (kan brukes til UI markering om du vil)
  root.dataset.skinSelected = skin;

  // "effektiv" (brukes av CSS)
  root.dataset.skin = effective; // <html data-skin="nature" />
}

export function setSkin(skin: Skin) {
  applySkin(skin);
  try {
    localStorage.setItem(SKIN_KEY, skin); // lagre valgt, ikke effektiv
  } catch {}
}

/**
 * Kall én gang i appen (f.eks i root layout eller provider)
 * så night-first oppdateres når systemtheme endres.
 */
export function startSkinEngine() {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => {};

  const handler = () => applySkin(getSavedSkin());
  mq.addEventListener?.("change", handler);

  return () => mq.removeEventListener?.("change", handler);
}
