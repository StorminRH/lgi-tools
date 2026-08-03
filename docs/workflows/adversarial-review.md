# Adversarial-review procedure

Review one complete plan, implementation diff, or pull request with fresh,
independent subagents. Keep the review read-only, verify every reported
defect, and return one concise reconciled result.

This procedure is parent orchestration. Selected portable reviewers follow
`docs/workflows/schema/reviewer-verdict.md` and their harness agent bodies; they
do not read this procedure.

Planning workflows may invoke **Plan mode** before approval. `close-out` invokes
**Diff mode** before its final definition-of-done checkpoint. An operator may
invoke any mode on demand. This procedure does not replace
`pre-pr-design-review`, external PR review, implementation, approval, or
delivery.

## Execution contract

Select exactly one review mode:

- **Plan:** one complete draft plan plus its authority, schema, source evidence,
  and content digest.
- **Diff:** one complete committed diff or stable working-tree snapshot plus its
  base, authority, changed-surface inventory, and available verification.
- **PR:** one pull request at an exact head SHA plus its complete diff,
  authority, description, review context, and available verification.

Return `BLOCKED` when the subject is incomplete or changes during review,
authority is ambiguous, subagents are unavailable, a selected reviewer
does not return a verdict, or load-bearing evidence cannot be established.
When the operator explicitly requires exact runtime identity for an experiment,
an identity mismatch or an unobservable identity also returns `BLOCKED`.
This procedure grants no edit, approval, commit, PR, merge, deployment,
lifecycle, or outward-action authority.

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

## 1. Freeze the subject and evidence

1. Record the mode, authority, repository, and operator emphasis.
2. Freeze the subject:
   - for a plan, record every reviewed path and its SHA-256 digest;
   - for a committed diff, record the full base and head SHAs;
   - for a working-tree diff, store the complete patch and untracked inventory
     outside the repository, record the base and patch digest, and require the
     worktree to remain unchanged; or
   - for a PR, record the repository, PR number, base SHA, and exact head SHA.
3. Map every outcome or logical change group to its authority. Stop when one is
   unowned.
4. Inventory the relevant source, tests, tooling, configuration, and prose.
5. Record current verification or an explicit not-run reason.

## 2. Select independent review roles

Select sparingly. Never launch a role merely because its definition exists.
Never add a role that duplicates another selected role's primary investigation.
A reviewer used during pre-PR design review must still be launched as a fresh
subagent here when its scope is selected. Role count expresses coverage; queue
roles that cannot run concurrently without combining roles or reducing
independence.

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

Before returning, personally verify:

1. inspect the highest-blast-radius owner;
2. reproduce or disprove every reported failure;
3. classify each accepted root cause once as `BLOCKER`, `MAJOR`, or `MINOR`
   using `docs/workflows/schema/reviewer-verdict.md`;
4. record false positives and deliberate do-not-change decisions;
5. confirm the smallest correction remains within authority;
6. record verification invalidated by each correction; and
7. recheck the subject identity.

Return `CLEAN` only when no verified actionable finding remains and all
required evidence is current. Return `CORRECTIONS_REQUIRED` when at least one
verified in-scope defect remains.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Adversarial review: `CLEAN` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** <paths and digest, diff identity, or PR and exact head>
- **Result:** <roles used; accepted finding count or clean; ≤2 sentences>
- **Action:** <continue, correct accepted root causes, or operator action>
- **Blocker:** <exact blocker or `None`>
```
