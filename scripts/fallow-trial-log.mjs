// fallow trial — per-PR log block generator.
//
// Pre-fills the MECHANICAL fields of a `docs/fallow-trial-results.md` per-PR block
// from a PR's `fallow-metrics-<PR#>` CI artifact (produced by fallow-metrics.mjs
// via .github/workflows/fallow.yml). It extracts the counts that don't need
// judgment — fallow's findings by category, knip/eslint findings, dead-code
// overlap, auto-fixable share, CI time — and emits a markdown block with the
// JUDGMENT fields (true/false-positive labels for M1/M3, would-block-justified
// for M5) left as `TODO` for the reviewer. It does NOT write the doc; it prints
// the block to stdout so you paste it into the matching `### PR #<n>` stub.
//
//   pnpm trial:log <PR#>                      # download the artifact via gh, then parse
//   pnpm trial:log <PR#> --artifact-dir <dir> # parse an already-downloaded bundle
//
// Why a human still finishes the block: M1 (net-new true positives) and M3 (false
// positives) require adjudicating each fallow-only finding as real or not — that's
// judgment, not extraction. See docs/fallow-trial.md.

import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const pr = args.find((a) => /^\d+$/.test(a));
const dirFlag = args.indexOf("--artifact-dir");
let artifactDir = dirFlag >= 0 ? args[dirFlag + 1] : null;

if (!pr && !artifactDir) {
  console.error("usage: node scripts/fallow-trial-log.mjs <PR#> [--artifact-dir <dir>]");
  process.exit(2);
}

function sh(cmd, a) {
  return spawnSync(cmd, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function readJson(path, fallback) {
  try {
    const raw = readFileSync(path, "utf8").trim();
    return raw ? JSON.parse(raw) : fallback; // knip prints nothing when clean
  } catch {
    return fallback;
  }
}

// --- 1. Resolve the artifact bundle. ---
let runDurationSec = null;
if (!artifactDir) {
  // Find the most recent `fallow (eval)` run for this PR's head and download its
  // metrics artifact. Best-effort: if gh isn't authed or the artifact has expired
  // (30-day retention), fall back to printing an empty block to fill by hand.
  const head = sh("gh", ["pr", "view", pr, "--json", "headRefName,headRefOid"]);
  let headRef = null, headSha = null;
  try { const j = JSON.parse(head.stdout); headRef = j.headRefName; headSha = j.headRefOid; } catch {}
  const runs = sh("gh", ["run", "list", "--workflow", "fallow.yml", "--branch", headRef || "",
    "--json", "databaseId,headSha,createdAt,startedAt,updatedAt", "-L", "20"]);
  let runId = null;
  try {
    const list = JSON.parse(runs.stdout);
    const match = list.find((r) => r.headSha === headSha) || list[0];
    if (match) {
      runId = match.databaseId;
      const s = match.startedAt && match.updatedAt ? (Date.parse(match.updatedAt) - Date.parse(match.startedAt)) / 1000 : null;
      runDurationSec = s && s > 0 ? Math.round(s) : null;
    }
  } catch {}
  if (runId) {
    artifactDir = mkdtempSync(join(tmpdir(), "fallow-trial-"));
    const dl = sh("gh", ["run", "download", String(runId), "--name", `fallow-metrics-${pr}`, "--dir", artifactDir]);
    if (dl.status !== 0) {
      console.error(`[trial:log] could not download fallow-metrics-${pr} (run ${runId}); the artifact may have expired (30-day retention).`);
      console.error(dl.stderr?.slice(0, 400) || "");
      artifactDir = null;
    }
  } else {
    console.error("[trial:log] could not resolve a fallow workflow run for this PR; pass --artifact-dir to parse a downloaded bundle.");
  }
}

// --- 2. Parse the bundle. ---
const M = artifactDir ? readJson(join(artifactDir, "metrics-manifest.json"), {}) : {};
const A = artifactDir ? readJson(join(artifactDir, "fallow-audit.json"), {}) : {};
const K = artifactDir ? readJson(join(artifactDir, "knip-results.json"), null) : null;
const E = artifactDir ? readJson(join(artifactDir, "eslint-results.json"), []) : [];

const sum = A.summary || {};
const deadCode = sum.dead_code_issues ?? "?";
const complexity = sum.complexity_findings ?? "?";
const duplication = sum.duplication_clone_groups ?? "?";
// boundary findings live in the dead_code section's boundary_violations, if present
const dc = A.dead_code || {};
const boundary = Array.isArray(dc.boundary_violations) ? dc.boundary_violations.length
  : (dc.boundary_violations ?? "?");

// auto-fixable share across fallow's actionable findings (branch per finding's bool)
let autoYes = 0, autoTotal = 0;
for (const arr of [dc.unused_exports, dc.unused_files, dc.unused_types, dc.unused_dependencies]) {
  if (!Array.isArray(arr)) continue;
  for (const f of arr) {
    autoTotal++;
    if ((f.actions || []).some((x) => x.auto_fixable)) autoYes++;
  }
}

// knip dead-code finding count (json reporter shape varies; count leaf issues best-effort)
function knipCount(k) {
  if (!k) return 0;
  if (Array.isArray(k)) return k.length;
  // knip object reporter: { files: [...], issues: {...} } — sum what we can see
  let n = 0;
  if (Array.isArray(k.files)) n += k.files.length;
  if (k.issues && typeof k.issues === "object") {
    for (const v of Object.values(k.issues)) n += Array.isArray(v) ? v.length : (typeof v === "number" ? v : 0);
  }
  return n;
}
const knipDead = knipCount(K);

// eslint: total + boundary/unused-rule messages
let esErr = 0, esWarn = 0, esBoundary = 0, esUnused = 0;
for (const file of Array.isArray(E) ? E : []) {
  esErr += file.errorCount || 0;
  esWarn += file.warningCount || 0;
  for (const m of file.messages || []) {
    const r = m.ruleId || "";
    if (r.startsWith("boundaries/")) esBoundary++;
    if (r.includes("no-unused-vars")) esUnused++;
  }
}

const verdict = A.verdict ?? "?";
const wouldBlock = verdict === "fail" ? "Y" : "N";
const fallowTotal = [deadCode, duplication, complexity].every((x) => typeof x === "number")
  ? deadCode + duplication + complexity + (typeof boundary === "number" ? boundary : 0) : "?";

// --- 3. Emit the pre-filled block. ---
const date = (M.capturedAt || "").slice(0, 10) || "20__-__-__";
const diff = M.changedFileCount != null ? `${M.changedFileCount} files` : "__ files";
const ci = runDurationSec != null ? `${runDurationSec}` : "__";

const block = `### PR #${pr || "__"} — ${date} — branch/sub-version: ${M.branch || "____"} — diff: ${diff} / +__/-__
- **fallow findings by category:** dead-code ${deadCode} · duplication ${duplication} · complexity ${complexity} · boundary ${boundary}
- **knip dead-code findings:** ${knipDead}
- **relevant ESLint findings (boundary / unused):** boundary ${esBoundary} · no-unused-vars ${esUnused} (errors ${esErr}, warnings ${esWarn})
- **fallow-only confirmed TPs (M1):** TODO — adjudicate each fallow-only finding; list: ____
- **dead-code overlap (M2):** agree __ · fallow-only __ · knip-only __ · contradiction __  (fallow dead-code=${deadCode}, knip=${knipDead} — intersect by file+symbol)
- **false positives (M3):** fallow TODO · knip __ · eslint __
- **CI time (M4):** fallow ${ci}s · knip __s  (fallow = whole eval run; split knip from the metrics step log if needed)
- **would-block? (M5):** ${wouldBlock} (audit verdict: ${verdict}) — justified? TODO — note: ____
- **auto-fixable share (M6):** ${autoYes} / ${autoTotal} fallow findings auto_fixable (verify they apply + pass tsc/tests)
- **maintenance/notes (M7):** ____  (fallow ${M.tools?.fallow || "?"}, knip ${M.tools?.knip || "?"}, base ${(M.baseSha || "?").slice(0, 8)})
`;

console.log("\n# Paste into docs/fallow-trial-results.md, replacing the `### PR #" + (pr || "n") + "` stub.");
console.log("# Mechanical fields are pre-filled; complete the TODO judgment fields (M1/M3/M5).\n");
console.log(block);
