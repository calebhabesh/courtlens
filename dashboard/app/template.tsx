import type { ReactNode } from "react";

/**
 * Root template: the page wrapper whose layout rules live on `.route-enter` (motion.css,
 * foundation.css). It used to fade each page in over --dur-slow; that animation was removed so a
 * page shows in the frame it arrives (Stats speed, 2026-11-17).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
