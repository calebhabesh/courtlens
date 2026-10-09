import type { SelectHTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  selectSize?: SelectSize;
  error?: boolean;
  wrapperClassName?: string;
  children: ReactNode;
}

export function Select({
  selectSize = "md",
  error = false,
  wrapperClassName = "",
  className = "",
  disabled,
  children,
  ...props
}: SelectProps) {
  return (
    <div
      className={`ui-select-wrapper ui-select-wrapper-${selectSize} ${error ? "ui-select-error" : ""} ${disabled ? "ui-select-disabled" : ""} ${wrapperClassName}`}
    >
      <select
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        className={`ui-select ui-select-${selectSize} ${className}`}
        {...props}
      >
        {children}
      </select>
      <span className="ui-select-chevron" aria-hidden="true">
        <Icon name="chevron-down" size={selectSize === "sm" ? 14 : selectSize === "lg" ? 20 : 16} />
      </span>
    </div>
  );
}
