#!/usr/bin/env node
/**
 * slim-guard — keeps the repo and the deployed bundle lean (瘦身 + 防呆).
 *
 *   node scripts/slim-guard.mjs repo   repository hygiene   (npm run guard / npm run check)
 *   node scripts/slim-guard.mjs dist   build output budget  (runs after every npm run build)
 *
 * Exits with code 1 when a rule is violated, which fails `npm run check`,
 * CI and the Vercel build before anything bloated or broken ships.
 * Emergency escape hatch: SLIM_GUARD=warn reports problems without failing.
 * Budgets live in LIMITS below — raise them deliberately, in a reviewed commit.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LIMITS = {
  repoFileBytes: 1_000_000, // any committed file (package-lock.json exempt)
  imageFileBytes: 300_000, // any committed image, anywhere (screenshots: resize + webp)
  repoTotalBytes: 3_000_000, // everything committed, excluding node_modules / dist / .git
  publicFileBytes: 500_000, // any file in public/ (copied to the CDN as-is)
  distTotalBytes: 3_000_000, // whole dist/ folder (currently ~1.4 MB)
  distFileBytes: 1_200_000, // any single emitted file (largest chunk ~0.7 MB)
  distFiles: 40,
  dependencies: 15, // runtime dependencies (warning only)
};

/** Raster images — allowed, but only small ones (see LIMITS.imageFileBytes). */
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|ico)$/i;

/**
 * Heavy media / design sources / archives that have no business in a web
 * repo — host them elsewhere and link to them.
 */
const HEAVY = /\.(mp4|mov|avi|mkv|webm|mp3|wav|flac|psd|ai|sketch|fig|xd|zip|rar|7z|tar|gz|tgz|pdf|exe|dmg|iso|glb|gltf|stl|obj|fbx|hdr|exr)$/i;

/** Backup / temp / OS junk that must never be committed or deployed. */
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.(bak|tmp|temp|old|orig|rej|swp|swo|log)$|~$/i;

/** Packages only needed at build time: they belong in devDependencies. */
const BUILD_ONLY = [
  /^@types\//, /^typescript$/, /^vite$/, /^@vitejs\//, /^vite-plugin-/, /^rollup/, /^esbuild$/,
  /^eslint/, /^@eslint\//, /^typescript-eslint$/, /^@typescript-eslint\//, /^globals$/,
  /^prettier/, /^tailwindcss$/, /^@tailwindcss\//, /^postcss/, /^autoprefixer$/, /^sass$/,
  /^vitest$/, /^jest$/, /^@testing-library\//, /^@babel\//, /^babel-/, /^@emotion\/babel-plugin$/,
];

/** Entries .vercelignore must keep (so local junk never reaches Vercel). */
const VERCELIGNORE_REQUIRED = [".git", "node_modules", "dist", "*.log", "*.bak", "*.tmp", "*.old", "uploads/"];

/** Files Vercel needs to build the site — .vercelignore must never hide them. */
const BUILD_INPUTS = [
  "index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json",
  "tsconfig.app.json", "tsconfig.node.json", "vercel.json", "src/main.tsx",
  "scripts/slim-guard.mjs", "scripts/vercel-ignore-build.mjs", "scripts/patch-dxf-writer.mjs",
];

/** Files browsers/crawlers request by convention, even if nothing links them. */
const PUBLIC_ALLOW_UNREFERENCED = /^(favicon\.ico|robots\.txt|sitemap\.xml|humans\.txt|security\.txt|\.well-known\/.*|apple-touch-icon.*\.png)$/i;

// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];
const error = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function walk(dir, skip = new Set([".git", "node_modules", "dist"])) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, skip));
    else out.push(rel(full));
  }
  return out;
}

/** Files that are (or would be) committed: tracked + untracked-but-not-ignored. */
function projectFiles() {
  const listed = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (listed === null) return { files: walk(ROOT), tracked: null };
  const files = [...new Set(listed.split("\0").filter(Boolean))].filter((f) => exists(f));
  const tracked = new Set((git(["ls-files", "-z"]) || "").split("\0").filter(Boolean));
  return { files, tracked };
}

/** Minimal gitignore-style matcher (enough for .vercelignore sanity checks). */
function ignoreMatcher(lines) {
  const rules = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      let pat = negate ? line.slice(1) : line;
      const dirOnly = pat.endsWith("/");
      if (dirOnly) pat = pat.slice(0, -1);
      const anchored = pat.startsWith("/") || pat.includes("/");
      pat = pat.replace(/^\//, "");
      const body = pat
        .split("**")
        .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
        .join(".*");
      const re = new RegExp(`${anchored ? "^" : "(^|/)"}${body}${dirOnly ? "/" : "(/|$)"}`);
      return { negate, re };
    });
  return (file) => {
    let ignored = false;
    for (const { negate, re } of rules) if (re.test(file)) ignored = !negate;
    return ignored;
  };
}

/** Lockfile entries that no dependency path reaches (dead weight). */
function orphanLockEntries(lock) {
  const pkgs = lock.packages || {};
  const resolve = (from, dep) => {
    let base = from;
    for (;;) {
      const candidate = `${base ? `${base}/` : ""}node_modules/${dep}`;
      if (pkgs[candidate]) return candidate;
      if (!base) return null;
      const i = base.lastIndexOf("/node_modules/");
      base = i === -1 ? "" : base.slice(0, i);
    }
  };
  const seen = new Set([""]);
  const queue = [""];
  while (queue.length) {
    const at = queue.pop();
    const meta = pkgs[at] || {};
    if (meta.link && meta.resolved && !seen.has(meta.resolved)) {
      seen.add(meta.resolved);
      queue.push(meta.resolved);
    }
    const deps = {
      ...meta.dependencies,
      ...meta.optionalDependencies,
      ...meta.peerDependencies,
      ...(at === "" ? meta.devDependencies : {}),
    };
    for (const dep of Object.keys(deps)) {
      const hit = resolve(at, dep);
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        queue.push(hit);
      }
    }
  }
  return Object.keys(pkgs).filter((k) => k && !seen.has(k));
}

/** src/ files not reachable from the entry point through imports. */
function orphanSources(files) {
  const sources = files.filter((f) => /^src\/.*\.(tsx?|css)$/.test(f) && !/\.d\.ts$/.test(f));
  const entry = "src/main.tsx";
  if (!exists(entry)) return [];
  const exts = ["", ".ts", ".tsx", ".css", "/index.ts", "/index.tsx"];
  const resolve = (from, spec) => {
    let base = null;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith(".")) base = path.posix.normalize(`${path.posix.dirname(from)}/${spec}`);
    if (!base) return null;
    for (const ext of exts) {
      const candidate = base + ext;
      if (exists(candidate) && fs.statSync(path.join(ROOT, candidate)).isFile()) return candidate;
    }
    return null;
  };
  const seen = new Set([entry]);
  const queue = [entry];
  const IMPORT = /(?:^|[^\w$])(?:import|export)\s*(?:[^"'`;]*?\s*from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while (queue.length) {
    const file = queue.pop();
    const text = read(file);
    for (const match of text.matchAll(IMPORT)) {
      const hit = resolve(file, match[1] ?? match[2]);
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        queue.push(hit);
      }
    }
  }
  return sources.filter((f) => !seen.has(f));
}

// ---------------------------------------------------------------------------

function checkRepo() {
  const { files, tracked } = projectFiles();
  let totalBytes = 0;

  for (const file of files) {
    const size = fs.statSync(path.join(ROOT, file)).size;
    totalBytes += size;

    if (JUNK.test(file)) error(`junk / backup file: ${file} — delete it (npm run clean removes untracked ones)`);
    if (/^(node_modules|dist|\.vercel|uploads|coverage)\//.test(file) && (!tracked || tracked.has(file))) {
      error(`generated / upload folder committed: ${file}`);
    }
    if (/(^|\/)\.env(\..+)?\.local$/.test(file)) error(`local env file would be committed: ${file}`);
    if (file !== "package-lock.json" && size > LIMITS.repoFileBytes) {
      error(`oversized file ${file} (${kb(size)} > ${kb(LIMITS.repoFileBytes)}) — compress it or host it elsewhere`);
    }
    if (file.startsWith("public/") && size > LIMITS.publicFileBytes) {
      error(`public asset too large: ${file} (${kb(size)} > ${kb(LIMITS.publicFileBytes)})`);
    }
    if (IMAGE.test(file) && size > LIMITS.imageFileBytes) {
      error(`image too large: ${file} (${kb(size)} > ${kb(LIMITS.imageFileBytes)}) — resize to ≤ 1400 px and save as WebP`);
    }
    if (HEAVY.test(file)) {
      error(`heavy media / archive committed: ${file} — host it outside the repo (Release asset, cloud drive) and link to it`);
    }
  }
  if (totalBytes > LIMITS.repoTotalBytes) {
    error(`repository is ${kb(totalBytes)} (budget ${kb(LIMITS.repoTotalBytes)}) — see docs/SLIM.md before raising the budget`);
  }

  // Source files nothing imports are dead weight that still gets uploaded,
  // type-checked and linted on every deploy.
  for (const orphan of orphanSources(files)) {
    error(`unused source file: ${orphan} — nothing imports it from src/main.tsx; delete it or wire it in`);
  }

  // public/ assets that nothing references are deployed for nothing
  const publicFiles = files.filter((f) => f.startsWith("public/"));
  if (publicFiles.length) {
    const sources = files
      .filter((f) => f === "index.html" || (/^(src|public)\//.test(f) && /\.(tsx?|jsx?|css|html|json|webmanifest|svg)$/.test(f)))
      .map((f) => read(f))
      .join("\n");
    for (const file of publicFiles) {
      const servedAs = file.slice("public/".length);
      if (PUBLIC_ALLOW_UNREFERENCED.test(servedAs)) continue;
      if (!sources.includes(servedAs) && !sources.includes(path.posix.basename(servedAs))) {
        error(`unreferenced public asset: ${file} — nothing in index.html / src uses it`);
      }
    }
  }

  // package.json: build-only tools belong in devDependencies
  const pkg = JSON.parse(read("package.json"));
  const deps = Object.keys(pkg.dependencies || {});
  for (const name of deps) {
    if (BUILD_ONLY.some((re) => re.test(name))) error(`"${name}" is a build-time tool: move it to devDependencies`);
  }
  if (deps.length > LIMITS.dependencies) {
    warn(`${deps.length} runtime dependencies (budget ${LIMITS.dependencies}) — make sure each one is really needed`);
  }

  // package-lock.json: must exist, match package.json, and carry no dead entries
  if (!exists("package-lock.json")) {
    error("package-lock.json is missing — run npm install and commit it (reproducible Vercel installs)");
  } else {
    const lock = JSON.parse(read("package-lock.json"));
    const root = (lock.packages || {})[""] || {};
    for (const field of ["dependencies", "devDependencies"]) {
      const want = pkg[field] || {};
      const have = root[field] || {};
      const drift = [...new Set([...Object.keys(want), ...Object.keys(have)])].filter((n) => want[n] !== have[n]);
      if (drift.length) error(`package-lock.json out of sync with package.json ${field} (${drift.join(", ")}) — run npm install`);
    }
    const orphans = orphanLockEntries(lock);
    if (orphans.length) {
      error(`package-lock.json has ${orphans.length} orphan entries (e.g. ${orphans.slice(0, 3).join(", ")}) — run npm install to prune`);
    }
  }

  // .gitignore must keep dependencies and build output out of git
  const gitignore = exists(".gitignore") ? read(".gitignore").split(/\r?\n/).map((l) => l.trim()) : [];
  for (const entry of ["node_modules", "dist"]) {
    if (!gitignore.includes(entry) && !gitignore.includes(`${entry}/`) && !gitignore.includes(`/${entry}`)) {
      error(`.gitignore must contain "${entry}"`);
    }
  }

  // .vercelignore: present, complete, and not hiding build inputs
  if (!exists(".vercelignore")) {
    error(".vercelignore is missing");
  } else {
    const lines = read(".vercelignore").split(/\r?\n/);
    const norm = (l) => l.trim().replace(/^\//, "").replace(/\/$/, "");
    const present = new Set(lines.map(norm));
    for (const entry of VERCELIGNORE_REQUIRED) {
      if (!present.has(norm(entry))) error(`.vercelignore must contain "${entry}"`);
    }
    const isIgnored = ignoreMatcher(lines);
    for (const file of BUILD_INPUTS) {
      if (isIgnored(file)) error(`.vercelignore hides a build input: ${file} — the Vercel build would break`);
    }
    const hidden = files.filter((f) => f.startsWith("src/") && isIgnored(f));
    if (hidden.length) error(`.vercelignore hides source files, e.g. ${hidden.slice(0, 3).join(", ")}`);
  }

  // vercel.json: must upload/serve only the Vite output
  if (!exists("vercel.json")) {
    error("vercel.json is missing");
  } else {
    let cfg = null;
    try {
      cfg = JSON.parse(read("vercel.json"));
    } catch (e) {
      error(`vercel.json is not valid JSON: ${e.message}`);
    }
    if (cfg) {
      if (cfg.outputDirectory !== "dist") error(`vercel.json outputDirectory must be "dist" (Vite build.outDir), got ${JSON.stringify(cfg.outputDirectory)}`);
      if (!cfg.buildCommand) error("vercel.json should pin buildCommand (npm run build)");
      const script = /node\s+(\S+\.m?js)/.exec(cfg.ignoreCommand || "")?.[1];
      if (script && !exists(script)) error(`vercel.json ignoreCommand points to a missing file: ${script}`);
    }
  }

  return { summary: `${files.length} project files, ${kb(totalBytes)} (excluding node_modules / dist / .git)` };
}

function checkDist() {
  const DIST = path.join(ROOT, "dist");
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    error("dist/index.html not found — run the build first");
    return { summary: "no build output" };
  }

  const files = walk(DIST, new Set()).map((f) => {
    const full = path.join(ROOT, f);
    const buf = fs.readFileSync(full);
    const isText = /\.(html|js|css|svg|json|txt|webmanifest)$/.test(f);
    return { file: f.replace(/^dist\//, ""), size: buf.length, gzip: isText ? zlib.gzipSync(buf, { level: 9 }).length : buf.length, text: isText ? buf.toString("utf8") : "" };
  });

  const total = files.reduce((n, f) => n + f.size, 0);
  const totalGzip = files.reduce((n, f) => n + f.gzip, 0);

  if (total > LIMITS.distTotalBytes) error(`dist/ is ${kb(total)} (budget ${kb(LIMITS.distTotalBytes)}) — find what grew before deploying`);
  if (files.length > LIMITS.distFiles) error(`dist/ has ${files.length} files (budget ${LIMITS.distFiles})`);

  const referenced = files.filter((f) => f.text).map((f) => f.text).join("\n");
  for (const f of files) {
    if (f.size > LIMITS.distFileBytes) error(`dist/${f.file} is ${kb(f.size)} (per-file budget ${kb(LIMITS.distFileBytes)})`);
    if (f.file.endsWith(".d.ts")) error(`type declarations leaked into the site: dist/${f.file}`);
    if (f.file.endsWith(".map") && process.env.SLIM_ALLOW_SOURCEMAPS !== "1") {
      error(`source map would be deployed: dist/${f.file} (set SLIM_ALLOW_SOURCEMAPS=1 if intended)`);
    }
    if (JUNK.test(f.file)) error(`junk file in build output: dist/${f.file}`);
    const base = path.posix.basename(f.file);
    if (f.file !== "index.html" && !PUBLIC_ALLOW_UNREFERENCED.test(f.file) && !referenced.includes(base)) {
      warn(`dist/${f.file} is not referenced by any page, script or stylesheet`);
    }
  }

  console.log("\n  dist/ contents (largest first)");
  for (const f of [...files].sort((a, b) => b.size - a.size)) {
    console.log(`    ${f.file.padEnd(40)} ${kb(f.size).padStart(10)}   gzip ${kb(f.gzip).padStart(9)}`);
  }
  return { summary: `${files.length} files, ${kb(total)} (gzip ${kb(totalGzip)}) — budget ${kb(LIMITS.distTotalBytes)}` };
}

// ---------------------------------------------------------------------------

const mode = process.argv[2];
if (mode !== "repo" && mode !== "dist") {
  console.error("usage: node scripts/slim-guard.mjs <repo|dist>");
  process.exit(2);
}

const { summary } = mode === "repo" ? checkRepo() : checkDist();
const label = mode === "repo" ? "repository hygiene" : "build output budget";

for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✖ ${e}`);

if (errors.length === 0) {
  console.log(`\n✔ slim-guard (${label}): ${summary}${warnings.length ? `, ${warnings.length} warning(s)` : ""}\n`);
} else if (process.env.SLIM_GUARD === "warn") {
  console.log(`\n⚠ slim-guard (${label}): ${errors.length} problem(s) ignored because SLIM_GUARD=warn — ${summary}\n`);
} else {
  console.log(`\n✖ slim-guard (${label}): ${errors.length} problem(s) — ${summary}`);
  console.log("  Fix them, or raise the budget in scripts/slim-guard.mjs in a reviewed commit.\n");
  process.exit(1);
}
