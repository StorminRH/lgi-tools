// fallow trial — same-diff metrics capture (M1–M7).
//
// Runs fallow + knip + eslint on the current commit, captures each tool's
// machine-readable output into ./fallow-out/, and writes a manifest recording
// the commit, the PR base, the changed-file list, and tool versions — so the
// per-PR scorecard in docs/fallow-trial-results.md is derivable later from the
// stored artifacts. NON-GATING: a tool exiting non-zero because it FOUND issues
// is normal here; we want the JSON, not a pass/fail. This script never throws on
// a tool's finding-exit and always writes what it can.
//
// Invoked by `pnpm metrics:capture` (locally and from .github/workflows/fallow.yml).
// knip needs DATABASE_URL — the workflow sets the same placeholder test.yml uses.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const OUT = "fallow-out";
mkdirSync(OUT, { recursive: true });

/** Run a command, capture stdout to a file, swallow finding-exits. */
function capture(label, file, cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  const stdout = res.stdout ?? "";
  writeFileSync(`${OUT}/${file}`, stdout);
  const note = res.error
    ? `spawn error: ${res.error.message}`
    : `exit ${res.status}`;
  console.log(`[metrics] ${label} -> ${OUT}/${file} (${note}, ${stdout.length} bytes)`);
  return { status: res.status, bytes: stdout.length, error: res.error?.message };
}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

// --- Resolve the diff scope. fallow audit auto-detects its own base; knip and
// eslint are whole-repo, so we record the changed files for analysis-time
// intersection rather than trying to scope those tools to the diff. ---
const head = git(["rev-parse", "HEAD"]);
let base = process.env.FALLOW_BASE_SHA?.trim() || "";
if (!base) base = git(["merge-base", "origin/main", "HEAD"]) || git(["rev-parse", "HEAD~1"]);
const changedFiles = base
  ? git(["diff", "--name-only", `${base}`, "HEAD"]).split("\n").filter(Boolean)
  : [];

// --- The three tools, each captured to its own file. ---
const results = {};
results.fallow = capture(
  "fallow audit",
  "fallow-audit.json",
  "pnpm",
  ["exec", "fallow", "audit", "--format", "json"],
);
results.knip = capture(
  "knip",
  "knip-results.json",
  "pnpm",
  ["exec", "knip", "--reporter", "json", "--no-exit-code"],
  // Mirror the `knip` npm script's placeholder so drizzle.config.ts doesn't throw.
  { DATABASE_URL: process.env.DATABASE_URL || "postgres://placeholder@localhost:5432/placeholder" },
);
results.eslint = capture(
  "eslint",
  "eslint-results.json",
  "pnpm",
  ["exec", "eslint", "--format", "json"],
);

// --- Tool versions (from the installed lockfile state, for reproducibility). ---
function pkgVersion(name) {
  try {
    return JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
  } catch {
    return null;
  }
}

const manifest = {
  capturedAt: new Date().toISOString(),
  commit: head,
  baseSha: base || null,
  changedFiles,
  changedFileCount: changedFiles.length,
  tools: {
    fallow: pkgVersion("fallow"),
    knip: pkgVersion("knip"),
    eslint: pkgVersion("eslint"),
    node: process.version,
  },
  capture: results,
};
writeFileSync(`${OUT}/metrics-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`[metrics] manifest -> ${OUT}/metrics-manifest.json (base ${base || "none"}, ${changedFiles.length} changed files)`);
