# VERSION 3.10 PLAN — Hull Integrity

> **This is a combined plan.** It brings together two movements: the
> documentation/lifecycle consolidation (findings, contradiction register, and
> the recorded Group A decisions and doc dispositions are in
> `DOC_CONSOLIDATION_AUDIT_AND_PLAN.md`) and the architecture-hardening roadmap
> sourced from the Sound Architecture report (2026-07-19). The consolidation
> is sequenced **first**, as Phase 0, because the architecture arcs write
> their new rules into the guidance Phase 0 restructures — so each rule has a
> single owner before anything new is added.
>
> Pairs with the canonical contract template (which Phase 0 extracts from
> `docs/SESSION_CONTRACTS.md`, with the resolver validating contract structure
> against it) and the contracts `plan-version` will derive from it.
> The roadmap below is the source of truth for sequence/status; each session
> contract is the source of truth for its session's executable requirements.
> Standing workflow: the lifecycle resolver selects every stage; branch per
> sub-version; sessions commit in-branch with `pnpm verify`; one PR per
> completed sub-version; Greptile on PR open is the gate of record; every
> session ends through `close-out`.
>
> **Numbering:** segmented by PHASE, including a Phase 0. Sub-versions are
> `3.10.<phase>.<slice>` (one branch + one PR each); sessions add a final
> digit only where a slice has more than one. CHANGELOG nests every
> sub-version under 3.10. (This is the 3.9/3.10 convention — `3.10.<phase>.<slice>`
> is a *sub-version*, not a "feature" — which Phase 0 itself makes canonical
> across the guides; see 3.10.0.2 decision A4.)
>
> **Contract-extraction convention (carried from 3.9):** every sub-version
> carries the fixed spec block — Objective / Done means / In scope / Out of
> scope / Dependencies / Decisions the session plan must resolve / Baseline &
> hotspot note / Delivery evidence. `plan-version` seeds the contract from
> these fields and derives the remaining contract sections (hard constraints,
> verification, gates, close-out behavior) from repo policy plus session
> needs; the plan states *what must be true*, never implementation steps.
> (Phase 0 replaces the older, inaccurate "maps 1:1 onto the contract shape"
> claim with this seed-and-derive description; see 3.10.0.2 decision A5.)

## What this is

3.10 is a **hardening pass with no new flagship tools**, in two movements
that share one thesis — *the intended design becomes the enforced design*:

- **Phase 0 hardens the guidance itself.** The agent-facing document corpus
  (~41k words across 35+ files, plus ~10.3k words duplicated across two skill
  trees) states the same rule in three-to-eight places and forces an agent to
  read up to eight cross-referencing documents for one workflow. Phase 0 stops
  treating docs as the medium of enforcement. Every rule routes to exactly one
  of three destinations: the **lifecycle resolver / checkers** enforce what a
  machine can verify (CHECK), the **skills** carry the actionable steps for
  each moment (STEP), and a small set of **map** docs hold on-demand references
  to this specific system (MAP). History and living state are RECORD — frozen
  or machine-owned, and no longer policed as if they must stay current. Each
  surviving rule gets one hand-editable canonical file (the `AGENTS.md` →
  `CLAUDE.md` model, applied throughout); the resolver and both runtime skill
  trees consume it, never restate it. Target: an agent's per-session read is
  one dispatched skill → its one canonical procedure in `docs/workflows/` →
  plus a map only when the task touches that area. This is P2 (one owner per
  decision) applied to the documents.
- **Phases 1–3 harden the code**, sourced from the Sound Architecture report
  and verified against live code at `ef2e7df`. The report's conclusion
  stands: the codebase stays a modular monolith, nothing is rewritten, and
  the work is closing the gaps between what the guides say and what the
  machine checks. Three arcs: (1) **Close the structural loopholes** — every
  source area becomes a named boundary zone, the bidirectional
  `shared`↔`features` edge is removed, and the browser/server boundary gets
  mechanical `server-only` enforcement; (2) **Production flow contracts** —
  one typed error contract with an RFC 9457-compatible mapper, a declared and
  enforced mutation-pipeline order (completing backlog LGI-03), a
  data-ownership/transaction/RLS registry, and a vendor resilience registry;
  (3) **Operability** — capability-level telemetry names, a small
  user-centered SLI set, a judged idempotency inventory, and a closing
  showcase: the architecture map generated from the finished Fallow zone
  config and published as a stylized devlog flowchart, so the map is rendered
  from enforcement, never drawn by hand.

Everything in both movements extends rails that already exist (Fallow zones,
the dataset-declaration census, the API-contract gate, the same-origin
coverage inventory, the drift/parity manifest) rather than adding parallel
machinery — P2's one-owner rule applied to the architecture and to the docs
alike.

Verified evidence anchoring the architecture arcs (2026-07-20, clone of
`main` @ `ef2e7df`):

- Fallow declares 6 zones; `src/app`, `src/db`, `src/config`, `src/purge`,
  `src/search`, `src/page-settings`, `src/esi-datasets`, and `convex/` are
  unzoned. `circular-dependencies` and `re-export-cycle` are `warn`.
- The `shared` zone may import `features` while `features` may import
  `shared` — a sanctioned two-way edge. 20 of 34 files in that zone import
  `@/features` or `@/data`; they are composition, not leaf code.
- Zero production files import `server-only` (all 8 grep hits are comments);
  the package is not a dependency.
- `route-guards.ts` returns plain-text `Response('Unauthorized'|'Forbidden')`;
  there is no typed failure set or single HTTP error mapper.
- `runMutationRoute` authorizes, then calls `requireSameOrigin`, which
  **observes and logs only** — a cross-origin mutation is never rejected
  (backlog LGI-03). Rate limits are caller-owned by doc comment only.
- Strong rails already in place and kept as-is: typed env (zero stray
  `process.env` reads), one ESI gate, 52-route API-contract gate, 56-table
  dataset-declaration census, 7 `defineCronRoute` declarations,
  same-origin-coverage inventory test, empty Fallow baselines.

Verified evidence anchoring Phase 0 (2026-07-20, same clone, plus a live
`check_doc_refs.py` run):

- `check_doc_refs.py` fails today with 4 errors: `AGENTS.md:220` and
  `docs/session-plans/3.9/3.9.1.4.md:70` both cite `.claude/worktrees/`
  (unresolved, ungitignored); `src/CLAUDE.md:5` makes a negative reference to
  `.claude/rules/`, a path the manifest *forbids* from existing (a
  structurally permanent error); `docs/SCRATCHPAD.md:39` cites a deleted
  ux-check profile.
- 14 distinct rules are maintained in parallel in 3–8 places each (the
  session-terminal rule in 8, the plain-English-checkpoint rule in 7, the UX
  pause in 6, post-merge reconciliation in 4, the adversarial-review cap in
  4, the seat→effort mapping in 3).
- ~1,000 words of `PR_REVIEW.md` teach a hand-rolled Greptile poll that
  `poll_pr_gate.py` and `merge_clean_pr.py` (tracked, tested, in
  PRIMITIVE_LEDGER) already own; neither doc references the scripts.
- The close-out pipeline is one workflow split across four era-mismatched
  docs (SESSION_END 3.0-era, SELF_REVIEW, PRE_PR_DESIGN_REVIEW, PR_REVIEW
  3.7-era); most contradictions live on the seams.
- `CODE_HEALTH_BASELINE.md` carries both the superseded and the current
  AF-013 diagnosis simultaneously; `check_lifecycle_evidence` only reads the
  Status cell, so the contradiction passes the gate.

The version starts from whatever verified v3.9 cycle-2 baseline exists at
adoption. Elective structural campaign: this version's roadmap **is** the
scheduled structural work; the baseline campaign queue was empty at drafting
and no separate elective campaign is scheduled.

## Status

| Sub-version | Theme | Sessions | Status |
|---|---|---|---|
| **Phase 0 — Documentation & lifecycle consolidation** | | | |
| 3.10.0.1 | Green the gate honestly: exempt history, fix real stale map-facts (decision-free) | 1 | PLANNED |
| 3.10.0.2 | Canonical frame: `docs/workflows/`, contract + strict data-only baseline forms, resolver-enforced (parser in scope); retire the lifecycle narrative | 2 (one branch) | PLANNED |
| 3.10.0.3 | Migrate close-out (SESSION_END + SELF_REVIEW + PR_REVIEW → one procedure + thin adapters) | 2 (one branch) | PLANNED |
| 3.10.0.4 | Migrate planning + design review (SESSION_PLANNING + PRE_PR + DESIGN_PRINCIPLES) | 2 (one branch) | PLANNED |
| 3.10.0.5 | Migrate version-audit + de-duplicate the self-contained skills | 1 | PLANNED |
| 3.10.0.6 | Maps & policy single-owner: AGENTS dedup, precedence, ledger archive | 1 | PLANNED |
| 3.10.0.7 | Enforcement follow-through & anti-duplication check | 1 | PLANNED |
| **Phase 1 — Close the structural loopholes** | | | |
| 3.10.1.1 | Full boundary coverage: every source area a named zone | 1 | PLANNED |
| 3.10.1.2 | Shared→composition split; cycles become blocking | 1 | PLANNED |
| 3.10.1.3 | `server-only` rails on the browser/server boundary | 1 | PLANNED |
| **Phase 2 — Production flow contracts** | | | |
| 3.10.2.1 | Typed error contract & RFC 9457 problem mapper | 2 (one branch) | PLANNED |
| 3.10.2.2 | Mutation pipeline: declared order & same-origin enforcement (LGI-03) | 1 | PLANNED |
| 3.10.2.3 | Data ownership, transaction & RLS registry | 1 | PLANNED |
| 3.10.2.4 | Vendor resilience registry (timeouts, retries, idempotency) | 1 | PLANNED |
| **Phase 3 — Operability** | | | |
| 3.10.3.1 | Capability telemetry names & SLIs | 1 | PLANNED |
| 3.10.3.2 | Idempotency inventory (judged; may resolve to no code) | 1 | PLANNED |
| 3.10.3.3 | Generated architecture map & devlog flowchart (UX gate: Yes) | 2 (one branch) | PLANNED |

## Phase 0 — Documentation & lifecycle consolidation (3.10.0.x)

**Arc thesis.** The drift/parity machinery polices the *copies* of each rule,
not its source, so every duplicated sentence is a maintenance tax and an agent
reads up to eight cross-referencing documents for one workflow. Phase 0 stops
treating docs as the medium of enforcement. Every rule routes to exactly one of
three destinations, and each surviving rule gets one hand-editable canonical
file:

- **CHECK** — anything a machine can verify lives in the lifecycle resolver
  (`resolve_development_state.py`) or a `.agent-local/` checker. The resolver
  *is* the lifecycle; prose describing it is deleted, not moved.
- **STEP** — the actionable steps for each moment live in the skill the resolver
  dispatches. The canonical steps for each workflow live once in
  `docs/workflows/<name>.md`; both runtime skill trees (`.claude`, `.agents`)
  are thin adapters over that file, carrying only genuine per-runtime mechanics
  (the `AGENTS.md` → `CLAUDE.md` model, applied to skills).
- **MAP** — coupled references to *this* system (`CONVEX`, `AGENT_TOOLING`,
  `README`, `CONTRIBUTING`, `DATA_SOURCES`, the AGENTS codebase map) survive and
  are read on demand, not every session.

**RECORD** is never read as guidance, and splits two ways. *Frozen history*
(`session-plans/**`, `session-contracts/**`, `version-audits/**`,
`content/changelog/**`, `SCRATCHPAD.md`) is exempt from reference-policing — it
is not required to stay current and must never be rewritten to satisfy a linter.
*Living state* is machine-owned: the active plan and `backlog.md`, and
`CODE_HEALTH_BASELINE`, which is tightened into a **strict data-only metrics
record the resolver enforces** — every metric carries a frozen version-start
value and a session-updated current value, only the current column is writable,
and no prose, notes, or campaign queue are permitted (3.10.0.2); scheduled work
lives in the plan/backlog and all findings and rationale live in the
version-tagged audit report (`version-audits/X.Y/`) that archives with the
version. Where a schema can be derived from a
canonical file — the contract's required sections from the template's own
headers, the baseline's allowed shape from its schema — it is derived, never
duplicated. No application behavior changes anywhere in the arc; the only code
touched is `.agent-local/` checkers/resolver (parser modification included) and
`policy-manifest.json`.

**Ordering rationale (P9 applied to the docs).** 3.10.0.1 makes the gate honest
without restructuring. 3.10.0.2 builds the canonical frame the migrations move
content into and retires the lifecycle narrative the resolver already replaces.
3.10.0.3–0.5 migrate each workflow's steps into its one canonical procedure,
baking the relevant recorded Group-A decision in at its destination — the
decisions are applied where the content lands, not in a separate pass, because
each migration is a rewrite (untangling shared steps from per-runtime mechanics
and rewriting narrative into actionable steps), not a pure move. 3.10.0.6 makes
the map/policy layer single-owner. 3.10.0.7 rewrites the enforcement machinery
for the new set and adds the check that keeps it single-owner. Each sub-version
updates `policy-manifest.json` and the checkers in the same slice, so the
resolver and drift gate are green at every step.

**Where the recorded Group-A decisions land** (each applied once, at the
destination that owns it): A4/A5/A9 → 3.10.0.2 (contract template + resolver);
A2/A3/A10 → 3.10.0.3 (close-out); A1/A4-b → 3.10.0.4 (planning/design);
A6/A7/A8 → 3.10.0.6 (maps/policy).

---

### 3.10.0.1 — Green the gate honestly (decision-free)

**Objective.** The drift gate is green on a fresh checkout, achieved by fixing
what is genuinely wrong and by teaching the reference checker not to police
history — with no restructuring and no policy change.

**Done means.** `check_doc_refs.py` exempts RECORD paths
(`docs/session-plans/**`, `docs/session-contracts/**`, `docs/version-audits/**`,
`content/changelog/**`, `docs/SCRATCHPAD.md`) so frozen history is not required
to resolve live paths — this alone clears the `3.9.1.4.md` and `SCRATCHPAD.md`
errors without editing a single historical file. The checker skips *negative*
path references (or `src/CLAUDE.md:5` is reworded) so a "do not create
`.claude/rules/`" sentence stops registering as a broken path. The
`AGENTS.md:220` `.claude/worktrees/` reference is resolved (added to
`.gitignore` + manifest `ignoredPaths`, or removed). Genuinely-stale **map**
facts are corrected: the non-existent `@convex-dev/eslint-plugin`
"lint-enforced" claim (CONVEX.md), the superseded `engine.ts:208-211` "latent
breach" note (the code is now a capped object literal), the "enforcement lands
with 3.9.1.7" future-tense note (AGENTS.md), the eslint "gitignored working
docs" comment (SCRATCHPAD is tracked), and the type-scale lint message that
omits `text-hero`. The `update-watch` skill is added to the AGENTS.md catalog.

**In scope.** The two checker behavior changes (history exemption, negative-
reference handling), the one real worktrees fix, the map-fact corrections, the
missing catalog entry.

**Out of scope.** AF-013 (owned by the v3.9 close-out audit, which overwrites
the baseline — not this version). The already-fixed DESIGN_PRINCIPLES exemplars
(`auth/queries.ts` / `PricingContextValue` no longer appear in the tree — dead
scope inherited from the audit's earlier HEAD). Any doc merge, any Group-A
decision, any skill restructure.

**Dependencies.** None. May ship as pre-adoption housekeeping before 3.9 closes.

**Decisions the session plan must resolve.** Whether the history exemption is a
checker allowlist of RECORD roots or a manifest-declared `recordPaths` set the
checker reads; whether `.claude/worktrees/` becomes legal (gitignore +
`ignoredPaths`) or the two references are removed.

**Baseline & hotspot note.** Neutral (checker code + map-doc facts only).

**Delivery evidence.** `python3 .agent-local/check_doc_refs.py` returns zero
errors; `check_agent_drift.py` green; no file under a RECORD path was edited.
Standard close-out.

---

### 3.10.0.2 — Canonical frame; retire the lifecycle narrative (2 sessions, one branch)

**Objective.** The two resolver-enforced canonical forms exist — the contract
template and the strict data-only baseline — the `docs/workflows/` home exists,
and the two docs the resolver already replaces are gone. The resolver's parser
is modified as needed to fit the model; it is treated as in scope, not a
constraint to design around.

**Done means (session A — contract form + lifecycle retirement).**
`docs/workflows/` exists. The contract *template* (the section skeleton +
marker vocabulary, extracted from `SESSION_CONTRACTS`) is a single canonical
file; the resolver validates a contract's section structure by **deriving the
required sections from that template's own headers** (extending or rewriting its
existing marker/digest parser — parser changes are in scope), so a contract
missing a required section resolves to a repair directive instead of dispatching
the next stage (A5). The `check_release_consistency.py --check` dispatch gate is
wired as an explicit pre-dispatch step in the resolver's directive contract
(A9). Every `DEVELOPMENT_LIFECYCLE.md` section is confirmed to have a live home
in the resolver/checkers, then `DEVELOPMENT_LIFECYCLE.md` and
`SESSION_CONTRACTS.md` are deleted; `policy-manifest.json` `canonicalGuides` and
any checker references are updated in the same slice.

**Done means (session B — strict data-only baseline + changelog form).**
`CODE_HEALTH_BASELINE.md` becomes a **pure metrics record**: every row is a
measured metric with exactly two value columns — **version-start** (captured
once at version adoption, frozen for the whole version) and **current** (the
only column a session updates) — plus a derived delta. There are **no prose
sections, no notes, no delta commentary, and no campaign queue** — scheduled
structural work lives in the version plan / backlog, and findings and rationale
live in the version-tagged audit report (`docs/version-audits/X.Y/`) that
archives with the version. Its schema is a single canonical baseline template,
and the resolver / `check_baseline_claims` is extended to enforce two
invariants: it **rejects any content outside the schema** (an injected note or
extra section fails the gate) and **rejects any session edit to the
version-start column** — the frozen anchor is write-once at version adoption, so
a session cannot move the starting point (the drift that currently defeats
start→current comparison). The reformat removes the current baseline's rolling
"Previous" column, its ~100 lines of prose, and the campaign queue. The
changelog-entry template (from `PR_REVIEW`) is extracted as a canonical form.

**In scope.** The `workflows/` dir; the contract, baseline, and changelog
canonical forms; resolver/parser modification for both the contract
section-derivation and the baseline data-only enforcement; the A9 dispatch gate;
the live-baseline reformat; the two doc retirements; manifest/checker updates.

**Out of scope.** Migrating any workflow's *steps* (0.3–0.5); any map/policy
change (0.6); the numbering *wording* in AGENTS (A4 lands in 0.6 — only the
template's `X.Y.N` sub-version shape is fixed here); the version-audit workflow
that *writes* the baseline (aligned to the strict schema in 0.5).

**Dependencies.** 3.10.0.1 (green base). Interacts with the v3.9 close-out
audit: if that audit writes the baseline in the strict data-only form, this
slice only adds enforcement; otherwise it also reformats the audit's output.

**Decisions the session plan must resolve.** Physical home of the forms
(`docs/workflows/` vs a `docs/templates/` sibling); how the resolver reads the
template headers and the baseline schema (runtime parse vs generated manifest
entry); where and when the immutable version-start column is captured (the
resolver's version-adoption step) and how its immutability is enforced (diff
against the adoption snapshot vs a write-lock); confirmation that no
`DEVELOPMENT_LIFECYCLE` section (runtime-todo invariant §2, health-feedback §8)
lacks a resolver/checker home before deletion.

**Baseline & hotspot note.** Neutral (checker/resolver code + forms; two docs
deleted; the baseline is reformatted, not re-measured).

**Delivery evidence.** A contract with a missing section fails resolution with a
repair directive (test); a baseline with an injected prose note fails
`check_baseline_claims` (test); `DEVELOPMENT_LIFECYCLE.md` and
`SESSION_CONTRACTS.md` no longer exist and nothing references them;
`check_agent_drift.py` green with a bumped revision. Standard close-out.

---

### 3.10.0.3 — Migrate close-out (2 sessions, one branch)

**Objective.** The whole close-out workflow is one canonical procedure the
skills adapt over, with the recorded close-out decisions baked in.

**Done means.** `SESSION_END` + `SELF_REVIEW` + `PR_REVIEW` become one canonical
`docs/workflows/close-out.md` written as actionable steps in the real sequence:
end-of-session gates, the judgment review (SELF_REVIEW's checks as mandatory
numbered steps, not self-declared companion material), and the PR loop. The
hand-rolled Greptile poll and merge recipes are replaced by citing
`poll_pr_gate.py` / `merge_clean_pr.py`; the duplicated coverage-backed Fallow
re-run at PR open is stated once (required iff a commit intervened); the
3.0/3.7-era narratives shrink to one line plus an archive pointer. Recorded
decisions are baked in: the contract `UX gate` marker is the pause authority
with judgment as the off-lifecycle fallback (A2); `merge_clean_pr.py` is named
the gate of record and the Greptile/CI/mergeability checklist stops being
restated in prose (A3); final sessions mark `Execution status: Complete` only
after merge (A10). The `.claude` and `.agents` close-out skills are split into
thin adapters over the canonical procedure — shared steps to
`workflows/close-out.md`, only genuine per-runtime mechanics (native task-lists
vs `codex exec`) in each adapter (the ~111 differing lines today). The three
source docs are deleted; manifest/refs updated; revision bumped.

**In scope.** The three-into-one canonical procedure, the poll/merge script
citations, the A2/A3/A10 wording, the skill adapter split,
`canonicalGuides`/`pairedSkills` + `check_doc_refs` allowlist updates.

**Out of scope.** Planning/design migration (0.4); the pre-pr procedure
internals (0.4) — close-out references the `pre-pr-design-review` skill as it
stands; any map/policy change.

**Dependencies.** 3.10.0.2 (frame exists).

**Decisions the session plan must resolve.** Whether the `version-audit`
procedure or `close-out.md` owns the targeted-baseline-overwrite reconciliation
step (currently duplicated across PRE_PR and VERSION_AUDIT); the split line
between "shared step" and "runtime mechanic" for the trickiest close-out
sections.

**Baseline & hotspot note.** Improves (removes ~6.5k words of duplicated
process; one canonical owner replaces three docs plus two skill copies).

**Delivery evidence.** `docs/workflows/close-out.md` exists; both close-out
skills point to it and carry only runtime mechanics; the three source docs are
gone and their references redirect; `check_agent_drift.py` green. Standard
close-out.

---

### 3.10.0.4 — Migrate planning + design review (2 sessions, one branch)

**Objective.** Planning and design-review each become one canonical procedure
the skills adapt over, and DESIGN_PRINCIPLES decomposes to its destinations.

**Done means.** `SESSION_PLANNING` becomes `docs/workflows/plan-version.md` and
`plan-session.md` (its version/session halves). `PRE_PR_DESIGN_REVIEW` +
`DESIGN_PRINCIPLES §3` (the red-flag smells) become
`docs/workflows/pre-pr-design-review.md`, with each smell written as a concrete
step (scan → if found → split/extract) and its principle named inline as
rationale; smells that Fallow already detects are stated as "the gate catches
this," not re-described (those are CHECK, not STEP). `DESIGN_PRINCIPLES §2/§6`
collapses to a one-paragraph creed at the head of the design procedure — the
only philosophy that survives as prose. Recorded decisions baked in: the
"data/plumbing before UX" ordering heuristic lands in `plan-session.md`,
decoupled from numbering language (A4-b); the Fallow-threshold-override escape
hatch (§4.1) is carried nowhere — split-or-cover is the only response to a
complexity finding (A1). The `plan-version`, `plan-session`, and
`pre-pr-design-review` skills (both trees) are thinned to adapters over the new
procedures. `SESSION_PLANNING.md` and `PRE_PR_DESIGN_REVIEW.md` are deleted;
`DESIGN_PRINCIPLES.md` is reduced to its §5 repo-map remnant (folded into the
AGENTS map in 0.6, then deleted). Manifest/refs updated; revision bumped.

**In scope.** The three canonical procedures, the smell-to-step rewrite, the
creed, A4-b + A1, the skill thinning, the two doc retirements, manifest updates.

**Out of scope.** The §5 repo-map fold and final DESIGN_PRINCIPLES deletion
(0.6); close-out (0.3); version-audit (0.5).

**Dependencies.** 3.10.0.2. May run parallel to 3.10.0.3 (disjoint procedures),
though sequential keeps revision bumps clean.

**Decisions the session plan must resolve.** Which smells are "Fallow already
catches this" (CHECK) vs genuine judgment steps (STEP); whether `plan-version`
and `plan-session` are two procedures or one with two entry points; confirmation
that removing §4.1 reintroduces no replacement pressure valve (A1 was explicit —
none).

**Baseline & hotspot note.** Improves (collapses the 8-copy terminal rule and
the 7-copy checkpoint rule toward single owners; retires the most-polluted
timeless doc).

**Delivery evidence.** The three procedures exist; the plan/design skills point
to them; `rg` shows zero feature-code paths in the design procedure (the
timeless-doc rule); `check_agent_drift.py` green. Standard close-out.

---

### 3.10.0.5 — Migrate version-audit + de-duplicate the self-contained skills

**Objective.** The remaining substantive workflow becomes canonical, and every
skill — including the currently self-contained ones — is a thin adapter over one
procedure.

**Done means.** `VERSION_AUDIT.md` becomes `docs/workflows/version-audit.md`
(its steps; the baseline template it emits was extracted in 0.2). The procedure
writes the baseline in the **strict two-column metrics schema** from 0.2 — it
updates the current column and records findings/rationale in the version-tagged
audit report, never as prose in the baseline; at version close it captures the
*next* version's frozen version-start snapshot (the one sanctioned write of that
column). The `version-audit`, `plan-version-audit`, and
`plan-audit-remediation` skills are thinned to adapters. The three currently-inlined skills are de-duplicated:
`update-watch` (byte-identical across both trees today — pure waste), `ux-check`,
and `triage-issue` have their shared procedure extracted to `docs/workflows/`
with only genuine per-runtime mechanics (capture tooling, native syntax) left in
each adapter. `VERSION_AUDIT.md` is deleted; manifest/refs updated; revision
bumped.

**In scope.** The version-audit procedure, the audit-skill thinning, the
self-contained-trio de-duplication, the doc retirement, manifest updates.

**Out of scope.** Maps/policy (0.6); the anti-dup check (0.7).

**Dependencies.** 3.10.0.2 (baseline template).

**Decisions the session plan must resolve.** Whether `ux-check`/`triage-issue`
retain enough genuine per-runtime difference to justify separate adapter bodies
or collapse to near-empty pointers like `update-watch`; the home of the audit's
re-rank/classify steps that overlap `repo_measures.py` output (the STEP vs CHECK
boundary).

**Baseline & hotspot note.** Improves (removes the last skill-tree duplication).

**Delivery evidence.** Every skill in both trees is a thin adapter over a
`docs/workflows/` procedure; total words across both skill trees drop materially
from today's 10,318; `check_agent_drift.py` green. Standard close-out.

---

### 3.10.0.6 — Maps & policy single-owner

**Objective.** The surviving map/policy layer states each rule once, and the
recorded doc dispositions are executed.

**Done means.** `src/AGENTS.md` becomes the sole owner of source/UI policy; the
render-mode ladder, UI-wrapper list, route-registration, and hex/CSSOM rules are
removed from root `AGENTS.md` and pointed at src. The seat→effort mapping gets
one owner (`CLAUDE.md` as runtime mechanics; root AGENTS points there). The A7
global precedence order (AGENTS → workflow procedures/skills, with the design
creed as the architecture constitution) is stated once in root AGENTS; scattered
tiebreakers (e.g. SELF_REVIEW's former "CLAUDE.md wins") are already gone with
their retired docs. `DESIGN_PRINCIPLES §5` ("what deep means here") folds into
the AGENTS codebase map, and `DESIGN_PRINCIPLES.md` is deleted. `CONTRIBUTING.md`
keeps its human-facing role; only drifted shared rules are aligned — the A6
data-slice hedge (plus a pointer to `.fallowrc.json` as the exception registry),
the A8 removal of the React Flow / dnd-kit list (defer to src/AGENTS.md), and the
understated CI-gate list (B13). `PRIMITIVE_LEDGER.md` is archived (its
per-primitive rails already live in `eslint.config.mjs` / `.fallowrc.json`;
confirm no going-forward doc needs its ownership rows first). `DATA_SOURCES.md`
and `AGENT_TOOLING.md` are left unchanged (Ryan-deferred); `docs/security/*`
untouched.

**In scope.** Root/src AGENTS dedup, the seat→effort single-owner move, the A7
precedence paragraph, the §5 fold + DESIGN_PRINCIPLES deletion, the three
CONTRIBUTING alignments, the ledger archive, manifest updates.

**Out of scope.** DATA_SOURCES / AGENT_TOOLING (deferred); any CONTRIBUTING
slimming beyond drifted rules; `docs/security`.

**Dependencies.** 3.10.0.2–0.5 (the precedence order references the final set;
DESIGN_PRINCIPLES's steps must have migrated first).

**Decisions the session plan must resolve.** The exact precedence wording and
its home paragraph in root AGENTS; confirmation that PRIMITIVE_LEDGER's
per-primitive ownership rows are unneeded going forward before archiving.

**Baseline & hotspot note.** Improves (removes the last large prose
duplications; two fewer standing docs).

**Delivery evidence.** Root AGENTS no longer restates src rules;
`DESIGN_PRINCIPLES.md` and `PRIMITIVE_LEDGER.md` are out of the standing set and
in the archive with references redirected; `check_agent_drift.py` green.
Standard close-out.

---

### 3.10.0.7 — Enforcement follow-through & anti-duplication check

**Objective.** The drift/parity machinery matches the consolidated set, and a
new check makes single-owner mechanical so the sprawl cannot silently regrow.

**Done means.** `policy-manifest.json` `canonicalGuides` and `pairedSkills` are
rewritten against the `docs/workflows/` procedures, the thin adapters, and the
map set; `bump_policy_revision.py` sets a fresh revision across all markers; the
`check_doc_refs.py` historical/future allowlist is pruned to what the
consolidated tree still needs. A new drift-gate check fails when the same
normative sentence (a hash over normalized text) appears in more than one
canonical file — spanning the `workflows/` procedures, the maps, and the two
skill adapters. All `.agent-local/test_*.py` fixtures are updated to match.

**In scope.** Manifest rewrite, revision bump, allowlist prune, the
anti-duplication check plus its tests, fixture updates.

**Out of scope.** Any further content change (the corpus is settled by 0.6);
architecture-phase work.

**Dependencies.** 3.10.0.3–0.6 (the final set must exist to police it).

**Decisions the session plan must resolve.** The normalization rule for the
duplicate-sentence hash (whitespace/case/punctuation folding) and its
false-positive tolerance (shared rule *names* and adapter boilerplate must not
trip it); which files are in-scope for the uniqueness check vs deliberately
shared boilerplate.

**Baseline & hotspot note.** Neutral-to-Improves (checker code only; no
production surface).

**Delivery evidence.** A seeded duplicate normative sentence across two
canonical files fails `check_agent_drift.py`; the full checker suite is green on
the consolidated tree. **Phase 0 exit:** an agent's close-out reading path is one
dispatched skill → one canonical procedure in `docs/workflows/`, and no rule has
two owners. Standard close-out.

## Phase 1 — Close the structural loopholes (3.10.1.x)

> **Reference note (post-Phase-0).** The guide updates in Phases 1–3 write
> into the *consolidated* set on its terms: import-direction and system facts
> live in the **map** docs (CONTRIBUTING + src/AGENTS.md), lifecycle semantics
> live in the **resolver**, workflow steps live in `docs/workflows/`, and any
> new rule obeys the A7 precedence order and the single-owner anti-duplication
> check from 3.10.0.7. Where a phase below says "guides state the rule," it
> means the one owning file (a map, a procedure, or the resolver), never a copy
> in each.
>
**Arc thesis.** Fallow is the sole mechanical boundary owner, but today it
owns only two-thirds of the source tree, permits one architectural cycle by
configuration, and cannot see the browser/server boundary at all. This arc
finishes the map. No application behavior changes anywhere in the arc.

---

### 3.10.1.1 — Full boundary coverage

**Objective.** Every production source file classifies into a named
architectural zone with declared allowed dependencies — deny-by-default,
no unzoned areas.

**Done means.** `.fallowrc.json` zones cover `src/app`, `src/db`,
`src/config`, `src/purge`, `src/search`, `src/page-settings`,
`src/esi-datasets`, and `convex/` alongside the existing six; each zone has
an explicit allow-list matching the CONTRIBUTING/AGENTS import-direction
prose; a short architecture map (one table: area / owns / may depend on /
must not own) lands in `docs/`; `fallow list --boundaries` shows zero
unclassified production files; any violation surfaced by the new zones is
fixed in-slice where Floss-sized, ledgered otherwise.

**In scope.** Fallow zone/rule additions, the ownership table, small
conformance fixes, CONTRIBUTING/agent-guide sentence updates.

**Out of scope.** Moving or renaming directories; changing any import that
is not a violation; TypeScript project references (explicit non-goal).

**Dependencies.** None within the architecture arcs; sequenced after Phase 0
so the ownership table and guide sentences land in the consolidated docs.

**Decisions the session plan must resolve.** Zone granularity for `src/app`
(one zone vs. api/pages split); whether `convex/` boundary rules live in
Fallow or a dedicated import test given its separate bundling
(memory: [[convex-bundles-lib-esi-no-next-imports]]); classification of
`src/instrumentation*` and `src/proxy.ts`.

**Baseline & hotspot note.** Neutral (config + docs; conformance fixes are
deletions or import moves).

**Delivery evidence.** `fallow list --boundaries` full-coverage output in PR
notes; a seeded cross-zone import fails `pnpm fallow`; standard close-out.

---

### 3.10.1.2 — Shared→composition split; cycles become blocking

**Objective.** Leaf shared code and cross-feature composition become two
one-way zones, removing the sanctioned `shared`↔`features` cycle; with the
graph clean, dependency cycles become CI failures rather than warnings.

**Done means.** The current `shared` zone splits: files importing
`@/features`/`@/data` (20 of 34 today — app shell, home dashboard, global
search, telemetry reporter) classify as `composition`, importable only by
`app`; remaining leaf files keep a `shared` zone restricted to `ui`/`lib`;
features may import leaf shared, never composition; no reverse edge exists;
`circular-dependencies` and `re-export-cycle` flip from `warn` to `error`
after a confirmed-clean run; guides state the two-zone rule.

**In scope.** Zone reclassification, any file moves the session plan judges
cheaper than pattern-listing, the two rule flips, guide updates.

**Out of scope.** Redesigning any shared component; new directory ceremony
beyond what classification requires.

**Dependencies.** 3.10.1.1.

**Decisions the session plan must resolve.** Physical move
(`src/components` → split dirs) vs. pattern-based zone membership;
disposition of any file that is genuinely both (split it or classify by
dominant role).

**Baseline & hotspot note.** Improves (removes a structural loophole;
possible small file-count churn, no LOC growth).

**Delivery evidence.** A seeded feature→composition import fails
`pnpm fallow`; cycle rules at `error` with a green run; standard close-out.

---

### 3.10.1.3 — `server-only` rails on the browser/server boundary

**Objective.** Server-only modules — database, secret-bearing config,
privileged auth, vendor adapters — mechanically cannot enter the client
graph.

**Done means.** The `server-only` package is a dependency; entry points of
`src/db`, `src/lib/env.ts`, server auth configuration, the ESI dispatch
gate, and vendor adapter roots import it; an ESLint restricted-import rule
blocks client files from those roots; a test enumerates the approved
server-only roots and fails when a new server root lacks the marker or a
client file reaches one; the existing typed-env rail is unchanged.

**In scope.** Marker imports, the lint rule, the enumeration test, guide
updates.

**Out of scope.** Changing what is currently server vs. client; converting
components between runtimes; Convex isolate modules (they have no client
graph — record the exemption).

**Dependencies.** 3.10.1.1 (zone map names the server roots).

**Decisions the session plan must resolve.** The authoritative root list;
whether the enumeration test discovers roots from the zone map or a
declared registry (prefer discovery, matching the 3.9 endpoint-gate
pattern).

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** A seeded client-component import of `src/db` fails
lint/build/test; standard close-out.

## Phase 2 — Production flow contracts (3.10.2.x)

**Arc thesis.** Every mutating request already flows through good gates,
but the gates improvise their outputs: plain-text errors, an observe-only
origin check, doc-comment rate-limit ownership, and per-integration
resilience habits. This arc gives the request path one error vocabulary,
one declared order, and written ownership for data and vendors.

---

### 3.10.2.1 — Typed error contract & RFC 9457 problem mapper

**Objective.** Application failures become typed values with one
delivery-boundary translation to a stable, safe HTTP problem shape.

**Done means.** A typed failure set exists (validation, unauthenticated,
forbidden, not-found, conflict, rate-limited, dependency-unavailable,
unexpected) with one mapper producing an RFC 9457-compatible body (`type`,
`title`, `status`, stable application `code`, correlation id); route
guards and the mutation pipeline emit mapped failures instead of plain-text
`Response` objects; representative 400/401/403/404/409/429/5xx paths are
tested for shape and non-leakage; deep application/data code returns typed
failures, never `Response`. Migration is incremental — routes not touched
by guards/pipeline convert opportunistically, not en masse.

**In scope.** The failure types, the mapper, guard/pipeline migration,
`apiFetch` awareness of the problem shape, tests.

**Out of scope.** Mass-rewriting route handlers that already behave; client
UX redesign of error display; changing any status code semantics without a
test documenting the old and new contract.

**Dependencies.** None (parallel-safe with Phase 1; after Phase 0).

**Decisions the session plan must resolve.** Failure-set home
(`src/lib` leaf vs. contract-adjacent); correlation-id source (existing
telemetry id vs. new); how `same-origin-coverage.test.ts` assertions track
the new bodies.

**Baseline & hotspot note.** Neutral-to-Improves (deletes ad-hoc error
construction).

**Delivery evidence.** Contract tests green across the representative
status set; a seeded raw-`Response` return from a guard fails a gate;
standard close-out.

---

### 3.10.2.2 — Mutation pipeline: declared order & same-origin enforcement

**Objective.** The mutation path's gate order becomes a written, tested
contract, and the same-origin check graduates from observation to
enforcement — completing backlog LGI-03.

**Done means.** The intended order (cheap rejection → rate limit → identity
→ same-origin → parse → object authorization → transaction → telemetry) and
its threat-model rationale are documented where `runMutationRoute` lives;
telemetry from the observe-only period is reviewed for legitimate
cross-origin callers; explicit `Origin`/`Referer` mismatches then return
403 through the 3.10.2.1 mapper, with negative tests; cron/service routes
stay on separate caller auth; the same-origin coverage test gains
discovery — a newly added mutating route with no declared classification
fails it.

**In scope.** LGI-03 scope as written in backlog, the order doc, the
discovery extension, tests.

**Out of scope.** LGI-02 step-up auth and the other security-tranche items
(they remain backlog with their own triggers); Fetch-Metadata policy if
telemetry review argues for deferral — record the decision either way.

**Dependencies.** 3.10.2.1 (403 uses the problem mapper).

**Decisions the session plan must resolve.** Enforcement rollout (flip
directly vs. short reject-log-then-enforce window); how missing-provenance
requests (no Origin, no Referer) are classified.

**Baseline & hotspot note.** Neutral. Touches `auth-surface`-adjacent files;
AF-008 Watch trigger must be rechecked in the same change.

**Delivery evidence.** Cross-origin mutation returns 403 in integration
tests; a seeded unclassified mutating route fails the coverage test;
standard close-out.

---

### 3.10.2.3 — Data ownership, transaction & RLS registry

**Objective.** Every table has a named owner, transaction boundary, and a
recorded authorization/RLS decision — one registry, extending the existing
dataset-declaration rail rather than a new document.

**Done means.** The 56-table dataset-declaration census gains (or is joined
by) per-table: owning slice, permitted cross-owner read contracts, write
invariants the database enforces, transaction-boundary statement, and a
per-data-class RLS decision (application-authorization-only vs. app+RLS)
recorded against the real role model from the 3.9.4.1 privilege runbook;
concurrency-sensitive invariants that PostgreSQL can express become
constraints with `*.db.test.ts` coverage; undeclared cross-owner writes
fail the census test.

**In scope.** Registry extension, the RLS decision document, constraints
for identified invariants, census-test extension.

**Out of scope.** Enabling RLS anywhere the decision does not justify it;
schema redesign; touching Convex data placement rules (owned by
`docs/CONVEX.md`).

**Dependencies.** None (after Phase 0).

**Decisions the session plan must resolve.** Registry home (extend
`dataset-declarations.test.ts` inputs vs. sibling registry the test also
reads); which invariants are genuinely race-exposed today.

**Baseline & hotspot note.** Neutral-to-Improves (may surface and delete
dead cross-owner edges).

**Delivery evidence.** Census test red on a seeded undeclared cross-owner
write; RLS decision recorded per data class; standard close-out.

---

### 3.10.2.4 — Vendor resilience registry

**Objective.** No production external call has an implicit timeout or
undocumented retry behavior; each integration's resilience policy is
declared in one place.

**Done means.** A registry records, per integration (ESI, EVE SSO/Better
Auth, Convex, Upstash, Neon, Vercel APIs, GitHub API in tooling): wrapper
entry point, timeout, retryable error classes, backoff/jitter policy,
rate-limit behavior, idempotency stance, degradation behavior, telemetry
fields; every external call site routes through its declared wrapper with
an explicit timeout; adapters translate SDK types/errors to owned types at
the boundary; a gate (test or lint) fails on a direct vendor call outside
its registered adapter — extending the existing ESI-gate and vendor-import
lint rails to full coverage.

**In scope.** The registry, timeout/retry gaps it exposes, the gate, guide
updates.

**Out of scope.** Circuit breakers or new resilience infrastructure without
a demonstrated need; changing vendor choice; rewriting the ESI gate (its
budget model is the pattern, not the patient).

**Dependencies.** None (after Phase 0).

**Decisions the session plan must resolve.** Registry form (typed module
consumed by tests vs. doc + census test); which existing calls lack real
timeouts (sweep first, fix in-slice where Floss-sized).

**Baseline & hotspot note.** Neutral. `src/lib/esi/dispatch.ts` is a listed
large file — extend, don't restructure.

**Delivery evidence.** Gate red on a seeded out-of-adapter vendor call;
registry complete for all listed integrations; standard close-out.

## Phase 3 — Operability (3.10.3.x)

**Arc thesis.** The request path becomes observable per capability: a
failed critical action traces to its use case and dependency without log
archaeology, and a small SLI set says whether users are fine.

---

### 3.10.3.1 — Capability telemetry names & SLIs

**Objective.** Traces/logs carry stable feature/operation names and outcome
codes, and a handful of user-centered indicators get owners and response
actions.

**Done means.** Important requests and jobs record: feature + operation
name, outcome category with the 3.10.2.1 stable error code, duration,
dependency durations, retry/rate-limit outcome, correlation id, and app
version; an SLI set is defined (page/tool success rate, mutation success
rate excluding validation failures, p95 latency on critical reads/writes,
ESI success/throttle rate, job backlog/terminal failures), each with an
owner and response action; no high-cardinality identifiers enter metric
labels; existing telemetry tables/queries are extended, not paralleled
(AF-006 Watch trigger on `src/data/telemetry/queries.ts` export breadth is
rechecked in the same change).

**In scope.** Telemetry field additions, the SLI definitions, minimal
dashboard/query support in the existing admin surface.

**Out of scope.** New observability vendors or OpenTelemetry migration
(record as a future decision); alerting infrastructure beyond what exists.

**Dependencies.** 3.10.2.1 (stable codes).

**Decisions the session plan must resolve.** Where SLI definitions live;
which existing admin telemetry panels absorb the new readouts.

**Baseline & hotspot note.** Temporary pressure risk on telemetry queries
(AF-006/AF-007 Watch surfaces) — the session plan must state the expected
export-count effect and stay below triggers.

**Delivery evidence.** A forced failure on a critical mutation is traceable
to feature/operation/dependency in the recorded telemetry; SLI queries
return live values; standard close-out.

---

### 3.10.3.2 — Idempotency inventory (judged)

**Objective.** Every retryable or redeliverable mutation/job is inventoried
and judged: inherently idempotent, key-protected, or accepted-risk — with
code changes only where duplicate/loss risk is real.

**Done means.** An inventory covers cron jobs, webhook-like entries,
scheduled ingestion, and user mutations that platforms can redeliver; each
entry carries a verdict and evidence; workflows judged at-risk gain an
idempotency key persisted with a uniqueness constraint and a replay test
proving no duplicated business effect; a verdict of "no at-risk workflow"
is an acceptable, recorded outcome. Coordination note: the LGI-06
revocation outbox stays in the security tranche — this slice may cite it,
not build it.

**In scope.** The inventory, verdicts, keys/constraints/tests for at-risk
entries only.

**Out of scope.** A general outbox framework, message bus, or event
sourcing; LGI-06 itself.

**Dependencies.** 3.10.2.4 (retry policy declares what can redeliver).

**Decisions the session plan must resolve.** Inventory home (extend the
cron/dataset rails vs. standalone doc); the at-risk shortlist.

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Replay test green on each protected workflow, or the
recorded no-at-risk verdict; standard close-out.

---

### 3.10.3.3 — Generated architecture map & devlog flowchart

**Objective.** The architecture diagram is derived, never drawn: one
generator emits the zone/dependency map from the live Fallow config, and a
stylized version of that map ships on the public devlog — deliberately the
final slice, so it renders the finished 3.10 graph before the version-close
audit measures it.

**Done means.** A stdlib-only (or existing-toolchain) generator reads
`.fallowrc.json` zones and rules and emits a Mermaid source of the
zone-level dependency graph (zones as nodes, allowed edges as arrows,
first-match/exception edges visibly distinct); the output is deterministic
and a drift test fails when committed diagram source no longer matches the
config; a stylized rendering of that graph appears in the appropriate
devlog section (the rails arc is the natural home) in the established
terminal/EVE visual identity using theme tokens — no raw hex, no ad-hoc
palette; the devlog page renders it within existing rendering rules (raw
HTML sinks stay lint-restricted); `ux-check` runs and Ryan's local browser
review approves the visual before the PR opens.

**In scope.** The generator + drift test, Mermaid source as the tracked
intermediate, the devlog visualization component/asset, one devlog prose
passage introducing the map, `ux-check` coverage of the changed route.

**Out of scope.** File-level or symbol-level graphs (zone-level only;
Graphify already owns fine-grained structure); a live/interactive graph
explorer (backlog if ever); restyling any other devlog section; new heavy
client dependencies — a client-side Mermaid runtime is presumed rejected
in favor of build-time SVG or a small owned component unless the session
plan proves otherwise.

**Dependencies.** 3.10.1.1 and 3.10.1.2 (the map must show the completed,
one-directional zone graph); sequenced as the roadmap's final slice.

**Decisions the session plan must resolve.** Rendering path (build-time
Mermaid→SVG with tokenized styling vs. a small owned visx/SVG component
reading the generator's JSON — compare against the raw-HTML lint rules and
bundle cost); where the generated artifacts live (`content/devlog` asset
vs. component-owned); whether the drift test also publishes the Mermaid
source into the devlog for copy-paste.

**Baseline & hotspot note.** Neutral (one small script, one component, one
test). Two sessions on one branch: generator/drift plumbing first, then the
dependent devlog UX.

**Delivery evidence.** Drift test red on a seeded zone-rule edit without a
regenerated diagram; `ux-check` captures plus Ryan's approved browser
review; standard close-out.

## Explicit non-goals

Carried from the Sound Architecture report §16, the doc-consolidation plan,
and repo precedent:

- No microservices, workspace packages, or TypeScript project references.
- No universal contract/policy/service/port folder ceremony — selective
  internal anatomy only where a future version's evidence justifies it.
- No full CQRS, event sourcing, or message bus.
- No rewrite of Verified or protected surfaces (`PricingProvider` AF-005,
  the mutation pipeline AF-001, `tree-resolver.ts`, `convex/engine.ts`,
  the ESI dispatch gate).
- No RLS enablement outside the documented per-data-class decision.
- No coverage-percentage targets; tests follow the changed behavior.
- Security-tranche backlog items other than LGI-03 (LGI-01/02/04/05/06/07/
  09/10/11/12) keep their own recorded triggers and are not silently
  absorbed.
- **Phase 0 non-goals:** no new parallel doc/checker machinery beyond the one
  anti-duplication drift check; no change to `DATA_SOURCES.md` or
  `AGENT_TOOLING.md` (Ryan-deferred); no CONTRIBUTING slimming beyond aligning
  drifted rules; no reopening a resolved Group A decision without a recorded
  reason; **no rewriting of frozen history** — the reference checker is taught to
  exempt it instead; **no workflow steps duplicated into skill bodies** — steps
  live once in `docs/workflows/`, both runtime skills adapt over them; **no
  prose notes or free-text in `CODE_HEALTH_BASELINE`** — it is a data-only report
  the resolver enforces, and only its data points are updated.

## Sequencing and dependencies

**Phase 0 strictly precedes Phases 1–3.** The architecture arcs write new
rules into the homes Phase 0 establishes, so consolidating first avoids
double-editing and guarantees the new rules land in single-owner files under
the 3.10.0.7 anti-duplication check. Within Phase 0: 3.10.0.1 (green the gate)
→ 3.10.0.2 (build the canonical frame, retire the lifecycle narrative) are
ordered. 3.10.0.3 (close-out) and 3.10.0.4 (planning/design) may run in either
order or parallel — disjoint procedures — both after 3.10.0.2; each bakes its
own recorded Group-A decisions in as it migrates. 3.10.0.5 (version-audit +
skill de-duplication) follows 3.10.0.2. 3.10.0.6 (maps/policy) follows
3.10.0.3–0.5, since its precedence order references the final set and it
completes DESIGN_PRINCIPLES's retirement. 3.10.0.7 is last — it rewrites the
manifest for the finished set and adds the check that polices it.

Within the architecture movement: Phase 1 is strictly ordered (1.1 → 1.2 →
1.3). Phase 2 may interleave with Phase 1 except 3.10.2.2, which follows
3.10.2.1. Phase 3 follows 3.10.2.1 (codes) and 3.10.2.4 (retry declarations).
3.10.3.3 is the deliberate final slice — it renders the completed zone graph
and pauses for Ryan's UX review — after which every row is terminal and the
resolver moves to `plan-version-audit`. Nothing here blocks on external
vendors or new dependencies beyond the `server-only` package.

**Bootstrapping note.** Phase 0 edits the very lifecycle docs, skills, and
`policy-manifest.json` that the resolver and drift gate validate against. Each
Phase 0 sub-version therefore updates the manifest/checkers in the same slice
that moves the docs, so `check_agent_drift.py`, `check_doc_refs.py`, and the
resolver are green at every step — the same "each PR independently green"
discipline the rest of the lifecycle already requires. This is why the
consolidation is a version phase shipped through the normal lifecycle, not an
out-of-band rewrite.
