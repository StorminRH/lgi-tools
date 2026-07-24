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

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Write the shared reviewer brief to the session scratchpad, never the repo.
- Area reviewers: parallel read-only `general-purpose` subagents via the
  Agent tool.
- Cross-model reviewer: background Bash running
  `codex exec --model gpt-5.6-sol -c model_reasoning_effort='"high"'
  --sandbox read-only --skip-git-repo-check "$(cat <brief>)" < /dev/null` —
  the `< /dev/null` is required; an open stdin hangs codex indefinitely.
- Run the gates in background Bash; verify reviewer claims yourself before
  accepting them.

## Return

Render the canonical adversarial-review Markdown result exactly, with the fix
prompt as its single fenced block when fixes are required.
