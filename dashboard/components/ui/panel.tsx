import type { HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}

export function Panel({
  title,
  actions,
  compact = false,
  className = "",
  children,
  ...props
}: PanelProps) {
  return (
    <div
      className={`ui-panel panel ${compact ? "ui-panel-compact" : ""} ${className}`}
      {...props}
    >
      {(title || actions) && (
        <div className="ui-panel-header panel-header">
          {title && (typeof title === "string" ? <h3 className="ui-panel-title panel-title">{title}</h3> : title)}
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </div>
      )}
      <div className="ui-panel-body">{children}</div>
    </div>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Section({
  title,
  description,
  actions,
  className = "",
  children,
  ...props
}: SectionProps) {
  return (
    <section className={`ui-section panel ${className}`} {...props}>
      <div className="ui-panel-header panel-header">
        <div>
          <h2 className="ui-panel-title panel-title">{title}</h2>
          {description && <p className="text-muted">{description}</p>}
        </div>
        {actions && <div className="ui-panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Title Case, matching the page's nav label exactly (D7). */
  title: ReactNode;
  /** At most one short line; longer text is clipped. Disclaimers belong in "Why?" or Data details. */
  subtitle?: string;
  icon?: IconName;
  /** The page's main actions, aligned right on the title row. */
  actions?: ReactNode;
}

/** Page header (D7): title and actions share one row; one optional subtitle line below. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className = "",
  ...props
}: PageHeaderProps) {
  return (
    <header className={`ui-page-header ${className}`} {...props}>
      <div className="ui-page-header-title-row">
        {icon && (
          <span className="ui-page-header-icon">
            <Icon name={icon} size={24} />
          </span>
        )}
        <h1 className="ui-page-header-title">{title}</h1>
        {actions && <div className="ui-page-header-actions">{actions}</div>}
      </div>
      {subtitle && <p className="ui-page-header-subtitle" title={subtitle}>{subtitle}</p>}
    </header>
  );
}
