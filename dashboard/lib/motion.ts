import {
  motion,
  AnimatePresence,
  useReducedMotion as useMotionReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";

/**
 * Design Language v1 Motion Tokens and Allowlist.
 *
 * Enforced via ESLint: imports of motion / motion/react outside
 * components/ui/**, components/charts/**, and lib/motion.ts are banned.
 */
export const MOTION_ALLOWLIST = [
  "components/ui/**",
  "components/charts/**",
  "lib/motion.ts",
  "lib/motion.tsx",
] as const;

export const DURATIONS = {
  instant: 0.08, // 80ms
  fast: 0.14,    // 140ms
  base: 0.20,    // 200ms
  slow: 0.32,    // 320ms
  chart: 0.45,   // 450ms
} as const;

export const EASINGS = {
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeIn: [0.4, 0, 1, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
} as const;

export const SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
  mass: 0.9,
};

export const SPRING_INSTANT = {
  duration: 0,
};

/**
 * Returns true if the user has requested reduced motion.
 * Respects OS accessibility settings.
 */
export function useReducedMotion(): boolean {
  const isReduced = useMotionReducedMotion();
  return Boolean(isReduced);
}

/**
 * Returns the Design Language v1 spring configuration, or an instant transition
 * if reduced motion is preferred.
 */
export function useSpringConfig(): Transition {
  const reduced = useReducedMotion();
  return reduced ? SPRING_INSTANT : SPRING;
}

/**
 * Motion variants for enters/exits (content, cards, rows).
 * Opacity 0 -> 1 and translateY(4px) -> 0 over 200ms ease-out.
 */
export const fadeSlideVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATIONS.base, ease: EASINGS.easeOut },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn },
  },
};

/**
 * Motion variants for menus, popovers, and selects.
 * Trigger-anchored scale 0.97 + opacity over 200ms ease-out. Exit over 140ms.
 */
export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATIONS.base, ease: EASINGS.easeOut },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn },
  },
};

/**
 * Motion variants for modals and dialogs.
 * Panel scale 0.98 + opacity over 200ms ease-out. Exit over 140ms.
 */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATIONS.base, ease: EASINGS.easeOut },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn },
  },
};

/**
 * Scrim backdrop fade variants.
 */
export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATIONS.base, ease: EASINGS.easeOut } },
  exit: { opacity: 0, transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn } },
};

/**
 * Drawer variants sliding from screen edges over 320ms.
 */
export function getDrawerVariants(side: "right" | "left" | "bottom" = "right"): Variants {
  const offset = side === "right" ? { x: "100%" } : side === "left" ? { x: "-100%" } : { y: "100%" };
  return {
    initial: offset,
    animate: {
      x: 0,
      y: 0,
      transition: { duration: DURATIONS.slow, ease: EASINGS.easeOut },
    },
    exit: {
      ...offset,
      transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn },
    },
  };
}

/**
 * Toast variants sliding in from bottom-right with spring.
 */
export const toastVariants: Variants = {
  initial: { opacity: 0, x: 40, scale: 0.96 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SPRING,
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.96,
    transition: { duration: DURATIONS.fast, ease: EASINGS.easeIn },
  },
};

export { motion, AnimatePresence };
