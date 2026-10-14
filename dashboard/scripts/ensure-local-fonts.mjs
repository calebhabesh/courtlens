import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const fontDirectory = new URL("../public/fonts/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", fontDirectory), "utf8"));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

for (const font of manifest.fonts.filter(font => font.acquire_at_setup)) {
  const target = new URL(font.file, fontDirectory);
  try {
    const existing = await readFile(target);
    if (digest(existing) !== font.sha256) {
      throw new Error(`${font.file} differs from its pinned original. Remove it and rerun npm run fonts:ensure.`);
    }
    continue;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const response = await fetch(font.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Fontshare returned ${response.status} for ${font.name}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== font.sha256) throw new Error(`${font.name} download differs from its pinned original.`);
  await writeFile(target, bytes);
  console.log(`Acquired ${font.name}: ${bytes.length} bytes, verified SHA-256.`);
}
