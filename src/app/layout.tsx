import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { Providers } from "@/components/layout/Providers";
import { PwaInstaller } from "@/components/PwaInstaller";
import "./globals.css";

export const metadata: Metadata = {
  title: "BizLedger - Premium Furniture Business Accounting",
  description:
    "BizLedger replaces scattered spreadsheets and generic tools with a unified platform designed specifically for furniture manufacturing and sales.",
  icons: {
    icon: "/branding/BIZ-LEDGER LOGO.png",
  },
  /* 10.2-C: PWA foundation — publish the manifest + brand chrome to the
   * browser. themeColor mirrors manifest.theme_color (#f7f9fb) and the app's
   * own chrome so the install prompt, address bar and OS app window are all
   * consistent with the product surface (no invented colors). Next.js moved
   * themeColor out of Metadata into the Viewport export (it is renderer
   * metadata), so it lives in `viewport` below; the rest stays here.
   *
   * CANONICAL MANIFEST: `/manifest.webmanifest` is the single PWA manifest and
   * the only path advertised to browsers. There is deliberately no
   * `/manifest.json` route and no duplicate file: nothing in this application
   * (layout metadata, PwaInstaller, service worker, public/) references
   * `manifest.json`, so adding one would only create a second, drift-prone copy
   * of the same document. `PHASE-10.1-PRICING-PLAN-ACCEPTANCE.md` mentioned
   * `manifest.json` as a build-out *option*; `.webmanifest` is what shipped. */
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BizLedger",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f9fb",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface font-body-md antialiased min-h-screen">
        <AuthProvider>
          <Providers>{children}</Providers>
        </AuthProvider>
        {/* 10.2-C: browser-only PWA registration. Renders nothing; returns null
         * in SSR/build/dev and is production-only, so `output: "export"`
         * static generation is never affected. */}
        <PwaInstaller />
      </body>
    </html>
  );
}