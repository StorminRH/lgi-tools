---
name: close-out
description: >-
  Run LGI.tools' end-of-session sequence and, for a complete sub-version, the
  required design review before the PR/Greptile loop, clean merge, and production
  reconciliation. Use for "close out", "wrap up", "ship it", "finish up and
  merge", or "run the Greptile loop". Invocation grants conditional per-run
  merge authorization only after every clean gate passes.
---

# Close out an LGI.tools session

Sequence the canonical docs; do not duplicate them. Read
`docs/DESIGN_PRINCIPLES.md`, `docs/CODE_HEALTH_BASELINE.md`,
`docs/workflows/close-out.md`, `docs/SESSION_END.md`, `docs/SELF_REVIEW.md`, and
the current resolver directive.
Create a native Claude Code task list from every applicable
phase/gate, keep one active, and reopen invalidated verification after fixes.

Invocation authorizes this sub-version's squash merge only with a current-head
Greptile 5/5, zero unresolved findings, green CI, and a mergeable/CLEAN PR. It
does not authorize bypassing a gate or unrelated production work.

Follow `docs/SESSION_END.md` completely, including the narrow ignored local-state boundary,
the APP_VERSION/changelog rule for every completed sub-version, no
production-mode build before merge, and the canonical coverage-backed
current-head checkpoint. Do not rerun it merely because the workflow enters
pre-PR or PR-opening; rerun only evidence a later change invalidates. A
branch push creates no Vercel preview; any manual preview follows
the documented exception. Run `check_baseline_claims` and
`check_watch_triggers`; reconcile or explain every claims warning and surface
every `promote AF-NNN` warning to Ryan without auto-promoting it.

After delivery evidence exists, mark the approved session plan's execution
status Complete. If sessions remain, stop after commit/push/handoff. For a final session, present
`ux-check` evidence and pause for the operator when user-facing, then invoke
`pre-pr-design-review` and follow `docs/PRE_PR_DESIGN_REVIEW.md`. Reconcile any
changed hotspot surface in the baseline
before continuing. Only after that gate passes, follow `docs/PR_REVIEW.md`: use
`## What this does`, `## Why`, `## Notes`, `## Test plan`; require
`check_release_consistency.py --check --expect pre-pr` and
`scrub_pr_body.py --check --body-file ... --title ...` to block personal information;
create the body through
a temporary Markdown body-file and rerun the scrub on the published read-back
before polling; run the Greptile loop; perform the
merge-time re-read; merge under the authorization above; and finish browser-first
after-merge reconciliation.

After merge/reconciliation, mark a mapped `AF-NNN` finding Delivered only after
all of its remediation sub-versions have terminal merge evidence. Do not archive
here, and do not cut the next branch here. Run the resolver, report its directive,
and return control to `start-session`; close-out never selects the next lifecycle
handler itself. `start-session` opens the resolver-named branch at the start of the
next action and makes the carried lifecycle reconciliation that branch's first
commit, then requires `check_release_consistency.py --check --expect reconciled`;
the intentional one-PR lag never justifies a follow-up PR or direct push to
`main`. `verify_archive.py` belongs only to the resolver-selected version-audit
archive transition, not close-out.
Finish with the agent drift check.
