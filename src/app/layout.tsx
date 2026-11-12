import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { KeepAliveBeacon } from "@/components/KeepAliveBeacon";
import { VaultLockGate } from "@/components/VaultLockGate";
import { siteConfig } from "@/three/site-config";

const newsreader = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-newsreader",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
});

const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  applicationName: siteConfig.applicationName,
  category: "diary",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe8" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
  colorScheme: "light dark",
};

const THEME_INIT_SCRIPT = `(function(){try{var k="mydiary_theme_v1";var v=localStorage.getItem(k);var t=(v==="dark"||v==="light")?v:"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var ve=localStorage.getItem("mydiary_vault_envelope_v1");var vs=sessionStorage.getItem("mydiary_vault_session_v1");if(ve&&!vs){document.documentElement.dataset.vault="locked";}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${newsreader.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex, nofollow" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <KeepAliveBeacon />
        <VaultLockGate>{children}</VaultLockGate>
      </body>
    </html>
  );
}
