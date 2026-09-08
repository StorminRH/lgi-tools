---
name: thermos
description: "Launch both thermo-nuclear review subagents within available slots, then synthesize their findings. Use for thermos, double thermo review, or combined bug/security and code-quality branch audits."
disable-model-invocation: true
---

# Thermos

Use [agent calls](../_shared/agent-calls.md). Launch
`thermo-nuclear-review-subagent` and
`thermo-nuclear-code-quality-review-subagent` with the same repository,
GitHub PR, frozen head/base SHAs, authority and relevant source paths.
Each seat reads the whole PR and retains its native pin/permissions.
Run concurrently within available capacity or in batches on one freeze.

Collect both final verdicts before synthesis. Deduplicate by root cause and
validate against evidence; consensus alone is not proof. Return `PASS`
when no accepted finding remains, `CORRECTIONS_REQUIRED` with the accepted
list, or `BLOCKED` for a missing seat, unresolved material dispute or
load-bearing evidence gap. The parent owns edits after all reviews settle.
