---
name: adversarial-review
description: Use before opening a PR to staging or main. Adversarial review with independent structure and behavior seats, plus thermos and no-comments, on a frozen plan or a development-to-staging or staging-to-main merge.
---

# Adversarial review

One frozen subject. Independent seats. Then `thermos` and `no-comments` on
code. Every accepted finding checked. One reconciled verdict.

Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`. One review round.

`BLOCKED` when a selected seat or skill returns no verdict, or load-bearing
evidence cannot be established.

Check every accepted seat finding against the verdict form in that seat's
agent file. Two seats agreeing is not proof. Fix clear in-scope defects on
code. Report contested, out-of-scope, or product-judgment items in chat. Plans
are report-only.

Prefer small deep interfaces, one owner per decision, current callers only,
edge cases absorbed below stable seams, behavior-preserving refactors, and
metrics as signals not design instructions.

Work lands on `development`. This skill is the review gate before merging
`development` onto `staging`, and before merging `staging` onto `main`.

## 1. Freeze

Done when the subject has a frozen identity and every change group has
authority.

Use the caller's subject when one is supplied. Otherwise pick the identity
that matches the ask:

- A plan. Path digest of the draft and its contract.
- Merge to staging. The PR onto `staging`, or `development` and `staging`
SHAs. Keep the tree still until verdicts return.
- Merge to main. The PR onto `main`, or `staging` and `main` SHAs. Keep the
tree still until verdicts return.
- Verified defects on a named diff or working tree. Base plus head or patch
digest, tree still until verdicts return.

Record authority and any operator emphasis. Stop if a change group has no
authority. List the files and areas the subject touches. Note which
verification ran, and which did not.

## 2. Select and launch seats

Done when every selected seat has returned its verdict form.


| Subject                                        | Launch                                       |
| ---------------------------------------------- | -------------------------------------------- |
| A plan                                         | `behavior-reviewer`                          |
| Merge to staging, merge to main, or other code | `structure-reviewer` and `behavior-reviewer` |


Add the other seat when the operator names it. Brief each seat with frozen
identity, authority, operator emphasis, and current evidence. Name a path or
symbol slice when one area is the point. Each seat gets a fresh brief. No
other seat's output.

Launch `structure-reviewer` or `behavior-reviewer` by those type names. Omit
Task `model` so the agent file pin applies.

If the first launch ran this chat's model, retry once the same way. Named
type, no `model`. A second wrong-model or format failure is `BLOCKED`.

## 3. Thermos and no-comments

Skip this step on a plan.

Done when `thermos` has returned its synthesized verdict and `no-comments`
has returned its report.

Run them on the same frozen subject. Read and follow
`.cursor/skills/thermos/SKILL.md`, then `.cursor/skills/no-comments/SKILL.md`.
Those files own their steps, seats, and pass rules. Treat their accepted
findings as this review's findings.

`thermos` first. It is read-only discovery. `no-comments` after accepted
code fixes from the seats and thermos, so its scope is the tree those fixes
left.

## 4. Verify

Done when every reported failure from the seats, `thermos`, and
`no-comments` is reproduced or disproved, and each root cause is accepted or
rejected once as `BLOCKER`, `MAJOR`, or `MINOR`.

Deduplicate by root cause. If seats or skills disagree on security, identity,
destructive data, migration, concurrency, or a public contract, and the
evidence cannot settle it, return `BLOCKED` and report the dispute in chat.

Report false positives and anything that needs operator judgment in chat.

Plans. `PASS` if clean. `CORRECTIONS_REQUIRED` if verified defects remain.
Code continues to the next step.

## 5. Fix code

Done when every accepted in-scope finding is fixed on the branch and the
focused test that covers the fix has been re-run, and `no-comments` has
finished on that tree.

If a fix would change product scope, structure, or policy, stop and report it
in chat as `BLOCKED` or `CORRECTIONS_REQUIRED`.

## Return

Render this form in chat. Exactly these four bullets. No fence, no second
summary above them.

## Adversarial review: `PASS` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** 
- **Result:** 
- **Action:** <continue, fix listed items, or operator decision>
- **Blocker:** <exact blocker or `None`>

`PASS` for code only when every accepted finding is fixed, `no-comments` has
reported, and nothing contested remains in chat. `PASS` is the review gate
for the named merge. It does not merge.