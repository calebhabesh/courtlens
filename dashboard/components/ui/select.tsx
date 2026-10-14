"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useControlScope } from "./control-scope";
import { Select as KitSelect } from "./kit";
import type { SelectSize as KitSelectSize } from "./kit";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "className"> {
  selectSize?: SelectSize;
  error?: boolean;
  /** Layout only, on the control's wrapper. */
  wrapperClassName?: string;
  children: ReactNode;
}

// The legacy sizes were 28/32/40 px; the kit select starts at 32 (`sm`).
const kitSize: Record<SelectSize, KitSelectSize> = { sm: "sm", md: "sm", lg: "lg" };

/**
 * The shared native select, drawn by the control kit (UC04 batch 6b). Inside a filter bar or a
 * `Field` it is 40 px, on the Stats workspace it takes the console tone, and elsewhere it keeps the
 * legacy 32 px default; an explicit `selectSize` wins. It fills its container unless the placement
 * says otherwise (`.legacy-select` in foundation.css).
 */
export function Select({ selectSize, error = false, wrapperClassName = "", children, ...props }: SelectProps) {
  const placement = useControlScope();
  const size = selectSize ? kitSize[selectSize] : placement.size === "lg" ? "lg" : "sm";
  return (
    <KitSelect size={size} tone={placement.tone === "console" ? "console" : "default"} invalid={error} className={`legacy-select ${wrapperClassName}`.trim()} {...props}>
      {children}
    </KitSelect>
  );
}
