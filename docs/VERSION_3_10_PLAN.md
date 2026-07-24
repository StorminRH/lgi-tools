# VERSION 3.10 PLAN — Hull Integrity + SKIN

> **This is a combined plan.** It brings together three movements: the
> documentation/lifecycle consolidation (findings, contradiction register, and
> the recorded Group A decisions and doc dispositions are in
> `DOC_CONSOLIDATION_AUDIT_AND_PLAN.md`) and the architecture-hardening roadmap
> sourced from the Sound Architecture report (2026-07-19), followed by the
> presentation-system completion roadmap sourced from the UploadThing UI
> comparison audit (2026-07-19). The consolidation
> is sequenced **first**, as Phase 0, because the architecture arcs write
> their new rules into the guidance Phase 0 restructures — so each rule has a
> single owner before anything new is added. The presentation work is last
> because it relies on those enforced architecture and ownership boundaries,
> then closes the remaining primitive-adoption and visual-consistency gaps.
>
> Pairs with the canonical contract template at
> `docs/workflows/schema/session-contract.md` and the contracts `plan-version`
> will derive from it.
> The roadmap below is the source of truth for goals, outcomes, invariants,
> genuine dependencies, and approved sequence. Proposed sub-version, session,
> branch, and PR boundaries are provisional until `plan-version` adversarially
> reviews the delivery topology for frontier-agent execution. Each approved
> session contract is then the source of truth for one execution bundle's
> requirements.
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
> **Contract-extraction convention:** roadmap spec blocks state what must be
> true, never implementation steps. `plan-version` preserves their goals and
> dependencies, attempts to combine every adjacent or tightly coupled slice,
> obtains approval for the minimum safe execution bundles, updates the roadmap
> topology, and only then creates contracts. A contract may cover multiple
> roadmap sections; headings and outcome groups are not contract boundaries.

## What this is

3.10 is a **hardening pass with no new flagship tools**, in three movements
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
- **Phase 4 completes the presentation system**, sourced from the SKIN roadmap
  and the UploadThing comparison audit. It first measures every live bypass of
  an existing UI primitive, then migrates and rails those bypasses, refines the
  primitives so improvements propagate site-wide, makes mobile a deliberate
  mode, resolves operator-led polish, and ends with a clean adoption re-audit.
  The entire site is in scope, including admin; no page is treated as a special
  focus area and none is left behind.

Everything in all three movements extends rails that already exist (Fallow zones,
the dataset-declaration census, the API-contract gate, the same-origin
coverage inventory, the drift/parity manifest) rather than adding parallel
machinery — P2's one-owner rule applied to the architecture and to the docs
alike. Phase 4 adds UI rails through the existing ESLint, Fallow, test, token,
and source-guide owners rather than reviving the Phase-0-retired primitive
ledger or design-principles guide.

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
| 3.10.0.1 | Green the gate honestly: exempt history, fix real stale map-facts (decision-free) | 1 | SHIPPED |
| 3.10.0.2 | Canonical frame: `docs/workflows/`, contract + strict data-only baseline forms, resolver-enforced (parser in scope); retire the lifecycle narrative | 2 (one branch) | SHIPPED |
| 3.10.0.3 | Migrate close-out (SESSION_END + SELF_REVIEW + PR_REVIEW → one procedure + thin adapters); PR #282, squash `93d08d1` | 2 (one branch) | SHIPPED |
| 3.10.0.4 | Complete the agent workflow and lifecycle consolidation | 1 | SHIPPED |
| **Phase 1 — Close the structural loopholes** | | | |
| 3.10.1.1 | Full boundary coverage: every source area a named zone (§3.10.1.1) | 1 | SHIPPED |
| 3.10.1.2 | Day-one responsibility-layer restructure: composition band, platform/transport layers, zero-exception boundaries, blocking cycles, `server-only` rails (§3.10.1.2 + §3.10.1.3) | 1 | SHIPPED |
| **Phase 2 — Production flow contracts** | | | |
| 3.10.2.1 | Typed error contract & RFC 9457 problem mapper (§3.10.2.1) | 1 | PLANNED |
| 3.10.2.2 | Mutation pipeline: declared order & same-origin enforcement (LGI-03) (§3.10.2.2) | 1 | PLANNED |
| 3.10.2.3 | Data ownership, transaction & RLS registry (§3.10.2.3) | 1 | PLANNED |
| 3.10.2.4 | Vendor resilience registry (timeouts, retries, idempotency) (§3.10.2.4) | 1 | PLANNED |
| **Phase 3 — Operability** | | | |
| 3.10.3.1 | Capability telemetry, SLIs & idempotency inventory (§3.10.3.1 + §3.10.3.2) | 1 | PLANNED |
| 3.10.3.3 | Generated architecture map & devlog flowchart, UX gate: Yes (§3.10.3.3) | 1 | PLANNED |
| **Phase 4 — Presentation-system completion** | Outcome groups below are inputs to adversarial decomposition, not fixed delivery boundaries | Set by `plan-version` after its live adoption survey | PLANNED |

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

**Ordering rationale.** 3.10.0.1 makes the gate honest
without restructuring. 3.10.0.2 builds the canonical frame the migrations move
content into and retires the lifecycle narrative the resolver already replaces.
3.10.0.3 establishes the directly executable close-out model. The single
3.10.0.4 execution bundle then migrates every remaining workflow, consolidates
map and policy ownership, and rebuilds enforcement in ordered internal phases.
The phases remain together because they modify the same owners and each phase
supplies the settled inputs the next one validates.

**Where the recorded Group-A decisions land** (each applied once, at the
destination that owns it): A4/A5/A9 → 3.10.0.2 (contract template + resolver);
A2/A3/A10 → 3.10.0.3 (close-out); A1/A4-b/A6/A7/A8 → 3.10.0.4
(planning, design, maps, and policy).

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
skills adapt over, with the recorded close-out decisions baked in and one
coverage-backed definition-of-done pass on the finalized head.

**Done means.** `SESSION_END` + `SELF_REVIEW` + `PR_REVIEW` become one canonical
`docs/workflows/close-out.md` written as actionable steps in the real sequence:
end-of-session gates, the judgment review (SELF_REVIEW's checks as mandatory
numbered steps, not self-declared companion material), and the PR loop. The
hand-rolled Greptile poll and merge recipes are replaced by citing
`poll_pr_gate.py` / `merge_clean_pr.py`; `pnpm verify` becomes the sole
coverage-backed definition-of-done command; the canonical procedure owns its
one `origin/main`-pinned invocation; unchanged-head evidence is reused at PR
open; later changes rerun only the gates they invalidate; the
3.0/3.7-era narratives shrink to one line plus an archive pointer. Recorded
decisions are baked in: the contract `UX gate` marker is the pause authority
with judgment as the off-lifecycle fallback (A2); `merge_clean_pr.py` is named
the gate of record and the Greptile/CI/mergeability checklist stops being
restated in prose (A3); final planned PRs carry `Execution status: Complete`
and truthful release state before they open (A10). The `.claude` and `.agents`
close-out skills are split into
thin adapters over the canonical procedure — shared steps to
`workflows/close-out.md`, only genuine per-runtime task-list and
background-launch syntax in each adapter (the ~111 differing lines today). The
three source docs are deleted; manifest/refs updated; affected skill-ledger
entries reviewed and restamped.

**In scope.** Session A authors the canonical procedure, upgrades `pnpm verify`
to its coverage-backed sequence, aligns every live ordinary-close-out owner and
both adapters without thinning them, reconciles the lifecycle artifacts, and
delivers the operator-authored Codegraph-hook improvement with explicit proof.
Session B performs the adapter split and source retirement, then updates
`canonicalGuides`/`pairedSkills` + the `check_doc_refs` allowlist and ships the
sub-version.

**Out of scope.** Planning/design migration (0.4); the pre-pr procedure
questions and broader internals (0.4) — session A changes only its invocation
order; any map-policy consolidation, checker redesign, CI-command
restructuring, specialized Convex/version-audit verification change, or
application behavior change.

**Dependencies.** 3.10.0.2 (frame exists).

**Decisions the session plan must resolve.** Whether the `version-audit`
procedure or `close-out.md` owns the targeted-baseline-overwrite reconciliation
step (currently duplicated across PRE_PR and VERSION_AUDIT); the split line
between "shared step" and "runtime mechanic" for the trickiest close-out
sections.

**Baseline & hotspot note.** Improves (removes ~6.5k words of duplicated
process; one canonical owner replaces three docs plus two skill copies).

**Delivery evidence.** Session A proves the exact `verify` sequence, one pinned
canonical invocation, unchanged CI commands, the Codegraph hook behavior, all
11 paired skills reconciled, and no `src/`/`convex/` change. Session B proves
both close-out skills are thin adapters, the three source docs are gone and
their references redirect, and `check_agent_drift.py` is green. Standard
close-out.

---

### 3.10.0.4 — Complete the agent workflow and lifecycle consolidation

**Execution topology.** One frontier autonomous coding agent, one context-rich
session (`3.10.0.4.1`), one lifecycle branch, and one PR. The former
3.10.0.4–3.10.0.7 breakdown is superseded; planning, canonical-procedure
migration, map/policy consolidation, enforcement, and document review are
internal phases of this bundle.

**Objective.** Finish Phase Zero by giving every dispatched workflow one
agent-executable canonical owner, reducing both runtime skill trees to thin
adapters, making delivery-topology minimization part of `plan-version`, and
mechanically preventing duplicated normative ownership.

**Done means.**

- The live planning, start-session, design-review, audit, update-watch,
  resolve-update-watch, UX-check, and issue-triage procedures live once under
  `docs/workflows/`; close-out retains its existing canonical procedure.
- Every Codex and Claude skill points to exactly one canonical procedure and
  retains only invocation authority, runtime mechanics, and runtime-specific
  return behavior.
- `plan-version` preserves roadmap outcomes but treats proposed sub-version,
  session, branch, and PR boundaries as provisional. It produces the fewest
  safe frontier-agent execution bundles, obtains topology approval before
  changing the roadmap, and creates one contract per approved bundle only after
  the roadmap topology is reconciled.
- Session contracts carry an execution profile, one-session/branch/PR delivery
  unit, roadmap coverage, ordered internal phases, and hard split triggers;
  `plan-session` cannot re-split an approved bundle without a recorded trigger
  or material scope conflict.
- Root and source agent maps, human contributor guidance, procedures, schemas,
  reference documents, and state documents have one declared role. Source/UI
  rules live only in `src/AGENTS.md`; the design creed and executable judgment
  checks live in pre-PR design review; the code-health baseline remains
  data-only.
- `DESIGN_PRINCIPLES.md` and `PRIMITIVE_LEDGER.md` leave the live guide set
  only after their surviving content and enforcement have identified owners and
  byte-identical archive copies exist.
- The policy manifest names the final canonical set and one procedure per skill,
  the reconciliation ledger is regenerated from real dependencies, and the
  drift gate rejects duplicated normalized normative sentences across declared
  live workflows, maps, and adapters.
- The full document corpus passes its mandatory operator wording review before
  any PR opens. The final PR contains truthful completed 3.10.0.4 state and is
  left review-ready and unmerged.

**In scope.** Live workflow/map documentation, both skill trees, session
contract/plan schemas, lifecycle and drift enforcement, policy fixtures and
manifest, the consolidated 3.10.0.4 lifecycle records, the approved Phase 4/SKIN
roadmap rider, external retired-guide archive copies, and final planned release
records.

**Out of scope.** Application behavior; production `src/` code other than agent
guidance; Convex, UI, database, dependency, or lockfile changes; Phase 1
architecture implementation; `DATA_SOURCES.md`, `AGENT_TOOLING.md`, and
security-policy changes; the deferred `fast-uri` advisory; merge, deployment,
and production proof.

**Dependencies.** PRs #284, #285, and #286 are merged. Preserve their update
watch, ordinary/planned delivery, pending-changelog, deterministic-branch, and
truthful pre-PR planned-state semantics while expressing them through the
canonical owner architecture established by PR #282.

**Decisions the session plan must resolve.** The exact contract execution-frame
validation; the canonical procedure mapping for all paired skills; the narrow
normalization and explicit-exception model for duplicate normative prose; the
final root/source map split; and the focused verification invalidated by each
operator wording change.

**Baseline & hotspot note.** Improves workflow ownership and removes duplicated
agent instructions without changing measured production surfaces. The live
code-health baseline remains a strict state record and requires no metric
refresh.

**Delivery evidence.** Current-versus-proposed topology (four sub-versions,
five sessions, four PRs → one/one/one); schema/resolver and drift fixtures;
seeded duplicate failure plus legitimate adapter pass; retired-reference sweep;
agent drift, document-reference, baseline/watch, pending-changelog, release,
tooling, and Vercel-adapter checks; mandatory pushed document-review checkpoint;
one final origin-main-pinned `pnpm verify`; current-head CI and Greptile 5/5
with zero unresolved findings. No local production build or UX review. The PR
remains unmerged.

## Phase 1 — Close the structural loopholes (3.10.1.x)

> **Reference note (post-Phase-0).** The guide updates in Phases 1–3 write
> into the *consolidated* set on its terms: import-direction and system facts
> live in the **map** docs (CONTRIBUTING + src/AGENTS.md), lifecycle semantics
> live in the **resolver**, workflow steps live in `docs/workflows/`, and any
> new rule obeys the A7 precedence order and the single-owner anti-duplication
> check from 3.10.0.4. Where a phase below says "guides state the rule," it
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

### 3.10.1.2 — Day-one responsibility-layer restructure; cycles become blocking

**Objective.** The source tree takes the shape it would have had with
boundaries from day one — composition above the slices, domain features,
platform capabilities and transport below them, foundations and
vendors-as-rule at the bottom — with zero carried-forward cross-layer
exceptions; with the relocated graph clean, dependency cycles become CI
failures rather than warnings.

**Done means.** Cross-slice composition lives only in a composition band
above the domain slices: `src/composition` owns the server side (the three
registry aggregators, the purge orchestrator, the database sync workers with
their shared port and dispatcher, the account-lifecycle orchestration, and
the table-growth registry) and `src/components/composition` owns the
app-shell UI (shell and dashboard modules, the PageMenu chain, and auth's
account components grouped under `account/`), both importable only from the
app band. `src/platform/<name>` owns structural capabilities as
peer-isolated child zones: `auth` (hoisted from `src/features/auth` minus
its UI, retiring the separate auth-surface zone), `esi` (from
`src/lib/esi`), and the registry socket contracts features implement
(`search`, `purge`, `page-settings` — contract types and pure utilities
only). A new `src/transport` home owns shared request plumbing (typed
client, body parsing, cron shell), with the API route handlers forming a
transport-owned zone and per-slice `api-contract.ts` files staying in their
slices. The whole online-status slice dissolves into `src/data`, deleting
the recorded Convex exception; the tsx entry scripts move to an entry-point
home so the database layer never imports upward; eve-sso splits its
client-safe constants from its server functions along existing export seams.
The former shared components zone resolves into the composition home and a
reusable leaf zone covering `.ts` and `.tsx`. One-way layer rules with
downward skips are enforced with zero recorded cross-layer exceptions; no
reverse edge exists; `circular-dependencies` and `re-export-cycle` flip from
`warn` to `error` after a confirmed-clean run on the relocated map; the
ownership map and guides state the layer rules. Delivered by the amended
session contract `3.10.1.2.1` under explicit operator direction (2026-07-23:
day-one-correct structure outranks refactor size, PR size, and contract
continuity) as one session with per-family verified commits. After the
original 522-file PR exceeded both review bots' hard caps, the operator
approved a narrow delivery exception on 2026-07-23: three sequential PRs at
the existing identity, composition-socket, and final-tree commit boundaries,
with Greptile and CodeRabbit fully settled on every part before any response
or push. Only the third PR publishes the terminal release records.

**In scope.** The relocations (composition band, platform, transport,
data/online-status as a whole slice, the entry-script home, the composition
and leaf component split), the eve-sso client/server split, zone-map
rewiring to zero exceptions, the two rule flips, ownership-map and guide
updates, the baseline-row and watch-trigger remap, and in-session safety
drills (local Convex bundle push, the tsx CLI matrix, an operator-authorized
cloned Neon branch migration drill, optional operator-authorized manual
preview deployments with both databases, removed after use).

**Out of scope.** Any runtime behavior change or component redesign beyond
the named file splits; renaming `src/features` or its surviving slices;
Phase 2 transport spine content.

**Dependencies.** 3.10.1.1.

**Decisions the session plan must resolve.** Exact membership for both
composition homes and the leaf zone; exact platform child sets and the
per-registry socket-contract splits; the eve-sso split boundary; the
entry-script home layout; the transport member set; correct placement for
the search contract's type references; commit sequencing and per-commit
proofs; drill triggers and authorization points.

**Baseline & hotspot note.** Improves (removes the structural loophole,
every misfiled ownership seam, and every recorded cross-layer exception;
large file-path churn, no LOC growth beyond the split modules' headers).

**Delivery evidence.** Full-coverage boundary run on the relocated tree with
seeded upward, peer, and feature→composition violations failing
`pnpm fallow` and a boundary configuration containing no upward or peer
allow; cycle rules at `error` with a green run; the Convex bundle and tsx
CLI proofs; standard close-out.

---

### 3.10.1.3 — `server-only` rails on the browser/server boundary

> *Delivered within sub-version 3.10.1.2, together with §3.10.1.2 (see the
> Status table). No separate 3.10.1.3 delivery row exists; this block states
> the §3.10.1.3 requirements the 3.10.1.2 bundle must satisfy.*

**Objective.** Server-only modules — database, secret-bearing config,
privileged auth, vendor adapters — mechanically cannot enter the client
graph.

**Done means.** The `server-only` package is a dependency; every compatible
server root imports it — roots whose module graphs are shared with the
Convex isolate bundle or the tsx database CLI entry points (which run under
plain Node, including on Vercel before the production build) instead carry a
recorded exemption, because the marker throws in any non-Next server
runtime; an ESLint restricted-import rule running inside `pnpm verify`/lint
is the primary gate blocking client files from every root, marked or
exempt; a discovery-based test enumerates the approved server-only roots and
fails when a root lacks its marker or recorded exemption or when a client
file can reach one through the import graph; the existing typed-env rail is
unchanged.

**In scope.** Marker imports, the lint rule, the enumeration test with its
client-reach graph walk, the vitest resolution stub the marker requires,
guide updates.

**Out of scope.** Changing what is currently server vs. client; converting
components between runtimes; Convex isolate modules and the Convex-bundled
ESI-gate chain (record the exemptions).

**Dependencies.** 3.10.1.1 (zone map names the server roots); the 3.10.1.2
relocations (roots live at their platform-layer homes).

**Decisions the session plan must resolve.** The authoritative root list and
the per-root marker-versus-exemption split; the enumeration test's discovery
mechanics (marker scan, vendor-SDK import scan, client-reach walk), matching
the 3.9 endpoint-gate pattern.

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

**Baseline & hotspot note.** Neutral. Touches the relocated auth-contract
paths; AF-008's convention-matched auth-contract Watch trigger must be
rechecked in the same change.

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

> *Delivered within sub-version 3.10.3.1, together with §3.10.3.1 (see the
> Status table). No separate 3.10.3.2 delivery row exists; this block states
> the §3.10.3.2 requirements the 3.10.3.1 bundle must satisfy.*

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
final architecture slice, so it renders the finished Phase 1–3 graph before
presentation-system work begins.

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
Codegraph already owns fine-grained structure); a live/interactive graph
explorer (backlog if ever); restyling any other devlog section; new heavy
client dependencies — a client-side Mermaid runtime is presumed rejected
in favor of build-time SVG or a small owned component unless the session
plan proves otherwise.

**Dependencies.** 3.10.1.1 and 3.10.1.2 (the map must show the completed,
one-directional zone graph); sequenced as the architecture movement's final
slice.

**Decisions the session plan must resolve.** Rendering path (build-time
Mermaid→SVG with tokenized styling vs. a small owned visx/SVG component
reading the generator's JSON — compare against the raw-HTML lint rules and
bundle cost); where the generated artifacts live (`content/devlog` asset
vs. component-owned); whether the drift test also publishes the Mermaid
source into the devlog for copy-paste.

**Baseline & hotspot note.** Neutral (one small script, one component, one
test). One session with two ordered internal phases: generator/drift plumbing
first, then the dependent devlog UX.

**Delivery evidence.** Drift test red on a seeded zone-rule edit without a
regenerated diagram; `ux-check` captures plus Ryan's approved browser
review; standard close-out.

## Phase 4 — Presentation-system completion (3.10.4.x)

**Arc thesis.** A primitive without an enforcing rail is unfinished, and a
surface bypassing an existing primitive is a defect. The 3.8 component-system
arc built the primitives; Phase 4 makes their adoption universal and enforced,
then improves the primitives so each improvement propagates site-wide. Mobile
becomes a designed mode rather than a shrunken desktop, and the phase closes by
re-running the adoption survey clean.

The UploadThing comparison is a behavioral and visual reference only. Its docs
UI derives from Tailwind UI; no component, markup, or stylesheet may be copied.
Every adopted idea is re-expressed through LGI.tools primitives and tokens. The
target is an EVE operations tool with documentation-grade clarity while keeping
the near-black palette, ISK-green accent, Barlow page identity, and mono data.

**Reference input.** Locate `LGI_UPLOADTHING_UI_AUDIT.md` in the repository's
current document archive convention before decomposition. If the reference is
not present, `plan-version` must report the missing source rather than inventing
its detailed targets from this summary.

**These are outcome groups, not contracts.** The labels A–D below preserve
goals and dependency order. They do not prescribe one session or PR each.
`plan-version` must apply its frontier-agent decomposition audit, attempt every
sensible bundle, and create the fewest safe execution contracts. Internal
phases, commits, UX pauses, different directories, and producer/consumer order
are not by themselves split reasons.

### Pre-contract adoption survey and operator disposition

Before proposing Phase 4 contracts, `plan-version` must use Codegraph and live
source inspection to build the inverse primitive map: for every live UI/design
primitive, identify every hand-rolled variant in `src/` and whether a mechanical
rail would have caught it.

Persist the approved survey in the current version-tagged audit/report location,
not in `docs/PRIMITIVE_LEDGER.md`; Phase 0 retires that document as a standing
policy owner. Use stable `AD-NNN` rows with at least:

`ID | Primitive | Bypass site(s) | Bypass form | Rail today | Rail gap | Estimated size | Disposition`

The survey covers, at minimum:

- raw `<button>` and link-as-button surfaces versus Button/`buttonVariants`
- hand-rolled toggles versus Segmented
- visible raw `<input>`/`<textarea>` and ad-hoc fields versus Field/Input/Textarea
- loading text and shapes versus LoadingLabel/Skeleton
- search wells versus Combobox/TerminalSearch
- pills, chips, dots, and statuses versus their primitives
- dialogs, popovers, and menus versus the Base UI overlay set
- tables, rows, and pagination versus SortableTable/Row/Pagination
- section chrome versus SectionHeader/SectionLabel/Card
- every page-scoped CSS family in `globals.css`, including `.sites-*` and
  `.industry-*`, mapped to the primitives or tone maps that supersede it
- every primitive with no enforcing rail, even when the survey finds no current
  bypass

The survey is planning evidence, not a pre-created implementation session. It
implements no product change. Present every row for operator disposition:
approve into Phase 4, route to backlog with its `AD-NNN` citation and reason, or
reject with a recorded reason. Use the dispositions and live ownership overlap
to propose the minimum safe execution bundles. Obtain approval of that topology,
amend the status table with concrete `3.10.4.x` rows, and only then create
contracts.

The detection method for every primitive family must be recorded so the closing
re-audit can repeat it diffably. The original SKIN roster is a starting
hypothesis, not a limit on the phase's end-state claim.

### Phase-wide constraints

- **Same-PR rail.** Any approved execution bundle that migrates surfaces onto a
  primitive lands the strongest appropriate mechanical rail in the same PR:
  ESLint selector/restricted import, Fallow boundary, registry/checker, or
  behavior test. A migration without its rail does not close.
- **Look-preserving adoption.** Adoption work migrates existing rendering; it
  does not redesign it. If a surface cannot be represented by an existing
  primitive, pause for an explicit variant or exemption decision. Never create
  a silent local override.
- **Explicit exemptions.** Legitimate raw usage, such as a hidden server-action
  input or a primitive's own implementation, must be narrowly encoded in the
  rail and listed in the adoption report. Zero silent bypasses.
- **Single owners after Phase 0.** UI and rendering guidance belongs in
  `src/AGENTS.md`; executable enforcement belongs in existing lint, Fallow,
  checker, and test owners; version-scoped findings and rationale belong in the
  Phase 4 adoption report. Do not revive `DESIGN_PRINCIPLES.md` or
  `PRIMITIVE_LEDGER.md` as live policy.
- **Token completion.** Every new `@theme` token family is registered with
  `cn.ts`'s `extendTailwindMerge` in the same commit.
- **Motion and access.** Every new transition honors reduced motion. Keyboard,
  focus, zoom, and responsive behavior are acceptance criteria, not polish.
- **UX gate.** Every visually changed execution bundle pauses for the
  operator's local review before its PR opens. A pause may occur inside one
  resumable session and does not automatically require another contract.
- **Release records.** Each approved planned delivery bundle follows the live
  planned close-out/versioning rules in force after Phase 0.

### Outcome group A — Universal primitive adoption and enforcement

**Objective.** Every approved `AD-NNN` bypass is migrated to its owning
primitive or tone map without changing the intended look, and every migrated
class of bypass becomes mechanically detectable in the same delivery bundle.

**Done means.** All operator-approved adoption rows are Delivered or carry a
new explicit disposition; the repeatable survey reports zero unexempted bypasses
for the completed families; every surviving exemption is narrow and recorded;
stale classes and local implementations are absent; each adopted primitive has
an effective rail.

**Required adoption outcomes.** The live survey controls the final roster, but
the planner must account for these verified starting hypotheses:

- **Actions.** Replace raw action buttons with Button and link actions with
  `buttonVariants`; raw `<button>` outside primitive internals becomes a lint
  failure unless narrowly exempted.
- **Toggles.** Replace cockpit and other hand-rolled toggle groups with
  Segmented. A compact/dense variant requires operator approval and must remain
  a shared primitive decision.
- **Fields.** Replace visible raw inputs and textareas with
  Field/Input/Textarea. The raw-input rail may exempt only the smallest proven
  hidden-field class.
- **Loading language.** Establish one rule for LoadingLabel (inline/dense) and
  Skeleton (shape-preserving region), migrate every loading surface, and detect
  ad-hoc loading literals or structures through the strongest reliable rail.
- **Legacy CSS.** Retire `.sites-*`, `.industry-*`, and any other superseded
  page-scoped class families. Consumers move to primitives plus feature-owned
  `*-styles.ts` tone maps. Deletion and stale-reference checks are the rail
  where a new rule class is unnecessary.
- **Residuals.** Deliver the remaining approved rows—search wells, chips,
  overlays, tables, section chrome, or other families found live—and finish with
  a clean family-by-family re-run.

**In scope.** All operator-approved adoption rows across every route and admin
surface; required primitive variants explicitly approved during a pause;
mechanical rails; removal of superseded CSS and local implementations; adoption
report status updates.

**Out of scope.** Visual refinement owned by outcome group B; feature behavior;
unrelated information architecture; speculative new primitives; broad
exemptions.

**Dependencies.** The approved pre-contract survey and disposition. Within the
group, only real rail interactions and primitive dependencies constrain order;
directory or primitive-family boundaries do not.

**Decisions contracts may require.** Variant mapping where several existing
variants are plausible; the narrow exemption form; whether a pattern needs an
ESLint selector, restricted import, Fallow rule, registry test, or deletion-only
stale-reference proof; true primitive gaps requiring operator ratification.

**Baseline & hotspot note.** `globals.css` should shrink materially. Planner
components may be touched, but PricingProvider AF-005 concern boundaries remain
fixed and contracts must name them when applicable.

**Delivery evidence.** Seeded rail failures followed by green tree-wide checks;
stale-reference sweeps for deleted patterns; route-representative `ux-check`
evidence; operator approval; standard close-out.

### Outcome group B — Primitive and surface refinement

**Objective.** Once adoption is complete and railed, refine typography,
chrome, surfaces, and content navigation inside shared primitives and tokens so
the result propagates across the entire site by construction.

**Done means.** Semantic type roles and PageHead modes are shared; header chrome
retains every capability with less decorative weight; each route declares an
appropriate PageShell mode; Card and section hierarchy express deliberate
object/control/data boundaries; the ContentBrowser rail has one layered state
model; no feature-local style bypass is introduced.

**Required refinement outcomes.** `plan-version` may bundle these where their
owners and UX review overlap:

- **Typography roles and scale.** `font-ui` (Geist) owns everyday navigation,
  action, menu, and label text; `font-data` (JetBrains Mono) owns values,
  status, code, compact technical metadata, and the wordmark. Uppercase and
  tracking become special treatments rather than defaults. PageHead supports
  `hero | page | compact`. Compare the audit's targets—navigation around
  14px/1.6, body 16px/1.7, and title `clamp(28px, 2.6vw, 36px)`—and record any
  operator-approved deviation.
- **Header restraint.** Preserve the compact height, functional slots,
  responsive collapse, and mono server-status instrumentation while removing
  nonessential seams and weight. Spacing plus the existing active rule should
  distinguish tools where borders are not load-bearing.
- **Surface hierarchy and page modes.** PageShell gains
  `workspace | reading | detail`; every route selects one. Classify Card uses as
  object, control group, data region, or spacing wrapper; convert spacing-only
  wrappers to borderless sections. Standardize label-to-content, peer-section,
  and major-region rhythm through registered tokens. Keep glow for meaningful
  interaction or live status only.
- **Content rail.** Re-express the audit's layered state model in LGI.tools
  tokens: neutral group guide, ISK-green active marker, and faint active-region
  wash, with immediate reduced-motion behavior. Preserve pathname/Suspense and
  server-rendered fallback behavior on every ContentBrowser consumer.

**In scope.** `globals.css` tokens; `src/components/ui/`; PageHead, PageShell,
Card and section primitives; header components; ContentBrowser; feature tone
maps; minimal call-site changes needed to select shared modes or variants.

**Out of scope.** Category-dropdown navigation; a general information-
architecture rewrite; copying UploadThing/Tailwind UI code; feature-local
one-off styling. Scroll-aware section links remain an explicit operator choice:
include them only if the planner proves sufficient current-version value and
bounded complexity; otherwise create one cited backlog entry.

**Dependencies.** Outcome group A must be complete enough that shared changes
propagate rather than chase hand-rolled stragglers. Typography precedes the
header and other type-dependent judgments; surface modes precede final content-
rail and responsive review.

**Decisions contracts may require.** Type-role assignment per primitive; which
uppercase treatments and header seams survive; route-to-PageShell-mode mapping;
per-call-site Card classification; scroll-aware section links in or out.

**Baseline & hotspot note.** Neutral. `globals.css` should continue shrinking
as backdrop and rhythm variants consolidate.

**Delivery evidence.** Before/after route captures across all surface modes and
header breakpoints; reduced-motion verification; ContentBrowser proof on devlog
and another consumer; operator UX approval; standard close-out.

### Outcome group C — Mobile mode and responsive rationalization

**Objective.** Mobile becomes an intentional composition and the site's
breakpoint behavior becomes a declared, evidence-based system.

**Done means.** The sub-860px ContentBrowser stack is replaced on every consumer
by an accessible Base UI drawer or dialog with a compact current-chapter bar,
full tree, close-on-navigation, and preserved focus; page settings are reachable
from mobile navigation; the site's observed breakpoint set is reconciled into a
declared ladder with a fit-based justification for every exception; all routes
pass the reference width and zoom matrix.

**In scope.** ContentBrowser mobile composition; the hamburger panel's settings
affordance; breakpoint declarations across `globals.css` and components;
keyboard, focus, zoom, and width-matrix verification.

**Out of scope.** Category-dropdown navigation; unrelated new mobile features;
forcing a generic framework breakpoint scale where observed fit supports a
better house value.

**Dependencies.** Outcome group B's content rail, header, type, and surface
changes must be stable enough that responsive verification measures the final
chrome. Drawer versus full-screen dialog at the smallest widths is a contract-
time implementation decision, not a separate roadmap outcome.

**Decisions contracts may require.** The observed-fit ladder; narrowest-width
drawer/dialog mode; settings placement; disposition of defects found by the
matrix.

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Route-by-route checks at 390, 768, 1024, 1366, 1440,
and 1920px plus 200% zoom; keyboard and focus proof; reduced-motion proof;
operator mobile/device-emulation review; standard close-out.

### Outcome group D — Operator punch list and clean closure

**Objective.** Resolve the remaining presentation defects found through live
operator use, then repeat the adoption survey and prove the phase's universal
claim.

**Punch-list execution contract.** A contract binds an area and its rules, not
an unknowable change list. The allowed fix vocabulary is existing primitives,
feature `*-styles.ts` tone maps, and registered tokens—never a new one-off
style. The operator reviews the live site and reports items; the agent resolves
each item within the rules. A material primitive, token-family, layout, or
architecture change outside the approved bundle pauses for amendment or is
routed to backlog. Multiple sittings may resume the same execution session and
branch; a sitting is not a new contract.

**Seed planner items.** Preserve these known checks without treating them as a
complete list:

- cockpit KPI figures share one baseline whether or not tiles contain controls
- ME/TE color meaning comes only from `industry-styles.ts`
- owned-blueprint highlighting is consistent across NodeCard, HeroCard,
  CockpitBuildPlan, and MeAdjuster

**Done means.** The operator declares the planner and remaining site-wide punch
lists resolved; each fix lives in a primitive, tone map, or token and therefore
propagates to all consumers; the original recorded adoption method re-runs with
zero unexempted hand-rolled variants, zero unrailed primitives, every exemption
listed, and every `AD-NNN` row terminal. Any residue receives an explicit
operator disposition, with an empty accepted-residual set as the expectation.

**In scope.** Industry-planner routes and components; every remaining route;
defects routed from the responsive matrix; the repeatable adoption re-audit;
version-ship finalization.

**Out of scope.** New flagship features; PricingProvider concern redesign;
one-off visual patches; new primitives or token families without an approved
amendment and their full shared enforcement; code-health version-close audit,
which remains a separate standing lifecycle action.

**Dependencies.** Outcome groups A–C. The planner may serve as the first polish
area because it contains the known seed items, but a separate planner contract
survives only if reviewability or a hard risk boundary justifies it.

**Decisions contracts may require.** KPI alignment mechanism (shared grid track
versus fixed label-row height); whether operator findings remain within the
approved vocabulary; whether a genuinely large discovered set requires a
master-plan amendment rather than another automatic session.

**Baseline & hotspot note.** Planner work must preserve AF-005 concern
boundaries. Otherwise neutral.

**Delivery evidence.** Per-item punch-list dispositions and operator approval;
the clean recorded adoption re-audit; terminal Phase 4 roadmap state; standard
version-close handoff.

### Phase 4 ship claim

Phase 4 is complete only when every UI primitive is consumed everywhere its
concern appears and an effective rail fails the build on regression; shared
primitives carry the approved type, chrome, surface, and navigation treatment;
mobile is an intentional mode verified across the width matrix; the operator's
punch lists are resolved; and the repeatable re-audit is clean. Presentation
drift then becomes a build failure, not a future version.

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
- **Phase 4 non-goals:** no copied UploadThing or Tailwind UI implementation;
  no feature behavior or information-architecture rewrite disguised as polish;
  no adoption sweep without a same-PR mechanical rail; no silent primitive
  exemption; no one-off style, primitive, or token created merely to clear an
  operator punch-list item; no resurrection of `PRIMITIVE_LEDGER.md` or
  `DESIGN_PRINCIPLES.md` as live policy owners after Phase 0; no automatic
  contract per primitive family, route family, outcome-group heading, review
  sitting, or UX pause.

## Sequencing and dependencies

**Phase 0 strictly precedes Phases 1–4.** The later arcs write new
rules into the homes Phase 0 establishes, so consolidating first avoids
double-editing and guarantees the new rules land in single-owner files under
the 3.10.0.4 anti-duplication check. Within Phase 0, 3.10.0.1 greens the gate,
3.10.0.2 builds the canonical frame, 3.10.0.3 establishes the close-out model,
and 3.10.0.4 completes every remaining migration, ownership change, and
enforcement update as one ordered execution bundle.

Within the architecture movement: Phase 1 is strictly ordered (1.1 → 1.2 →
1.3). Phase 2 may interleave with Phase 1 except 3.10.2.2, which follows
3.10.2.1. Phase 3 follows 3.10.2.1 (codes) and 3.10.2.4 (retry declarations).
3.10.3.3 is the architecture movement's deliberate final slice: it renders the
completed zone graph and pauses for operator UX review. Phase 4 follows the
completed architecture movement. Its live adoption survey is a prerequisite of
delivery decomposition, not an automatically separate execution PR: the new
`plan-version` performs the survey, obtains operator dispositions, adversarially
bundles the approved outcomes, updates this status table with concrete
`3.10.4.x` delivery rows, and only then creates contracts. Within Phase 4,
adoption and its rails precede primitive refinement; stable refinement precedes
responsive verification and operator punch-list closure; the clean adoption
re-audit is last. Only after every Phase 4 row is terminal does the resolver
move to `plan-version-audit`.

Nothing in Phases 1–3 blocks on external vendors or new dependencies beyond the
`server-only` package. Phase 4 must use the installed primitive stack and
existing toolchain unless a separately approved amendment proves a dependency
necessary.

**Bootstrapping note.** Phase 0 edits the very lifecycle docs, skills, and
`policy-manifest.json` that the resolver and drift gate validate against. Each
Phase 0 sub-version therefore updates the manifest/checkers in the same slice
that moves the docs, so `check_agent_drift.py`, `check_doc_refs.py`, and the
resolver are green at every step — the same "each PR independently green"
discipline the rest of the lifecycle already requires. This is why the
consolidation is a version phase shipped through the normal lifecycle, not an
out-of-band rewrite.
