import { motion, useSpringConfig } from "../../lib/motion";

export interface SlidingIndicatorProps {
  /** Shared id for every indicator in one tab group; the indicator slides between owners. */
  layoutId: string;
  className?: string;
}

/**
 * Shared-layout indicator for custom tab rows that can't use `Tabs` directly.
 * Render it inside the active tab only; it springs to the newly active tab and
 * snaps when the OS requests reduced motion.
 */
export function SlidingIndicator({ layoutId, className = "" }: SlidingIndicatorProps) {
  const transition = useSpringConfig();
  return <motion.span layoutId={layoutId} className={`ui-sliding-indicator ${className}`} transition={transition} aria-hidden="true" />;
}
