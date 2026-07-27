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

- Capture each complete JSON result. Read `session_id` from each investigation
  response into its matching collection variable, and treat the resumed
  response's text as that seat's recorded verdict.
- Do not add `--force`, `--yolo`, or `--approve-mcps`. An operator's explicit
  authorization permits `--trust` for one run only; otherwise let the operator
  grant workspace trust through Cursor's interactive prompt.
- A canonical escalation trigger does not start another Grok background job.
  Reconcile it from direct evidence; if a frontier review is still required,
  stop as `BLOCKED` for the operator instead of rerunning the current tier.
- Keep reviewing the highest-blast-radius owner while the model reviews run.
  Verify every accepted claim directly and fail if the subject changes.

## Return

Place the canonical Markdown result directly in chat. Include exactly one fenced
fix prompt only for a `FIX_ROUND_REQUIRED` verdict.
