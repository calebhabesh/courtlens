"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../icon";
import { controlClasses, cx, kitIconSize, type KitSize } from "./recipes";

/** `console` sits on the Stats table lift; `default` on surface-2. */
export type ChipTone = "default" | "console";

interface ChipLook {
  size?: KitSize;
  tone?: ChipTone;
  icon?: IconName;
  /** Layout only (margin, grid or flex placement). */
  className?: string;
  children: ReactNode;
}

export interface ChipProps extends ChipLook, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  /** Toggle state (`aria-pressed`); omit for a plain action chip. */
  pressed?: boolean;
}

/** Toggle chip (position filters, view modes, suggestion chips). */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { size = "md", tone = "default", icon, pressed, className, type = "button", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      data-kit="chip"
      className={cx(controlClasses({ size, variant: "secondary", tone: tone === "console" ? "console" : "default", tight: true }), className)}
      {...props}
    >
      {icon ? <Icon name={icon} size={kitIconSize[size]} /> : null}
      {children}
    </button>
  );
});

export interface RemovableChipProps extends ChipLook {
  onRemove: () => void;
  /** Accessible name of the remove button, for example "Remove Boston Celtics". */
  removeLabel: string;
}

/** A chosen entity with a trailing remove button; the × is centered in its own square hit area. */
export function RemovableChip({ size = "lg", tone = "default", icon, onRemove, removeLabel, className, children }: RemovableChipProps) {
  const surface = tone === "console" ? "kit:bg-console kit:text-text-control kit:font-semibold" : "kit:bg-surface-2 kit:text-text kit:font-medium";
  const height = { xs: "kit:h-control-xs kit:text-xs kit:ps-2", sm: "kit:h-control-sm kit:text-sm kit:ps-3", md: "kit:h-control-md kit:text-sm kit:ps-3", lg: "kit:h-control-lg kit:text-sm kit:ps-3" }[size];
  return (
    <span data-kit="chip" className={cx("kit:inline-flex kit:shrink-0 kit:items-center kit:gap-1 kit:whitespace-nowrap kit:rounded-sm kit:phone:min-h-control-lg", surface, height, className)}>
      {icon ? <Icon name={icon} size={kitIconSize[size]} /> : null}
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        title={removeLabel}
        onClick={onRemove}
        className={controlClasses({ size, variant: "ghost", square: true })}
      >
        <Icon name="close" size={kitIconSize[size]} />
      </button>
    </span>
  );
}
