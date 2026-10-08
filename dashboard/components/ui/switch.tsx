import type { ReactNode, KeyboardEvent } from "react";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  id,
  className = "",
}: SwitchProps) {
  const toggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <label className={`ui-switch ${disabled ? "ui-switch-disabled" : ""} ${className}`} htmlFor={id}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className="ui-switch-track"
        data-checked={checked}
      >
        <span className="ui-switch-thumb" />
      </button>
      {label && <span className="ui-switch-label">{label}</span>}
    </label>
  );
}
