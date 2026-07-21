---
name: triage-issue
description: >-
  Triage a GitHub issue or contribution for LGI.tools by retrieving it, validating
  every claim against current code and behavior, sizing the real scope, and
  reporting a recommendation plus relevant response choices. Use for requests
  such as "triage issue #160", "is this bug report real?", "handle this
  contribution", or "what should I do with this issue/PR?" Stop after the
  evidence-backed report until the user chooses a direction. Never comment,
  label, open a PR, implement a fix, or merge during the triage phase.
---

# Triage an issue or contribution

<!-- shared-policy-revision: 28 -->

Produce a validated diagnosis before taking outward action. Read `CLAUDE.md` and
the recent changelog/scratchpad context that could reframe the report.

Create a native Claude Code task list from the numbered phases, keep one task
active, and require evidence before completion. Treat
`docs/DESIGN_PRINCIPLES.md` as the constitution when a validated report points
to broader design or boundary decay.

## Guardrails

- Verify claims; confidence, citations, and reported line numbers are not proof.
- Separate validity from scope. A correct symptom may still name the wrong cause
  or only one instance of a wider class.
- Keep triage read-only until the user chooses a direction.
- Surface wider scope as a choice rather than silently absorbing it.

## 1. Retrieve and decompose

Use `gh issue view <number> --comments` or the equivalent `gh pr view` and
`gh pr diff` reads. Identify each concrete claim, the author, offered
contribution, proposed direction, reproduction details, and affected versions.
Ask which issue/PR if none is identifiable.

## 2. Validate every claim

Query Graphify before broad source searches. Use `query`, `explain`, `path`, or
`affected`, then open the exact files and lines needed for proof.

For each claim, confirm current code and behavior, reproduce safely when useful,
distinguish application bugs from environment/auth/rate-limit/schema/deployment
failures, test the proposed root cause, sweep related instances, and check current
guides/plans/changelog/memory for intentional or superseded behavior.

Show tight evidence and assign independent verdicts:

- Validity: valid, partially valid, false positive, needs information,
  duplicate, or works as intended.
- Scope: trivial, contained, or tip of iceberg with the class named.

## 3. Report and wait

Lead with diagnosis, evidence, validity, scope, and a recommendation. Offer only
material choices: acknowledge/fix, request information, decline, duplicate,
contributor-versus-us implementation, or narrow-versus-wider scope. Explain the
tradeoff and put the recommended option first.

Use Claude's structured `AskUserQuestion` control when available; otherwise ask
directly. Stop until the user chooses. Do not post a response without approval.

## 4. Act only after the choice

For comments, draft in the project voice, credit the contributor, link
`CONTRIBUTING.md` when inviting a PR, and show the draft before posting.

For an in-house fix, obtain approval for a scoped plan unless truly trivial,
verify current library APIs when relevant, implement without scope expansion,
include `Fixes #<number>`, acknowledge the reporter, use `ux-check` for UI, and
use `close-out` for delivery.

Every completed sub-version receives an `APP_VERSION` bump and changelog entry,
including internal fixes. Only the UX review pause depends on whether the change
is user-facing.

For contribution PRs, validate the diff and CI before recommending approve and
merge, request changes, or decline. Greptile and CI remain the gates; use
`close-out` only after the user selects the merge path.
