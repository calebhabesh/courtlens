import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { NavRail } from "@/components/nav-rail";
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
    default: "CourtLoad · NBA Research & Forecast Workbench",
    template: "%s · CourtLoad"
  },
  description:
    "Local NBA research and forecast workbench. Investigate player production, explore team cohorts, inspect prospective points estimates under uncertainty, and reproduce evidence-backed findings.",
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
        <div className="workbench-layout">
          <NavRail />
          <div className="workbench-main">
            <main id="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
