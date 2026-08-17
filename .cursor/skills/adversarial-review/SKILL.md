---
name: adversarial-review
description: Review a plan, implementation diff, working tree, or pull request with independent subagents. Use before approving a plan, before opening a PR, or when asked to find verified defects.
---

# Run the adversarial review

Review one complete plan or implementation diff with independent subagents.
Verify every reported defect and return one concise reconciled result.

## Execution contract

One review round. Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`. Do not
auto-relaunch.

Return `BLOCKED` when a selected reviewer fails to return a verdict or
load-bearing evidence cannot be established.

Verify every accepted finding against the reviewer-verdict form inlined in each
reviewer. Reviewer agreement is not proof. Do not defer, backlog, or justify
findings away — fix clear in-scope defects on code, or report contested /
out-of-scope / product-judgment items in chat. Plan subjects are report-only.

**Design creed (code).** Prefer small deep interfaces, one owner per decision,
current callers only, edge cases absorbed below stable seams, behavior-preserving
refactors, and metrics as signals not design instructions.

## 1. Freeze

1. Record authority and any operator emphasis.
2. Freeze identity: plan path digests; or base/head SHAs; or working-tree base +
   patch digest (worktree stable until verdicts return); or PR + head SHA.
3. Stop if any logical change group lacks authority.
4. Inventory touched surfaces. Note verification status (or not-run).

## 2. Select roles

Launch each selected role once. Do not launch a role just because it exists.

| Context | Integrative seat (exactly one) |
| --- | --- |
| Ordinary / small one-off code | `primitive-checker` |
| Plans, large diffs, and other non-ordinary work | `holistic-reviewer` |

Plans: integrative only, unless operator emphasis names one scoped seat.

Code: integrative + up to two scoped seats; a third only when three distinct
judgment risks are present. Prefer `ownership-reviewer` for application or
backend behavior, `interface-reviewer` for user-facing UI, then
`architecture-reviewer` / `contract-reviewer` / `reliability-reviewer` only when
that risk is the material one.

Brief each role with: frozen subject identity, authority, operator emphasis,
and current evidence. For a scoped seat, name the primary path/symbol slice.
Do not hint expected defects or share other reviewers' output.

## 3. Launch

Launch one designed subagent per selected role.

- **Type.** `subagent_type` is the role name (`primitive-checker`,
  `holistic-reviewer`, `ownership-reviewer`, `interface-reviewer`,
  `architecture-reviewer`, `contract-reviewer`, or `reliability-reviewer`).
  Do not use `generalPurpose` or another built-in with a copied review prompt.
- **Model.** Omit Task `model` so the agent file pin applies. Do not pass
  `inherit` or a slug; those override the pin.
- **Retry.** If the first launch ran this chat's model, retry once the same
  way (named type, omit `model`). A second wrong-model or format failure is
  `BLOCKED`.

Deduplicate by root cause. If reviewers disagree on security, identity,
destructive data, migration, concurrency, or public contract and evidence
cannot settle it, return `BLOCKED` and report the dispute in chat.

## 4. Verify

1. Reproduce or disprove every reported failure.
2. Accept or reject each root cause once (`BLOCKER` / `MAJOR` / `MINOR`).
3. Report false positives and anything needing operator judgment in chat.

Do not re-run a second discovery pass that duplicates selected seats.

**Plans:** `PASS` if clean; `CORRECTIONS_REQUIRED` if verified defects remain.
**Code:** continue to §5.

## 5. Fix and close (code)

Fix accepted in-scope findings on the branch. Re-check with the focused test
that covers the fix. If a fix would change product scope, architecture, or
policy, stop and report it in chat (`BLOCKED` or `CORRECTIONS_REQUIRED`).

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Adversarial review: `PASS` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** <frozen identity>
- **Result:** <roles; clean or what remains; ≤2 sentences>
- **Action:** <continue, fix listed items, or operator decision>
- **Blocker:** <exact blocker or `None`>

`PASS` for code only when every accepted finding is fixed and nothing
contested remains in chat. `PASS` does not authorize opening a PR.
