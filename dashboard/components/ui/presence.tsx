import type { ReactNode } from "react";
import { AnimatePresence } from "../../lib/motion";

export interface PresenceProps {
  children?: ReactNode;
  mode?: "sync" | "wait" | "popLayout";
  initial?: boolean;
  onExitComplete?: () => void;
}

/**
 * Presence is a declarative enter/exit wrapper around AnimatePresence.
 * It manages component mounting/unmounting transitions safely.
 */
export function Presence({
  children,
  mode = "sync",
  initial = true,
  onExitComplete,
}: PresenceProps) {
  return (
    <AnimatePresence mode={mode} initial={initial} onExitComplete={onExitComplete}>
      {children}
    </AnimatePresence>
  );
}
