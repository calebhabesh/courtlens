import { readFile } from "node:fs/promises";
import path from "node:path";
export const publications = {
  blog: { title: "CourtLens engineering notes", file: "evidence-before-narrative.md" },
  "patch-notes": { title: "CourtLens patch notes", file: "2026-10-04-retained-operations.md" }
} as const;
export async function readPublication(kind: keyof typeof publications) {
  return readFile(path.join(process.cwd(), "content", publications[kind].file), "utf8");
}
