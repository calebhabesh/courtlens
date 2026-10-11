import type { HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type BadgeVariant = "default" | "accent" | "positive" | "negative" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  pill?: boolean;
  icon?: IconName;
  onRemove?: () => void;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  pill = false,
  icon,
  onRemove,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`ui-badge ui-badge-${variant} ${pill ? "ui-badge-pill" : ""} ${onRemove ? "ui-badge-removable" : ""} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          className="ui-badge-remove"
          aria-label="Remove"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </span>
  );
}

export type ChipProps = BadgeProps;

/**
 * Chip is a pill-shaped interactive badge, commonly used for filters or tags.
 */
export function Chip({ pill = true, ...props }: ChipProps) {
  return <Badge pill={pill} {...props} />;
}
