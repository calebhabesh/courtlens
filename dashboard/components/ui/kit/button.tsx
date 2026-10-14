"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../icon";
import { controlClasses, cx, kitIconSize, trailingChevronClasses, type KitSize, type KitTone, type KitVariant } from "./recipes";

interface ControlLookProps {
  size?: KitSize;
  variant?: KitVariant;
  tone?: KitTone;
  /** Leading icon. */
  icon?: IconName;
  /** Trailing icon; a `chevron-down` gets the mirrored chevron offset. */
  iconAfter?: IconName;
  /**
   * Layout only (margin, grid or flex placement). Size, padding and colour come from props; UC03
   * lint rejects size utilities here.
   */
  className?: string;
}

function Content({ size, icon, iconAfter, loading, children }: { size: KitSize; icon?: IconName; iconAfter?: IconName; loading?: boolean; children?: ReactNode }) {
  const iconSize = kitIconSize[size];
  return (
    <>
      {loading ? <Icon name="loader" size={iconSize} className="ui-spinner" /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {!loading && iconAfter ? (
        <Icon name={iconAfter} size={iconSize} className={iconAfter === "chevron-down" ? trailingChevronClasses : undefined} />
      ) : null}
    </>
  );
}

export interface ButtonProps extends ControlLookProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  loading?: boolean;
  /** Toggle buttons: sets `aria-pressed` and the selected look. */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { size = "md", variant = "secondary", tone, icon, iconAfter, loading = false, pressed, className, type = "button", disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-kit="button"
      className={cx(controlClasses({ size, variant, tone }), className)}
      {...props}
    >
      <Content size={size} icon={icon} iconAfter={iconAfter} loading={loading}>{children}</Content>
    </button>
  );
});

export interface ButtonLinkProps extends ControlLookProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> {
  href: string;
  /** Current route or section: sets `aria-current` and the selected look. */
  current?: boolean;
}

/** A link with button geometry (Next `Link`, so client navigation and prefetch still apply). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { size = "md", variant = "secondary", tone, icon, iconAfter, current, className, href, children, ...props },
  ref,
) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={current ? "page" : undefined}
      data-kit="button"
      className={cx(controlClasses({ size, variant, tone }), className)}
      {...props}
    >
      <Content size={size} icon={icon} iconAfter={iconAfter}>{children}</Content>
    </Link>
  );
});

export interface ButtonSummaryProps extends ControlLookProps, Omit<HTMLAttributes<HTMLElement>, "className"> {}

/** The `<summary>` of a `<details>` disclosure (for example "Why?"), with button geometry. */
export function ButtonSummary({ size = "xs", variant = "ghost", tone, icon, iconAfter, className, children, ...props }: ButtonSummaryProps) {
  return (
    <summary data-kit="button" className={cx(controlClasses({ size, variant, tone }), "kit:list-none kit:[&::-webkit-details-marker]:hidden", className)} {...props}>
      <Content size={size} icon={icon} iconAfter={iconAfter}>{children}</Content>
    </summary>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "icon" | "iconAfter" | "children"> {
  icon: IconName;
  /** Required: the accessible name and the native tooltip. */
  label: string;
}

/** Square icon-only button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", variant = "ghost", tone, icon, label, loading = false, pressed, className, type = "button", disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-kit="icon-button"
      className={cx(controlClasses({ size, variant, tone, square: true }), className)}
      {...props}
    >
      <Icon name={loading ? "loader" : icon} size={kitIconSize[size]} className={loading ? "ui-spinner" : undefined} />
    </button>
  );
});
