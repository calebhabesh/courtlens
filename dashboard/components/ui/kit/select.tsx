"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { Icon } from "../icon";
import { cx } from "./recipes";

export type SelectSize = "sm" | "md" | "lg";
export type SelectTone = "default" | "console";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "className"> {
  size?: SelectSize;
  tone?: SelectTone;
  invalid?: boolean;
  /** Layout only, applied to the wrapper (margin, grid or flex placement). */
  className?: string;
  children: ReactNode;
}

const heights: Record<SelectSize, string> = {
  sm: "kit:h-control-sm",
  md: "kit:h-control-md",
  lg: "kit:h-control-lg",
};

/**
 * Selects lead with text (about 1 of 24 units of side bearing) while the chevron glyph leaves 5, so
 * the chevron moves 4 units outward and the end padding shrinks by the same amount (instruction 71):
 * the text-to-chevron gap stays 4 px and the visible gaps mirror.
 */
const chevrons = {
  sm: { size: 14, pad: "kit:pe-[calc(var(--space-8)-var(--kit-chevron-sm)*4/24)]", end: "kit:end-[calc(var(--space-3)-var(--kit-chevron-sm)*4/24)]" },
  md: { size: 16, pad: "kit:pe-[calc(var(--space-8)-var(--kit-chevron)*4/24)]", end: "kit:end-[calc(var(--space-3)-var(--kit-chevron)*4/24)]" },
  lg: { size: 16, pad: "kit:pe-[calc(var(--space-8)-var(--kit-chevron)*4/24)]", end: "kit:end-[calc(var(--space-3)-var(--kit-chevron)*4/24)]" },
} as const;

const tones: Record<SelectTone, string> = {
  default: "kit:bg-surface-2 kit:text-text kit:hoverable:bg-surface-3",
  console: "kit:bg-console kit:font-semibold kit:text-text-control kit:hoverable:bg-console-hover kit:hoverable:text-text",
};

/** The chevron sits outside the select, so it follows the select's text colour through `peer`. */
const chevronTones: Record<SelectTone, string> = {
  default: "kit:text-text",
  console: "kit:text-text-control kit:peer-hover:peer-enabled:text-text",
};

/** Native select with the kit chevron. Its popup keeps the shared `::picker(select)` styling. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "lg", tone = "default", invalid = false, className, disabled, children, ...props },
  ref,
) {
  const chevron = chevrons[size];
  return (
    <span data-kit="select" className={cx("kit:relative kit:inline-flex kit:min-w-0 kit:align-middle", className)}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cx(
          "kit:peer kit:w-full kit:min-h-0 kit:min-w-0 kit:truncate kit:rounded-sm kit:border-0 kit:py-0 kit:ps-3 kit:text-sm kit:cursor-pointer kit:appearance-none",
          "kit:supports-[appearance:base-select]:[appearance:base-select] kit:[&::picker-icon]:hidden",
          "kit:transition-[background-color,color,box-shadow] kit:duration-(--dur-fast) kit:ease-out",
          "kit:motion-reduce:duration-(--dur-instant)",
          "kit:focus-visible:outline-none kit:focus-visible:shadow-(--focus-ring) kit:phone:min-h-control-lg",
          "kit:disabled:cursor-not-allowed kit:disabled:opacity-45 kit:disabled:pointer-events-none kit:aria-invalid:inset-ring kit:aria-invalid:inset-ring-negative",
          heights[size],
          chevron.pad,
          tones[tone],
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className={cx(
          "kit:pointer-events-none kit:absolute kit:top-1/2 kit:inline-flex kit:-translate-y-1/2 kit:transition-[rotate] kit:duration-(--dur-fast) kit:ease-out",
          "kit:peer-open:rotate-180 kit:peer-disabled:opacity-45",
          "kit:motion-reduce:duration-(--dur-instant)",
          chevron.end,
          chevronTones[tone],
        )}
      >
        <Icon name="chevron-down" size={chevron.size} />
      </span>
    </span>
  );
});
