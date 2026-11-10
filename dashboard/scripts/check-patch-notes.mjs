#!/usr/bin/env node
// Checks dashboard/content/patch-notes.json against git and the progress logs (Research R11).
// Needs full history, so it runs during verification rather than in CI (which clones at depth 1).
// Usage: node dashboard/scripts/check-patch-notes.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const notes = JSON.parse(readFileSync(path.join(root, "dashboard/content/patch-notes.json"), "utf8"));
const problems = [];
let checked = 0;

function commit(hash) {
  try {
    const [date, subject] = execFileSync("git", ["log", "-1", "--date=format:%Y-%m-%d", "--format=%ad%x00%s", hash], { cwd: root, encoding: "utf8" }).trim().split("\0");
    return { date, subject };
  } catch {
    return null;
  }
}

function expectCommit(hash, date, where) {
  checked += 1;
  const found = commit(hash);
  if (!found) problems.push(`${where}: commit ${hash} not found`);
  else if (found.date !== date) problems.push(`${where}: ${hash} is dated ${found.date}, not ${date}`);
  return found;
}

// RD07: version numbers run in merge order, newest release first, with no gaps or repeats.
const numbers = notes.releases.map(release => release.number);
const parsed = numbers.map(number => number?.match(/^v(\d+)\.(\d+)$/));
checked += 1;
if (parsed.some(match => !match)) problems.push(`version numbers must look like v1.6: ${numbers.join(", ")}`);
else for (let index = 1; index < parsed.length; index += 1) {
  const [newer, older] = [parsed[index - 1], parsed[index]].map(match => [Number(match[1]), Number(match[2])]);
  const next = newer[0] === older[0] ? newer[1] === older[1] + 1 : newer[0] === older[0] + 1 && newer[1] === 0;
  if (!next) problems.push(`${numbers[index - 1]} does not follow ${numbers[index]}`);
}
if (notes.releases.slice(1).some(release => release.merge === null && release.version !== "main")) problems.push("only the newest release may be unmerged");
for (const [index, release] of notes.releases.entries()) {
  const merged = notes.releases.slice(index + 1).filter(older => older.merge);
  if (release.merge && merged.some(older => older.merge.date > release.merge.date)) problems.push(`${release.number} merged before an older number`);
}

for (const release of notes.releases) {
  if (release.merge) {
    const merge = expectCommit(release.merge.commit, release.merge.date, `${release.id} merge`);
    const pr = release.version.match(/^PR #(\d+)$/);
    if (merge && pr && !merge.subject.includes(`#${pr[1]}`)) problems.push(`${release.id}: merge subject "${merge.subject}" does not name #${pr[1]}`);
  }
  for (const group of release.groups) for (const entry of group.entries) {
    const where = `${release.id} / ${entry.title}`;
    expectCommit(entry.commit, entry.date, where);
    if (entry.date < release.range.from || entry.date > release.range.to) problems.push(`${where}: ${entry.date} outside ${release.range.from} to ${release.range.to}`);
    // Commits quoted in the text, as "(abc1234)" or "(abc1234, YYYY-MM-DD)".
    for (const quoted of `${entry.text} ${(entry.bullets ?? []).join(" ")}`.matchAll(/\(([0-9a-f]{7})(?:, (\d{4}-\d{2}-\d{2}))?\)/g)) {
      const found = expectCommit(quoted[1], quoted[2] ?? commit(quoted[1])?.date ?? "", `${where} (quoted)`);
      if (found && (found.date < release.range.from || found.date > release.range.to) && !quoted[2]) problems.push(`${where}: quoted ${quoted[1]} outside the release range`);
    }
    if (entry.log) {
      checked += 1;
      const log = readFileSync(path.join(root, entry.log.file), "utf8");
      if (!log.split("\n").includes(`## ${entry.log.heading}`)) problems.push(`${where}: heading "${entry.log.heading}" not in ${entry.log.file}`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`patch notes: ${checked} commit and log references match`);
