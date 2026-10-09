import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "../../lib/motion";
import { Icon, type IconName } from "./icon";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Options share the full available width (for example the Showcase Focus control). */
  stretch?: boolean;
  className?: string;
  name?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  stretch = false,
  className = "",
  name,
}: SegmentedControlProps<T>) {
  const autoId = useId();
  const groupId = name || autoId;
  const groupRef = useRef<HTMLDivElement>(null);
  const select = (next: T) => {
    onChange(next);
    // Roving focus: the newly selected option becomes the group's single tab stop.
    requestAnimationFrame(() => groupRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next)}"]`)?.focus());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabledOptions = options.filter(o => !o.disabled);
    const currentIndex = enabledOptions.findIndex(o => o.value === value);
    if (currentIndex === -1) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % enabledOptions.length;
      select(enabledOptions[nextIndex].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + enabledOptions.length) % enabledOptions.length;
      select(enabledOptions[prevIndex].value);
    } else if (e.key === "Home") {
      e.preventDefault();
      select(enabledOptions[0].value);
    } else if (e.key === "End") {
      e.preventDefault();
      select(enabledOptions[enabledOptions.length - 1].value);
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={name}
      onKeyDown={handleKeyDown}
      className={`ui-segmented-control ui-segmented-control-${size} ${stretch ? "ui-segmented-control-stretch" : ""} ${className}`}
    >
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            data-value={option.value}
            disabled={option.disabled}
            onClick={() => !option.disabled && onChange(option.value)}
            className={`ui-segmented-item ${isActive ? "ui-segmented-item-active" : ""}`}
            data-active={isActive}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-indicator-${groupId}`}
                className="ui-segmented-indicator"
                transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
              />
            )}
            <span className="ui-segmented-label">
              {option.icon && (
                <Icon name={option.icon} size={14} />
              )}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
