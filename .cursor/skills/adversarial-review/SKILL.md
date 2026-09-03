---
name: adversarial-review
description: Use on an Origin draft and before every merge onto staging or main. Independent structure and behavior agents, then thermos, on a freeze after the comment pass. Reviewers run origin pr diff.
---

# Adversarial review

The comment pass already wrote. One freeze. Independent agents. Then
`thermos`. Every freeze seat returns before the caller batches. One
review round.

Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`.

`BLOCKED` when a selected agent or skill returns no verdict, or
load-bearing evidence cannot be established.

Check every accepted finding against the verdict form in that agent's
file. Two agents agreeing is not proof. Report contested,
out-of-scope, or product-judgment items in chat.

Prefer small deep interfaces, one owner per decision, current callers
only, edge cases absorbed below stable seams, behavior-preserving
refactors, and metrics as signals not design instructions.

This skill is the freeze review on an Origin draft, including every
merge onto `staging` or `main`. Close-out runs `no-comments` and
`comment-sicko` before the GitHub mirror and this freeze. Plans and
Ordered work use `structure-reviewer` and `behavior-reviewer` from
those skills.

## 1. Freeze

Done when the Origin change has a frozen identity, the tree is
still, the comment pass already wrote, and every change group has
authority.

The subject is that Origin change. Brief every freeze seat with the
change number. Each seat runs `origin pr diff <N>`.

Use the caller's change number when one is supplied. Otherwise
the open draft for this head:

- Merge to staging. Usual head is `development`.
- Merge to main. Usual head is `staging`.
- Another Origin draft. That change number.

Record authority and any operator emphasis. Stop if a change
group has no authority. Note which verification ran, and which
did not. Keep the tree still until every selected freeze seat has
returned.

## 2. Select and launch agents

Done when every selected freeze seat has returned its verdict form.

Launch `structure-reviewer`, `behavior-reviewer`, and `thermos` in
the same turn. Add the other agent when the operator names it.
Brief each seat with the change number, authority, and operator
emphasis. Each seat gets a fresh brief. The brief is the change
number.

Launch those agents by type name. Omit Task `model` so the agent
file pin applies. `thermos` is the skill; it launches both thermo
seats.

If the first launch ran this chat's model, retry once the same
way. Named type, no `model`. A second wrong-model or format
failure is `BLOCKED`.

## 3. Thermos

Done when `thermos` has returned its synthesized verdict.

Read and follow `.cursor/skills/thermos/SKILL.md`.

Treat accepted findings from `thermos` as this review's findings.

## 4. Verify

Done when every reported failure from the agents and `thermos` is
reproduced or disproved, and each root cause is accepted or
rejected once as `BLOCKER`, `MAJOR`, or `MINOR`. The tree is still
the freeze head.

Deduplicate by root cause. If agents or skills disagree on
security, identity, destructive data, migration, concurrency, or
a public contract, and the evidence cannot settle it, return
`BLOCKED` and report the dispute in chat.

Report false positives and anything that needs operator judgment
in chat.

## Return

Render this form in chat. Exactly these four bullets. No fence,
no second summary above them. The caller batches accepted
findings after Bugbot and GitHub mirror review are idle.

## Adversarial review: `PASS` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** Origin `<N>`; `origin pr diff <N>`
- **Result:**
- **Action:** <continue, batch listed items, or operator decision>
- **Blocker:** <exact blocker or `None`>

`PASS` when no accepted finding remains. `CORRECTIONS_REQUIRED`
when the caller has an accepted list to batch. `PASS` is the
review gate for the named merge when the list is empty. It does
not merge.
