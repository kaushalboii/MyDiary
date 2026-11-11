import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/inter";
import "./globals.css";
import { KeepAliveBeacon } from "@/components/KeepAliveBeacon";
import { siteConfig } from "@/three/site-config";

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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <KeepAliveBeacon />
        {children}
      </body>
    </html>
  );
}
