#!/usr/bin/env node
/**
 * Free local disk space (瘦身).
 *
 *   npm run clean                 build output, tool caches, untracked junk files
 *   npm run clean -- --all        …and node_modules too (reinstall with `npm ci`)
 *   npm run clean -- --dry-run    only list what would be removed
 *
 * Never touches files tracked by git — committed junk is reported by
 * `npm run guard` for a human to review instead.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const all = args.has("--all");

const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.(bak|tmp|temp|old|orig|rej|swp|swo|log)$|~$/i;

const TARGETS = [
  "dist",
  "dist-ssr",
  "coverage",
  ".eslintcache",
  "node_modules/.vite",
  "node_modules/.tmp",
  "node_modules/.cache",
  ...(all ? ["node_modules"] : []),
];

function sizeOf(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((n, name) => n + sizeOf(path.join(p, name)), 0);
}

function untrackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--others"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split("\0").filter((f) => f && !f.startsWith("node_modules/"));
  } catch {
    return null; // not a git checkout: only remove the well-known targets
  }
}

const removals = TARGETS.filter((t) => fs.existsSync(path.join(ROOT, t)));
for (const name of fs.readdirSync(ROOT)) if (name.endsWith(".tsbuildinfo")) removals.push(name);
for (const file of untrackedFiles() || []) {
  if (JUNK.test(file) && !removals.some((r) => file === r || file.startsWith(`${r}/`))) removals.push(file);
}

let freed = 0;
for (const target of removals) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) continue;
  const size = sizeOf(full);
  freed += size;
  console.log(`  ${dryRun ? "would remove" : "removed"}  ${target}  (${(size / 1024 / 1024).toFixed(2)} MB)`);
  if (!dryRun) fs.rmSync(full, { recursive: true, force: true });
}

console.log(
  removals.length
    ? `\n${dryRun ? "Would free" : "Freed"} ${(freed / 1024 / 1024).toFixed(2)} MB${all && !dryRun ? " — run `npm ci` to reinstall dependencies" : ""}\n`
    : "\nNothing to clean.\n"
);
