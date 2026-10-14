"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../icon";
import { SlidingIndicator } from "../sliding-indicator";
import { cx, kitIconSize, type KitSize } from "./recipes";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Outer group height; items occupy the space left by 4 px padding on each side. */
  size?: KitSize;
  tone?: "default" | "console";
  stretch?: boolean;
  disabled?: boolean;
  /** Paint the choice before starting an expensive parent update (the Stats and career counting modes). */
  deferChange?: boolean;
  /** Abutting items with one 4 px step less inline padding, for long rows such as the Stats presets. */
  dense?: boolean;
  /** Layout only. */
  className?: string;
}

const sizes: Record<KitSize, string> = {
  xs: "kit:h-control-xs kit:text-xs",
  sm: "kit:h-control-sm kit:text-sm",
  md: "kit:h-control-md kit:text-sm",
  lg: "kit:h-control-lg kit:text-sm",
};

export function Segmented<T extends string>({ label, options, value, onChange, size = "md", tone = "default", stretch = false, disabled = false, deferChange = false, dense = false, className }: SegmentedProps<T>) {
  const itemPadding = dense ? (size === "xs" ? "kit:px-1" : "kit:px-2") : (size === "xs" ? "kit:px-2" : "kit:px-3");
  const id = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const pendingFrame = useRef<number | undefined>(undefined);
  const pendingChange = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [shown, setShown] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setShown(value);
  }
  const selected = deferChange ? shown : value;
  const enabled = options.filter(option => !disabled && !option.disabled);
  const tabStop = enabled.find(option => option.value === selected) ?? enabled[0];

  useEffect(() => () => {
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current);
    if (pendingChange.current !== undefined) clearTimeout(pendingChange.current);
  }, [value]);

  const select = (option: SegmentedOption<T>) => {
    if (option.disabled || disabled) return;
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(option.value)}"]`)?.focus();
    if (option.value === selected) return;
    if (!deferChange) {
      onChange(option.value);
      return;
    }
    setShown(option.value);
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current);
    if (pendingChange.current !== undefined) clearTimeout(pendingChange.current);
    pendingFrame.current = requestAnimationFrame(() => {
      pendingChange.current = setTimeout(() => onChange(option.value), 0);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled.length) return;
    const index = enabled.findIndex(option => option === tabStop);
    let next: SegmentedOption<T> | undefined;
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": next = enabled[(index + 1) % enabled.length]; break;
      case "ArrowLeft": case "ArrowUp": next = enabled[(index - 1 + enabled.length) % enabled.length]; break;
      case "Home": next = enabled[0]; break;
      case "End": next = enabled[enabled.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    if (next) select(next);
  };

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} data-kit="segmented"
      onKeyDown={handleKeyDown}
      className={cx("kit:inline-flex kit:max-w-full kit:items-stretch kit:rounded-sm kit:p-1 kit:overflow-x-auto kit:[scrollbar-width:none] kit:phone:h-[calc(var(--kit-control-lg)+var(--space-2))]",
        dense ? "kit:gap-0" : "kit:gap-1", sizes[size], tone === "console" ? "kit:bg-console" : "kit:bg-surface-2", stretch && "kit:flex kit:w-full", className)}>
      {options.map(option => {
        const active = option.value === selected;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} data-value={option.value}
            tabIndex={option === tabStop ? 0 : -1} disabled={disabled || option.disabled} title={option.title}
            onClick={() => select(option)}
            className={cx("kit:relative kit:inline-flex kit:shrink-0 kit:items-center kit:justify-center kit:gap-1 kit:rounded-xs kit:border-0 kit:py-0 kit:whitespace-nowrap kit:cursor-pointer kit:bg-transparent",
              // One colour per tone: two text utilities would resolve by stylesheet order, not intent.
              tone === "console" ? "kit:font-semibold kit:text-text-control" : "kit:font-medium kit:text-text-secondary",
              "kit:transition-[color,background-color,scale] kit:duration-[var(--dur-fast),var(--dur-fast),var(--dur-instant)] kit:ease-out kit:active:not-disabled:scale-98 kit:hoverable:bg-surface-hover kit:hoverable:text-text kit:selected:text-accent kit:selected:font-semibold",
              "kit:motion-reduce:duration-(--dur-instant)",
              "kit:focus-visible:outline-none kit:focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] kit:disabled:opacity-45 kit:disabled:pointer-events-none kit:disabled:cursor-not-allowed",
              "kit:phone:min-h-control-lg kit:phone:min-w-control-lg kit:phone:px-2", itemPadding, stretch && "kit:flex-1")}>
            {active && <SlidingIndicator layoutId={`kit-segmented-${id}`} className="kit:absolute kit:inset-0 kit:rounded-xs kit:bg-accent-soft kit:inset-ring kit:inset-ring-accent kit:pointer-events-none" />}
            <span className="kit:relative kit:inline-flex kit:items-center kit:gap-1">
              {option.icon && <Icon name={option.icon} size={kitIconSize[size]} />}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
