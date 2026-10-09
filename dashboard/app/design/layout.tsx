import type { Metadata } from "next";
import type { ReactNode } from "react";

// Internal style guide (FO07): reachable by URL, kept out of navigation, search and indexing.
export const metadata: Metadata = { title: "Design Language", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
