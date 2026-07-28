---
name: adversarial-review
description: >-
  Run a read-only adversarial review of an LGI.tools plan, implementation diff,
  or pull request with independent Cursor models and verified findings. Use
  when the operator asks to challenge a plan, review a branch or PR, validate a
  completed implementation, or independently test implementation readiness.
  Also runs from planning workflows and close-out without replacing approval,
  pre-PR design review, the external PR gate, implementation, or delivery.
---

# Run the adversarial review

Procedure: `docs/workflows/adversarial-review.md`.

## Invocation authority

Keep the repository read-only. Run only review-local commands and gates; do not
fix, commit, open a PR, merge, deploy, or mutate lifecycle state.

## Codex runtime mechanics

- Track the canonical phases with native Codex tasks and keep exactly one task
  active.
- Store the Grok brief, one-to-three selected Composer briefs, and all review
  captures under a temporary directory outside the repository.
- Resolve the repository, output directory, and brief paths into task-specific
  variables. Build `ADVERSARIAL_COMPOSER_ARGS` with one
  `--composer-brief "scope=path"` pair per frozen Composer scope.
- Run every selected investigation and collection turn through the shared
  concurrent runner from the persistent terminal:

  ```bash
  python3 .agent-local/run_adversarial_review.py \
    --repository "$ADVERSARIAL_REVIEW_REPOSITORY" \
    --output-dir "$ADVERSARIAL_REVIEW_OUTPUT" \
    --grok-brief "$ADVERSARIAL_GROK_BRIEF" \
    "${ADVERSARIAL_COMPOSER_ARGS[@]}"
  ```

- The runner pins `composer-2.5` and `cursor-grok-4.5-high`, launches the
  selected seats concurrently, resumes each `session_id` once, stores complete
  JSON captures, and emits only the compact severity-count summary.
- Render that summary as the canonical receipt table, state that triage is
  beginning, and do not expose raw reviewer findings in commentary.
- Do not add `--force`, `--yolo`, or `--approve-mcps`. Only an operator's
  explicit per-run authorization permits appending `--trust` to the runner
  command; an interactive operator trust grant is the normal first-run path.
- Do not launch a duplicate Grok seat for a canonical escalation trigger.
  Follow the procedure's evidence-first reconciliation and return `BLOCKED`
  when an unresolved trigger needs an operator-approved frontier-model review.
- Do not add review agents from the invoking runtime. Continue the
  orchestrator's source review while the Cursor seats run, inspect their
  captured verdicts during triage, verify every accepted claim personally, and
  fail if the subject changes.

## Return

Render the canonical concise Markdown result without an outer fence. Return
accepted root causes to the invoking workflow without generating a fix prompt.
