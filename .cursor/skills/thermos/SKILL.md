---
name: thermos
description: "Launch both thermo-nuclear review subagents within available slots, then synthesize their findings. Use for thermos, double thermo review, or combined bug/security and code-quality branch audits."
disable-model-invocation: true
---

# Thermos

Run both review seats concurrently when slots permit; otherwise run them
in batches against the same frozen head. Wait for both final verdicts
before synthesis. These reviews collect evidence and report findings;
the caller owns edits after the freeze.

## Workflow

1. The subject is the GitHub pull request number from the caller. Each seat
   runs `gh pr diff <N>`.
2. Launch both subagents with `run_in_background: true`, subject to available slots. Omit Task `model` so each named role keeps its pin:
   - `subagent_type: "thermo-nuclear-review-subagent"` for bugs, breakages, security, devex regressions, feature-flag leaks, and other branch-audit risks.
   - `subagent_type: "thermo-nuclear-code-quality-review-subagent"` for maintainability, structure, file-size growth, spaghetti, abstractions, and codebase-health risks.
3. Brief each subagent with the change number. Each seat runs
   `gh pr diff <N>` and reads the files on the branch.
4. After both finish, synthesize the results with findings first, deduplicated across reviewers. Validate overlapping findings against evidence; agreement alone is not proof. Report unresolved material disputes as `BLOCKED`. Return `PASS` when no accepted finding remains, `CORRECTIONS_REQUIRED` with the accepted list otherwise, or `BLOCKED` when a seat or load-bearing evidence is missing.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.
