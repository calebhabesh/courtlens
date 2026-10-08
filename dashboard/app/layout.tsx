import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { ReplicaNav } from "@/components/replica-nav";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { AssistantPageProvider } from "@/lib/assistant-page-context";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const publicSans = localFont({
  src: "../public/fonts/public-sans-variable.woff2",
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
  title: {
    default: "CourtLens · NBA Analytics",
    template: "%s · CourtLens"
  },
  description:
    "Dense local NBA analytics and research workbench. Investigate player production, explore team cohorts, inspect prospective points estimates under uncertainty, and reproduce evidence-backed findings.",
  icons: {
    icon: "/icon.svg",
    apple: "/icons/courtlens-apple-180.png"
  }
};

export const viewport: Viewport = { themeColor: "#0b0d10" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${jetBrainsMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <WorkspaceProvider><AssistantPageProvider><ToastProvider>
          <div className="replica-shell">
            <Suspense fallback={<div className="header-suspense-fallback" />}>
              <ReplicaNav />
            </Suspense>
            <main id="content" className="replica-main">
              <Suspense fallback={null}>
                {children}
              </Suspense>
            </main>
          </div>
        </ToastProvider></AssistantPageProvider></WorkspaceProvider>
      </body>
    </html>
  );
}
