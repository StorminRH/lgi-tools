---
name: adversarial-review
description: >-
  Run LGI.tools' adversarial implementation review on a completed diff before
  its PR: truthful gates, parallel independent reviewers, verified findings,
  one report plus one executable fix prompt. Use for "adversarially review the
  diff", "comprehensive review with a fix prompt", "review the implementation
  on this branch", or a pre-PR review request outside close-out.
---

# Run the adversarial review

Procedure: `docs/workflows/adversarial-review.md`.

## Invocation authority

Invocation permits read-only review and gate execution only. No file in the
diff may be modified; no fix, commit, PR, or delivery authority is added. The
fix prompt is the sole change vehicle, executed by a separately authorized
agent.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Write the shared reviewer brief to a temporary path outside the repo.
- Area reviewers: parallel read-only Codex subagents at high effort.
- Cross-model reviewer: run the Claude CLI headless and read-only
  (`claude -p "$(cat <brief>)" --permission-mode plan`) from the long-lived
  terminal.
- Run the gates in the long-lived terminal; verify reviewer claims yourself
  before accepting them.

## Return

Render the canonical adversarial-review Markdown result exactly, with the fix
prompt as its single fenced block when fixes are required.
