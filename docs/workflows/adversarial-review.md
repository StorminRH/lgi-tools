# Adversarial-review procedure

Review one complete plan, implementation diff, or pull request with fresh,
independent subagents. Verify every reported defect and return one concise
reconciled result. Diff mode also owns the repository design creed, in-scope
fixes, baseline reconcile, and PR design notes for close-out.

This procedure is parent orchestration. Selected portable reviewers follow
`docs/workflows/schema/reviewer-verdict.md` and their harness agent bodies; they
do not read this procedure.

Planning workflows may invoke **Plan mode** before approval. `close-out` and
`resolve-update-watch` invoke **Diff mode** as the sole implementation-review
gate before the final definition-of-done checkpoint. An operator may invoke any
mode on demand. This procedure does not replace external PR review,
implementation, approval, or delivery.

## Execution contract

Select exactly one review mode:

- **Plan:** one complete draft plan plus its authority, schema, source evidence,
  and content digest.
- **Diff:** one complete committed diff or stable working-tree snapshot plus its
  base, authority, changed-surface inventory, focused or UX proof, and the
  current code-health baseline.
- **PR:** one pull request at an exact head SHA plus its complete diff,
  authority, description, review context, and available verification.

### Mode duties

- **Plan and PR:** read-only. No design-creed checklist, no on-branch edits, no
  Design notes, no baseline mutation. Return `CLEAN`,
  `CORRECTIONS_REQUIRED`, or `BLOCKED`. Plan mode from `plan-session` launches
  only `holistic-reviewer`.
- **Diff:** freeze the subject, launch agents once, verify and reconcile against
  the design creed, fix or defer in-scope findings, reconcile affected baseline
  state, and prepare PR Design notes when the caller will open a PR. Return
  `PASS` or `BLOCKED`. Diff grants edit authority only for those in-scope
  corrections; it grants no approval, commit, PR, merge, deployment, lifecycle,
  or outward-action authority.

Return `BLOCKED` when the subject is incomplete or changes during review,
authority is ambiguous, subagents are unavailable, a selected reviewer
does not return a verdict, or load-bearing evidence cannot be established.
When the operator explicitly requires exact runtime identity for an experiment,
an identity mismatch or an unobservable identity also returns `BLOCKED`.

Each invocation runs one fresh review round and returns. After reconcile, fix
or disclose; do not automatically relaunch this procedure. An operator may
request another review explicitly later.

Parent verification still severity-calibrates accepted findings using the
severity and evidence rules in `docs/workflows/schema/reviewer-verdict.md`.
Reviewer agreement raises confidence but never replaces direct verification.
Preserve deliberate behavior by recording rejected findings and why they must
not be changed. Top-level `BLOCKED` means the review cannot establish a
trustworthy verdict; it is not a finding severity. Missing load-bearing
evidence returns top-level `BLOCKED`.

**Design creed (Diff acceptance criteria).** Make the next change cheaper: keep
caller-facing interfaces small and implementations deep; give each decision one
owner; require every layer to hide real complexity; build only for current
callers; absorb edge cases below stable interfaces; repair resistant structure
before adding behavior; preserve non-obvious rationale; avoid fragmenting
cohesive modules; refactor in behavior-preserving tested steps; and treat
metrics as signals, not design instructions. `docs/CODE_HEALTH_BASELINE.md`
owns current hotspot state.

## 1. Freeze the subject and evidence

1. Record the mode, authority, repository, and operator emphasis.
2. Freeze the subject:
   - for a plan, record every reviewed path and its SHA-256 digest;
   - for a committed diff, record the full base and head SHAs;
   - for a working-tree diff, store the complete patch and untracked inventory
     outside the repository, record the base and patch digest, and require the
     worktree to remain unchanged until agent verdicts are collected; or
   - for a PR, record the repository, PR number, base SHA, and exact head SHA.
3. Map every outcome or logical change group to its authority. Stop when one is
   unowned.
4. Inventory the relevant source, tests, tooling, configuration, and prose.
5. Record current verification or an explicit not-run reason.
6. **(Diff)** Confirm focused proof exists for every changed behavior, or record
   which surfaces legitimately need no runtime or UX proof. Record every added
   or changed exported surface, or `Exports: none`.

## 2. Select independent review roles

Select sparingly. Never launch a role merely because its definition exists.
Never add a role that duplicates another selected role's primary investigation.
Launch each selected role once in this invocation; do not run a prior collector
round for the same scopes. Role count expresses coverage; queue roles that
cannot run concurrently without combining roles or reducing independence.

Default seats by context:

- **Plan mode from `plan-session`:** launch only `holistic-reviewer`.
- **Other Plan mode callers** (`plan-version`, version-audit planning,
  plan-audit-remediation): launch only `holistic-reviewer` unless operator
  emphasis names one distinct risk that needs a single scoped seat.
- **Diff / PR mode:** launch `holistic-reviewer` plus at most one scoped seat by default;
  allow a second scoped seat only when two materially distinct judgment risks
  are present. Never select three scoped seats.

Diff / PR scoped preference order (judgment mechanical gates miss):

1. `ownership-reviewer` when `src/` or `convex/` behavior changes
   (primitive, registry, and owner reuse against living guides);
2. `interface-reviewer` when user-facing UI changed (house style and UI
   primitives); then
3. `architecture-reviewer`, `contract-reviewer`, or `reliability-reviewer` only
   when that specific risk is the material one and ownership or interface do
   not cover it.

Portable role vocabulary (selection only; investigation lives in each agent):

- `architecture-reviewer` — module interface depth, layer boundaries, or
  structural pressure;
- `ownership-reviewer` — local decision ownership, dependency direction, living
  AGENTS.md primitive/registry/gate reuse, interface breadth, or semantic
  duplication;
- `reliability-reviewer` — state transitions, cleanup, cancellation, resource
  release, concurrency, idempotency, timeouts, retries, degradation, or
  recovery;
- `contract-reviewer` — authority-to-outcome coverage, boundary contracts,
  authoritative shapes, cross-file consistency, or behavioral proof;
- `interface-reviewer` — changed user-facing UI behavior, accessibility, or
  design-system conformance (not module or API interface depth);
- `holistic-reviewer` — complete frozen subject for missing outcomes, cross-area
  contradictions, failure paths, stale assumptions, and integrated risk; and
- a task-specific security, identity, data-integrity, concurrency, or other
  role when that risk is more material than the portable seats above.

Every brief must include the stable subject identity, authority, operator
emphasis, assigned scope, current evidence, read-only instructions, and the
verdict contract from `docs/workflows/schema/reviewer-verdict.md`.

Give each scoped reviewer the full inventory plus one non-overlapping primary
scope. Give the holistic reviewer the complete subject. Do not disclose
expected defects, another reviewer's output, or the caller's prior conclusions.

Pass paths, symbols, hashes, and the logical inventory instead of raw discovery
logs or copied source. Require the final verdict to stay compact; the
reviewer's exploratory transcript remains isolated from the caller context.

When subagents are unavailable in Diff mode, perform the same design judgment
directly. Their absence never waives Diff parent duties or changes the result
standard.

## 3. Launch subagents

Launch one fresh portable harness subagent for every selected role and isolate
each reviewer from the authoring conversation and other verdicts. Reviewers
follow `docs/workflows/schema/reviewer-verdict.md` and their agent body.

Collect structured verdicts from every selected role. Allow one diagnosed
retry when a reviewer fails to return the required format. A second failure
returns `BLOCKED`.

Record the requested runtime identity for each role and the observed identity
when available. Write `Not observable` when it is not. Never infer observed identity
from role configuration, role name, or self-report. Ordinary lifecycle review
remains role-based unless the operator made exact identity an explicit
condition.

Render one compact receipt before triage. It is review-local evidence held for
the caller's reconciliation, not chat output:
`docs/workflows/schema/chat-result.md` owns what reaches chat and excludes role
and runtime-identity tables from it.

```markdown
| Reviewer role | Assigned scope | Requested runtime identity | Observed runtime identity | Reported |
|---|---|---|---|---:|
| Holistic | Complete subject | <selection, inherit, or unspecified> | <identity or Not observable> | <severity counts or Clean> |
| Scoped 1 | <scope> | <selection, inherit, or unspecified> | <identity or Not observable> | <severity counts or Clean> |
```

Do not quote or enumerate raw reviewer findings before reconciliation.

## 4. Collect structured verdicts

Confirm each verdict belongs to the frozen subject and contains the required
evidence. Reject unsupported preferences. Deduplicate reports by root cause,
but retain the source roles in review-local evidence.

If reviewers disagree about a security, identity, destructive-data, migration,
concurrency, or public-contract claim, first settle it from source, primary
documentation, tests, or observable behavior. If direct evidence cannot settle
it, return `BLOCKED` for operator direction. Do not silently add an unselected
reviewer or model lane.

## 5. Verify and reconcile

Before returning (and before Diff parent duties), personally verify:

1. inspect the highest-blast-radius owner;
2. reproduce or disprove every reported failure;
3. classify each accepted root cause once as `BLOCKER`, `MAJOR`, or `MINOR`
   using `docs/workflows/schema/reviewer-verdict.md`;
4. record false positives and deliberate do-not-change decisions;
5. confirm the smallest correction remains within authority;
6. record verification invalidated by each correction; and
7. recheck the subject identity.

For **Plan and PR**, return `CLEAN` only when no verified actionable finding
remains and all required evidence is current. Return `CORRECTIONS_REQUIRED`
when at least one verified in-scope defect remains. Do not edit the subject.

For **Diff**, continue to section 6 when verification is complete. Do not
re-run a full ownership, interface-depth, or amplification discovery pass that
duplicates selected reviewer scopes; use agent findings plus the slim parent
checklist below. Treat design-creed red flags (shallow pass-through, leaked
ownership, unused surface breadth, apology comments, metric-driven wrappers) as
verification prompts against reported findings, not a second discovery round.

## 6. Diff parent duties

Diff mode only. Skip this section in Plan and PR modes.

### 6.1 Apply the design creed and fix findings

Classify every accepted finding exactly once:

- `FIXED`: the defect was in scope and is corrected on the branch.
- `DEFERRED`: the finding is outside the whole sub-version and now has one
  actionable backlog entry in `docs/backlog.md` with diagnosis, size, and
  trigger.
- `BLOCKED`: correcting it would change approved product scope, architecture,
  or policy and requires operator approval.

Stop with `BLOCKED` when a required Diff input is missing, the diff violates an
approved scope boundary, or a material design fix needs operator approval.
Ordinary localized fixes are verified by the orchestrator and the applicable
focused check without another full review round.

### 6.2 Rationale and comments

1. Verify every changed exported production surface under `src/` or `convex/`
   has the concise contract comment required by the applicable scoped guidance,
   without restating its signature.
2. Verify non-obvious ordering, invariants, units, ownership, and rejected
   simpler alternatives are recorded at the owning site.
3. Treat comments that explain call order, field navigation, or a workaround as
   interface defects. Fix the interface rather than polishing the apology.
4. Remove commentary that merely narrates visible code.

### 6.3 Tests as design evidence

1. Map every new or changed behavior branch to a behavioral test.
2. For structural changes, identify the characterization evidence that held
   behavior constant before the move.
3. If branching logic remains difficult to test because presentation and policy
   are tangled, separate the policy at its natural seam and test it there.
4. Reject assertions added only to raise coverage or satisfy a metric without
   proving behavior.

### 6.4 Rail pressure and live baseline

1. Inspect any lint, Fallow, complexity, duplication, suppression, or boundary
   pressure encountered by the branch.
2. Confirm the implementation was not fragmented, padded with tests, or wrapped
   in pass-through layers solely to satisfy a metric.
3. Do not add a complexity or CRAP threshold override. Split by a real change
   axis, simplify the design, or add meaningful behavioral coverage. A proposed
   suppression or boundary exception is `BLOCKED` until the operator approves
   its narrow owner and rationale.
4. When a boundary changes, update its mechanical owner and public description
   together; do not create a second enforcement representation.
5. Compare every touched hotspot or Watch surface with the current baseline.
   Update only the affected measurements and required snapshot identity. Do not
   perform a partial rewrite of unrelated baseline evidence.
6. If the diff creates a credible new hotspot, add evidence and a direction of
   fix now or stop for an operator decision.

### 6.5 Prepare PR design notes

When the caller will open a PR, produce a three-to-eight-line `Design notes:`
block for the PR's `## Notes` section. State:

1. Which decisions now have one owner.
2. Which interfaces were deliberately kept deep or changed, and why.
3. Any override, suppression, or boundary decision and its evidence location.
4. Any deferred finding and its backlog entry.

For audit remediation, also name each mapped `AF-NNN` finding and state how the
delivered shape meets its required outcome. Do not mark an audit finding
Verified here. Non-final planned sessions that only hand off may record
`Design notes: deferred to final session` instead of a PR-ready block.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to the field set for the selected
mode.

### Plan and PR

```markdown
## Adversarial review: `CLEAN` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** <paths and digest, diff identity, or PR and exact head>
- **Result:** <roles used; accepted finding count or clean; ≤2 sentences>
- **Action:** <continue, correct accepted root causes, or operator action>
- **Blocker:** <exact blocker or `None`>
```

### Diff

```markdown
## Adversarial review: `PASS` | `BLOCKED`

- **Subject:** <diff identity or working-tree base and patch digest>
- **Result:** <roles used; finding disposition counts; design-notes readiness; ≤2 sentences>
- **Action:** <Return to close-out, or stop for operator decision>
- **Blocker:** <exact blocker or `None`>
```

Return Diff `PASS` only when no unresolved `FIXED`-pending or `BLOCKED`
finding remains, Diff parent evidence is complete, any affected baseline state
is current, and Design notes are ready or explicitly deferred for a non-final
handoff. A `PASS` returns control to the caller; it does not itself authorize
PR creation. Keep as-built receipts labeled `**Adversarial review:**` for
resolver compatibility.
