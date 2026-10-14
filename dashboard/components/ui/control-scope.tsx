"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { KitSize } from "./kit";

/**
 * Placement defaults for the shared controls (Data details, Select, date and menu triggers): the
 * filter bar sets `lg`, and the Stats workspace sets the console tone. An explicit prop always
 * wins. This replaces page CSS that resized these controls by where they sat (UC04 batch 6).
 */
export interface ControlScopeValue {
  size?: KitSize;
  tone?: "default" | "console";
}

const ControlScopeContext = createContext<ControlScopeValue>({});

export function ControlScope({ size, tone, children }: ControlScopeValue & { children: ReactNode }) {
  const outer = useContext(ControlScopeContext);
  return <ControlScopeContext.Provider value={{ size: size ?? outer.size, tone: tone ?? outer.tone }}>{children}</ControlScopeContext.Provider>;
}

export function useControlScope() {
  return useContext(ControlScopeContext);
}
