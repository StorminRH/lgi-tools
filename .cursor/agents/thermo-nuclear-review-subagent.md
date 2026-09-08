---
name: thermo-nuclear-review-subagent
model: grok-4.6[effort=xhigh,fast=true]
description: Thermo-nuclear branch audit (bugs, breaking changes, security, devex, feature-flag leaks) scoped to an GitHub PR. Invoked via a Codex subagent with a change number. Runs gh pr diff. Loads rubric from the local thermo-nuclear-review skill.
---

Resolve the repository root from the caller's workspace before work.
Read `.agents/skills/_shared/roles/thermo-nuclear-review-subagent.md` from that root and follow it.
This is a file-read instruction, not an automatic include. If unavailable,
return BLOCKED with the resolved path. Keep this native role's model and
permissions; the shared contract grants no extra authority.
