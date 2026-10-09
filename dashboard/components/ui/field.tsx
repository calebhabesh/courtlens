import type { ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Inline puts the label left of the control (filter bars); stacked puts it above (forms). */
  layout?: "inline" | "stacked";
  /** Associates the visible label with a control that has this id. */
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
}

/** One label/control treatment for inputs, selects and date pickers (40px controls). */
export function Field({ label, children, layout = "stacked", htmlFor, hint, className = "" }: FieldProps) {
  return (
    <div className={`ui-field ui-field-${layout} ${className}`}>
      {htmlFor ? <label className="ui-field-label" htmlFor={htmlFor}>{label}</label> : <span className="ui-field-label">{label}</span>}
      <div className="ui-field-control">{children}</div>
      {hint && <span className="ui-field-hint">{hint}</span>}
    </div>
  );
}
