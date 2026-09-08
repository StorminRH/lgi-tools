---
name: adversarial-review
description: Review a frozen whole PR with independent structure, behavior and both thermo seats; required before staging/main merges.
---

# Adversarial review

Use [agent calls](../_shared/agent-calls.md). This is the independent review
gate for the whole GitHub PR, including every merge onto staging or main.
[Delivery](../../../docs/workflows/delivery.md) owns preparation, freeze,
bots, adjudication and merge; it must have completed candidate/comment work
before this review. Plans and Ordered work retain their scoped reviewers.

1. Verify the caller's repository, PR, head/base branches and SHAs,
   authority and operator emphasis. Each seat reads the actual whole PR
   diff and files at those revisions. Keep the freeze while every seat runs.
2. Launch fresh `structure-reviewer` and `behavior-reviewer` seats; follow
   [thermos](../thermos/SKILL.md) for both thermo seats. Respect available
   capacity, batching seats on the same freeze. Add operator-named reviewers.
   Preserve native pins and permissions. Every selected seat must return.
3. Collect and validate every verdict; deduplicate by cause. Evidence, not
   reviewer agreement, settles a claim. Report false positives with reasons.
   Unresolved security, identity, destructive-data, migration, concurrency or
   public-contract disputes are `BLOCKED`; preserve operator decisions.
4. Return accepted findings to the caller without changing source. The
   caller waits for configured bots as well, then owns the settled fix batch
   in delivery. A changed freeze requires refreshed affected review.

If runtime metadata confirms a wrong model, retry once by named role with
no override. A second confirmed mismatch or verdict-format failure is
`BLOCKED`. Unavailable backend identity is `Not observable`; configuration
or a child's self-report cannot establish effective model identity.

Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`, with exact frozen
subject, each accepted finding and evidence, next action and blocker.
`PASS` requires all seats and no accepted outstanding finding. It grants
no merge authority.
