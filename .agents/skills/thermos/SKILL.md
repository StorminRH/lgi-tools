---
name: thermos
description: "Launch both thermo-nuclear review subagents in parallel, then synthesize their findings. Use for thermos, double thermo review, or combined bug/security and code-quality branch audits."
---

# Thermos

For agent launches, follow [Codex agent calls](../_shared/codex-agents.md).

Run the two thermo review passes as async background subagents in parallel, then synthesize their results.

## Workflow

1. The subject is the Origin change number from the caller. Each seat
   runs `origin pr diff <N>`.
2. Launch both subagents with `collaboration.spawn_agent`, subject to available slots:
   - `agent_type: "thermo-nuclear-review-subagent"` for bugs, breakages, security, devex regressions, feature-flag leaks, and other branch-audit risks.
   - `agent_type: "thermo-nuclear-code-quality-review-subagent"` for maintainability, structure, file-size growth, spaghetti, abstractions, and codebase-health risks.
3. Brief each subagent with the change number. Each seat runs
   `origin pr diff <N>` and reads the files on the branch.
4. After both finish, synthesize the results with findings first, deduplicated across reviewers. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.
