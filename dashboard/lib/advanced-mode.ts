"use client";

import { useSyncExternalStore } from "react";
import { readStoredValue, storageKeys } from "./storage-keys";

// Advanced mode (frontend overhaul D5) reveals raw release IDs, hashes and exclusive-cutoff rules
// in the main flow. It is a local display preference and never changes a query or result.
const EVENT = "courtlens-advanced-mode-change";

export function readAdvancedMode(): boolean {
  return readStoredValue(storageKeys.advancedMode) === "on";
}

export function setAdvancedMode(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(storageKeys.advancedMode, "on");
    else window.localStorage.removeItem(storageKeys.advancedMode);
  } catch {
    // Storage can be unavailable (private mode); the toggle still applies for this page view.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKeys.advancedMode) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Server render and first paint use `false`, so hydration never depends on local storage. */
export function useAdvancedMode(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readAdvancedMode, () => false);
  return [enabled, setAdvancedMode];
}
