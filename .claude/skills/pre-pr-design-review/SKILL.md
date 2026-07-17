---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review", or
  when a final session is ready for external review.
---

# Run the pre-PR design review

<!-- shared-policy-revision: 19 -->

Follow `docs/PRE_PR_DESIGN_REVIEW.md` in full. Read
`docs/DESIGN_PRINCIPLES.md`, `docs/CODE_HEALTH_BASELINE.md`, the approved session
plan, and complete branch diff first. Create a native Claude Code task list from every
numbered review section, keep one active, and reopen invalidated gates after
fixes.

Fix all in-scope findings before the gate passes. If the branch changes a
measured hotspot surface, override, suppression, duplication state, or campaign
status, update the relevant baseline rows in the same change. Put the concise
outcome in the PR body's canonical `## Notes` and return to `close-out`. This
skill does not authorize a PR, merge, deployment, or archive.
