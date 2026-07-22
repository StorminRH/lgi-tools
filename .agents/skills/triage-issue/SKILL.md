---
name: triage-issue
description: >-
  Triage an incoming GitHub issue or contribution for the LGI.tools repo: pull the
  issue, VALIDATE every claim against the actual codebase (diagnose-before-fixing —
  grep/read the cited files, confirm the line numbers and behavior, catch false
  positives, and judge whether it's a one-line fix or the tip of a wider problem),
  then REPORT a clear recommendation plus the response directions to choose from
  (acknowledge/comment, request more info, decline with a reason, invite the
  contributor to open the PR, fix it ourselves, or expand into a broader cleanup).
  Only after the user picks a direction does it act. Use this whenever a new issue
  or contributor PR comes in and you want to size it up before responding —
  phrasings like "triage this issue", "look at issue #160", "a contributor opened
  an issue", "someone filed a bug", "what should I do with this issue", "is this
  bug report real", "handle this contribution", "validate this issue". It NEVER
  posts a comment, opens a PR, or merges without the user's chosen direction.
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

Return the verdict, evidence, recommendation, and choices. Await the operator's direction.
