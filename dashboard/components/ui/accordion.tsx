import {
  useState,
  useId,
  type ReactNode,
} from "react";
import { Icon } from "./icon";

export interface AccordionItemProps {
  title: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function AccordionItem({
  title,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  className = "",
  children,
}: AccordionItemProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;
  const id = useId();

  const handleToggle = () => {
    const next = !isExpanded;
    if (!isControlled) setInternalExpanded(next);
    onToggle?.(next);
  };

  return (
    <div className={`ui-accordion-item ${className}`}>
      <button
        type="button"
        id={`${id}-trigger`}
        aria-controls={`${id}-content`}
        aria-expanded={isExpanded}
        onClick={handleToggle}
        className="ui-accordion-trigger"
      >
        <span>{title}</span>
        <span
          className={`ui-accordion-icon ${isExpanded ? "ui-accordion-icon-expanded" : ""}`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      <div
        id={`${id}-content`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        data-expanded={isExpanded}
        className="ui-accordion-content"
      >
        <div className="ui-accordion-content-inner">{children}</div>
      </div>
    </div>
  );
}

export interface AccordionProps {
  className?: string;
  children: ReactNode;
}

export function Accordion({ className = "", children }: AccordionProps) {
  return <div className={`ui-accordion ${className}`}>{children}</div>;
}
