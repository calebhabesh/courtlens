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
  /** One 4 px step less inline padding, for packed rows that must not wrap. */
  dense?: boolean;
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
  /** Fill the row, lead-align the content and truncate the label (the phone "Filters" toggle). */
  stretch?: boolean;
  /** Toggle buttons: sets `aria-pressed` and the selected look. */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { size = "md", variant = "secondary", tone, icon, iconAfter, dense, loading = false, pressed, stretch = false, className, type = "button", disabled, children, ...props },
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
      className={cx(controlClasses({ size, variant, tone, dense }), stretch && "kit:w-full kit:min-w-0 kit:shrink kit:justify-start", className)}
      {...props}
    >
      <Content size={size} icon={icon} iconAfter={iconAfter} loading={loading}>{stretch ? <span className="kit:min-w-0 kit:truncate">{children}</span> : children}</Content>
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
  { size = "md", variant = "secondary", tone, icon, iconAfter, dense, current, className, href, children, ...props },
  ref,
) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={current ? "page" : undefined}
      data-kit="button"
      className={cx(controlClasses({ size, variant, tone, dense }), className)}
      {...props}
    >
      <Content size={size} icon={icon} iconAfter={iconAfter}>{children}</Content>
    </Link>
  );
});

export interface ButtonSummaryProps extends ControlLookProps, Omit<HTMLAttributes<HTMLElement>, "className"> {}

/** The `<summary>` of a `<details>` disclosure (for example "Why?"), with button geometry. */
export function ButtonSummary({ size = "xs", variant = "ghost", tone, icon, iconAfter, dense, className, children, ...props }: ButtonSummaryProps) {
  return (
    <summary data-kit="button" className={cx(controlClasses({ size, variant, tone, dense }), "kit:list-none kit:[&::-webkit-details-marker]:hidden", className)} {...props}>
      <Content size={size} icon={icon} iconAfter={iconAfter}>{children}</Content>
    </summary>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "icon" | "iconAfter" | "children"> {
  icon: IconName;
  /** Required: the accessible name and the native tooltip. */
  label: string;
  /** Filled glyph for an "on" toggle (for example a favourite star). */
  filled?: boolean;
}

/** Square icon-only button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", variant = "ghost", tone, icon, label, filled = false, loading = false, pressed, className, type = "button", disabled, ...props },
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
      <Icon name={loading ? "loader" : icon} size={kitIconSize[size]} filled={filled && !loading} className={loading ? "ui-spinner" : undefined} />
    </button>
  );
});

export interface IconButtonLinkProps extends Omit<ButtonLinkProps, "icon" | "iconAfter" | "children" | "dense"> {
  icon: IconName;
  /** Required: the accessible name and the native tooltip. */
  label: string;
}

/** Square icon-only link (for example a rail shortcut to another page). */
export const IconButtonLink = forwardRef<HTMLAnchorElement, IconButtonLinkProps>(function IconButtonLink(
  { size = "md", variant = "ghost", tone, icon, label, current, className, href, ...props },
  ref,
) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-label={label}
      title={label}
      aria-current={current ? "page" : undefined}
      data-kit="icon-button"
      className={cx(controlClasses({ size, variant, tone, square: true }), className)}
      {...props}
    >
      <Icon name={icon} size={kitIconSize[size]} />
    </Link>
  );
});
