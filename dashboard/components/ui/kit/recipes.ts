import type { IconSize } from "../icon";

/**
 * Control kit v1 class recipes (docs/design/control-kit-v1.md). Size, variant and state live only
 * here; components pass props, never size classes. Tailwind scans this folder (app/styles/tailwind.css),
 * so every class must appear as a complete literal string.
 */
export type KitSize = "xs" | "sm" | "md" | "lg";
export type KitVariant = "primary" | "secondary" | "ghost" | "danger";
/** `console`: the Stats/Databallr control console on the table lift; `onBackground`: ghost controls on the page background (header). */
export type KitTone = "default" | "console" | "onBackground";

export const kitIconSize: Record<KitSize, IconSize> = { xs: 14, sm: 16, md: 16, lg: 16 };

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Shared by every pressable kit control: geometry, motion, focus, disabled and phone hit area. */
const pressable =
  "kit:relative kit:inline-flex kit:shrink-0 kit:min-h-0 kit:items-center kit:justify-center kit:whitespace-nowrap kit:rounded-sm kit:border-0 kit:p-0 " +
  "kit:no-underline kit:select-none kit:cursor-pointer kit:transition-[background-color,color,box-shadow,scale] " +
  "kit:duration-[var(--dur-fast),var(--dur-fast),var(--dur-fast),var(--dur-instant)] kit:ease-out " +
  "kit:active:not-disabled:scale-98 kit:focus-visible:outline-none kit:focus-visible:shadow-(--focus-ring) " +
  "kit:disabled:cursor-not-allowed kit:disabled:opacity-45 kit:disabled:pointer-events-none " +
  "kit:aria-disabled:cursor-not-allowed kit:aria-disabled:opacity-45 kit:aria-disabled:pointer-events-none kit:phone:min-h-control-lg kit:phone:min-w-control-lg " +
  "kit:motion-reduce:duration-(--dur-instant)";

const sizes: Record<KitSize, string> = {
  xs: "kit:h-control-xs kit:text-xs",
  sm: "kit:h-control-sm kit:text-sm",
  md: "kit:h-control-md kit:text-sm",
  lg: "kit:h-control-lg kit:text-sm",
};

/** Inline padding for labelled controls; square (icon-only) controls have none. */
const paddings: Record<KitSize, string> = { xs: "kit:px-2", sm: "kit:px-3", md: "kit:px-3", lg: "kit:px-3" };
/** `dense`: one 4 px step less, for packed rows (the Stats footer) that must not wrap. */
const densePaddings: Record<KitSize, string> = { xs: "kit:px-1", sm: "kit:px-2", md: "kit:px-2", lg: "kit:px-2" };

const squares: Record<KitSize, string> = {
  xs: "kit:w-control-xs kit:phone:min-w-control-lg",
  sm: "kit:w-control-sm kit:phone:min-w-control-lg",
  md: "kit:w-control-md kit:phone:min-w-control-lg",
  lg: "kit:w-control-lg kit:phone:min-w-control-lg",
};

const variants: Record<KitVariant, string> = {
  primary: "kit:bg-accent kit:font-medium kit:text-on-accent kit:hoverable:bg-accent-hover",
  secondary: "kit:bg-surface-2 kit:font-medium kit:text-text kit:hoverable:bg-surface-3",
  ghost: "kit:bg-transparent kit:font-medium kit:text-text-secondary kit:hoverable:bg-surface-hover kit:hoverable:text-text",
  danger: "kit:bg-surface-2 kit:font-medium kit:text-negative kit:hoverable:bg-danger-hover",
};

/** A tone replaces its variant's colours: `console` for secondary, `onBackground` for ghost. */
const tones: Record<Exclude<KitTone, "default">, string> = {
  console: "kit:bg-console kit:font-semibold kit:text-text-control kit:hoverable:bg-console-hover kit:hoverable:text-text",
  onBackground: "kit:bg-transparent kit:font-medium kit:text-on-bg-secondary kit:hoverable:bg-surface-hover kit:hoverable:text-text",
};

/** Accent outline for pressed toggles, checked radios, selected tabs and the current route. */
export const selectedClasses =
  "kit:selected:bg-accent-soft kit:selected:text-accent kit:selected:font-semibold kit:selected:inset-ring kit:selected:inset-ring-accent";

export interface ControlClassOptions {
  size: KitSize;
  variant: KitVariant;
  tone?: KitTone;
  square?: boolean;
  /** Chips and segments use a 4 px icon gap; buttons 8 px. */
  tight?: boolean;
  /** One 4 px step less inline padding. */
  dense?: boolean;
}

export function controlClasses({ size, variant, tone = "default", square = false, tight = false, dense = false }: ControlClassOptions) {
  return cx(
    pressable,
    sizes[size],
    tight ? "kit:gap-1" : "kit:gap-2",
    square ? squares[size] : (dense ? densePaddings : paddings)[size],
    tone === "default" ? variants[variant] : tones[tone],
    variant !== "primary" && selectedClasses,
  );
}

/**
 * Trailing chevron optics (instruction 71): the glyph leaves 5 of 24 units empty, leading content
 * about 2, so the chevron moves 3 units outward to mirror the left gap. Selects lead with text
 * (about 1 unit) and move 4; see select.tsx.
 */
export const trailingChevronClasses = "kit:-me-[calc(var(--ui-icon-size)*3/24)]";
