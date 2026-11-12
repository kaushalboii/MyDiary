import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { KeepAliveBeacon } from "@/components/KeepAliveBeacon";
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

const STORAGE_ORIGIN = (() => {
  const raw = (process.env.NEXT_PUBLIC_STORAGE_URL || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

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

const THEME_INIT_SCRIPT = `(function(){try{var k="mydiary_theme_v1";var v=localStorage.getItem(k);var t=(v==="dark"||v==="light")?v:"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

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
        {STORAGE_ORIGIN ? (
          <>
            <link rel="dns-prefetch" href={STORAGE_ORIGIN} />
            <link rel="preconnect" href={STORAGE_ORIGIN} crossOrigin="anonymous" />
          </>
        ) : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <KeepAliveBeacon />
        {children}
      </body>
    </html>
  );
}
