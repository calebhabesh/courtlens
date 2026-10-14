"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "../icon";
import { controlClasses, cx, kitIconSize, trailingChevronClasses, type KitSize, type KitTone, type KitVariant } from "./recipes";

export interface MenuTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  size?: KitSize;
  variant?: Exclude<KitVariant, "primary" | "danger">;
  tone?: KitTone;
  /** Leading icon (for example the calendar on a date trigger). */
  icon?: IconName;
  /** Whether the menu or popover is open (`aria-expanded`). */
  expanded?: boolean;
  /** What opens: `menu` for `Menu`, `dialog` for a popover panel. */
  popup?: "menu" | "dialog" | "listbox";
  /** The trigger holds a chosen value (for example a selected team): the accent outline. */
  selected?: boolean;
  /** Layout only (margin, grid or flex placement). */
  className?: string;
}

/**
 * Button plus trailing chevron that opens `Menu` or a popover. The chevron is 14 px at every size,
 * mirrored by the instruction 71 offset, 4 px after the label.
 */
export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { size = "md", variant = "secondary", tone, icon, expanded = false, popup = "menu", selected, className, type = "button", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-haspopup={popup}
      aria-expanded={expanded}
      data-selected={selected || undefined}
      data-kit="menu-trigger"
      className={cx(controlClasses({ size, variant, tone }), className)}
      {...props}
    >
      {icon ? <Icon name={icon} size={kitIconSize[size]} /> : null}
      {children}
      <Icon
        name="chevron-down"
        size={14}
        className={cx("kit:-ms-1", trailingChevronClasses)}
      />
    </button>
  );
});
