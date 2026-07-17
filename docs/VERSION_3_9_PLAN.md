# VERSION 3.9 PLAN — Refit

> Pairs with `docs/SESSION_CONTRACTS.md` and the contracts `plan-version` will
> derive from it. The roadmap below is the source of truth for sequence/status;
> each session contract is the source of truth for its session's executable
> requirements. Standing workflow: the lifecycle resolver selects every stage;
> branch per sub-version; sessions commit in-branch with `pnpm verify`; one PR
> per completed sub-version; Greptile on PR open is the gate of record;
> UX-touching sub-versions pause for Ryan's local dev-server review before the
> PR opens; every session ends through `close-out`.
>
> **Numbering:** segmented by PHASE. Sub-versions are `3.9.<phase>.<slice>`
> (one branch + one PR each); sessions add a final digit and are written out
> only where a slice has more than one. CHANGELOG nests every sub-version under
> 3.9.
>
> **Contract-extraction convention (new this version):** every sub-version in
> §Phase narrative carries a fixed spec block — Objective / Done means / In
> scope / Out of scope / Dependencies / Decisions the session plan must resolve
> / Baseline & hotspot note / Delivery evidence. `plan-version` maps these
> 1:1 onto the contract shape in `docs/SESSION_CONTRACTS.md`; the plan states
> *what must be true*, never implementation steps.

## What this is

3.9 is a refit pass: no new flagship tools. One thesis — **better primitives
at every layer** — expressed in three arcs. A primitive is the smallest unit
of meaning the system exposes; every decision a primitive owns is a decision
the agent can no longer get wrong. (1) **Workflow mechanization**: the
agent-tools layer — convert the lifecycle's judgment-dependent checks into
local scripts and machine-readable state, extending the resolver philosophy
one ring outward; (2) **Primitive lifecycle** (systems-design arc): run the
create / combine / delete / expand lifecycle over the application's
primitives — six pre-judged, code-verified verdicts followed by a
primitives-scoped audit that maps every area (UI, API, data, infra, agent
tools/workflow, auth/trust) and reports what remains — so repeated agent
decisions become owned decisions; (3) **Backlog clearance**: triage
`docs/backlog.md` and ship the refit-shaped items — stale entries deleted,
small deferrals landed, and the well-documented medium items (image
resolver, dev-perf, update-watch, the invalid-route error) delivered;
(4) **Continuity & recovery**: verify the system — and the process that
builds it — survives losing a machine or a service: workspace continuity,
database and Convex recovery drills, the secrets/bootstrap runbook, and
restoring the broken production browser smoke.
The version starts from the verified 3.8 cycle-2 baseline (2026-07-16,
`291ee78`): all five v3.8 campaigns Verified, the campaign queue empty,
and four Watch findings carried forward (AF-006 telemetry queries, AF-007
refresh-jobs queries, AF-008 `auth-surface`, AF-009 the cron-shell
clone). The elective-campaign decision is recorded in §Elective health
campaign: none — the queue is empty.

## Status

| Sub-version | Theme | Sessions | Status |
|---|---|---|---|
| **Phase 1 — Workflow mechanization** | | | |
| 3.9.1.1 | Lifecycle doc reconciliation & machine-readable formats | 1 | SHIPPED |
| 3.9.1.2 | Resolver hardening (vocabulary, markers, git awareness) | 1 | SHIPPED |
| 3.9.1.3 | Evidence & reference checkers | 1 | SHIPPED |
| 3.9.1.4 | Baseline claims & Watch tripwires | 1 | SHIPPED |
| 3.9.1.5 | Close-out gate mechanization | 1 | SHIPPED |
| 3.9.1.6 | Drift-manifest derivation | 1 | SHIPPED |
| 3.9.1.7 | Comment standard migration & enforcement | 2 (one branch) | SHIPPED |
| **Phase 2 — Primitive lifecycle** | | | |
| 3.9.2.1 | Real-Postgres test harness promotion (Expand) | 1 | SHIPPED |
| 3.9.2.2 | Cron shell & wake policy (Expand; retires `dup:b54bf337`, fixes the idle Neon wake) | 2 (one branch) | SHIPPED |
| 3.9.2.3 | ESI dataset registry & freshness gate (Create + Expand/Combine — one declaration, placement and staleness) | 2 (one branch) | SHIPPED |
| 3.9.2.4 | Endpoint contract gate (Expand) | 1 | SHIPPED |
| 3.9.2.5 | ux-check probe harness (Combine ~30 one-off probes) | 1 | SHIPPED |
| 3.9.2.6 | Dataset declaration manifest (judged: fold purge/growth into the 3.9.2.3 registry, or Keep) | 1 | SHIPPED |
| 3.9.2.7 | Primitives-scoped audit & ledger (report; Ryan decides extensions) | 1 | PLANNED |
| 3.9.2.8 | Planner freshness consumption (PL-011 Expand) | 1 | PLANNED |
| 3.9.2.9 | UI wrapper import rail (PL-012 Expand) | 1 | PLANNED |
| 3.9.2.10 | Token-vend scope cleanup (PL-013 Delete) | 1 | PLANNED |
| **Phase 3 — Backlog clearance** | | | |
| 3.9.3.1 | Backlog triage & hygiene sweep | 1 | PLANNED |
| 3.9.3.2 | EVE image resolver & app-wide adoption | 1 | PLANNED |
| 3.9.3.3 | Invalid-route rendering fix (React #419) | 1 | PLANNED |
| 3.9.3.4 | Local dev performance | 2 (one branch) | PLANNED |
| 3.9.3.5 | Update-watch routine (report-only dependency/service watch) | 1 | PLANNED |
| 3.9.3.6 | Planner polish pair (multibuy pinned row + primitive fidelity) | 1 | PLANNED |
| 3.9.3.7 | Operator verification session (Convex/Upstash usage cells) | 1 | PLANNED |
| 3.9.3.8 | Public document truth pass (README/CONTRIBUTING/templates/.env.example/legal) | 1 | PLANNED |
| **Phase 4 — Continuity & recovery** | | | |
| 3.9.4.1 | Production smoke restoration (browser-control diagnosis) | 1 | PLANNED |
| 3.9.4.2 | Workspace continuity (mechanism + restore drill) | 1 | PLANNED |
| 3.9.4.3 | Neon recovery posture & drill | 1 | PLANNED |
| 3.9.4.4 | Convex regenerability drill | 1 | PLANNED |
| 3.9.4.5 | Secrets & bootstrap runbook | 1 | PLANNED |

*(Elective health campaign: none scheduled — decision recorded below the
phase narratives. The cycle-2 campaign queue is empty.)*


## Phase 1 — Workflow mechanization (3.9.1.x)

**Arc thesis.** v3.8 proved the resolver model: state lives in documents,
one script derives the next action, contradictions stop the line. But the ring
around the resolver — SCRATCHPAD agreement, baseline truthfulness, Watch
triggers, PR hygiene, the archive transition — is still enforced by prose and
agent diligence. This arc converts those checks into small, stdlib-only
`.agent-local/` scripts wired into the two existing entry points
(`check_agent_drift.py` and `close-out`), so a stale snapshot, a missed
marker flip, or a dead doc reference is *detected*, not discovered.

**Arc-wide constraints (apply to every 3.9.1.x contract):**

- Python 3 stdlib only; no new runtime dependencies; every script offers
  `--check` (exit nonzero on findings) and `--pretty` where output is JSON.
- New checks wire into `check_agent_drift.py` or the close-out sequence —
  never a new command an agent must remember unprompted.
- Distinguish **error** (contradiction; blocks) from **warn** (suspicious;
  reported, non-blocking) — snapshot-timing situations like a mid-flight
  branch must warn, not block.
- Fixture tests accompany every new or changed script, following the
  `test_development_state.py` pattern.
- Deliverables live mostly in gitignored workspace (`.agent-local/`, `docs/`,
  skill trees). Delivery evidence is therefore defined per contract (see each
  block); tracked-file changes (scripts/, CI) still ride the normal PR, and
  every sub-version gets its APP_VERSION bump + changelog entry regardless.
- No behavior change to application code anywhere in this arc.

---

### 3.9.1.1 — Lifecycle doc reconciliation & machine-readable formats

**Objective.** Give every lifecycle decision exactly one home and a
machine-readable form, so the scripts in 3.9.1.2–3.9.1.5 have unambiguous
state to read — and fix the known procedure/state leaks found in the 3.8-era
docs review.

**Done means.**
- `docs/VERSION_AUDIT.md` Step 1 references "every known-wide surface named in
  the current baseline" generically; version-specific measurement commands
  live only in the version's audit plan. No lifecycle doc names a repo path
  that does not exist.
- Watch promotion triggers have one owner — the baseline's Watch rows
  (living state that survives version archival; the 3.8 close proved the
  need: AF-006–AF-009 outlive their archived audit plan). The audit
  ledger cites the AF id rather than restating the trigger. The
  artifact-ownership table in `docs/DEVELOPMENT_LIFECYCLE.md` records
  this.
- Marker vocabulary is normalized and documented: `Execution status` is
  exactly `Pending` or `Complete`; roadmap terminal statuses are an exact
  closed set.
- Three new machine-readable formats are specified in the owning docs (shapes
  below are proposals for the session plan to finalize, not implementation):
  - **Watch trigger block** in the audit ledger — one fenced block per Watch
    finding, e.g. `trigger: exports(src/data/telemetry/queries.ts) <= 25`,
    limited to a small comparator grammar over countable evidence.
  - **`**Baseline effect:**`** marker in session plans — exactly one of
    `Improves | Neutral | Temporary pressure`, per SESSION_PLANNING Step 7.
  - **`**UX gate:**`** marker in contracts — `Yes | No`; drives the
    operator-review pause mechanically in later slices.
- The churn-window difference between SESSION_PLANNING (proximity, rolling)
  and VERSION_AUDIT (version lens, since previous baseline) is stated as
  intentional in one sentence in each doc.
- **Planning outcomes become session-terminal (the plan/execute
  boundary):** `docs/DEVELOPMENT_LIFECYCLE.md` §5, `docs/SESSION_PLANNING.md`
  Step 9, and the `start-session` + all `plan-*` skills (both runtimes,
  manifest revision bump) state one rule: a session that planned an
  artifact never executes it. Runtime plan-mode acceptance authorizes
  **artifact persistence only** — after a planning handler persists its
  approved artifact, `start-session` reports the resolver's new directive
  and **stops** instead of dispatching it; execution begins in a fresh
  `start-session`, whichever runtime runs it (a session boundary, never a
  runtime assignment). This replaces today's re-resolve-and-dispatch
  chaining and the manual "don't execute on accept" instruction it
  forced.
- **Committed public documents join the truth loop:** `docs/SELF_REVIEW.md`
  gains a public-documents prompt (did this change invalidate README,
  CONTRIBUTING, SECURITY, the PR/issue templates, `.env.example`, or the
  `/legal` page?), and `docs/VERSION_AUDIT.md` Step 3's docs-truth sweep
  explicitly enumerates that committed set alongside the workspace docs —
  the drift 3.9.3.8 corrects once stays corrected because the loop now
  covers it.
- **The comment standard is specified** (implementation lands in 3.9.1.7):
  hybrid TSDoc-lite — `/** */` interface comments on every exported
  surface (summary prose stating the contract; tags only where they add
  information, no mandatory `@param` ceremony); `//` unchanged for module
  prologues, rationale, and implementation commentary; deferred work
  routes to `docs/backlog.md`, never a source `TODO`/`FIXME`. P7's
  comment-first discipline becomes a lifecycle artifact:
  `docs/SESSION_PLANNING.md` Step 8's output schema requires the
  interface designs to include the *draft interface comments themselves*,
  so a session's exports are commented before the code exists. Quality
  remains a judgment gate (pre-PR review §3); no comment-coverage or
  density metric is ever adopted (P10).

**In scope.** The lifecycle/stage docs, SESSION_CONTRACTS/PLANNING schemas,
the artifact-ownership table, format specifications, and the same-change
`policy-manifest.json` revision bump + skill-tree marker updates the drift
gate requires.

**Out of scope.** Any script or resolver change (3.9.1.2+); retro-editing 3.8
archived artifacts; changing constitution principles (P1–P10 text is frozen
this version unless a durable rule emerges through the audit process).

**Dependencies.** 3.8 archived (this whole plan gates on that). None within
the phase; everything later in the arc depends on this slice's formats.

**Decisions the session plan must resolve.** Final trigger-block grammar
(which countable evidence kinds: file LOC, export count, file count in a
zone, clone-group count); whether existing 3.8-cycle artifacts are exempt
from the new marker vocabulary (proposed: yes — formats apply from 3.9
forward; checkers treat pre-3.9 artifacts as legacy).

**Baseline & hotspot note.** Neutral; touches no measured surface.

**Delivery evidence.** Drift gate green at the new policy revision; a doc-ref
sweep (manual this slice; mechanized in 3.9.1.3) shows zero dead paths;
changelog entry + APP_VERSION bump.

---

### 3.9.1.2 — Resolver hardening

**Objective.** The resolver validates the new vocabulary and markers exactly,
and gains optional git awareness, without changing its directive contract.

**Done means.**
- Terminal-status detection is an exact match against the closed set (a cell
  containing `INCOMPLETE` or `NOT SHIPPED` is nonterminal / flagged), and
  marker values outside their vocabularies are reported as errors with the
  offending file and value.
- The resolver validates the 3.9.1.1 markers where present: a session plan
  missing `Baseline effect`, or a contract missing `UX gate`, is a
  `session-plan-needed`-style reason (legacy pre-3.9 artifacts exempt).
- A `session-ready` directive for a `UX gate: Yes` contract carries that gate
  in its `pause` field.
- An opt-in `--git` flag adds **warnings** (never errors): current branch vs.
  the expected sub-version branch pattern, dirty worktree during a plan-mode
  directive, local main behind `origin/main`. Default behavior without the
  flag is byte-identical to today.
- Fixture coverage extends to every new rule, including the
  exact-vocabulary regressions; the existing 13 fixtures still pass.

**In scope.** `resolve_development_state.py`, `test_development_state.py`,
the manifest's `developmentState` schema if fields change, and the doc
sentences that describe resolver behavior.

**Out of scope.** New sibling scripts (3.9.1.3+); changing stage names,
handler names, or the directive field set (the dispatch contract is frozen);
making git checks blocking.

**Dependencies.** 3.9.1.1 (vocabulary + marker formats).

**Decisions the session plan must resolve.** Whether marker-validation
failures surface as stage-level reasons or as `errors[]` entries; the exact
branch-pattern expectation (`feat/X.Y.N-*` with named exceptions like
`codex/`-prefixed tooling branches).

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Full fixture suite green; resolver run against the
live repo returns the same directive as before the change (plus any new
warnings); drift gate green.

---

### 3.9.1.3 — Evidence & reference checkers

**Objective.** Contradictions *between* artifacts — the class the resolver
deliberately doesn't own — are detected mechanically.

**Done means.**
- `check_lifecycle_evidence.py` cross-checks: SCRATCHPAD's `Now` names the
  resolver-selected session; AF statuses agree across the audit ledger, the
  baseline campaign queue, and roadmap remediation rows; no session plan is
  `Complete` while the artifacts that close-out must update still describe it
  as pending (and the inverse — delivered evidence with a `Pending` marker is
  the snapshot-vs-drift warning case, reported as **warn**).
- `check_doc_refs.py` verifies every backticked repo path in `docs/`, the
  agent guides, and the skill trees resolves to an existing file or a
  declared legacy/archive reference; a small allowlist covers deliberate
  external/archive paths.
- `check_env_example.py` diffs `.env.example` against the typed registry
  in `src/lib/env.ts` (REQUIRED + VERBATIM key sets): a registry key
  missing from the example, or a stale example key no longer in the
  registry, is an error — the one committed public doc whose truth is
  fully mechanizable. (`NEXT_PUBLIC_*` build-inlined literals are listed
  in the script's own allowlist.)
- Both are invoked by `check_agent_drift.py`; both have fixture tests; both
  report file + line for every finding.

**In scope.** The two new scripts, their fixtures, drift-gate wiring, and an
allowlist/exemption format if 3.9.1.1 didn't already define one.

**Out of scope.** Recomputing code metrics (3.9.1.4); auto-fixing anything —
these scripts only report.

**Dependencies.** 3.9.1.1 formats; 3.9.1.2 helps (shared marker parsing) but
is not blocking — the session plan must state whether parsing is shared or
duplicated, and shared is the default expectation (P2).

**Decisions the session plan must resolve.** Which cross-checks are error vs.
warn (proposed: intra-document contradictions error; cross-artifact timing
mismatches warn); where shared markdown-parsing helpers live so three scripts
don't own three parsers.

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Both checkers run clean (or with explained warns) on
the live workspace; a seeded-contradiction fixture demonstrates each finding
class; drift gate green.

---

### 3.9.1.4 — Baseline claims & Watch tripwires

**Objective.** The baseline's cheap factual claims are recomputed rather than
trusted, and Watch findings fire the moment their trigger trips instead of
waiting for the next audit to notice.

**Done means.**
- `check_baseline_claims.py` recomputes the mechanically-derivable Step 1
  rows (production/test file counts, LOC, export counts on the known-wide
  surfaces the baseline names, suppression count, `auth-surface` file count,
  clone-group count) and diffs them against the baseline's asserted values;
  a baseline row referencing a nonexistent file is an error; a stale number
  is a warn with both values shown (coverage and Fallow score are explicitly
  out — they need full runs and stay audit-owned).
- `check_watch_triggers.py` evaluates every trigger block in the
  baseline's Watch rows and prints `promote AF-NNN` with the measured
  value when tripped. The initial concrete set is AF-006–AF-009 (26th
  telemetry export; >15 refresh-jobs exports; a fourth `auth-surface`
  file; a third cron-shell clone — the last mooted once 3.9.2.2 lands).
- Both wire into the close-out sequence (and are runnable standalone); a
  tripped Watch trigger is a **warn** that close-out must surface to Ryan,
  never an auto-promotion — classification stays an audit decision (P10).

**In scope.** The two scripts, fixtures, close-out wiring (SESSION_END.md +
close-out skill text + manifest bump).

**Out of scope.** Auto-editing the baseline; evaluating judgment rows
(hotspot rankings, verdicts, health trend); running coverage.

**Dependencies.** 3.9.1.1 (trigger grammar); 3.9.1.3 (shared parsing
helpers).

**Decisions the session plan must resolve.** Tolerance policy for counts that
legitimately drift within a session (proposed: exact match required only at
close-out, since the baseline must be reconciled there anyway); how carried
`Targeted:` rows are treated (proposed: skipped unless their named surface is
in the diff).

**Baseline & hotspot note.** Neutral; the checker *reads* the baseline.

**Delivery evidence.** Checker output on the live baseline attached to the
PR notes; a fixture proves a deleted-file claim and a tripped trigger are
caught; drift gate green.

---

### 3.9.1.5 — Close-out gate mechanization

**Objective.** The three close-out rituals that currently rely on
read-back-and-hope — release consistency, PR-body privacy, and the archive
transition — get mechanical verification.

**Done means.**
- `check_release_consistency.py`: `APP_VERSION`, the newest heading in the
  version's `content/changelog/vX.Y.md`, and the roadmap's latest terminal
  row agree before a PR opens; mismatch is an error.
- `scrub_pr_body.py`: scans a PR body-file for personal names, emails, local
  absolute paths, machine/profile identifiers, and credential-shaped strings
  per the PR_REVIEW privacy rule; findings block publish; the pattern set is
  maintained in the script with a documented extension point.
- `verify_archive.py`: mechanizes the seven archive preconditions from
  `docs/DEVELOPMENT_LIFECYCLE.md` §7 and, after the copy, verifies the
  destination bundle contains the plan, contract set, session plans, and
  audit plan byte-identical to the active copies.
- All three are named steps in the close-out / archive procedures and the
  close-out skill; fixtures included.

**In scope.** The three scripts, fixtures, SESSION_END/PR_REVIEW/lifecycle
wiring sentences, manifest bump.

**Out of scope.** Changing the Greptile loop or `merge_clean_pr.py` (already
mechanized); any auto-publish or auto-archive — scripts verify, humans/skills
act.

**Dependencies.** 3.9.1.1 vocabulary; independent of 3.9.1.3/4.

**Decisions the session plan must resolve.** Where the personal-identifier
pattern list lives so it isn't secret-adjacent content in a tracked file
(proposed: in the gitignored script itself); whether `verify_archive.py`
takes the archive root as a required argument or reads a configured path.

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Each script demonstrated against a seeded-violation
fixture; release-consistency check run green on the slice's own PR; drift
gate green.

---

### 3.9.1.6 — Drift-manifest derivation

**Objective.** The drift gate's hand-synced expectations become derived
wherever a source of truth already exists, cutting the per-change maintenance
cost that the manifest currently imposes.

**Done means.**
- `sessionContracts.expected` is derived from the active version's
  `INDEX.md` (plus the resolver's active-version discovery) instead of a
  hand-listed 3.8 path set; the per-version update ritual disappears.
- Required skill paths are derived from `pairedSkills` + `skillRoots` rather
  than enumerated twice.
- The regex-phrase requirements are reviewed pair-by-pair: each either stays
  (with a one-line note of the drift it guards) or is replaced by a
  structural check (marker present, doc referenced, revision stamp) — the
  goal is fewer prose-coupled patterns, not zero.
- `check_agent_drift.py` behavior is otherwise unchanged and its full check
  suite still fails on each seeded violation class it failed on before.

**In scope.** `check_agent_drift.py`, `policy-manifest.json`,
`bump_policy_revision.py` if the revision flow changes, fixtures.

**Out of scope.** Weakening any existing guarantee; touching the tooling-
parity scripts (Vercel adapter flow is stable); skill content changes beyond
revision stamps.

**Dependencies.** Best run last in the arc so it derives from the formats and
wiring the earlier slices landed.

**Decisions the session plan must resolve.** Which phrase requirements are
genuinely load-bearing vs. legacy (present the keep/replace table for
approval); whether derivation happens at check time or via a generated
section in the manifest (proposed: check time — no generated files to drift).

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** A before/after manifest diff showing removed
hand-synced lists; the seeded-violation matrix green; drift gate green at the
bumped revision.

---

### 3.9.1.7 — Comment standard migration & enforcement

**Objective.** One comment style repo-wide, enforced: every exported
surface carries a `/** */` interface comment, the legacy `//` export
comments are converted without losing a word, and the lint rules land
green on the whole tree — never a two-style period, never a
changed-files-only carve-out.

**Done means.**
- Every existing `//` comment block sitting above an exported symbol is
  converted to `/** */` with its prose **preserved verbatim** — the
  migration changes syntax, never words; rewording during a mass sweep
  is how hard-won rationale gets silently lost. Module prologues and
  inner rationale comments stay `//` untouched.
- Every exported surface with *no* comment gets one **authored** to the
  standard (contract prose: what it does, units, preconditions, what
  the caller owns). Authored comments are the judgment half of the
  slice and are reviewed as such — restating the signature fails the
  pre-PR §3 bar.
- Three lint rules flip on and pass repo-wide in the same sub-version:
  doc-comment presence on exports (`eslint-plugin-jsdoc` require-jsdoc
  scoped to exported declarations), TSDoc syntax validation
  (`eslint-plugin-tsdoc`), and the TODO ban (`no-warning-comments` for
  `TODO`/`FIXME` — deferrals route to `docs/backlog.md`, mechanizing
  the existing rule). Any `TODO`s the sweep finds are dispositioned to
  the backlog, not deleted.
- Zero executable-code changes: `pnpm verify` green with an unchanged
  test count, and the diff is comments-plus-lint-config only.

**Sessions.** Two, one branch: **.1** tooling-assisted conversion of
existing export comments (script drafts the syntax flip, the agent
reviews every hunk) + lint dry-run producing the uncommented-export
worklist; **.2** author the missing interface comments from that
worklist, disposition stray `TODO`s, flip the three rules on, full
verification.

**Rail.** The three lint rules *are* the rail; delivery demonstrates
presence-lint red on a seeded uncommented export.

**In scope.** `src/` and `convex/` production exports; the lint config;
the sweep tooling (workspace-local, deleted at close per scratch-script
hygiene); backlog routing of found `TODO`s.

**Out of scope.** Rewording any existing comment (verbatim-preservation
is a hard constraint); test files and `scripts/` (exempt by default —
the session plan confirms or adjusts the exemption set); doc-comment
tags beyond TSDoc-lite (no mandatory `@param` ceremony); any code
change.

**Dependencies.** 3.9.1.1 (the standard must be specified before it is
enforced). Runs before Phase 2 slices start, so every new primitive is
born commented-first under a green lint.

**Decisions the session plan must resolve.** The exact export-detection
scope for the presence rule (declaration exports vs. re-exports vs.
type-only exports); the exemption set (tests, `scripts/`, generated
Convex files — the five generated-header suppressions must not trip
TSDoc validation); whether the conversion script normalizes comment
line-wrapping (proposed: no — verbatim means verbatim).

**Baseline & hotspot note.** Neutral — comments only; suppression count
must not grow (a file that can't satisfy TSDoc syntax gets fixed, not
suppressed).

**Delivery evidence.** All three rules green repo-wide and red on
seeded violations; a spot-diff sample in the PR notes proving verbatim
conversion; unchanged test count; the uncommented-export worklist
closed; standard close-out.

---

## Phase 2 — Primitive lifecycle (3.9.2.x)

**Arc thesis.** A primitive is the smallest unit of meaning the system
exposes; every decision a primitive owns is a decision the agent can no
longer get wrong. The wrap-once discipline that governs UI, ESI access, API
calls, and env reads is extended across the remaining system areas —
API/backend, data, infra, agent tools/workflow — using the lifecycle verbs
**create / combine / delete / expand** with a standing combine-bias
(P1/P8: fewer, deeper concepts). Slices 3.9.2.1–3.9.2.6 are pre-judged
verdicts grounded in verified repetition in the current code; 3.9.2.7 is a
primitives-scoped audit that maps the whole surface, verifies the arc, and
reports remaining verdicts for Ryan's decision.

**Verified starting state (why these verdicts, and not others):** the
codebase already holds strong primitives this arc must extend rather than
duplicate — the cron gate (`requireCronAuth`, `runCronJob` advisory-lock
wrapper, `cronLogger`), the full per-owner sync engine
(`OwnerSyncDescriptor` + character/corp/owned factories + `planRead`), the
mutation-route pipeline (`src/app/api/mutation-route.ts`), body parsing
(`route-body.ts`), two registry-with-gate patterns (purge contributors,
table-growth), the schema-steered Postgres harness
(`src/db/test-support/db-test-harness.ts`), and the junction manifests
(`search/register-all.ts`, `purge/register-all.ts`, `db/sde-pipeline.ts`).
Every slice below names which existing primitive it expands or which
verified repetition it collapses.

**Arc-wide constraints (apply to every 3.9.2.x contract):**

- Every slice traces to a concrete existing consumer or observed repetition
  (P4). "The v4.0 mapper will want it" is never sufficient evidence; the
  mapper benefits as a side effect only.
- Combine-bias: extend an existing primitive before creating a sibling; a
  Create must record why no existing primitive stretches (each slice below
  already records this).
- Full pattern per slice: extract/expand → migrate every consumer → enforce
  by rail in the same sub-version. Zero old-path call sites at close; no
  compatibility façade survives its migration.
- **Rail policy:** every primitive ships with a named enforcement rail
  chosen from the three house mechanisms — restricted-import/syntax lint
  ("you must use the primitive": the raw-`fetch`/raw-hex precedent in
  `eslint.config.mjs`), a Fallow boundary ("you can't reach around it"),
  or a registry/gate test ("your declaration must be complete and
  legal"). The session plan justifies the mechanism choice; delivery
  evidence demonstrates the rail **red** on a seeded violation, not just
  green on the live tree; and each slice's rail is listed in its spec
  below so 3.9.2.7 can record the primitive→rail mapping.
- Judged slices may conclude **Keep**: where a slice's investigation shows
  the combine/expand does not reduce what callers must know (P1 test), the
  correct delivery is the written distinction + the registry/rail that
  pins it — not a forced unification (P8). 3.9.2.6 is explicitly this kind.
- Hotspot proximity per SESSION_PLANNING Step 2 for every touched file;
  protected non-goals (`tree-resolver.ts`, `convex/engine.ts`,
  `src/lib/esi/`) are off-limits; anything campaign-shaped stops and
  reports rather than absorbing scope.
- New shared code lives in `src/lib/` (or `src/db/test-support/` for the
  harness); no boundary redraw is expected this arc — if one becomes
  necessary it is a §4.2 event raised in the session plan.

---

### 3.9.2.1 — Real-Postgres test harness promotion

**Objective.** Promote the schema-steered local-Postgres testing pattern
from a coverage-suite helper into the repo's first-class DB test primitive,
so characterization work (this arc's and every future campaign's) stops
hand-assembling setup.

**Verdict & evidence.** *Expand* `src/db/test-support/db-test-harness.ts`.
The 3.8.5.x campaigns built five-plus real-Postgres suites (auth migration
25-scenario coverage, retention boundaries, concurrency cases) that each
re-assemble reachability gating, schema steering, seeding, and teardown
around the same harness core.

**Done means.** One documented harness surface owns: DB-reachability
skip-gating, disposable-schema lifecycle (create/steer/drop), migration
application into the schema, seed/fixture helpers for the common row shapes
(user + linked character + tokens; dataset rows keyed `by_user`), and
teardown. Existing real-Postgres suites are migrated onto it with zero
behavior change to what they assert; a new suite needs only its seeds and
assertions. The testing-policy section of the agent guide names it as the
standard.

**Rail.** Restricted-import lint scoped to `*.db.test.ts`: direct
`postgres()` construction and connection-string literals are banned
outside `src/db/test-support/` — a suite that hand-rolls schema steering
fails lint with a pointer to the harness.

**In scope.** `src/db/test-support/`, the consuming `.db.test.ts` suites,
the lint rule, agent-guide testing-policy wording.

**Out of scope.** New test *coverage* (no assertion changes, no padding);
component/jsdom testing (separate backlog item); CI changes.

**Dependencies.** None. First in the arc because later slices' migrations
lean on cheap characterization.

**Decisions the session plan must resolve.** Fixture surface breadth — which
seed shapes have two-plus real consumers today (P4 trims the rest); whether
suite migration is one behavior-preserving commit per suite (P9 default) or
batched.

**Baseline & hotspot note.** Improves (removes per-suite duplication);
touches no measured production surface.

**Delivery evidence.** All migrated suites green with unchanged assertion
counts; a grep shows zero suites hand-rolling schema steering outside the
harness; `pnpm verify` + coverage-backed Fallow; standard close-out.

---

### 3.9.2.2 — Cron shell & wake policy

**Objective.** A cron route becomes a declaration — name, lock key, wake
class, work, response shape — with the shell owning everything the seven
routes currently repeat, and the PR #159 lesson ("a healthy no-op must not
touch Neon") encoded as an enforced property of the primitive instead of a
one-route predicate.

**Verdict & evidence.** *Expand* the existing cron primitives
(`requireCronAuth`, `runCronJob`, `cronLogger`) into one route-shell seam
with a declared **wake class**. Evidence, two-part:

1. *Shape repetition:* seven cron routes (47–146 LOC) each re-assemble
   logger creation, start-time capture, busy/refreshed response
   construction, lock-key plumbing, and event emission around the same
   gate — including the clone `dup:b54bf337` (affiliations ↔
   industry-indices shells), which the cycle-2 audit classified **AF-009
   Watch** ("boring shape; extract only on a third instance"). This
   slice respects that verdict's logic: the clone alone would not
   justify work (P10), and it is not this slice's driver — the wake
   regression below is. The shell expansion deletes the clone as a
   byproduct, and close-out records AF-009's closure in the primitive
   ledger with that framing.
2. *Regressed decision (the live bug this slice fixes):* PR #159 stopped
   the 15-minute sync-sweeper from waking Neon on healthy no-ops, but the
   decision was encoded as a route-local predicate (`isNoteworthySweep`),
   not in the seam — and the next 15-minute cron
   (`drain-esi-refresh-jobs`, 3.8.4.5/.6) rebuilt the failure mode
   three-fold: the `runCronJob` advisory lock opens the direct Neon
   connection every run; `maybeAlertPublicEsiBudgetExhaustion()` runs a
   Neon telemetry window count every run (result ~always zero); and the
   drain queries the queue even when empty. 96 wakes/day on an idle
   deploy — the exact kept-warm cost #159 removed.

**Design (what the declaration encodes).**

- **Wake class, required per cron:** `batch` — daily jobs whose purpose is
  waking Neon (prices, SDE, affiliations, indices, GSC) — or
  `idle-silent` — sub-daily watchdogs/drains, for which a healthy no-op
  run touches zero Neon: no lock, no read, no write.
- **Idle probe, required for `idle-silent`:** the shell runs it after auth
  and *before* any Neon touch (lock included); probe reports idle → one
  structured console line + JSON response, return. The shell owns the
  ordering guarantee: auth → idle probe → advisory lock → work →
  durable-telemetry gate.
- **Recording policy:** #159's noteworthy predicate generalized as the
  declaration's default — durable telemetry rows only on failure or
  work-done; `always`-record requires a written justification in the
  declaration.
- **Schedule cross-check gate:** a registry-style test parses
  `vercel.json` crons; any schedule more frequent than daily must map to
  an `idle-silent` declaration or carry a justification string. The next
  15-minute cron cannot ship without confronting the wake question.
- **Drain-cron idle probe (the proving consumer):** an Upstash Redis
  pending-work signal — enqueue paths (which run with Neon already awake)
  set/increment it; the drain writes back the residual due-count (or
  earliest `nextAttemptAt`) after each run; probe reads it, absent/zero →
  idle. The budget alert gates the same way: the exhaustion *originates*
  in the Redis budget gate, so a short-TTL "recent exhaustion" marker set
  there means the Neon window query runs only when a marker exists. Two
  safety valves: Redis unconfigured (local dev) → probe returns unknown →
  proceed to Neon, matching the Redis-optional convention; and one
  designated daily run drains Neon-backed regardless of the signal, so a
  lost Redis flag strands a job at most ~24h (the on-view stale gate
  re-triggers anything a user actually views sooner).

**Done means.** One shell primitive composes auth, wake-class enforcement,
advisory-lock gating, duration capture, cron telemetry with the
noteworthy-gated recording policy, and the busy-path response; each route
supplies only its declaration and its `work`. All seven routes migrate
with route-specific behavior (GSC quota handling, SDE ingest phases and
its pre-lock version gate, prices' deliberate lock-free mode) staying
visibly route-local — the shell owns the *shape* and supports composed
pre-lock stages rather than flattening them. `dup:b54bf337` no longer
appears in a whole-version Fallow run. The two `*/15` crons are declared
`idle-silent` and demonstrably touch zero Neon on an idle run; the
schedule cross-check gate is red when a seeded sub-daily cron lacks a
declaration.

**Sessions.** Two, one branch: **.1** shell + wake classes + recording
policy + schedule gate + migration of the five batch routes and the
sweeper (its declaration adopts the existing probe-free idle-silent shape
— it already touches Neon only when noteworthy). **.2** the drain-cron
idle probe: Redis pending-work + exhaustion-marker signals, write-back,
daily Neon-backed heal, and the idle-wake demonstration.

**Rail.** Two-part: (1) the schedule cross-check gate above
(`vercel.json` ↔ declarations); (2) restricted-import lint scoped to
`src/app/api/cron/**`: `requireCronAuth`, `withAdvisoryLock`,
`directClient`, and direct durable-telemetry writes are banned in route
files — a cron route reaches them only through the shell, so the
ordering guarantee and recording policy cannot be bypassed.

**In scope.** `src/lib/cron.ts` / `src/db/cron-gate.ts` seam, the seven
`src/app/api/cron/*/route.ts` files and their tests, the enqueue paths'
Redis signal writes, the schedule cross-check gate, the lint rule, cron
telemetry call sites.

**Out of scope.** Schedule changes (`vercel.json` cadences untouched);
new cron jobs; the deferred-queue worker's job-processing internals (its
route and its entry probe change, its per-job logic does not);
event-ledger vocabulary changes; moving the budget-exhaustion *history*
out of Neon (the marker gates the read; the durable record stays).

**Dependencies.** 3.9.2.1 preferred (characterize the seven routes'
response contracts on the harness where DB-backed). Session .2 depends on
.1's shell.

**Decisions the session plan must resolve.** Whether the seam lives on
`runCronJob` (options growth) or as a thin `defineCronRoute` over it —
the two-decomposition comparison weighs caller-visible concepts (P1)
against pass-through risk (P3); the Redis signal's exact shape (flag vs.
count vs. next-due timestamp) with the thrash case (a pending retry due
in hours) explicitly analyzed; which run is the daily heal slot; how
maxDuration/route-marker conventions ride the declaration.

**Baseline & hotspot note.** Improves — ends the idle-wake cost (~$6/mo
class kept-warm compute at zero traffic), shrinks seven route files, and
incidentally removes the whole-version clone group (AF-009 closes as a
byproduct; the baseline's Watch row is updated in the same change).

**Delivery evidence.** Whole-version pinned Fallow shows zero duplication
groups; seven routes migrated with per-route contract tests green; an
idle-path test (or instrumented local run) demonstrating zero Neon
connections for both `idle-silent` crons' no-op path; the schedule gate
red on a seeded violation, green live; route classification unchanged;
standard close-out.

---

### 3.9.2.3 — ESI dataset registry & freshness gate

**Objective.** One declaration point per ESI-fed dataset — placement,
verified cache time, freshness model, refresh owner — with the placement
rule enforced by a gate test and the staleness verdict served by one
runtime gate that derives from the same entry. The declaration is written
once; the gate is its runtime face.

**Verdict & evidence.** *Create* the registry (registry-with-gate
pattern: purge contributors, table-growth precedent) + *Expand/Combine*
the staleness gates onto it. Combine rationale for the Create: the
owner-sync descriptor owns personal datasets' refresh *mechanics* but
nothing owns the placement *decision*; global/cron datasets (prices,
indices, SDE, GSC, market history) and the Convex live datasets have no
declaration point at all — today the rule lives in agent-guide prose + a
SELF_REVIEW checklist, and the 3.7.5.1 owned-blueprints mis-placement is
the documented failure this class of gate prevents. Evidence for the
staleness combine: six mirrored copies of the same gate — five
per-feature `staleness.ts` files (skill-queue, industry-jobs,
owned-assets, owned-blueprints, owned-structures) plus the affiliation
gate in `membership.ts` — each an `X_TTL_MS` constant and an
`isXStale(refreshedAt, now)` with identical null-handling, each comment
declaring it "mirrors" the previous one (the P2 leak documenting
itself); plus two parallel on-view trigger implementations
(`market-prices/refresh-on-view.ts` 232 LOC, `market-history/` 142 LOC,
and their client hooks) re-building the stale-gated write-behind the
owner-sync engine owns for personal data; plus three freshness models
(caller-TTL, row-carried `stale_after`, ESI `Expires` boundary)
coexisting with no declared chooser.

**Design.**
- **The entry (written once, complete from day one):** dataset name;
  verified ESI cache time with the spec path it was read from; store
  (`convex` | `neon`); shape (`global-cron` | `personal-on-view` |
  `live`); refresh owner (descriptor, cron route, or engine); freshness
  model (`caller-ttl` | `row-stale-after` | `expires-boundary`);
  effective TTL, defaulting to the verified cache time, with an
  override-with-rationale field where it deliberately diverges (e.g.
  prices' 24h sweep).
- **The gate test enforces:** `convex` requires cache ≤ 120s or the
  collaborative flag; `neon` + `global-cron` names its cron route;
  `neon` + `personal-on-view` names its `OwnerSyncDescriptor`; effective
  TTL ≥ verified upstream cache ("never poll faster than upstream"
  becomes checked, not commented); no durable table mirroring ESI data
  is unregistered (schema-discovery, the table-growth mechanism).
  Non-conformant-by-history placements are fixed or explicitly waivered
  *in the registry with rationale* — visible debt, never silent
  blessing.
- **The runtime gate:** one clock-injected freshness verdict in
  `src/lib/` reading the entry's model + effective TTL; the six mirrored
  gates collapse onto it; the row-carried `stale_after` model consumes
  the entry at write time so there is no second source of truth.
- **Judged tier — the trigger layer:** run the Step 4 two-decomposition
  comparison for the on-view trigger family (market-prices/history
  refresh-on-view vs. the owner-sync engine's trigger): one shared
  trigger primitive vs. Keep-with-written-distinction. Budget
  interaction and concurrency differ; if the comparison shows the
  unification is campaign-shaped, deliver the recorded comparison and
  report a Proposed row for the 3.9.2.7 audit instead of absorbing it.

**Done means.** Every ESI-fed dataset has exactly one registry entry;
the gate test is red on each seeded violation class and green live with
every waiver rationale present; zero per-feature staleness modules
remain (grep-verified) and every gated read derives its verdict from the
entry; behavior is preserved — same TTL values, same refresh timing;
the trigger-layer comparison is recorded with its verdict implemented
(if Floss-sized) or reported; SELF_REVIEW §1 points at the registry.

**Sessions.** Two, one branch: **.1** registry module + gate test +
complete entries for every existing dataset (freshness fields included
from the start — no second pass over the entries later). **.2** the
runtime freshness gate, the six-gate collapse + market-prices/history
derivation, and the trigger-layer comparison.

**Rail.** Three-part: (1) the registry gate test (placement rules, TTL ≥
upstream cache, unregistered-mirror detection); (2) naming-pattern lint
banning `*_TTL_MS`/staleness-window const declarations outside the leaf —
a stray TTL constant fails lint with a pointer to the registry entry;
(3) restricted-import so read paths import the verdict only from the
leaf module.

**In scope.** Registry entries manifest + CI validator (composed above
the slices per the pinned layering), the lib leaf (entry type + verdict),
entries for every existing dataset,
the five `staleness.ts` files + affiliation gate migration, write-time
`stale_after` derivation, the trigger comparison, SELF_REVIEW pointer
update.

**Out of scope.** Moving any dataset between stores (a discovered
placement bug is *reported*, its waiver the record — migration is its
own decision); changing any TTL value or refresh cadence; the pricing
*feature* surface — the market-prices data slice is in scope, but the
Verified AF-005 five-concern contexts (`planner-contexts.tsx`,
4/10/18/6/13 fields) are not: they own presentation policy (fallback
source, staleness display), a different decision axis from the
storage-freshness verdict, and the baseline's standing direction applies
— add fields only to their owning concern, no general façade or selector
layer, and `PricingProvider` (902 LOC, monitored-not-actionable) is not
touched by adjacent work. Migrating the pricing feature's staleness
*consumption* onto the gate is a legitimate Proposed row for the 3.9.2.7
audit.
Next.js `'use cache'`/`cacheLife` profiles (eve-status et al.) stay
unwrapped — the framework owns that layer (combine-bias).

**Dependencies.** 3.9.2.1 for cheap characterization of gated read
paths; after 3.9.2.2 keeps cron-route references stable (soft ordering).

**Structure (pinned — the `src/purge/` layering pattern).** This is one
primitive, layered by import direction, not two: the **leaf** — the entry
type + the clock-injected verdict function, the declaration's shape and
its meaning — lives in `src/lib/` so every slice imports staleness from
one place; the **entries manifest + CI validator** compose above the
slices (the `purge/types.ts` vs. orchestrator split, and the
`lib/cron.ts` vs. `db/cron-gate.ts` split, exist for the identical
reason). Slices import only the leaf; the validator imports the world.
What keeps it one primitive is not co-location but three pinned
properties: one entry per dataset, a verdict with zero configuration of
its own, and the rail below banning staleness computation anywhere else.

**Decisions the session plan must resolve.** Confirm the pinned layering
against the live import graph (descriptor references may need to be
by-name — the purge pattern's claim-by-object vs. by-name tension); the
waiver shape for non-conformant-by-history datasets; the verdict's exact
signature (one `isStale(entry, refreshedAt, now)` vs. per-dataset bound
gates — P1 caller-knowledge count decides); the trigger-comparison
scope fence (what makes it campaign-shaped).

**Baseline & hotspot note.** Improves — deletes six mirrored modules and
their drift surface and adds two rails; the pricing scope fence is the
hotspot guard.

**Delivery evidence.** Gate test red on seeded violations (bad
placement, unregistered mirrored table, below-upstream TTL), green live;
grep shows zero `*_TTL_MS` constants and zero `staleness.ts` files
outside the registry/gate; unchanged-behavior characterization green
before/after migration; the recorded trigger comparison; standard
close-out.

**Delivered 2026-07-17.** PR #257, squash `eefc59f`; production
`dpl_CbazTA4SyC46BG77bCGFAXmv9yp2` is Ready on `lgi.tools`.

---

### 3.9.2.4 — Endpoint contract gate

**Objective.** A route handler cannot exist without its typed contract —
the api-contract convention becomes mechanically complete instead of
convention-complete.

**Verdict & evidence.** *Expand* the existing contract convention (17
`api-contract.ts` files, `apiFetch`, `route-body.ts`, the no-user-input
marker comment already expected by an audit) into a completeness gate.
Evidence: pairing route ↔ contract ↔ marker is currently enforced by
review habit; the repeated shape (schema + response type + endpoint object
+ marker) is assembled by hand per route.

**Done means.** One gate (registry test or lint audit — session plan
compares) asserts for every `src/app/api` route: it either consumes a Zod
schema from its owning slice's `api-contract.ts` via `route-body.ts` (or
the mutation pipeline), or carries the no-user-input marker; its response
type is exported from the same contract file; and every `apiFetch` call
site references a declared endpoint object. Gaps found in the sweep are
fixed in-slice where Floss-sized, reported otherwise.

**Rail.** This slice *is* a rail — the completeness gate itself. Its own
enforcement evidence is the seeded contractless-route failure below.

**In scope.** The gate, a routes sweep, small conformance fixes,
CONTRIBUTING/agent-guide sentence updates.

**Out of scope.** Changing any contract's shape or any route's behavior;
the mutation pipeline (AF-001 Verified in cycle 2 — its shape is
preserved, not extended); OpenAPI-style codegen (backlog if ever).

**Dependencies.** None.

**Decisions the session plan must resolve.** Gate mechanism (extend the
existing API-contract audit vs. new registry test — prefer expanding the
existing one, combine-bias); how the sweep classifies the cron/webhook
family (bearer-auth marker vs. contract).

**Baseline & hotspot note.** Neutral-to-Improves (may delete drifted
contract remnants).

**Delivery evidence.** Gate red on a seeded contractless route; green on
the live tree; sweep findings ledgered in the PR notes; standard
close-out.

**Delivered 2026-07-17.** PR #258, squash `9d851ae`; production
`dpl_FZGZhXDaaLbcg7U2jp1vWyG6ybFD` is Ready on `lgi.tools`.

---

### 3.9.2.5 — ux-check probe harness

**Objective.** The ~30 one-off probe scripts under `docs/ux-check/`
collapse into one probe-definition primitive, making browser probes as
repeatable for the agent as `ux-capture` sweeps already are.

**Verdict & evidence.** *Combine.* Evidence: ~30 ad-hoc `*-probe.mjs`
scripts re-implement launch/navigate/wait/console-collect/assert around
`ux-capture.mjs`'s core — the literal one-off-script smell (several are
versioned near-duplicates: `hero-two-groups-probe` 1/2/3). Agent-tools
area: this is workspace tooling, not app code.

**Done means.** One probe runner owns browser lifecycle, console/network
capture, and reporting; a probe is a small declarative definition (route,
setup interactions, assertions). The recurring probe families
(dialog/overlay open, CSP, network, element-state) become parameterized
definitions; superseded one-offs are deleted; `docs/ux-check/README.md`
documents the definition format and the ux-check skill points at it.
One-off exploration remains allowed — the harness makes the *durable*
probes cheap, it does not ban scratch scripts (scratch scripts are deleted
at close-out per existing workspace hygiene).

**Rail.** Workspace-side (lint can't reach gitignored docs): a drift-gate
path check flags `*-probe.mjs` files outside the runner's definitions
layout, and the paired ux-check skills instruct the runner-first flow —
scratch scripts stay allowed but are flagged for close-out deletion.

**In scope.** `docs/ux-check/` scripts + README, the paired ux-check
skills (both runtimes, manifest bump), the drift-gate path check,
deletion of superseded probes.

**Out of scope.** `scripts/ux-capture.mjs` behavior (the sweep contract is
consumed as-is); adding Playwright to the app's test stack; any app code.

**Dependencies.** None; independent of 3.9.2.1–4.

**Decisions the session plan must resolve.** Definition format (data file
vs. tiny JS module per probe); which probe families have real recurrence
vs. genuine one-shots to delete unreplaced (P4 applied to tooling).

**Baseline & hotspot note.** Neutral (workspace-only); drift gate rows for
the skill pair updated same-change.

**Delivery evidence.** Probe count and total probe LOC before/after in the
notes; each retained family demonstrated via the runner; drift gate green
at the bumped revision.

**Delivered 2026-07-17.** PR #259, squash `0959509`; production
`dpl_2rSnCRoAm1T5Tb6V76aHh14zzR5s` is Ready on `lgi.tools`.

---

### 3.9.2.6 — Dataset declaration manifest *(judged: Combine or Keep)*

**Objective.** Decide — with evidence, in one place — whether the
remaining per-dataset declarations (purge contributor, growth-story row,
`by_user` key shape) should fold into the 3.9.2.3 dataset registry as one
manifest seam, or remain separate registries with a cross-registry
completeness check.

**Verdict & evidence.** *Judged.* Evidence for Combine: a new durable
dataset currently touches three registries plus schema conventions — four
places to forget, each with its own gate. Evidence for Keep: the
registries own genuinely different change axes (privacy teardown,
retention, placement), and P8 warns against a wide grab-bag manifest whose
consumers each use one field. The slice's deliverable is the *decision
with its rationale*, then the small implementation of whichever verdict
wins.

**Done means.** The SESSION_PLANNING Step 4 two-decomposition comparison is
run for real (one-manifest vs. indexed-registries), the verdict is
recorded (in the code's owning rationale comment and the ledger at
3.9.2.7), and the winner ships: either one `defineDataset` seam that the
three gates read from, or a cross-registry completeness check (every
user/character-keyed table appears in all applicable registries — the
schema-discovery mechanism already exists in two of them) plus a
documented per-dataset checklist. Either way: adding a dataset with a
missing declaration fails a gate.

**In scope.** The evaluation, the winning implementation, registry gate
wiring.

**Out of scope.** Changing any registry's semantics; retention or purge
policy changes; forcing the Combine if the comparison says Keep.

**Dependencies.** 3.9.2.3 (the dataset registry must exist to be the
combine target).

**Decisions the session plan must resolve.** This slice *is* the decision;
the plan presents both decompositions with the P1 caller-knowledge count
for each and Ryan approves the direction before implementation.

**Baseline & hotspot note.** Neutral-to-Improves.

**Delivery evidence.** The recorded comparison; the completeness gate red
on a seeded missing-declaration dataset, green live; standard close-out.

**Delivered 2026-07-17.** PR #260, squash `cbefaac`; production
`dpl_FT4WC6NTR1ixoCUmErFvULsgXTAk` is Ready on `lgi.tools`.

---

### 3.9.2.7 — Primitives-scoped audit & ledger

**Objective.** Map the system's full primitive surface, verify this arc's
outcomes held, and report the remaining create/combine/delete/expand
verdicts — with Ryan deciding what, if anything, extends the version.

**Done means.**
- `docs/PRIMITIVE_LEDGER.md` exists as living overwrite-in-place state
  (the baseline's pattern): part 1 the **primitive map** — every primitive
  by area (UI/design, API/backend, data, infra/platform, agent
  tools/workflow, auth/trust) with its owning module and the decision it
  hides; part 2 the **verdict table** — stable `PL-NNN` rows
  (`| ID | Area | Class | Evidence | Proposed end-state | Est. size | Status |`)
  recording this arc's delivered verdicts as Delivered and every
  *newly found* gap/overlap as Proposed.
- Required judgments the audit must run and record: the
  telemetry-vs-domain-events vocabulary boundary (expected Keep with the
  distinction written); `lib/sync-engine.ts` vs `convex/engine.ts` vs
  `lib/live-dataset.ts` overlap (one live-sync story or three?); the
  3.9.2.3 trigger-layer verdict if it reported rather than implemented; any
  primitive with zero remaining consumers (Delete candidates); any
  pass-through wrapper (P3 sweep).
- The audit *reports*; it implements nothing. Proposed rows either (a) get
  Ryan's approval and append `3.9.2.N` rows via the master-plan-amendment
  path, (b) route to `docs/backlog.md` citing their `PL-NNN`, or (c) are
  rejected with reason in the ledger. The session pauses on the report for
  Ryan's decision before any amendment.

**In scope.** Read-only survey (Graphify-first) of `src/`, `convex/`,
`scripts/`, and the agent workspace; the ledger document; the approved
disposition of every Proposed row.

**Out of scope.** Implementing any Proposed verdict; re-auditing code
health (the version-close audit owns that; this audit is
primitives-scoped and does not touch the AF ledger or baseline schema).

**Dependencies.** Last in the arc — 3.9.2.1–6 delivered so the map records
end-state, not mid-migration.

The map section records each primitive's enforcement rail (or `none`),
so primitive↔rail coverage is diffable by future audits and an unrailed
primitive is a visible finding class.

**Decisions the session plan must resolve.** Ledger granularity (what
counts as one primitive vs. a family — propose: one row per exported
surface an agent must choose between).

**Baseline & hotspot note.** Neutral; read-only against measured surfaces.

**Delivery evidence.** The committed ledger with the arc verdicts
Delivered and every Proposed row dispositioned by Ryan; `UX gate: No`;
changelog + APP_VERSION; standard close-out.

---

### 3.9.2.8 — Planner freshness consumption *(PL-011 Expand)*

**Objective.** Make the shared ESI freshness primitive the planner's sole
authority for price-staleness boundaries without changing the planner's
refresh or rendering behavior.

**Done means.** Planner price-confidence and aggregate-staleness
derivations consume the exact `staleAfter <= now` semantics owned by
`src/lib/esi-datasets/freshness.ts`; no equivalent boundary comparison
remains in `industry-styles.ts`. The planner still refreshes the complete
price set on view so the existing visual confirmation behavior is
unchanged, and the AF-005 pricing contexts do not widen.

**In scope.** The shared freshness surface needed by the planner, its
price-staleness derivations, and focused behavior tests.

**Out of scope.** Changing price-refresh cadence, data placement,
confidence labels, UI appearance, or the `PricingContextValue` /
`usePricing` / `useBuildPlan` ownership split.

**Dependencies.** 3.9.2.7 records and approves PL-011. Independent of the
other approved extension rows.

**Decisions the session plan must resolve.** The smallest browser-safe
freshness surface that eliminates the duplicated boundary without moving
planner policy into `src/lib/`; the characterization cases that prove
visible behavior is unchanged.

**Baseline & hotspot note.** Neutral. The plan must treat the planner
pricing surfaces as an existing hotspot and avoid unrelated cleanup.

**Delivery evidence.** Focused exact-boundary and aggregate-confidence
tests; no direct planner staleness comparison; `pnpm verify`; standard
close-out. `UX gate: No` because the approved end-state is
behavior-preserving.

---

### 3.9.2.9 — UI wrapper import rail *(PL-012 Expand)*

**Objective.** Mechanize the standing rule that feature and application
code consume Base UI and sonner only through `src/components/ui/`.

**Done means.** Scoped restricted-import rules reject direct Base UI and
sonner imports outside their shared wrappers, preserve the wrappers'
required package access, and fail on seeded violations for both package
families. Existing source remains green with no new exemption surface.

**In scope.** ESLint import restrictions, the exact wrapper exemptions,
seeded rule tests or equivalent lint evidence, and documentation references
that name the enforcement rail.

**Out of scope.** Rebuilding UI primitives, changing wrapper APIs or
appearance, migrating already-compliant consumers, or adding a new UI
library.

**Dependencies.** 3.9.2.7 records and approves PL-012. Independent of the
other approved extension rows.

**Decisions the session plan must resolve.** The flat-config scope that
allows only the true wrapper modules without exempting all of
`src/components/ui/`, and the durable seeded-red demonstration for each
restricted package.

**Baseline & hotspot note.** Neutral-to-Improves; policy enforcement only,
with no measured source hotspot change expected.

**Delivery evidence.** Both seeded direct-import violations fail, the live
tree passes zero-warning lint and `pnpm verify`, and the primitive ledger's
rail cell names the delivered rule. `UX gate: No`.

---

### 3.9.2.10 — Token-vend scope cleanup *(PL-013 Delete)*

**Objective.** Delete the unused scopes field and divergent parser from the
internal EVE token-vending contract while preserving the authoritative
stored-scope health path.

**Done means.** `EveTokenOkResponse` and the internal token route vend only
the access token data their Convex consumer reads; the token-service
whitespace-only scope parser is removed; route and contract tests pin the
narrowed response. `scope-health.ts` remains the sole decoder for persisted
comma-or-space scope strings and its behavior is unchanged.

**In scope.** The internal token response type, token service, route,
Convex consumer typing, and focused tests.

**Out of scope.** Requested EVE SSO scopes, stored account scope format,
token encryption or refresh behavior, scope-health policy, and any auth UI.

**Dependencies.** 3.9.2.7 records and approves PL-013. Independent of the
other approved extension rows.

**Decisions the session plan must resolve.** The exact contract
characterization needed before deletion and whether the Convex consumer can
drop its response cast as part of the same narrowing.

**Baseline & hotspot note.** Improves by deleting a zero-consumer contract
field and one divergent decoder; auth trust boundaries remain unchanged.

**Delivery evidence.** Focused token-service, route, and scope-health tests;
Fallow reports no newly unused surface; `pnpm verify`; standard close-out.
`UX gate: No`.

---

## Phase 3 — Backlog clearance (3.9.3.x)

**Arc thesis.** `docs/backlog.md` (486 lines, ~14 areas) gets one honest
pass: stale and already-shipped entries deleted, the refit-shaped items
delivered, and everything genuinely feature-shaped kept deferred with its
trigger re-verified. "Refit-shaped" means it improves what exists —
correctness, performance, workflow, polish — without adding a flagship
tool. Feature clusters explicitly staying deferred (recorded here so the
decision is visible): fees & margin, whole-tree build time, asset-tracking
popover + real held-by names (both gated on new-ESI-scope decisions),
market-score tempering and multi-region, sites editorial/blue-loot,
navigation expansion, roster Phase B, the a11y verification pass, the
React DOM test stack, F3 bundle trim, and client-settled static (the last
three keep their existing triggers).

**Arc-wide constraints:** diagnosis-before-prescription for every bug item
(3.9.3.3, 3.9.3.4); UX-touching slices pause for Ryan's local review
(3.9.3.2, 3.9.3.6, parts of 3.9.3.4); each shipped item is deleted from
the backlog in the same close-out (one home); nothing feature-shaped is
absorbed under a cleanup label.

---

### 3.9.3.1 — Backlog triage & hygiene sweep

**Objective.** The backlog reflects post-3.8 reality: every entry is
live, accurately sized, and correctly triggered — or gone.

**Done means.** Stale/superseded entries are deleted with their
supersession named — verified candidates: the `<img>` → next/image
migration entry (superseded by 3.8.2.6's `EveImage` pipeline), the
CLAUDE.md bare-filename/tech-stack entry (superseded by the thin-adapter
rewrite), and any others the sweep proves shipped. Executed-in-session
hygiene: the leftover fallow-trial artifacts in gitignored `docs/`
(748 KB `fallow-audit-full.json` et al.) are removed and the lone
`fallow-trial-log.mjs` lint warning cleared; the CLOSED fallow
code-health section collapses to an archive pointer per doc hygiene.
Remaining entries get their size/trigger re-verified against the 3.9
plan (e.g. per-row staleness UX now notes 3.9.2.3 as its data layer);
a short dispositions report lists anything the sweep believes belongs in
3.9 beyond the slices below, for Ryan's call via the amendment path.

**In scope.** `docs/backlog.md`, the gitignored artifact cleanup, the
one-line lint fix. **Out of scope.** Implementing any entry; deleting
anything not provably shipped/superseded. **Dependencies.** None; runs
first in the phase. **Baseline note.** Neutral. **Delivery evidence.**
The diffed backlog with each deletion's supersession evidence; drift and
lint green; `UX gate: No`.

---

### 3.9.3.2 — EVE image resolver & app-wide adoption

**Objective.** One shared per-intent descriptor resolver decides which
EVE image rendition every surface shows; the drifted per-call-site
decisions collapse onto it, and the `/industry` landing rows upgrade
from monogram initials to product icons.

**Verdict & evidence (backlog: "EVE images", Ryan-directed 2026-07-10).**
*Create/Expand* — the decision layer over the existing render door.
`TypeIcon`/`EveImage` already own rendering (3.8.2.6: sole `next/image`
importer, host + variants + monogram fallback); what is duplicated and
drifted is the *choice* of rendition per call site. The two seed helpers
(`nodeIcon`, `isRenderableCategory` in `industry-styles.ts`) promote to
`src/data/eve-data/` (SDE category semantics live there; feature→data is
boundary-legal). The per-intent rule from the backlog entry is the spec:
show-the-item surfaces → product `icon` (hero upgrades to `render` for
renderable categories); show-what-you-run surfaces → producing
blueprint/formula `bp`; monogram stays the terminal fallback.

**Done means.** Every EVE-image call site consumes the resolver
(landing-page Recents/Templates/Active-jobs/Corp-jobs rows,
`SavedPlanRowItem`, `GlobalSearch`, planner nodes/hero, with the needed
ids threaded); the monogram→icon landing change passes Ryan's browser
review; `CharacterPortrait` and corp/structure icons stay out (different
image families). **Rail.** Restricted-import: variant strings /
rendition decisions banned outside the resolver — call sites pass
intent, not variant. The 3.9.2.7 primitive ledger gains its row
(post-audit ledger update — living state). **UX gate: Yes.**
**Dependencies.** None. **Baseline note.** Improves (deletes drifted
per-site decisions). **Delivery evidence.** Grep: zero rendition
decisions outside the resolver; ux-check sweep + operator review;
standard close-out.

---

### 3.9.3.3 — Invalid-route rendering fix (React #419)

**Objective.** The correct 404/noindex response for an invalid site
detail stops emitting React #419 in production runtime.

**Evidence (backlog: "Sites & content").** Known production runtime
error; a prior bounded candidate (3.8.4.1.1) failed its
production-preview gate and was reverted, so the naive fix is already
falsified. **Done means.** Diagnosis-first per the house rule: verify,
reproduce, root-cause, and present evidence *before* any fix; the fix
preserves the correct 404 + noindex contract and is verified against a
production-mode environment via the documented manual-preview exception
(the one case local dev cannot represent — the prior revert proves it).
**In scope.** The invalid-site render path. **Out of scope.** The sites
editorial layer; route-mode changes elsewhere. **Dependencies.** None.
**Baseline note.** Neutral. **Delivery evidence.** The diagnosis
write-up; a production-preview check showing the 404 path clean of
#419; preview torn down; standard close-out. **UX gate: No** (error-path
only).

---

### 3.9.3.4 — Local dev performance

**Objective.** A cold `/sites` in `pnpm dev` stops taking >60s, blocking
the Node event loop, and driving the machine into swap.

**Evidence (backlog: "Infra & bundle"; full diagnosis in
`DEV_PERF_DIAGNOSIS.md`, archived in the Document Archive root).** Root cause already diagnosed: the page
assembles the entire catalogue and eagerly server-renders every site's
full detail body per request with no prerender warm cache. The doc's
A/B/C plan is the session-plan seed: profile/confirm the stall,
lazy-render detail bodies (helps dev *and* prod), and a dev-only
sample-data mode. **Done means.** The stall is profiled and confirmed
(diagnosis-first — the doc predates 3.8's changes); the lazy-render step
ships behavior-preserving with the prod rendering modes unchanged in
`route-classification.json` unless justified; the dev sample mode is
dev-only and clearly labeled. Cold `/sites` in dev is measured
before/after. **Sessions.** Two, one branch: **.1** profile + lazy
detail-body rendering; **.2** dev sample-data mode + the measured
readout. **UX gate: Yes** for .1 (rendering change on a user-facing
page — Ryan reviews locally). **Dependencies.** None. **Baseline
note.** Neutral-to-Improves. **Delivery evidence.** Before/after cold
timings; unchanged production route modes (or the justified diff);
standard close-out.

---

### 3.9.3.5 — Update-watch routine

**Objective.** The report-only dependency/service watch deferred from
3.8.4.9 ships: a committed baseline (every dependency, the platform
services, the EVE developer surface), a self-contained routine skill,
and a daily cloud routine that opens a GitHub digest issue only on
deltas.

**Evidence (backlog: "Infra & bundle"; operator decision 2026-07-14 to
revisit in the active version — 3.9 is it).** **Done means.** The
routine is strictly report-only — no package changes, baseline edits,
commits, or PRs; digests prioritize major versions and security
advisories; per the backlog's own caveat, the session plan re-verifies
current Claude Code cloud-routine/scheduling documentation before any
account or network access is configured (find-docs rule). This is an
agent-tools primitive in the Kent taxonomy — it joins the 3.9.2.7
ledger's map. **In scope.** The baseline file, the routine skill (both
runtimes, manifest bump), the scheduled routine, the digest format.
**Out of scope.** Renovate or any auto-merge behavior (advisory-only was
the standing decision); acting on any finding. **Dependencies.** None
hard; after Phase 1 keeps the drift-gate wiring stable. **Baseline
note.** Neutral. **Delivery evidence.** One live digest run (or a
seeded-delta demonstration); drift gate green; `UX gate: No`.

---

### 3.9.3.6 — Planner polish pair

**Objective.** Two ratified-small UX deferrals land together: the
multibuy panel's always-built product row (XS — a pinned, checked,
disabled product row above Tier 1), and the primitive-reference fidelity
polish (S — Tooltip surface treatment, checked-Checkbox reference
comparison, Field density/invalid states in the admin preview).

**Done means.** Both match their backlog specs; both pass Ryan's local
review; both entries deleted from the backlog. **UX gate: Yes.**
**In scope.** The multibuy panel row; the named primitive surfaces + the
admin `/preview/primitives` page. **Out of scope.** Any other planner UI
deferral (the slots scope-mismatch hint stays likely-never); new
primitives. **Dependencies.** None. **Baseline note.** Neutral.
**Delivery evidence.** ux-check sweep + operator review; standard
close-out.

---

### 3.9.3.7 — Operator verification session

**Objective.** The four standing measurement cells clear in one
no-branch operator session (the 3.8.3.3 precedent): Convex char-token
groups (cell i), the 3.5.e1 DB-I/O drop verification (cell ii — a
shipped claim still unverified), the sweep db-op budget (cell iii), and
free-tier headroom incl. the F1-adjusted Upstash command re-estimate
(cell iv).

**Done means.** Each cell's readout recorded in SCRATCHPAD with
pass/anomaly noted; anomalies become backlog entries or proposed rows,
never in-session fixes. **In scope.** Dashboard reads + recorded
evidence. **Out of scope.** Any configuration change or code.
**Dependencies.** None; schedule at Ryan's convenience within the
version. **Delivery evidence.** SCRATCHPAD evidence block; roadmap row
COMPLETE with no PR (non-code completion evidence, the 3.8.3.3 shape).

---

### 3.9.3.8 — Public document truth pass

**Objective.** Every committed public-facing document tells the truth
about the current app, and the `/legal` privacy page is rewritten so it
*stays* true: policy-level wording that survives feature growth instead
of enumerations that drift.

**Evidence.** The `/legal` page currently states "we request exactly four
read-only scopes" — presently false, and structurally doomed to keep
going false because it enumerates. README/CONTRIBUTING/SECURITY and the
PR/issue templates have no truth loop at all (the lifecycle governs only
workspace docs); `docs/UI_SYSTEM_AUDIT_3_8_2_8.md` is a committed
historical artifact.

**Done means.**
- `/legal` is rewritten at policy level: what *categories* of data are
  stored (account identity, encrypted EVE tokens, ESI-mirrored gameplay
  data, in-house telemetry), the standing guarantees (read-only-plus-the-
  named-waypoint-exception access posture, application-layer encryption,
  full purge/deletion rights and how to exercise them, no sale of data),
  and the third-party processors by role (hosting, database, live sync,
  rate-limit store, CCP's ESI) — **no scope enumeration, no feature
  list**; the page points at EVE SSO's own consent screen as the
  authoritative per-scope record. Ryan approves the wording (UX gate).
- README, CONTRIBUTING (general prose), SECURITY, and the PR/issue
  templates are trued against the current app and workflow — the PR
  template matches PR_REVIEW's canonical section format.
- `.env.example` reconciled against the env registry (the 3.9.1.3
  checker then keeps it true).
- `docs/UI_SYSTEM_AUDIT_3_8_2_8.md` is dispositioned — relocated to the
  Document Archive or explicitly kept with a stated reason.

**Rail.** The 3.9.1.1 loop additions (SELF_REVIEW prompt + audit
docs-truth enumeration) + the 3.9.1.3 env-example checker; content truth
beyond that stays a judgment gate by design.

**In scope.** The named documents and page. **Out of scope.** New legal
obligations analysis (this is truthful-description work, not counsel);
`content/devlog` (already maintained); any feature copy.
**Dependencies.** After 3.9.1.1/.3 preferred so the loop exists when the
pass lands. **UX gate: Yes** (the `/legal` wording is Ryan's call).
**Baseline note.** Neutral. **Delivery evidence.** The rewritten page
live in local review; each document's diff summarized in the PR notes;
env-example checker green; standard close-out.

## Phase 4 — Continuity & recovery (3.9.4.x)

**Arc thesis.** Everything else in 3.9 makes the system better; this arc
verifies it can *survive* — losing the machine, losing a database, losing
a service, or losing the operator's environment. The process itself is
the biggest exposure: the entire document-driven lifecycle (resolver,
constitution, baseline, contracts, SCRATCHPAD, skills, `.agent-local/`,
memory files, the Document Archive) lives in gitignored paths on one
machine whose only replication is iCloud *sync* — and sync is not
backup: a deletion or corruption propagates. The architectural recovery
claims ("Convex is regenerable"; Neon's restore posture) are load-bearing
and have never been drilled. A backup that has never been restored is a
rumor; every slice here converts a claim into a drill with evidence.

**Arc-wide constraints:** drills run against disposable targets (a Neon
branch, the dev/preview Convex deployment) — never production state;
secrets never enter any continuity mechanism (the runbook records *where*
each secret lives and how to re-obtain it, never values); every drill
produces a written runbook + a timed result in SCRATCHPAD; operator-mode
steps are explicit (several slices are agent+Ryan hybrids).

---

### 3.9.4.1 — Production smoke restoration

**Objective.** The browser-first post-merge production smoke works again
from the agent runtime, so every 3.9 close-out gets its required real-
browser verification instead of the "Browser runtime could not
initialize" fallback that recurred through 3.8.

**Evidence.** Four 3.8 shipped-ledger entries record the smoke skipped
(`Cannot redefine property: process`); operator context: the failure
involves local permissions and the agent driving the Brave browser.

**Done means.** Diagnosis-first: reproduce the failure, separate the
runtime error from the macOS permission/browser-selection question, and
present the root cause before any fix. The fix may be configuration
(permissions, a designated automation browser/profile) rather than code;
if Brave is the blocker, a dedicated automation profile or browser is an
acceptable outcome — Ryan decides the browser policy from the diagnosis.
Success = a demonstrated end-to-end production smoke (version, an
affected route, an auth gate, console) run by the agent, and the
procedure recorded where close-out already points.

**In scope.** The agent-runtime browser tooling, local permissions,
smoke procedure docs. **Out of scope.** Replacing the browser-first
policy with scripted HTTP (the policy stands — the edge rate-limits
scripts). **Dependencies.** None — runs **first in the version** if
practical, since every subsequent close-out benefits.
**Delivery evidence.** The recorded diagnosis; one real smoke run's
readout; updated procedure text; drift gate green if skills changed.

---

### 3.9.4.2 — Workspace continuity (mechanism + restore drill)

**Objective.** The gitignored workspace — `docs/`, agent guides, both
skill trees, `.agent-local/`, memory files — and the Document Archive
survive machine loss, deletion, and corruption, verifiably.

**Done means.** A mechanism is chosen and running (decision surfaced to
Ryan with the trade-offs): the recommended primary is a **private git
repository** for the workspace + archive (text-shaped, versioned,
off-device, deletion-recoverable, and both runtimes already hold `gh`
auth), with a scheduled one-way snapshot copy to a separate directory as
belt-and-braces; a second live-synced iCloud folder alone is
insufficient because sync propagates deletion. Secrets and env files are
categorically excluded (3.9.4.5 owns those). Then the drill: from a
clean checkout/simulated-new-machine, restore the workspace and
demonstrate `resolve_development_state.py` + `check_agent_drift.py`
running green — timed and written up as the restore runbook.

**In scope.** The mechanism, its exclusion rules, the drill, the
runbook. **Out of scope.** The application repo (already on GitHub);
secret values. **Dependencies.** None. **Delivery evidence.** The
mechanism live with one verified cycle; the timed drill write-up;
runbook committed to the workspace (and therefore itself now backed up).

---

### 3.9.4.3 — Neon recovery posture & drill

**Objective.** The database's actual restore capability is known,
documented, and exercised once.

**Done means.** The posture is recorded from the live plan (PITR window,
branch-restore semantics, what the current tier actually guarantees);
one drill executes: restore a point-in-time branch, run the app's
verification against it (migrations status, row-count sanity on
system-of-record tables — identity, tokens, durable app data), and tear
it down. The runbook states the from-loss recovery sequence and the
regenerable-vs-authoritative split (what must restore vs. what re-syncs
from ESI/SDE). **In scope.** Posture doc, one branch-restore drill,
runbook. **Out of scope.** Plan/tier changes (report if the posture is
insufficient — Ryan decides); any production mutation.
**Dependencies.** None. **Delivery evidence.** The drill readout
(commands + verification results) and the committed runbook.

---

### 3.9.4.4 — Convex regenerability drill

**Objective.** The standing claim "Convex state is fully derived —
teardown + resync reproduces it" is verified by doing it, not asserted.

**Done means.** Against the dev (or a disposable preview) deployment:
tear down the Convex state, run the documented resync path, and verify
the live surfaces reconverge (sync subjects re-arm, projections
repopulate, the sweeper reports healthy). Any manual step the drill
uncovers is either automated or written into the runbook; any state
that turns out *not* to be regenerable is a finding reported to Ryan
(it would contradict a durable invariant). **In scope.** The drill on
non-production state, the runbook, findings. **Out of scope.**
Production Convex; engine behavior changes. **Dependencies.** None;
pairs naturally with 3.9.3.7's measurement cells in scheduling.
**Delivery evidence.** Before/after state evidence; the reconvergence
readout; the committed runbook.

---

### 3.9.4.5 — Secrets & bootstrap runbook

**Objective.** From zero — new machine, no local state — the operator
can reconstruct a working development environment and, if needed,
production configuration, because every secret's *location and
re-obtainment path* is inventoried.

**Done means.** One runbook covers: every env-registry key with where
its value lives (Vercel env, the CCP developer application, Neon,
Convex, Upstash, Better Auth secret, service secrets) and how to
regenerate or re-obtain each; the CCP dev-app registration's role as
the scope ceiling (and that its settings are console-state, not code);
the local bring-up sequence cross-checked against the agent guide; and
the rotation posture (which secrets can rotate without user impact,
which force re-auth). No secret **values** anywhere in it. A dry-run
walk of the dev-bootstrap half validates the doc. **In scope.** The
inventory/runbook + the dev-half validation. **Out of scope.** Actual
rotations (report staleness findings); storing values.
**Dependencies.** After 3.9.4.2 so the runbook lands in a backed-up
home. **Delivery evidence.** The committed runbook; the dev dry-run
readout.

## Elective health campaign: none (decision recorded)

Per the one-elective-campaign rule: **no structural campaign is scheduled
for 3.9.** The 3.8 cycle-2 audit closed with an empty campaign queue —
all three v3.8 campaigns (AF-001, AF-004, AF-005) Verified — and four
Watch findings (AF-006–AF-009) whose triggers are monitored, not acted
on (P10). 3.9.1.4's Watch-trigger checker mechanizes exactly those
triggers, so a trip during 3.9 surfaces at close-out rather than waiting
for the next audit; AF-009's trigger (a third cron-shell clone) is
additionally mooted by 3.9.2.2, which records its closure in the
primitive ledger. Structural work re-enters through a tripped trigger or
the 3.9 version-close audit.

## Gates

- Delivered 2026-07-16 against a satisfied archive gate: the 3.8
  version-close audit is Complete (cycle 2), the bundle is archived with a
  verified manifest, and the resolver reported `master-plan-needed`.
- Phase 1 sequencing: 3.9.1.1 must merge before any other Phase 1 slice
  starts; 3.9.1.7 (comment migration) runs early after it — preferably
  before Phase 2 begins, so all new 3.9 code is born under the enforced
  standard; 3.9.1.6 runs last in the phase.
- Every Status row is a specified, approved commitment; rows are appended
  mid-version only through the master-plan-amendment path (the 3.9.2.7
  report or a tripped Watch trigger), with Ryan's recorded approval.
- Phase 3 ordering: 3.9.3.1 (triage) runs first in the phase; the rest
  order freely; 3.9.3.7 schedules at Ryan's convenience; 3.9.3.8 prefers
  running after 3.9.1.1/.3 so the truth loop exists when the pass lands.
- Phase 4 ordering: 3.9.4.1 (smoke restoration) runs as early in the
  version as practical — every close-out benefits; 3.9.4.5 follows
  3.9.4.2; the drills (.3/.4) schedule freely and never touch production
  state. Phase 3 may
  interleave with Phases 1–2 after 3.9.3.1, except 3.9.3.2 waits for the
  3.9.2.7 ledger only for its ledger-row update, never for its delivery.
- Phase 2 ordering: 3.9.2.1 (harness) runs first in the original arc;
  3.9.2.3 before 3.9.2.6; 3.9.2.7 (the primitives audit) runs after
  3.9.2.1–6 are terminal. 3.9.2.4 and 3.9.2.5 may interleave anywhere.
  Ryan approved PL-011–PL-013 from the 3.9.2.7 report on 2026-07-17, so
  amendment rows 3.9.2.8–10 follow the audit and may order freely.
- The primitives audit (3.9.2.7) never touches the AF ledger, the baseline
  schema, or the version-close audit's authority — it is scoped to the
  primitive map and `PL-NNN` verdicts.
- Every Phase 1 slice is non-UX: sessions self-finish through close-out with
  no operator pause; `UX gate: No` on every Phase 1 contract once the marker
  exists.

## Standing decisions

- The resolver's directive contract (stages, handlers, seven fields) is
  frozen in 3.9 — hardening refines validation, never the dispatch model.
- Checkers report; they never mutate artifacts or auto-promote findings
  (P10: metrics rank attention).
- Legacy exemption: machine-readable marker/vocabulary requirements apply to
  3.9-and-later artifacts; archived 3.8 material is never retro-edited.
- New checks always wire into `check_agent_drift.py` or close-out — no new
  standalone rituals.
- Planning sessions never execute what they planned: accepting a plan
  persists the artifact and ends the session; the next `start-session`
  (any runtime) picks up the execution directive.
- One comment style, no dual-style period: the migration (3.9.1.7)
  converts everything before enforcement flips on; conversion preserves
  existing prose verbatim; comment quality is judged, never metricized.
- Primitive verdicts require a concrete existing consumer or observed
  repetition; "the v4.0 mapper will want it" is never sufficient evidence.
  The mapper benefits from 3.9's primitives as a side effect, not as their
  justification.
- Combine-bias is standing: fewer, deeper primitives beat more primitives
  (P1/P8); every Create verdict records why no existing primitive stretches
  to cover the need.
- The primitive ledger (`docs/PRIMITIVE_LEDGER.md`, created by 3.9.2.7,
  living overwrite-in-place state thereafter) proposes; Ryan disposes. No
  row beyond 3.9.2.7 exists without his recorded approval of its `PL-NNN`
  verdict.

## Version-close checklist

- [ ] All Phase 1 checkers green on the live workspace and wired into their
      entry points; fixture suites green; the comment presence/TSDoc/TODO
      rules green repo-wide with no new suppressions.
- [ ] Drift-manifest hand-synced lists removed or justified.
- [ ] All six original Phase 2 verdict slices and approved extension rows
      terminal with rails demonstrated; `docs/PRIMITIVE_LEDGER.md` committed
      with the arc's verdicts Delivered and every Proposed row dispositioned
      by Ryan (approved rows terminal, deferred rows in backlog with their
      `PL-NNN`, rejections recorded — none silently implemented).
- [ ] Phase 3 delivered per its specs, each shipped item deleted from the
      backlog, and the triage sweep's dispositions resolved; the Phase 4
      no-campaign decision stands unless a Watch trigger tripped (then the
      trip is dispositioned, not ignored).
- [ ] Phase 4: the smoke runs browser-first again; the continuity
      mechanism is live with a passed restore drill; both recovery drills
      executed with committed runbooks; the secrets/bootstrap runbook
      validated dev-side.
- [ ] Version-close audit planned and run per `docs/VERSION_AUDIT.md`
      (which, after 3.9.1.1, no longer names version-specific surfaces).
