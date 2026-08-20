---
name: adversarial-review
description: Use before every merge onto staging or main. Independent structure and behavior agents, then thermos and no-comments, on that frozen merge.
---

# Adversarial review

One frozen merge. Independent agents. Then `thermos` and `no-comments`.
Every accepted finding checked. One reconciled verdict.

Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`. One review round.

`BLOCKED` when a selected agent or skill returns no verdict, or load-bearing
evidence cannot be established.

Check every accepted finding against the verdict form in that agent's
file. Two agents agreeing is not proof. Fix clear in-scope defects on
code. Report contested, out-of-scope, or product-judgment items in chat.

Prefer small deep interfaces, one owner per decision, current callers only,
edge cases absorbed below stable seams, behavior-preserving refactors, and
metrics as signals not design instructions.

This skill is the review gate before every merge onto `staging` or
`main`. Plans and Ordered work use `structure-reviewer` and
`behavior-reviewer` from those skills.

## 1. Freeze

Done when the merge has a frozen identity and every change group has
authority.

Use the caller's subject when one is supplied. Otherwise pick the identity
that matches the ask:

- Merge to staging. The PR onto `staging`, or the ritual head and
  `staging` SHAs. Usual head is `development`. Keep the tree still
  until verdicts return.
- Merge to main. The PR onto `main`, or the ritual head and `main`
  SHAs. Usual head is `staging`. Keep the tree still until verdicts
  return.
- Verified defects on a named diff or working tree. Base plus head or patch
  digest, tree still until verdicts return.

Record authority and any operator emphasis. Stop if a change group has no
authority. List the files and areas the subject touches. Note which
verification ran, and which did not.

## 2. Select and launch agents

Done when every selected agent has returned its verdict form.

Launch `structure-reviewer` and `behavior-reviewer` in parallel. Add the
other agent when the operator names it. Brief each agent with frozen
identity, authority, operator emphasis, and current evidence. Name a path or
symbol slice when one area is the point. Each agent gets a fresh brief. No
other agent's output.

Launch those agents by type name. Omit Task `model` so the agent file pin
applies.

If the first launch ran this chat's model, retry once the same way. Named
type, no `model`. A second wrong-model or format failure is `BLOCKED`.

## 3. Thermos and no-comments

Done when `thermos` has returned its synthesized verdict and `no-comments`
has returned its report.

Run them on the same frozen subject. Read and follow
`.cursor/skills/thermos/SKILL.md`, then `.cursor/skills/no-comments/SKILL.md`.
Those files own their steps, agents, and pass rules. Treat their accepted
findings as this review's findings.

`thermos` first. It is read-only discovery. `no-comments` after accepted
code fixes from the agents and thermos, so its scope is the tree those fixes
left.

## 4. Verify

Done when every reported failure from the agents, `thermos`, and
`no-comments` is reproduced or disproved, and each root cause is accepted or
rejected once as `BLOCKER`, `MAJOR`, or `MINOR`.

Deduplicate by root cause. If agents or skills disagree on security, identity,
destructive data, migration, concurrency, or a public contract, and the
evidence cannot settle it, return `BLOCKED` and report the dispute in chat.

Report false positives and anything that needs operator judgment in chat.

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

`PASS` when every accepted finding is fixed, `no-comments` has reported,
and nothing contested remains in chat. `PASS` is the review gate for the
named merge. It does not merge.
