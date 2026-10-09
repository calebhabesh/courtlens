// Legacy keys are read once and removed only after the new value has been persisted.
export const storageKeys = {
  density: "courtlens_table_density",
  sidebar: "courtlens-ask-sidebar-collapsed-v1",
  historyChange: "courtlens-assistant-history-change-v2",
  activeThread: "courtlens-assistant-active-thread-v2",
  advancedMode: "courtlens-advanced-mode-v1"
} as const;

const legacyKeys: ReadonlyArray<readonly [string, string]> = [
  ["courtload_table_density", storageKeys.density],
  ["courtload-ask-sidebar-collapsed-v1", storageKeys.sidebar],
  ["courtload-assistant-history-change-v2", storageKeys.historyChange],
  ["courtload-assistant-active-thread-v2", storageKeys.activeThread]
];

export function migrateStorageKeys(storage: Storage): void {
  for (const [oldKey, newKey] of legacyKeys) {
    const retained = storage.getItem(oldKey);
    if (retained === null) continue;
    if (storage.getItem(newKey) === null) storage.setItem(newKey, retained);
    storage.removeItem(oldKey);
  }
}

export function readStoredValue(key: string): string | null {
  try {
    migrateStorageKeys(window.localStorage);
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
