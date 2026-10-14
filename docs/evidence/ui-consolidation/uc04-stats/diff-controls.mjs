// Compare two measure-stats.mjs runs control by control: node diff-controls.mjs before.json after.json [state@width]
import { readFileSync } from "node:fs";
const [before, after] = process.argv.slice(2, 4).map(file => JSON.parse(readFileSync(file, "utf8")));
const only = process.argv[4];
const FIELDS = ["w", "h", "pad", "fs", "fw", "radius", "bg", "color", "border", "shadow"];
for (const run of before) {
  const id = `${run.state}@${run.width}`;
  if (only && id !== only) continue;
  const next = after.find(entry => entry.state === run.state && entry.width === run.width);
  if (!next || run.error || next.error) { console.log(`== ${id}: ${run.error ?? next?.error ?? "missing"}`); continue; }
  const lines = [];
  const used = new Set();
  const counts = {};
  for (const control of run.controls) {
    counts[control.key] = (counts[control.key] ?? 0) + 1;
    const match = next.controls.filter(candidate => candidate.key === control.key)[counts[control.key] - 1];
    if (!match) { lines.push(`  - removed ${control.key} ${control.w}x${control.h}`); continue; }
    used.add(match);
    const changes = FIELDS.filter(field => String(control[field]) !== String(match[field])).map(field => `${field} ${control[field]} → ${match[field]}`);
    const dy = +(match.y - control.y).toFixed(1), dx = +(match.x - control.x).toFixed(1);
    if (dx || dy) changes.push(`moved ${dx},${dy}`);
    const icons = JSON.stringify(control.svgs.map(svg => svg.w)) !== JSON.stringify(match.svgs.map(svg => svg.w));
    if (icons) changes.push(`icons ${control.svgs.map(svg => svg.w)} → ${match.svgs.map(svg => svg.w)}`);
    if (changes.length) lines.push(`  ~ ${control.key}: ${changes.join("; ")}`);
  }
  for (const control of next.controls) if (!used.has(control)) lines.push(`  + added ${control.key} ${control.w}x${control.h}`);
  console.log(`== ${id}: ${lines.length} changed`);
  for (const line of lines) console.log(line);
}
