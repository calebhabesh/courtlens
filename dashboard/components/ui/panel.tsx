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
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  className = "",
  ...props
}: PageHeaderProps) {
  return (
    <div className={`ui-page-header ${className}`} {...props}>
      <div className="ui-page-header-main">
        {breadcrumbs && <div className="ui-page-header-breadcrumbs">{breadcrumbs}</div>}
        <div className="ui-page-header-title-row">
          {icon && (
            <span className="ui-page-header-icon">
              <Icon name={icon} size={24} />
            </span>
          )}
          <div>
            <h1 className="ui-page-header-title">{title}</h1>
            {subtitle && <p className="ui-page-header-subtitle text-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  );
}
