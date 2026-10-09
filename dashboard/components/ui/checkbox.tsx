import { type InputHTMLAttributes, type ReactNode, forwardRef, useEffect, useRef } from "react";
import { Icon } from "./icon";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked = false, indeterminate = false, onChange, label, disabled, className = "", id, ...props },
  forwardedRef
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const ref = (forwardedRef as React.RefObject<HTMLInputElement>) || innerRef;

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, ref]);

  const handleChange = () => {
    if (disabled) return;
    onChange?.(!checked);
  };

  return (
    <label
      className={`ui-checkbox ${disabled ? "ui-checkbox-disabled" : ""} ${className}`}
      htmlFor={id}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : checked}
        onChange={handleChange}
        className="ui-checkbox-input sr-only"
        {...props}
      />
      <span
        className="ui-checkbox-box"
        data-checked={checked}
        data-indeterminate={indeterminate}
        aria-hidden="true"
      >
        {indeterminate ? (
          <span className="ui-checkbox-indeterminate-mark" />
        ) : checked ? (
          <Icon name="check" size={14} />
        ) : null}
      </span>
      {label && <span className="ui-checkbox-label">{label}</span>}
    </label>
  );
});
