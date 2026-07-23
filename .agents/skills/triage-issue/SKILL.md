---
name: triage-issue
description: >-
  Triage an LGI.tools GitHub issue or contribution by retrieving it, validating
  every claim against current code and behavior, sizing the real scope, and
  returning evidence, a recommendation, and only the material response choices.
  Use for requests to triage, validate, assess, or handle an issue, bug report,
  or contributor PR. Stop after the report until the operator chooses a
  direction; never comment, label, implement, open a PR, review, or merge during
  triage.
---

# Triage an issue or contribution

Procedure: `docs/workflows/triage-issue.md`.

## Invocation authority

Invocation permits retrieval, validation, and recommendations. Outward actions require the operator's chosen direction.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Render the procedure's Markdown result without a code fence. Include evidence,
the recommendation, and only material choices; await operator direction.
