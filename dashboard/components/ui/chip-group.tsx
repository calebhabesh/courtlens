import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface ChipOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  disabled?: boolean;
  /** Optional count shown after the label, e.g. games on a date. */
  count?: number;
}

interface ChipGroupBase<T extends string> {
  options: ChipOption<T>[];
  /** Accessible group name. */
  label: string;
  className?: string;
}

export interface SingleChipGroupProps<T extends string> extends ChipGroupBase<T> {
  multiple?: false;
  value: T;
  onChange: (value: T) => void;
}

export interface MultiChipGroupProps<T extends string> extends ChipGroupBase<T> {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
}

/**
 * Filter chips. Single-select chips form a radio group with one tab stop and arrow-key movement;
 * multi-select chips are independent toggle buttons. Selected chips stay distinguishable without
 * hover or color alone (filled surface, accent ring and a check icon).
 */
export function ChipGroup<T extends string = string>(props: SingleChipGroupProps<T> | MultiChipGroupProps<T>) {
  const { options, label, className = "" } = props;
  const groupRef = useRef<HTMLDivElement>(null);
  const isSelected = (value: T) => (props.multiple ? props.value.includes(value) : props.value === value);
  const toggle = (value: T) => {
    if (props.multiple) props.onChange(isSelected(value) ? props.value.filter((item) => item !== value) : [...props.value, value]);
    else props.onChange(value);
  };
  const enabled = options.filter((option) => !option.disabled);
  const focusValue = (value: T) =>
    requestAnimationFrame(() => groupRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)?.focus());

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (props.multiple || enabled.length === 0) return;
    const index = enabled.findIndex((option) => option.value === props.value);
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: enabled.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = enabled[(keys[event.key] + enabled.length) % enabled.length].value;
    props.onChange(next);
    focusValue(next);
  };

  const tabStop = props.multiple ? null : enabled.some((option) => option.value === props.value) ? props.value : enabled[0]?.value;

  return (
    <div
      ref={groupRef}
      role={props.multiple ? "group" : "radiogroup"}
      aria-label={label}
      className={`ui-chip-group ${className}`}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <button
            key={option.value}
            type="button"
            data-value={option.value}
            role={props.multiple ? undefined : "radio"}
            aria-checked={props.multiple ? undefined : selected}
            aria-pressed={props.multiple ? selected : undefined}
            tabIndex={props.multiple || option.value === tabStop ? 0 : -1}
            disabled={option.disabled}
            className={`ui-chip-option ${selected ? "is-selected" : ""}`}
            onClick={() => toggle(option.value)}
          >
            {selected && props.multiple ? <Icon name="check" size={14} /> : option.icon && <Icon name={option.icon} size={14} />}
            <span>{option.label}</span>
            {option.count !== undefined && <span className="ui-chip-count">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
