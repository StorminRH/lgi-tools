---
name: adversarial-review
description: >-
  Run a read-only, cross-runtime adversarial review of a completed LGI.tools
  implementation diff before its PR. Use when the operator asks to
  adversarially review a branch, obtain independent area and cross-model
  findings, validate a completed implementation, or produce one executable fix
  prompt. Do not use inside close-out or as a replacement for pre-PR design
  review, Greptile, implementation, or delivery.
---

# Run the adversarial review

Procedure: `docs/workflows/adversarial-review.md`.

## Invocation authority

Restrict the run to read-only review evidence. Repository edits, commits, PRs,
delivery, and lifecycle mutations remain outside this invocation.

## Claude Code runtime mechanics

- Represent the canonical phases with native Claude tasks and keep exactly one
  task active.
- Store the shared brief in session-local temporary storage, never in the
  repository.
- Launch parallel read-only `general-purpose` area subagents through the Agent
  tool at high effort, with disjoint primary file assignments.
- Run the holistic cross-runtime reviewer in background Bash after setting
  `ADVERSARIAL_REVIEW_BRIEF` to the brief's absolute path:

  ```bash
  codex exec -c model_reasoning_effort='"high"' --sandbox read-only \
    --ephemeral - < "$ADVERSARIAL_REVIEW_BRIEF"
  ```

- Keep reviewing the highest-blast-radius owner while background work runs.
  Verify every accepted claim directly.

## Return

Place the canonical Markdown result directly in chat. Include exactly one fenced
fix prompt only for a `FIX_ROUND_REQUIRED` verdict.
