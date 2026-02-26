import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Fraunces } from "next/font/google";

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

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pause",
  description: "Phase 1 prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const THEME_KEY = "pause-theme"; // "light" | "dark" | null (system)
  const SKIN_KEY = "pause-skin";
  const PRO_KEY = "pause-pro-demo";

  // BreathingRoom keys (separate fra app prefs)
  const BR_MODE_KEY = "pause-br-mode"; // "follow" | "light" | "dark"
  const BR_SKIN_KEY = "pause-br-skin"; // ThemeSkin (classic|floating|...|nightpro)

  const themeBootstrap = `
(function () {
  try {
    var THEME_KEY = '${THEME_KEY}';
    var SKIN_KEY  = '${SKIN_KEY}';
    var PRO_KEY   = '${PRO_KEY}';

    var BR_MODE_KEY = '${BR_MODE_KEY}';
    var BR_SKIN_KEY = '${BR_SKIN_KEY}';

    var path = (location && location.pathname) ? location.pathname : '';
    var isBR = path.indexOf('/breathingroom') === 0;

    // ---- MODE (app -> system fallback) ----
    var saved = localStorage.getItem(THEME_KEY); // "light"|"dark"|null
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

    // ---- BR MODE override (only on /breathingroom) ----
    if (isBR) {
      var brMode = localStorage.getItem(BR_MODE_KEY); // "follow"|"light"|"dark"|null
      if (brMode === 'light' || brMode === 'dark') {
        mode = brMode;
        // treat as "manual" so we set explicit class
        saved = brMode;
      }
      // "follow" => keep mode from app/system
    }

    var root = document.documentElement;
    root.classList.remove('dark');
    root.classList.remove('light');

    // If explicit manual choice (or BR forced): add light/dark class
    if (saved === 'light' || saved === 'dark') {
      root.classList.add(mode);
    } else {
      // system: only add dark when dark (light = no class)
      if (mode === 'dark') root.classList.add('dark');
    }

    // ---- SKIN (app) ----
    var valid = {
      classic: 1,
      floating: 1,
      nature: 1,
      nightpro: 1,
      desert: 1,
      ocean: 1,
      peaceful: 1,
      winter: 1
    };

    var skin = (localStorage.getItem(SKIN_KEY) || '').trim().toLowerCase();
    if (skin === 'night-pro') skin = 'nightpro';
    if (!valid[skin]) skin = 'classic';

    // ---- BR SKIN override (only on /breathingroom + pro) ----
    if (isBR) {
      var pro = localStorage.getItem(PRO_KEY) === '1';
      if (pro) {
        var brSkin = (localStorage.getItem(BR_SKIN_KEY) || '').trim().toLowerCase();
        if (brSkin === 'night-pro') brSkin = 'nightpro';
        if (valid[brSkin]) skin = brSkin;
      }
    }

    // CSS uses kebab-case for night-pro
    if (skin === 'nightpro') skin = 'night-pro';
    root.dataset.skin = skin;

    // ---- Theme-color meta (status/nav bar) ----
    var meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', mode === 'dark' ? '#0e1117' : '#ffffff');
    }
  } catch (e) {}
})();`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />

        {/* Single meta that we mutate in bootstrap */}
        <meta id="theme-color-meta" name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light dark" />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}