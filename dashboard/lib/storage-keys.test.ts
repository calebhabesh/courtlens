import { describe, expect, it } from "vitest";
import { migrateStorageKeys, storageKeys } from "./storage-keys";

function fixtureStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  const storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); }
  } satisfies Storage;
  return storage;
}

describe("browser key migration", () => {
  it("retains density, sidebar preference and active chat, and is idempotent", () => {
    const storage = fixtureStorage({ courtload_table_density: "compact", "courtload-ask-sidebar-collapsed-v1": "true", "courtload-assistant-active-thread-v2": "thread-a", "courtload-assistant-history-change-v2": "change-a" });
    migrateStorageKeys(storage);
    migrateStorageKeys(storage);
    expect(storage.getItem(storageKeys.density)).toBe("compact");
    expect(storage.getItem(storageKeys.sidebar)).toBe("true");
    expect(storage.getItem(storageKeys.activeThread)).toBe("thread-a");
    expect(storage.getItem(storageKeys.historyChange)).toBe("change-a");
    expect(storage.length).toBe(4);
  });
  it("keeps a newer preference when both keys exist", () => {
    const storage = fixtureStorage({ courtload_table_density: "compact", [storageKeys.density]: "standard" });
    migrateStorageKeys(storage);
    expect(storage.getItem(storageKeys.density)).toBe("standard");
    expect(storage.getItem("courtload_table_density")).toBeNull();
  });
  it("retains the old key if persistence fails", () => {
    const storage = fixtureStorage({ courtload_table_density: "compact" });
    storage.setItem = () => { throw new Error("Storage unavailable"); };
    expect(() => migrateStorageKeys(storage)).toThrow("Storage unavailable");
    expect(storage.getItem("courtload_table_density")).toBe("compact");
  });
});
