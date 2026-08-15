# Audit plan — Version 4.0 "The Living Map"

**Audit status:** Remediation in progress
**Audit cycle:** 1
**Audited ref:** `3daa21f54143cb48c5f69d669cb72aa9ae276530`
**Audit mode:** Version close

> **Expected shape: a single-cycle clean close, with a real risk of actionable
> findings against the mapper's first live surface.** 4.0 is the flagship
> collaborative wormhole mapper — the first Convex-durable user-authored data,
> the first multi-user real-time surface, the first interactive canvas.
> Grounding (2026-08-13, clean `main` @ `3daa21f5`, PR #422) against the
> live baseline (2026-07-27 / 4.0.0.1 / `c60a44e6`) shows the mechanical
> surface healthy: 23 configured Fallow zones (22 at version-start), zero
> threshold overrides, three carried Watch triggers (AF-006/007/008) all
> below threshold, and a clean release-consistency gate. The baseline
> `Current` column was session-maintained incrementally across the version
> (+71 production files, +1 Fallow zone, +1 cron shell, and the other
> session-recorded deltas against the frozen `Version-start` column); this
> audit is the first full re-measurement since adoption, so every `Current`
> cell is re-derived against the audited ref rather than trusted from
> session upkeep.
> The known open questions are judgment reviews, not pre-judged gaps: the
> mapper host layer (`src/mapper/`) is the version's largest new surface and
> the natural hotspot; the D14 layering arrow and the D16 observation
> stream's anti-circularity are the structural risks no PR-level gate sees;
> and PR #422's relocation of every `docs/workflows/*.md` procedure into
> Cursor skills (including `update-watch` and `resolve-update-watch`) must
> be reconciled against the automation that follows it. The baseline
> replacement **preserves** the frozen `Version-start` column and
> `Version-start ref` (`c60a44e6…`), so no checker transition is required
> for a clean close. The dev wall (D13) stays up through this audit —
> release is a separate act after the audit completes, so wall-gated
> product validation (D1) and Convex Pro durability hardening remain open
> carry-forwards, not close blockers. Unless a review confirms an
> actionable defect, the realistic path is cycle 1 → clean close → archive;
> if any Floss/Campaign is confirmed, the standard remediation branch applies.

## 1. Scope and comparison frames

- **Cycle-1 audited ref:** `3daa21f54143cb48c5f69d669cb72aa9ae276530` —
  current canonical `main`, the squash of PR #422. The final roadmap
  sub-version 4.0.4.4 shipped in PR #409 (`01c69678`). Three PRs landed
  after every roadmap row was already terminal: PR #410 (`b52a95d4` —
  "Keep Atlas tracking, jumps, and scanners on the live system"), ordinary
  post-roadmap production work, and PRs #419 and #422, post-roadmap
  cleanup. Their release notes sit as the four fragments in
  `content/changelog/pending/` (the designed inbox for out-of-band work)
  and fold into a public entry at the next planned release, which is
  after this audit. The worktree is clean on `main`.
- **Version-start ref (whole-version lens):**
  `c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd` (v3.10 cycle-4 audited ref;
  4.0 adoption, 2026-07-27). Use it for whole-version shape (`git archive`)
  and the pinned `FALLOW_AUDIT_BASE` run. It is a verified ancestor of `main`.
- **Previous baseline (delta + churn):** `2026-07-27 / 4.0.0.1 / c60a44e6` —
  the current `docs/CODE_HEALTH_BASELINE.md`. Because the previous baseline
  ref **is** the version-start ref, the two churn lenses coincide: one
  frame, expressed both as `--since=2026-07-27` and as
  `c60a44e6..3daa21f5` (cross-checked against each other).
- **The audited ref advances across cycles.** Any confirmed actionable
  finding remediates through a normal sub-version PR; cycle 2 audits the
  advanced canonical `main`, and the final baseline `Code ref` equals that
  clean-cycle audited ref.
- **Intentional terminal decisions, not gaps:** the operator-approved D1
  product validation (behind the wall, not yet released), Convex Pro /
  durability hardening timing (prerequisite for release, not for
  building), the membership source static-resolution-first posture, the
  D12 desktop-first deferral, the finer role tiers deferred from 4.0.1.1
  (deferred, not rejected), the always-author-everything setting parked as
  session-empirical, the summary-widget real content parked as a post-4.0
  intel decision, and the elective health campaign explicitly not
  scheduled for a flagship feature version. The dev wall (D13) remains up;
  its drop is the release act and happens only after this audit completes.

## 2. Step 0 — Transition validation and pre-overwrite capture

- Confirm the resolver directive names `version-audit` as its handler before
  any execution step; this plan never selects a sibling handler.
- On a complete-restart directive: verify every mapped remediation sub-version
  has terminal merge evidence, advance `Audit cycle`, set `Audited ref` to
  current canonical `main`, rerun every measurement and gate.
- Read, in order: the current `docs/CODE_HEALTH_BASELINE.md`; this approved
  plan; the completed `docs/VERSION_4_0_PLAN.md` and its Carry-forwards; the
  version's contract index, contracts, session plans, as-built records,
  changelog entries, and the `update-watch`/`resolve-update-watch` skill
  pair that replaced the deleted `docs/workflows/update-watch.md`.
- **Record the outgoing baseline in full before overwrite:** its Snapshot
  identity (Date 2026-07-27, App version 4.0.0.1, Code ref `c60a44e6…`,
  Measurement scope Full audit, Version-start ref `c60a44e6…`) and every
  Metrics row value, so the new baseline's `Current` cells compute against
  a captured prior, not a remembered one.

## 3. Artifact reconciliation

- Reconcile the master plan's 19 terminal roadmap status rows (14
  sub-version rows + 5 per-session delivery-record rows) against git, the
  17 `content/changelog/v4.0.md` sub-version headings, the 21 contracts
  mapped by `docs/session-contracts/4.0/INDEX.md`, the 21 approved session
  plans under `docs/session-plans/4.0/`, and the 21 as-built records under
  `docs/session-as-built/4.0/` (binding floor `(3, 10, 2, 1)` — every 4.0
  session is above the floor, so all 21 require and carry an as-built
  record). Row↔heading↔session mapping: the 19 roadmap rows cover the 21
  sessions — 4.0.2.2, 4.0.3.1, and 4.0.4.1 each ran two sessions under one
  sub-version row, while 4.0.4.2 and 4.0.4.3 ran three sessions each with
  per-session delivery-record rows (except 4.0.4.2.1, which has no record
  row). Changelog headings follow the same shape: one heading per
  single-session sub-version, one folded heading per multi-session
  sub-version through 4.0.4.1, and per-session headings for 4.0.4.2.2,
  4.0.4.2.3, and 4.0.4.3.1–3. Session 4.0.4.2.1 (tracked location and jump
  classification, PR #357, 2026-08-04) has no heading of its own; its
  user-facing surface appears folded across the v4.0.4.2.2/v4.0.4.2.3
  entries — confirm that coverage and record the disposition as a
  docs-truth item, not a code finding, unless coverage is actually absent.
- **Known reconciliation details to disposition (not pre-judged):**
  - The 4.0.4.2 and 4.0.4.3 per-session-PR delivery exceptions (three
    sessions, one branch each, one PR per session) are operator-approved
    deviations; verify their recorded as-built PR markers.
  - The 2026-08-11 operator amendment merged 4.0.4.4's four sessions into
    the single maps & access session `4.0.4.4.1`; confirm the changelog and
    as-built record agree.
  - Two delivery rows absorbed sibling roadmap sections (§4.0.1.2 into
    4.0.1.1; §4.0.1.4 into 4.0.1.3; §4.0.1.5 into 4.0.1.3); confirm the
    changelog and as-built records agree.
  - Post-roadmap ordinary work: PR #410 (`b52a95d4`) shipped production
    Convex behavior (character location, map-create seeding, dock/scanner
    root) with no session contract/plan/as-built — the designed path for
    ordinary out-of-band work. Confirm its whole-version churn reconciles
    to PR #410 alone, and confirm the four `content/changelog/pending/`
    fragments (2026-08-11 feedback/GitHub issues and 2026-08-13
    update-watch absorption ← #419; 2026-08-12 Atlas live tracking ← #410;
    2026-08-13 thin agent context ← #422) each name their shipped work and
    remain unfolded by design until the next planned release.
- **PR #422 workflow-doc relocation (the operator's investigation request):**
  PR #422 deleted every `docs/workflows/*.md` procedure file — including
  `update-watch.md` and `resolve-update-watch.md` — and relocated the
  procedure steps into Cursor skills at `~/.cursor/skills/` (and
  `~/.agents/skills/`). Reconcile that (a) no operative in-repo reference
  to the deleted `docs/workflows/*` paths remains — keyed on
  `python3 tools/cli.py policy check-doc-refs --check` staying error-free
  (the checker exempts frozen record sources by design). A literal grep
  legitimately hits frozen lifecycle records
  (`docs/session-as-built/4.0/4.0.1.1.1.md`,
  `docs/session-plans/4.0/4.0.0.1.1.md`, `4.0.1.6.1.md`, `4.0.2.1.1.md`)
  and a self-contained fixture path in `tools/tests/test_agent_policy.py`;
  those historical citations are in scope only as confirmation that they
  are frozen records, never as restoration targets. Then (b) the
  `update-watch` collector's rendered absorption note now points at
  `docs/UPDATE_WATCH_BASELINE.md` directly rather than the deleted
  `docs/workflows/resolve-update-watch.md`, and (c) the cursor automation
  that follows the update-watch workflow resolves to the skill, not a
  deleted doc. Conclusion expected: no restoration is needed; record the
  reconciliation as a closed docs-truth item, not a finding, unless evidence
  shows a broken reference.
- **Master-plan Watch citation drift:** `docs/VERSION_4_0_PLAN.md` states
  "Watch findings AF-006–AF-009 carry," but the live baseline carries only
  AF-006/007/008. AF-009 (the cron-shell clone posture) was never promoted
  to a baseline `watch-trigger`; the 4.0.1.6.1 plan explicitly records
  that "the live baseline governs, and the substantive constraint survives
  as Contract HC-3." Reconcile the master-plan prose against the baseline:
  the substantive constraint is enforced; the prose citation is stale.
  Record as a docs-truth item (master-plan prose), not a code finding, unless
  reconciliation exposes a real unenforced constraint.
- Validate the master plan's version-close claim set against actual
  terminal/deferred decisions: every Carry-forwards item (D1 product
  validation OPEN; Convex Pro durability OPEN; membership source;
  OCC-under-load WATCH; EVE-Scout v2 API WATCH; the operator-scheduled
  location read scopes for 4.0.4.2) is either satisfied, explicitly
  deferred, or still-open-but-not-blocking.

## 4. Step 1 — Measurements

Run and record numbers from the approved plan. `fallow:health` may exit
nonzero — record it; it is not gating `pnpm fallow`. Remove `coverage/`
after final checks. Capture every registered baseline row against
`3daa21f5`.

Exact commands:

- `pnpm verify` — the sole definition of done (typecheck + lint +
  test:coverage + fallow). Record pass/fail and the coverage figures.
- `FALLOW_AUDIT_BASE=c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd pnpm
  verify` — the whole-version pinned Fallow window (version-start ref →
  audited ref); the producing run for the `Version-start-pinned Fallow
  verdict` and `Whole-version Fallow clone groups` rows. Record the
  verdict and the clone-group count. (The PR-time form
  `FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm verify` is a
  vacuous self-comparison on the audit checkout, where `main` ==
  `origin/main` == the audited ref; it is retained nowhere in this plan
  as a measurement, only noted here so the executing auditor does not
  mistake it for the audit gate.)
- `pnpm fallow:health` — report-only health score and
  functions-above-threshold; record the score and any functions flagged.
- `python3 tools/cli.py quality check-baseline --check` — baseline-claims
  consistency; record any stale `Current` cells the replacement will
  overwrite.
- `python3 tools/cli.py quality check-watch-triggers --check` —
  Watch-trigger evaluation against the live baseline; record AF-006/007/008
  verdicts.
- `python3 tools/cli.py lifecycle check-evidence --check` — cross-lifecycle
  evidence (baseline ↔ audit ↔ roadmap ↔ contracts ↔ as-builts); record.
- `python3 tools/cli.py lifecycle check-release --check` — release
  consistency; record.
- `python3 tools/cli.py policy check` — policy-manifest invariants; record.
- `python3 tools/cli.py update-watch check-baseline` — update-watch baseline
  vs `package.json`; record.
- Whole-version churn lens: `git archive` / `git log --since=2026-07-27` /
  `c60a44e6..3daa21f5` for file and LOC deltas.

Registered metric rows to refresh (every one measured against `3daa21f5`):
production TS/TSX files and LOC; test files; coverage statements/branches/
functions/lines; Fallow health score; functions above health thresholds;
planner concern-context fields; concern-hook consumers; auth contract paths;
ESI dataset registry entries; freshness leaf breadth; cron shell
declarations; real-Postgres harness consumers; dataset declaration census;
API contract completeness; EVE type-image resolver breadth; threshold
overrides; diagnostic suppressions; test contract suppressions;
whole-version Fallow clone groups; accepted duplication baseline clone
groups; version-start-pinned Fallow verdict; Fallow boundary zones;
vendor-resilience integrations; instrumented capability operations; owned
service-level indicators; UI adoption exemptions; retained legacy CSS
families; `src/data/telemetry/queries.ts` exports;
`src/data/esi-refresh-jobs/queries.ts` exports.

## 5. Step 2 — Re-rank hotspots

Hotspot = interface breadth + unrelated change axes + churn, not mere
length. Record ranking and fix directions in this plan. "Make it smaller"
is not enough. Candidate hotspots to rank against the audited ref:

- **`src/mapper/` host layer** — the version's largest new surface (D14).
  Rank by import breadth (features' public surfaces it consumes), the
  number of distinct map data documents it touches, and churn across the
  version. The D14 one-directional arrow (mapper may import features' public
  surfaces; no feature may import the mapper) is the structural invariant —
  verify the fallow failure test still fails on a feature→mapper import.
- **`convex/engine.ts`** (518 LOC at baseline, named Watch-adjacent) + the
  new location dataset added by 4.0.4.2. Rank by the dataset-union breadth
  and the AFK zero-write contract. Verify the extension followed the
  existing subject pattern, not a fork.
- **`src/data/eve-data/universe.ts`** (501 LOC) and
  **`src/features/wormhole-sites/queries.ts`** (466 LOC, AF-003) — named
  Watch-listed surfaces the version reads from; verify the version did not
  widen them.
- **The Convex authorization projection** (4.0.2.2) — the D5 single-gate
  invariant and the Neon→Convex one-directional projection. Rank by the
  public map function count (every one must call the gate first) and the
  revoke-evicts-live contract.
- **The D16 observation stream** (4.0.4.2/4.0.4.3) — anti-circularity
  (inferred values never emit) and attribution (K162 never attributable).
  Rank by the emission-site count and the provenance-tier coverage.
- **The unified collapse pathway** (4.0.4.1/4.0.4.3) — three triggers
  through one orphan smart-logic; verify no second implementation appeared.

## 6. Step 3 — Review drift no PR-level gate sees

- **Boundary drift:** `src/mapper/` zone growth, any new Fallow `allow`
  entries, composition inside a participating slice. The D14 hierarchy
  (`components/ui` → `data` → `features` → `mapper` → `app`) and the
  feature-never-imports-mapper rule are the boundary invariants.
- **Override staleness:** every Fallow override/suppression is a loan. The
  baseline records 0 threshold overrides, 18 diagnostic suppressions, 24
  test contract suppressions — re-verify each is still justified; remove
  stale, classify live with rationale and date.
- **Duplication baseline:** each accepted clone group is boring shape or
  leaked knowledge. The baseline records 1 whole-version Fallow clone group
  and 0 accepted duplication baseline clone groups at version-open; re-verify
  the mapper's first live surface did not add a clone group silently.
- **Rails gaps:** repeated failures → narrowest useful rail, tripwire, or
  durable principle. The D16 anti-circularity and the D5 single-gate are the
  candidates for a durable rail if any drift appeared.
- **Docs truth:** reconcile prose with reality, including `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `.github/` templates, `.env.example`,
  and legal pages — especially after PR #422's large doc thinning (root
  `AGENTS.md`, `CONTRIBUTING.md`, `docs/CONVEX.md`, `docs/contributing/*`,
  and the deleted `docs/workflows/*` set). Verify operative docs carry no
  deleted-path references (`python3 tools/cli.py policy check-doc-refs
  --check` is the authority; frozen lifecycle records and test fixtures
  keep their historical `docs/workflows/*` citations by design — see §3)
  and that `docs/DATA_SOURCES.md` (deleted by #422) is not referenced as
  live.
- **Lifecycle truth:** contracts, approved session plans, close-out
  evidence, as-built records, and master-plan terminal statuses must agree.
  The AF-009 citation drift (§3) and the PR #422 workflow-doc relocation (§3)
  are the named lifecycle-truth reconciliation items.

## 7. Step 4 — Classify, record, and route

One bucket per finding. Ids monotonic within 4.0 (`AF-001`…). Status:
`Open`, `Planned`, `Delivered`, `Verified`, or `Watch`. Watch class
requires Watch status; actionable classes must not use Watch. The cycle-1
ledger is empty until measurement and review run; findings discovered
during execution are recorded in the `## Audit findings` ledger below.
Carried Watch findings AF-006/007/008 retain `Watch` status across the
cycle unless measurement promotes one to Floss/Campaign.

## 8. Step 5 — Overwrite the baseline

Replace `docs/CODE_HEALTH_BASELINE.md` in full using only
`docs/workflows/schema/code-health-baseline.md`. Full audit: measure every
registered row; `Measurement scope: Full audit`; advance Snapshot to the
audited ref (`3daa21f5…`). **Preserve** the frozen `Version-start` column
and `Version-start ref` (`c60a44e6…`); update every `Current` and derived
`Delta`. Re-evaluate each carried Watch trigger (AF-006/007/008) against the
new `Current`; a trigger that crosses its threshold promotes the finding to
Floss or Campaign and is recorded in the ledger before the baseline is
sealed. The baseline `Code ref` equals the cycle's `Audited ref` on a clean
close; on a remediation-required close it equals the prior `Current` ref
until the next clean cycle.

## 9. Step 6 — Remediate, repeat, or archive

- **Clean version close:** run the master-plan version-close checks
  against actual terminal/deferred decisions; mark Delivered → Verified
  only when this fresh cycle proves each required outcome; every audit gate
  passes; baseline `Code ref` equals `Audited ref`; set
  `**Audit status: Complete**`; follow resolver `archive-needed`: archive
  the master plan, contracts, session plans, session-as-builts, and this
  audit plan as one version bundle; keep `docs/CODE_HEALTH_BASELINE.md`
  active; report the next master-plan handoff or `awaiting master plan`;
  run the workflow-state resolver and `python3 tools/cli.py policy check`.
- **Version close with any Floss or Campaign:** set each actionable finding
  Open; set `Audit status: Remediation required`; report the resolver
  directive for audit-remediation planning; run the resolver, report the
  directive, return control to `start-session`; stop — no archive. After
  `plan-audit-remediation` maps the work, use normal session plans, branches,
  PRs, design review, and close-out; in every mapped sub-version's delivering
  PR, mark its finding Delivered; when all rows are terminal on `main`,
  rerun the resolver and let its directive start the next full cycle.
- Never archive before baseline replacement is verified.

## 10. Version-close archive destination

On a clean close, the version bundle archives to the sibling document archive
used by the v3.10 close: `<repo parent>/LGI Tools Document Archive/versions/4.0`
(the `verify_archive` default `archive-root`). The bundle is the master plan
(`docs/VERSION_4_0_PLAN.md`), `docs/session-contracts/4.0/`,
`docs/session-plans/4.0/`, `docs/session-as-built/4.0/`, and
`docs/version-audits/4.0/`. Run `python3 tools/cli.py lifecycle
verify-archive --phase pre` before the copy and `--phase post` after, with
the explicit recursive diff of every copied directory (the checker proves
byte-identity for the bundle; session-as-built is covered). The live
`docs/workflows/` + `docs/workflows/schema/` canonical set and
`docs/CODE_HEALTH_BASELINE.md` stay active and are **never** archived with
the version.

## Cycle-1 execution evidence

Outgoing baseline captured before overwrite: Snapshot Date 2026-07-27, App
version 4.0.0.1, Code ref `c60a44e6…`, Measurement scope Full audit,
Version-start ref `c60a44e6…`, with every Metrics cell as committed on
`origin/main`. Cycle-1 measurements are against `3daa21f5`. Session-maintained
`Current` cells were stale; live re-measurement is the replacement source.

### Gates

| Command | Result |
| --- | --- |
| `pnpm verify` internals (typecheck, lint, `test:coverage`) | Pass. 593 test files / 5172 tests passed, 1 skipped. Coverage 82.70% / 79.65% / 77.97% / 84.13%. |
| `FALLOW_AUDIT_BASE=c60a44e6… pnpm verify` (producing whole-version Fallow) | Fail. Typecheck/lint/tests passed; `pnpm fallow --fail-on-issues` reported unused export `PointerPopover` and 1 new clone group (`dup:50ee3d46`, jump-resolver vs signature-elimination `postDoor`). Audit scope: 1162 changed files vs version-start. |
| Unpinned `pnpm fallow` (HEAD == `origin/main`) | Pass. Empty window except the untracked audit plan; CI-shaped gate is green. |
| `pnpm fallow:health` | Report-only nonzero. Score 78 (B). 1 function above CRAP threshold: `SectionHeader` (CRAP 42.0, 0% tested). Not classified as Floss — complexity is low (cyclomatic 6); CRAP is an untested-primitive signal, same posture as 3.9's inherited above-threshold set. |
| `quality check-baseline --check` (before overwrite) | 6 stale-Current warnings (files 877→1058, LOC 86886→119944, tests 472→583, diagnostic suppressions 18→21, vendor 15→16, capability 40→49). |
| `quality check-watch-triggers --check` | Clean. AF-006=25, AF-007=13, AF-008=3. None promoted. |
| `lifecycle check-evidence --check` | Clean. |
| `lifecycle check-release --check` | Clean. |
| `policy check` | Clean. |
| `update-watch check-baseline` | Clean. |
| `policy check-doc-refs --check` | Error-free; one warning: `docs/ux-check/README.md` → deleted `docs/contributing/end-to-end-testing.md`. |

Whole-version churn (`c60a44e6..3daa21f5`): 780 `src`/`convex` paths. Top
non-version-stamp band is the mapper host (`ChainHost.tsx`, `use-map-chain.ts`,
window/canvas tests) plus `idempotency-registry.ts` and `data-ownership-registry.ts`.

### Hotspot ranking

1. **`src/mapper/` host layer** — 104 production files, 17,504 LOC, highest
   version churn. Consumes features' public surfaces (wormhole-sites scanner
   hosting) and many `src/data/maps` documents through `use-map-chain` /
   optimistic authoring. D14 holds: features do not import mapper;
   `src/mapper/boundary.test.ts` still fails a feature→mapper probe and
   restores bytes. Direction of fix: do not "make it smaller"; split only if
   a second consumer of a mapper-internal decision appears. Fallow warns that
   zone `mapper` matched 0 reachable files from configured entries — unused
   exports inside mapper are weakly visible. Attention, not a finding.
2. **`convex/engine.ts` (744 LOC) + `characterLocation`** — grew from 518 by
   adding the location dataset on the existing watched-hour subject pattern
   (`characterLocation: internal.characterLocationSync.syncUser`), not a fork.
   Direction of fix: keep new engine datasets on that union; do not add a
   second heartbeat.
3. **Convex map modules (`mapScan.ts` 1408, `mapAuthoring.ts` 1359,
   `mapFixtures.ts` 917)** — largest files in the tree; public handlers still
   enter through `requireMapAccess` / `tryMapAccess` (D5). Direction of fix:
   extract only when a second authorization path appears.
4. **`src/composition/data-ownership-registry.ts` (943 LOC)** — declarative
   census, one consumer. Grew with tables. Direction of fix: unchanged from
   3.10 — split only on a second programmatic consumer.
5. **D16 observation stream / unified collapse** — emission stays in the
   jump-resolver and Convex authoring doors; `tween-model.ts` still names one
   collapse pathway. No second implementation found. Anti-circularity
   (inferred values do not emit as authored facts) and K162 attribution hold
   in the jump-resolution tests.
6. **`src/data/eve-data/universe.ts` (519) and
   `src/features/wormhole-sites/queries.ts` (516)** — Watch-listed surfaces
   the version reads; neither grew a new owner or a second parse/query hub.

### Drift review

- **Boundary:** 23 configured zones (mapper added). Features' `allow` list
  still excludes mapper. No new cross-layer `allow` that reverses D14.
- **Overrides:** `thresholdOverrides: []` still empty. Diagnostic
  suppressions 18→21; test-contract suppressions stayed 24. The three new
  diagnostic loans are live (not stale leftovers of deleted files).
- **Duplication:** accepted `dupes.json` is empty. Whole-version window
  reports 1 clone group, new in 4.0 (the two Convex HTTP `postDoor` helpers).
  Count matches version-start's recorded 1, but the group is different
  content and fails `gate: new-only`. Classified as Floss (AF-011).
- **Rails:** D5 single-gate and D16 anti-circularity still have tests. The
  mapper-unreachable Fallow warning is the candidate rail if mapper dead code
  starts accumulating; not promoted this cycle.
- **Docs truth:** PR #422 procedure relocation is closed for operative
  in-repo refs except AF-012. Frozen lifecycle records keep historical
  `docs/workflows/*` citations. `update-watch` collector absorbs against
  `docs/UPDATE_WATCH_BASELINE.md`; the skill pair at `~/.agents/skills/`
  replaced the deleted workflow docs. `docs/DATA_SOURCES.md` is not a live
  operative reference (`check-doc-refs` did not error on it). Master-plan
  AF-009 citation drift is stale prose; HC-3 still owns the cron-shell
  constraint. Session 4.0.4.2.1 has no changelog heading; jump-authoring and
  tracked-pilot surfaces are covered in v4.0.4.2.2 / v4.0.4.2.3 — folded,
  not absent. Carry-forwards (D1 validation, Convex Pro, membership source,
  OCC, EVE-Scout v2) remain open by design and are not close blockers.
- **Lifecycle truth:** 19 roadmap status rows, 17 changelog headings, 21
  contracts / plans / as-builts. Per-session PRs for 4.0.4.2 and 4.0.4.3
  match as-built markers (#357, #365, #370, #377, #380, #406). 4.0.4.4.1
  as-built PR #409. Pending fragments remain unfolded.

## Audit findings

| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-010 | 1 | Floss | unused `PointerPopover` export in `src/components/ui/popover.tsx` (introduced #377, never consumed; Signature Editor uses `ScannerAnchoredPanel`) | delete the unused export or give it its one consumer | 4.0.5.1 | Planned |
| AF-011 | 1 | Floss | new whole-version clone group `dup:50ee3d46` — `postDoor` in `src/composition/jump-resolver/convex-door.ts` and `src/composition/signature-elimination/convex-door.ts` fails version-start-pinned `pnpm fallow` | one shared Convex service-door helper, or a documented accepted clone | 4.0.5.1 | Planned |
| AF-012 | 1 | Floss | `docs/ux-check/README.md` layout table uses a `../` path that `check-doc-refs` treats as a repo-root archive reference, so live `docs/contributing/end-to-end-testing.md` does not resolve | retarget or drop the layout-table row so `check-doc-refs` is warning-free | 4.0.5.1 | Planned |

Carried Watch findings (baseline `## Watch findings`):

- Watch (AF-006)

```watch-trigger
AF-006: exports(src/data/telemetry/queries.ts) >= 26
```

- Watch (AF-007)

```watch-trigger
AF-007: exports(src/data/esi-refresh-jobs/queries.ts) > 15
```

- Watch (AF-008)

```watch-trigger
AF-008: files(globs:src/platform/auth/*types.ts,src/platform/auth/*-contract.ts,src/db/*auth*schema.ts) >= 4
```
