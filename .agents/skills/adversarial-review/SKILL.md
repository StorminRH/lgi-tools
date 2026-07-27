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
    < "$ADVERSARIAL_EXECUTION_BRIEF" \
    > "$ADVERSARIAL_EXECUTION_BRIEF.result.json" &
  ADVERSARIAL_EXECUTION_PID=$!

  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --model cursor-grok-4.5-high \
    --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    < "$ADVERSARIAL_HOLISTIC_BRIEF" \
    > "$ADVERSARIAL_HOLISTIC_BRIEF.result.json" &
  ADVERSARIAL_HOLISTIC_PID=$!

  ADVERSARIAL_REVIEW_FAILURE=0
  wait "$ADVERSARIAL_EXECUTION_PID" || ADVERSARIAL_REVIEW_FAILURE=1
  wait "$ADVERSARIAL_HOLISTIC_PID" || ADVERSARIAL_REVIEW_FAILURE=1
  if [ "$ADVERSARIAL_REVIEW_FAILURE" -ne 0 ]; then exit 1; fi

  ADVERSARIAL_EXECUTION_SESSION_ID=$(
    jq -er '.session_id' "$ADVERSARIAL_EXECUTION_BRIEF.result.json"
  )
  ADVERSARIAL_HOLISTIC_SESSION_ID=$(
    jq -er '.session_id' "$ADVERSARIAL_HOLISTIC_BRIEF.result.json"
  )

  ADVERSARIAL_COLLECTION_PROMPT='Return the review verdict now as plain text in the required format. Do not perform more investigation, edit files, or refer me to a plan artifact. Output only the Verdict, Findings, and Load-bearing checks sections.'

  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    --resume "$ADVERSARIAL_EXECUTION_SESSION_ID" \
    "$ADVERSARIAL_COLLECTION_PROMPT"

  cursor-agent --print --output-format json --mode plan --sandbox enabled \
    --workspace "$ADVERSARIAL_REVIEW_REPOSITORY" \
    --resume "$ADVERSARIAL_HOLISTIC_SESSION_ID" \
    "$ADVERSARIAL_COLLECTION_PROMPT"
  ```

- Use separate background jobs and capture each complete JSON result. Resolve
  each collection variable from the corresponding investigation result's
  `session_id`; the collection result text is the verdict of record.
- Do not add `--force`, `--yolo`, or `--approve-mcps`. Only an operator's
  explicit per-run authorization permits `--trust`; an interactive operator
  trust grant is the normal first-run path.
- Do not launch a duplicate Grok seat for a canonical escalation trigger.
  Follow the procedure's evidence-first reconciliation and return `BLOCKED`
  when an unresolved trigger needs an operator-approved frontier-model review.
- Continue the orchestrator's source review while the model reviews run. Verify
  every accepted claim personally and fail if the subject changes.

## Return

Render the canonical Markdown result without an outer fence. Include exactly
one fenced fix prompt only when the verdict is `FIX_ROUND_REQUIRED`.
