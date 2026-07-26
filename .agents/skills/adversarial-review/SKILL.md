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

Keep the repository read-only. Run only review-local commands and gates; do not
fix, commit, open a PR, merge, deploy, or mutate lifecycle state.

## Codex runtime mechanics

- Track the canonical phases with native Codex tasks and keep exactly one task
  active.
- Store both context-budgeted briefs under a temporary directory outside the
  repository.
- Resolve the repository and brief paths into `ADVERSARIAL_REVIEW_REPOSITORY`,
  `ADVERSARIAL_EXECUTION_BRIEF`, and `ADVERSARIAL_HOLISTIC_BRIEF`.
- Run the default reviewers concurrently from the persistent terminal:

  ```bash
  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --model composer-2.5 --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    < "$ADVERSARIAL_EXECUTION_BRIEF"

  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --model cursor-grok-4.5-medium \
    --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    < "$ADVERSARIAL_HOLISTIC_BRIEF"
  ```

- Use separate background jobs and capture each complete JSON result. Do not add
  `--force`, `--yolo`, `--trust`, or `--approve-mcps`.
- For a canonical escalation trigger only, run one fresh targeted brief with
  `--model cursor-grok-4.5-high` and the same read-only flags.
- Continue the orchestrator's source review while the model reviews run. Verify
  every accepted claim personally and fail if the subject changes.

## Return

Render the canonical Markdown result without an outer fence. Include exactly
one fenced fix prompt only when the verdict is `FIX_ROUND_REQUIRED`.
