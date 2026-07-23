---
name: triage-issue
description: >-
  Triage a GitHub issue or contribution for LGI.tools by retrieving it, validating
  every claim against current code and behavior, sizing the real scope, and
  reporting a recommendation plus relevant response choices. Use for requests
  such as "triage issue #160", "is this bug report real?", "handle this
  contribution", or "what should I do with this issue/PR?" Stop after the
  evidence-backed report until the user chooses a direction. Never comment,
  label, open a PR, implement a fix, or merge during the triage phase.
---

# Triage an issue or contribution

Procedure: `docs/workflows/triage-issue.md`.

## Invocation authority

Invocation permits retrieval, validation, and recommendations. Outward actions require the operator's chosen direction.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Use the canonical Markdown result directly in chat. Present the verdict,
evidence, recommendation, and choices, then await operator direction.
