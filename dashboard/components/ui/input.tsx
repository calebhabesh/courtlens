import type { InputHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { IconButton } from "./button";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: InputSize;
  error?: boolean;
  prefixIcon?: IconName;
  suffixIcon?: IconName;
  prefixElement?: ReactNode;
  suffixElement?: ReactNode;
  wrapperClassName?: string;
}

export function Input({
  inputSize = "md",
  error = false,
  prefixIcon,
  suffixIcon,
  prefixElement,
  suffixElement,
  wrapperClassName = "",
  className = "",
  disabled,
  ...props
}: InputProps) {
  return (
    <div
      className={`ui-input-wrapper ui-input-wrapper-${inputSize} ${error ? "ui-input-error" : ""} ${disabled ? "ui-input-disabled" : ""} ${wrapperClassName}`}
    >
      {prefixIcon ? (
        <span className="ui-input-prefix">
          <Icon name={prefixIcon} size={inputSize === "sm" ? 14 : inputSize === "lg" ? 18 : 16} />
        </span>
      ) : prefixElement ? (
        <span className="ui-input-prefix">{prefixElement}</span>
      ) : null}

      <input
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        className={`ui-input ui-input-${inputSize} ${className}`}
        {...props}
      />

      {suffixIcon ? (
        <span className="ui-input-suffix">
          <Icon name={suffixIcon} size={inputSize === "sm" ? 14 : inputSize === "lg" ? 18 : 16} />
        </span>
      ) : suffixElement ? (
        <span className="ui-input-suffix">{suffixElement}</span>
      ) : null}
    </div>
  );
}

export interface SearchFieldProps extends Omit<InputProps, "prefixIcon" | "prefixElement"> {
  shortcut?: string;
  onClear?: () => void;
}

export function SearchField({
  value,
  shortcut,
  onClear,
  inputSize = "md",
  placeholder = "Search…",
  className = "",
  ...props
}: SearchFieldProps) {
  const hasValue = Boolean(value && String(value).length > 0);

  return (
    <Input
      type="search"
      role="searchbox"
      value={value}
      placeholder={placeholder}
      inputSize={inputSize}
      prefixIcon="search"
      className={`ui-search-field ${className}`}
      suffixElement={
        hasValue && onClear ? (
          <IconButton
            icon="close"
            label="Clear search"
            size="sm"
            variant="ghost"
            onClick={onClear}
          />
        ) : shortcut ? (
          <kbd className="ui-search-shortcut">{shortcut}</kbd>
        ) : undefined
      }
      {...props}
    />
  );
}
