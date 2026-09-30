#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step" (vercel.json -> ignoreCommand).
 * Exit 0 = skip this deployment, exit 1 = build it.
 *
 * Skips a deployment only when EVERY file changed since the last successful
 * deployment of this branch is documentation / repo metadata that cannot
 * affect the website (README, LICENSE, *.md, docs/**, .github/**).
 * Anything uncertain -> build. It can never skip a real change by mistake:
 *   - first deployment of a branch (no VERCEL_GIT_PREVIOUS_SHA)
 *   - "Redeploy" of the same commit
 *   - previous commit not in Vercel's shallow clone, or any git error
 *   - empty "trigger deploy" commits
 * Set FORCE_BUILD=1 (Vercel env var) to always build.
 *
 * Note: Vercel compares against the last *successful* deployment
 * (VERCEL_GIT_PREVIOUS_SHA), so a multi-commit push is diffed as a whole.
 */
import { execFileSync } from "node:child_process";

const DOCS_ONLY = [
  /\.md$/i,
  /(^|\/)LICENSE(\.[a-z]+)?$/i,
  /^docs\//,
  /^\.github\//,
  /^\.vscode\//,
  /^\.editorconfig$/,
];

function build(reason) {
  console.log(`✅ Building: ${reason}`);
  process.exit(1);
}

function skip(reason) {
  console.log(`🛑 Skipping build: ${reason}`);
  process.exit(0);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

if (process.env.FORCE_BUILD === "1") build("FORCE_BUILD=1");

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
let current = process.env.VERCEL_GIT_COMMIT_SHA;
if (!previous) build("no previous successful deployment for this branch");
try {
  current ||= git(["rev-parse", "HEAD"]);
} catch {
  build("cannot determine the current commit");
}
if (previous === current) build("redeploy of the same commit");

try {
  git(["cat-file", "-e", `${previous}^{commit}`]);
} catch {
  build(`previous deployment ${previous.slice(0, 7)} is not in the clone — cannot compare safely`);
}

let changed;
try {
  changed = git(["diff", "--name-only", previous, current]).split("\n").filter(Boolean);
} catch {
  build("git diff failed");
}

if (changed.length === 0) build("no file changes (explicit redeploy)");

const siteFiles = changed.filter((file) => !DOCS_ONLY.some((re) => re.test(file)));
if (siteFiles.length > 0) {
  build(`${siteFiles.length} site file(s) changed: ${siteFiles.slice(0, 5).join(", ")}${siteFiles.length > 5 ? ", …" : ""}`);
}

skip(`only docs / repo metadata changed (${changed.join(", ")})`);
