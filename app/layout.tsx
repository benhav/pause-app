import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import AppProviders from "./AppProviders";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pause",
  description: "Phase 1 prototype",
};

const THEME_KEY = "pause-theme"; // "light" | "dark" | (null => system)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Setter riktig theme før UI tegnes (hindrer flash + hydration-krøll)
  const THEME_KEY = "pause-theme";
  const SKIN_KEY = "pause-skin";

  const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem('${THEME_KEY}'); // "light" | "dark" | null
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

    var root = document.documentElement;
    root.classList.remove('dark');
    root.classList.remove('light');

    // Hvis bruker ikke har valgt manuelt: vi setter ingen class (så deres @media tar over)
    // MEN: deres ThemeToggle forventer "light"/"dark" når man har valgt manuelt 
    if (saved === 'light' || saved === 'dark') {
      root.classList.add(mode);
    } else {
      // system: vi setter bare dark-class for å holde logikken konsistent med resten
      if (mode === 'dark') root.classList.add('dark');
    }

    // Skin
    var skin = localStorage.getItem('${SKIN_KEY}');
    if (skin !== 'classic' && skin !== 'floating' && skin !== 'nature' && skin !== 'nightfirst') skin = 'classic';

    // Nightfirst i light -> fallback
    var isDark = root.classList.contains('dark');
    if (skin === 'nightfirst' && !isDark) skin = 'classic';

    root.dataset.skin = skin;
  } catch (e) {}
})();`;


  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
