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

Restrict the run to read-only review evidence. Repository edits, commits, PRs,
delivery, and lifecycle mutations remain outside this invocation.

## Claude Code runtime mechanics

- Represent the canonical phases with native Claude tasks and keep exactly one
  task active.
- Store the Grok brief, one-to-three selected Composer briefs, and all captured
  results in session-local temporary storage, never in the repository.
- Export task-specific variables for the repository, output directory, and
  briefs. Populate `ADVERSARIAL_COMPOSER_ARGS` with one
  `--composer-brief "scope=path"` entry for every frozen Composer scope.
- Use Bash to invoke the repository's shared concurrent runner:

  ```bash
  python3 .agent-local/run_adversarial_review.py \
    --repository "$ADVERSARIAL_REVIEW_REPOSITORY" \
    --output-dir "$ADVERSARIAL_REVIEW_OUTPUT" \
    --grok-brief "$ADVERSARIAL_GROK_BRIEF" \
    "${ADVERSARIAL_COMPOSER_ARGS[@]}"
  ```

- The utility fixes the reviewed model ids, runs all selected seats
  concurrently, resumes every captured session once, stores each complete JSON
  response, and prints only severity counts for the receipt table.
- Put that compact table in chat before triage. Keep every raw finding inside
  the captured review evidence rather than repeating it to the operator.
- Do not add `--force`, `--yolo`, or `--approve-mcps`. An operator's explicit
  authorization permits adding `--trust` to this runner invocation only;
  otherwise let the operator grant workspace trust interactively.
- A canonical escalation trigger does not start another Grok background job.
  Reconcile it from direct evidence; if a frontier review is still required,
  stop as `BLOCKED` for the operator instead of rerunning the current tier.
- Do not create Claude general-purpose review agents. Keep reviewing the
  highest-blast-radius owner while the Cursor seats run, use the stored verdicts
  for triage, verify every accepted claim directly, and fail if the subject
  changes.

## Return

Place the canonical concise Markdown result directly in chat. Give accepted
root causes back to the caller without composing an implementation prompt.
