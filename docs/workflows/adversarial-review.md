# Adversarial-review procedure

Review a completed implementation diff before its PR: verify the gates
truthfully, fan out independent adversarial reviewers, verify their claims,
and return one report plus one executable fix prompt. Read-only throughout —
this procedure never edits a file in the diff.

## Execution contract

Inputs: the diff (`git diff <base>...HEAD`, default base `origin/main`), the
owning plan/contract documents when the work was planned, and the operator's
stated review emphasis if any.

Output: one chat report in the canonical form below, containing the verdict,
verified-gate evidence, reconciled findings, explicit rejections, and — when
any fix is required — exactly one fenced, self-contained fix prompt for the
executing agent.

Stop with `BLOCKED` only when the gates cannot run or the diff base is
ambiguous. Never modify repository files; reviewers run read-only.

## Review philosophy (binding)

- Judge technical quality, not document adherence. Plans and contracts supply
  intent context; they are prompts, not law.
- A plan-faithful implementation that is technically wrong is a finding. A
  deviation that improves the code is recorded as justified, not "fixed."
- Never require a quality regression to restore document conformance. When
  quality and a constraint genuinely conflict, surface the tradeoff with a
  recommendation; the operator arbitrates.
- Deviations are disclosed, never silent: an accepted behavior delta goes in
  the PR body and as-built record, not quietly reverted.
- Findings need evidence: file:line plus a concrete failure scenario. No
  vibes-based severity.

## 1. Gates, run truthfully

Run and record before any reviewer opinion:

```bash
pnpm verify
FALLOW_AUDIT_BASE=origin/main npx fallow audit --fail-on-issues
npx tsc --noEmit --incremental false
```

`pnpm verify`'s Fallow leg self-compares against the pushed branch tip
(merge-base trap) — the pinned rerun is mandatory, not optional. A red gate is
itself a finding, not a stop.

## 2. Fan out

Write one shared reviewer brief (scratch file, not the repo) containing: the
diff base, the philosophy block above, the codegraph-first mandate, read-only
orders, and the required output form — `Verdict: CLEAN | FINDINGS`, numbered
severity-tagged findings (`BLOCKER|MAJOR|MINOR|NIT`, file:line, failure
scenario, required fix), then one-line confirmations of load-bearing checks
that HELD.

Launch in parallel, each reviewer fresh and high-effort:

- Area reviewers (same runtime), split by responsibility so every changed
  file has exactly one owner: shared kernel/guards, contracts/routes,
  callers/tests/gates — adjust the split to the diff's shape.
- One cross-model holistic reviewer over the entire diff, briefed to hunt
  cross-file inconsistency, behavior drift, and quality-regressed-to-match-
  the-document spots.

One pass. A second pass is permitted only after a material revision of the
work under review; never a third.

## 3. Orchestrator duties (not delegable)

- Personally review the highest-blast-radius shared code in the diff before
  reviewer reports land.
- Verify every load-bearing reviewer claim against source before accepting
  it — reviewers are sometimes wrong, and one confirmed false positive
  invalidates only that finding, not the reviewer.
- Reconcile: dedupe across reviewers (convergence raises confidence), judge
  each finding technically, and record explicit rejections with reasons —
  "working as intended, do not fix" items belong in the report so the
  executing agent cannot helpfully regress them.

## 4. Result

```markdown
## Adversarial review: `CLEAN` | `FIX_ROUND_REQUIRED` | `BLOCKED`

- **Diff:** <base>...<head sha>, <N> files
- **Gates:** <verify / pinned-Fallow / fresh-tsc results>

### What held

- <one line per verified load-bearing property>

### Findings

- <numbered, severity-tagged, grouped by theme; evidence inline>

### Rejected (working as intended)

- <finding → reason, or None>

### Next state

- **Fix prompt:** <the single fenced prompt below, or Not required>
- **Blocker:** <exact blocker or None>
```

The fix prompt is one fenced block, self-contained for an agent with no
conversation context: numbered fixes with exact paths, an explicit
do-not-change list, the verification command sequence from step 1, and the
commit/disclosure instructions. Operator-arbitration items appear as
recommendations with the alternative stated, never as silent choices.
