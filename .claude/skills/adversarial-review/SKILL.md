---
name: adversarial-review
description: >-
  Run a read-only adversarial review of an LGI.tools plan, implementation diff,
  or pull request with independent Cursor models and verified findings. Use
  when the operator asks to challenge a plan, review a branch or PR, validate a
  completed implementation, or produce one executable fix prompt. Also runs
  from planning workflows and close-out without replacing approval, pre-PR
  design review, the external PR gate, implementation, or delivery.
---

# Run the adversarial review

Procedure: `docs/workflows/adversarial-review.md`.

## Invocation authority

Restrict the run to read-only review evidence. Repository edits, commits, PRs,
delivery, and lifecycle mutations remain outside this invocation.

## Claude Code runtime mechanics

- Represent the canonical phases with native Claude tasks and keep exactly one
  task active.
- Store both context-budgeted briefs in session-local temporary storage, never
  in the repository.
- Export the resolved repository and brief paths as
  `ADVERSARIAL_REVIEW_REPOSITORY`, `ADVERSARIAL_EXECUTION_BRIEF`, and
  `ADVERSARIAL_HOLISTIC_BRIEF`.
- Run the default reviewers concurrently in background Bash:

  ```bash
  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --model composer-2.5 --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    < "$ADVERSARIAL_EXECUTION_BRIEF"

  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --model cursor-grok-4.5-medium \
    --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    < "$ADVERSARIAL_HOLISTIC_BRIEF"
  ```

- Capture each complete JSON result. Do not add `--force`, `--yolo`, `--trust`,
  or `--approve-mcps`.
- If the canonical escalation rule fires, use the same read-only flags for one
  fresh targeted `--model cursor-grok-4.5-high` run.
- Keep reviewing the highest-blast-radius owner while the model reviews run.
  Verify every accepted claim directly and fail if the subject changes.

## Return

Place the canonical Markdown result directly in chat. Include exactly one fenced
fix prompt only for a `FIX_ROUND_REQUIRED` verdict.
