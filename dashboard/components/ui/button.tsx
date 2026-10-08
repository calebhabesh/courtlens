import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "default" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconAfter?: IconName;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconAfter,
    className = "",
    type = "button",
    disabled,
    children,
    ...props
  },
  ref
) {
  // Normalize alias variants
  const resolvedVariant = variant === "quiet" ? "ghost" : variant === "default" ? "secondary" : variant;
  const legacyClass = variant === "primary" ? "button-primary" : variant === "quiet" ? "button-quiet" : "";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={`ui-button ui-button-${resolvedVariant} ui-button-${size} button ${legacyClass} ${loading ? "ui-button-loading" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <Icon name="loader" className="ui-spinner" size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
      ) : null}
      {children}
      {!loading && iconAfter ? (
        <Icon name={iconAfter} size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
      ) : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "iconAfter"> {
  label: string;
  icon: IconName;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, className = "", size = "md", ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      className={`ui-icon-button icon-button ${className}`}
      aria-label={label}
      title={label}
      size={size}
      {...props}
    >
      <Icon name={icon} size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
    </Button>
  );
});
