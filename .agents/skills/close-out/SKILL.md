---
name: close-out
description: >-
  Run LGI.tools' end-of-session sequence: verify and commit the current session,
  and for a complete sub-version run the required pre-PR design review before
  the PR/Greptile loop, clean merge, and production reconciliation. Use for
  "close out", "do the session end", "wrap up", "ship it", "run the Greptile
  loop", "finish up and merge", or "take this to merge". Invocation is
  conditional per-run authorization to merge only after every clean gate passes.
---

# Close out an LGI.tools session

This skill sequences canonical documents and carries merge authorization; it
does not restate their procedures. Read `docs/DESIGN_PRINCIPLES.md` as the
constitution and `docs/CODE_HEALTH_BASELINE.md` as current health state.

## Authorization

Invocation authorizes the current sub-version's squash merge only when
`docs/PR_REVIEW.md` reports a current-head Greptile 5/5 with zero unresolved
findings, green CI, and a mergeable/CLEAN PR. It does not authorize merging past
a failed gate or any unrelated production action.

## Sequence

1. Read `docs/SESSION_END.md`, `docs/SELF_REVIEW.md`, and the current resolver
   directive. Create a native Codex todo list from every
   applicable phase and gate; keep one item in progress and reopen invalidated
   verification after fixes.
2. Follow `docs/SESSION_END.md` completely. A branch push creates no Vercel
   preview; use a manual preview only under that document's exception. Never run
   a production-mode build before merge. Every completed sub-version still gets
   its APP_VERSION bump and changelog entry under the PR document's rules. Run
   `check_baseline_claims` and `check_watch_triggers`; reconcile or explain every
   claims warning and surface every `promote AF-NNN` warning to Ryan without
   auto-promoting it.
3. After the required delivery evidence exists, mark the current approved
   session plan's execution status Complete. If sessions remain, stop after the
   verified commit/push and handoff.
4. For a final session, present `ux-check` evidence and pause for the operator when the
   work is user-facing.
5. Invoke `pre-pr-design-review` and require
   `docs/PRE_PR_DESIGN_REVIEW.md` to pass. Reconcile any changed hotspot surface
   in the baseline before external review.
6. Only then read and follow `docs/PR_REVIEW.md`: open the one PR using
   `## What this does`, `## Why`, `## Notes`, and `## Test plan`; run fresh
   `pnpm test:coverage` plus coverage-backed Fallow as required; complete the
   required personal information scrub; require
   `check_release_consistency.py --check --expect pre-pr` and
   `scrub_pr_body.py --check --body-file ... --title ...`; create the body through
   a temporary Markdown body-file and rerun the scrub on the published read-back
   before polling; complete the Greptile loop; perform the merge-time re-read;
   merge only under the authorization above; and complete browser-first
   after-merge reconciliation.
7. After merge/reconciliation, mark an audit finding Delivered only when all
   mapped sub-versions have terminal merge evidence. Do not archive here, and do
   not cut the next branch here. Run the resolver, report its directive, and
   return control to `start-session`; close-out never selects the next lifecycle
   handler itself. `start-session` opens the resolver-named branch at the start of
   the next action and makes the carried lifecycle reconciliation that branch's
   first commit, then requires
   `check_release_consistency.py --check --expect reconciled`;
   the intentional one-PR lag never justifies a follow-up PR or direct push to
   `main`. `verify_archive.py` is not run here: the resolver-selected
   `version-audit` handler owns its pre-copy and post-copy archive gates.

Finish by reconciling the narrow ignored local-state boundary and running
`python3 .agent-local/check_agent_drift.py`.
