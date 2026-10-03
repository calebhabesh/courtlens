import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { ReplicaNav } from "@/components/replica-nav";
import { WorkspaceProvider } from "@/lib/workspace-context";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "CourtLoad · NBA Analytics & Replica Workbench",
    template: "%s · CourtLoad"
  },
  description:
    "Dense local NBA analytics and research workbench. Investigate player production, explore team cohorts, inspect prospective points estimates under uncertainty, and reproduce evidence-backed findings.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plexMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <WorkspaceProvider>
          <div className="replica-shell">
            <Suspense fallback={<div style={{ height: "84px", background: "var(--surface)" }} />}>
              <ReplicaNav />
            </Suspense>
            <main id="content" className="replica-main">
              {children}
            </main>
          </div>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
