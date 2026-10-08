import type { ReactNode } from "react";

/**
 * Root Template for Page Route Transitions.
 *
 * In Next.js App Router, templates create a new instance on navigation,
 * triggering the route-enter CSS animation (opacity 0 -> 1, translateY 6px -> 0
 * over --dur-slow). Under reduced motion, transforms are disabled and
 * durations collapse to 1ms.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
