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

Keep the repository read-only. Run only review-local commands and gates; do not
fix, commit, open a PR, merge, deploy, or mutate lifecycle state.

## Codex runtime mechanics

- Track the canonical phases with native Codex tasks and keep exactly one task
  active.
- Store the shared brief under a temporary directory outside the repository.
- Launch the area reviewers as parallel, read-only Codex subagents at high
  effort, with disjoint primary file assignments.
- Run the holistic cross-runtime reviewer from the persistent terminal after
  setting `ADVERSARIAL_REVIEW_BRIEF` to the brief's absolute path:

  ```bash
  claude -p --permission-mode plan --effort high --no-session-persistence \
    < "$ADVERSARIAL_REVIEW_BRIEF"
  ```

- Continue the orchestrator's own source review while reviewers run. Verify
  every accepted claim personally.

## Return

Render the canonical Markdown result without an outer fence. Include exactly
one fenced fix prompt only when the verdict is `FIX_ROUND_REQUIRED`.
