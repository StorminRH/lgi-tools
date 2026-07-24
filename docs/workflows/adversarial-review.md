# Adversarial-review procedure

Review one completed implementation diff before its PR. Establish truthful
current-head evidence, obtain independent reviews from both supported runtimes,
verify every claim, and return one reconciled report plus one executable fix
prompt when defects remain. Keep the review read-only.

This procedure is an on-demand review outside `close-out`. It does not replace
the required `pre-pr-design-review` gate, Greptile, or any close-out phase.

## Execution contract

Required inputs:

1. An unambiguous merge base and the complete diff from that base to the current
   head.
2. The direct request or frozen contract-and-plan chain that authorizes the
   diff.
3. Current-head verification evidence, or authority to run the applicable
   repository gates.
4. Any operator-specified review emphasis.

Required outputs:

1. One result using the exact form under **Return the result**.
2. One reconciled ledger containing only verified findings and explicit
   rejections.
3. When an actionable defect remains, exactly one fenced, self-contained prompt
   for a separately authorized fixing agent.

Return `BLOCKED` when the base or authority is ambiguous, a required reviewer
cannot run, or current-head evidence cannot be established. A red gate is a
finding when its cause is in the diff; it is a blocker only when the agent
cannot diagnose or attribute it. This procedure grants no edit, commit, PR,
merge, deployment, or lifecycle authority.

## Review rules

- Judge the implementation against live behavior, repository policy, current
  primary documentation, and the authorized outcome. Treat contracts and plans
  as frozen prompts whose claims must be verified, not as substitutes for live
  evidence.
- Record a plan-faithful technical defect as a finding. Record a technically
  sound divergence as justified and require its later disclosure; never regress
  the implementation merely to reproduce stale prompt text.
- Require every finding to name a repository location, the violated contract or
  invariant, a concrete failure scenario, and the smallest sufficient fix.
  Unsupported style preferences are not findings.
- Preserve deliberate behavior by recording rejected findings with the exact
  reason they must not be "helpfully" changed.
- Do not accept reviewer consensus as proof. Verify every accepted claim against
  source, tests, or observable behavior.

## 1. Establish the boundary and evidence

1. Resolve and record the full base and head SHAs. Inspect the complete diff,
   name-status view, and stat view.
2. Map every logical change group to its direct request or owning lifecycle
   artifact. Stop if any group lacks authority.
3. Inventory the changed production surfaces, tests, executable tooling,
   configuration, and prose. Assign each changed file a primary area-review
   owner while retaining one holistic reviewer over the full diff.
4. Reuse a supplied gate result only when it names the current head and its
   command matches the repository's current requirement.
5. When application, test, executable, dependency, or verification
   configuration changed and no reusable result exists, run the single
   coverage-backed checkpoint:

   ```bash
   FALLOW_AUDIT_BASE="$(git rev-parse origin/main)" pnpm verify
   ```

6. When TypeScript strictness is a load-bearing review claim, also run:

   ```bash
   npx tsc --noEmit --incremental false
   ```

7. For a prose-only or policy-only diff, run the applicable cheap document,
   skill, privacy, and drift checks instead of manufacturing an application
   verification cycle. Never run the lifecycle resolver or release-consistency
   checker for ordinary work.

Evidence: base and head SHAs, authority map, changed-surface inventory, and each
gate command with its current-head result or explicit not-applicable reason.

## 2. Build one reviewer brief

Write one brief to a temporary directory outside the repository. Include:

- the absolute repository path and exact base/head SHAs;
- the authority map and operator emphasis;
- the review rules above;
- the changed-file inventory and each area reviewer's assigned files;
- read-only instructions and a Codegraph-first investigation requirement;
- the current-head gate evidence; and
- this required reviewer response:

```text
Verdict: CLEAN | FINDINGS

Findings:
1. [BLOCKER|MAJOR|MINOR] path:line — violated invariant; concrete failure
   scenario; smallest sufficient fix.

Load-bearing checks that held:
- path or behavior — evidence.
```

Require `Findings: None` for a clean review. Do not give reviewers expected
defects or the orchestrator's conclusions.

## 3. Run independent reviews

Launch the following reviewers concurrently when the runtime supports it:

1. Same-runtime area reviewers with disjoint primary file ownership. Choose the
   smallest split that covers the diff; do not create empty or artificial
   specialties.
2. One cross-runtime holistic reviewer over the entire diff, focused on
   cross-file inconsistency, behavior drift, missing tests, and implementation
   changes made only to satisfy stale prose.

Run each reviewer fresh, read-only, and at high reasoning effort. An initial
review is one round. After a material implementation revision, a later explicit
invocation starts a new round; do not loop reviewers against an unchanged diff.

Evidence: reviewer identity, assigned scope, completion state, and raw verdict.

## 4. Verify and reconcile

The orchestrating agent must:

1. Personally inspect the highest-blast-radius changed owner before accepting
   reviewer conclusions.
2. Reproduce or disprove every reported failure against current source,
   primary documentation, tests, or observable behavior.
3. Deduplicate findings by root cause. Convergence raises confidence but never
   replaces verification.
4. Classify each accepted item exactly once as `BLOCKER`, `MAJOR`, or `MINOR`.
   Reject false positives explicitly and preserve deliberate behavior in the
   rejection ledger.
5. Confirm the proposed fix is within the authorized boundary and does not
   create a second owner, widen a public surface, or weaken a gate.
6. Record which verification evidence a future fix will invalidate.

Return `CLEAN` only when no verified actionable finding remains and all required
evidence is current. Return `FIX_ROUND_REQUIRED` when at least one verified,
in-scope defect remains.

## 5. Build the fix prompt

For `FIX_ROUND_REQUIRED`, write exactly one fenced `text` block that an agent
with no conversation context can execute. Include:

1. the repository path, base/head SHAs, authority, and intended outcome;
2. numbered fixes with exact paths, failure scenarios, and required end states;
3. the explicit rejected/do-not-change ledger;
4. the focused checks and every invalidated gate to rerun; and
5. a stop condition for any scope, architecture, or authority conflict.

Do not authorize a commit, PR, merge, deployment, lifecycle mutation, or
outward action in the prompt. Those require separate operator authority.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Adversarial review: `CLEAN` | `FIX_ROUND_REQUIRED` | `BLOCKED`

- **Diff:** <full base SHA>...<full head SHA>
- **Files:** <count and logical groups>
- **Authority:** <direct request or owning artifacts>

### Review evidence

- **Gates:** <current-head commands and results>
- **Area reviewers:** <assignments and verdicts>
- **Cross-runtime reviewer:** <runtime and verdict>
- **Load-bearing checks:** <verified properties that held>

### Findings

- **Accepted:** <numbered severity ledger or None>
- **Rejected:** <finding and reason or None>
- **Invalidated verification:** <checks a fix must rerun or None>

### Fix prompt

<one fenced text block or Not required>

### Next state

- **Handoff:** <Send the prompt to a separately authorized fixing agent, continue
  to the owning workflow, or stop for operator action>
- **Blocker:** <exact blocker or None>
```
