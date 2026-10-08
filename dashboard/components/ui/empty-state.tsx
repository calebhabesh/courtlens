import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`}>
      {icon && (
        <div className="ui-empty-state-icon" aria-hidden="true">
          <Icon name={icon} size={24} />
        </div>
      )}
      <div className="ui-empty-state-text">
        <h3 className="ui-empty-state-title">{title}</h3>
        {description && <p className="ui-empty-state-desc text-muted">{description}</p>}
      </div>
      {action && <div className="ui-empty-state-action">{action}</div>}
    </div>
  );
}
