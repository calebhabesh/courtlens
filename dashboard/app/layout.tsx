import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { ReplicaNav } from "@/components/replica-nav";
import { NavTrailRecorder } from "@/components/ui/back-button";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { AccountProvider } from "@/lib/account-context";
import { LazySignInDialog } from "@/components/account/lazy-sign-in-dialog";
import { AssistantPageProvider } from "@/lib/assistant-page-context";
import { ToastProvider } from "@/components/ui/toast";
import { ScrollMemory } from "@/components/scroll-memory";
import "./globals.css";

const switzer = localFont({
  src: "../public/fonts/switzer-variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial"
});
const jetBrainsMono = localFont({
  src: "../public/fonts/jet-brains-mono-variable.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-mono",
  display: "swap",
  preload: true,
  fallback: ["monospace"],
  adjustFontFallback: false
});

export const metadata: Metadata = {
  metadataBase: new URL("https://courtlens.calebhabesh.com"),
  openGraph: {
    type: "website",
    siteName: "CourtLens",
    title: "CourtLens · NBA Analytics",
    description:
      "NBA stats back to 1946-47, impact ratings from play-by-play, and win probabilities sealed before tip-off and graded after every game.",
    images: [
      { url: "/og-image.png?v=2", width: 1280, height: 640, alt: "CourtLens logo over its NBA player statistics table" }
    ]
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "CourtLens · NBA Analytics",
    template: "%s · CourtLens"
  },
  description:
    "Self-hosted NBA analytics: player and team stats back to 1946-47, comparisons, impact ratings from play-by-play, research tested on held-out seasons, and win probabilities graded after every game.",
  icons: {
    icon: { url: "/icon.svg?v=7", type: "image/svg+xml", sizes: "any" },
    apple: "/icons/courtlens-apple-180.png?v=5"
  }
};

export const viewport: Viewport = { themeColor: "#0c1f3d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${switzer.variable} ${jetBrainsMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <AccountProvider><WorkspaceProvider><AssistantPageProvider><ToastProvider>
          <div className="replica-shell">
            <Suspense fallback={<div className="header-suspense-fallback" />}>
              <ReplicaNav />
            </Suspense>
            {/* Before the page in the tree, so each page is on the trail before its Back reads it. */}
            <Suspense fallback={null}>
              <NavTrailRecorder />
            </Suspense>
            {/* No Suspense around the page: a page without a loader (Stats, the page `/` opens) then
                streams in the first flush instead of a later reveal that React batches 300 ms
                after the header's (Stats speed, 2026-11-17). Pages with a loader keep their own. */}
            <main id="content" className="replica-main" tabIndex={-1}>
              {children}
            </main>
          </div>
          <LazySignInDialog />
          <ScrollMemory />
        </ToastProvider></AssistantPageProvider></WorkspaceProvider></AccountProvider>
      </body>
    </html>
  );
}
