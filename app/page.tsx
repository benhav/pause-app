// app/page.tsx (SERVER COMPONENT)
import { cookies } from "next/headers";
import type { Locale } from "./data/uiText";
import HomeClient from "./HomeClient";

const LOCALE_KEY = "pause-locale";

async function getInitialLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_KEY)?.value;
  return saved === "en" ? "en" : "no";
}

export default async function Page() {
  const initialLocale = await getInitialLocale();
  return <HomeClient initialLocale={initialLocale} />;
}
