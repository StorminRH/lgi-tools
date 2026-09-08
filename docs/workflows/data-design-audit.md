# Data-design audit

Audit one coherent domain slice per run using the shared [data-design
standard](../contributing/data-design.md). The [coverage inventory](data-design-inventory.md)
provides starting seams. Families organize the rotation; a family can require
several runs. A clean result is valid and creates no PR.

This workflow is prepared for the Cursor replacement described in
[LGI-118](https://linear.app/lgitools/issue/LGI-118). Activation is a separate
transition. Repository guidance does not schedule a worker.

## Run

1. Read the configured Linear checkpoint and applicable repository rules. Resolve
   the authoritative forge, repository, and development branch from the current
   delivery workflow. Record the base SHA. After the GitHub cutover is verified,
   target GitHub `development`. Before then, preserve Origin drafts and links.
   Confirm no other run owns this rotation before taking its single-run guard.
   If the scheduler cannot enforce one active run, activation remains blocked.
2. Reconcile the prior run and open or rejected findings. Check whether proposals
   were merged, closed without merging, rejected with an accepted rationale, or
   remain open. Check relevant code and deployment evidence. A merged PR alone
   does not complete hosted contraction. Resume an interrupted slice at its last
   durable step after checking whether its source changed.
3. Select the oldest unaudited runnable slice from the recorded cursor. Retain
   Held work and active migration gates. Record blocked slices with an owner,
   reason, and reassessment trigger, then advance to a disjoint runnable slice.
   An urgent assigned incident can preempt with an explicit note preserving the
   next position. Unrelated backlog cannot disable the rotation indefinitely.
4. Freeze a scope comprising named tables, paths, invariant, producers, consumers,
   API types, and client state. Set the investigation boundary before research.
   Start with a proposed 45-minute budget and calibrate it after two dry-runs.
   Split a large seam into named sub-slices with completion boundaries; time
   expiry records partial work, not a clean result.
5. Use the active harness's supported named agents for repository mapping,
   external documentation, and needed tests, following its repository rules.
   Give focused briefs and collect compact evidence packets. Keep raw logs and
   broad tool responses outside the coordinating context. Apply all five shared
   lenses to this scope. Trace intentional denormalization and migration history
   before proposing a change. Use authorized read-only deployed metadata and
   bounded aggregates where needed; record unavailable evidence as unverified.
6. Classify the result using the outcomes below. Deduplicate by domain, invariant,
   and affected paths against tracked and previously rejected work. A rejected
   idea needs new evidence or a changed requirement before reopening.
7. For an authorized bounded correction, follow the current delivery workflow to
   prepare one coherent draft. State the old invalid state or demonstrated cost,
   the proposed representation, consumer impact, tradeoffs, and meaningful
   verification. Larger or destructive transitions first need a sequenced
   migration proposal with rollout gates. This automation does not merge or
   execute production migrations.
8. Persist the result and next cursor to Linear, even when no PR exists. Record
   the completed step before yielding or ending a timed-out run. Release the
   run guard after the checkpoint is durable. Stop at the selected scope; a run
   need not find a defect to justify its work.

## Outcomes and review capacity

| Outcome | Record and next action |
| --- | --- |
| No actionable finding | Name the audited scope, SHA, five-lens evidence, and limits. Mark that scope audited and advance. Create no cosmetic PR. |
| Existing tracked finding | Link the existing issue or draft and add only new evidence. Mark audit completion separately from its remediation. |
| New actionable finding | Record the failing invariant and evidence. Prepare a bounded draft only if authorized and the draft slot is free; otherwise queue the finding. |
| Partial or blocked | Keep the unfinished boundary and missing evidence visible. Resume when runnable; allow disjoint coverage to advance. |

At most one unresolved remediation draft from this automation may exist. While
it awaits review, audit-only runs can cover disjoint slices and attach findings
to Linear. They cannot create a second implementation draft or edit the pending
branch to occupy the slot. Same-file conflicts remain recorded deferrals.

Audit completion and remediation completion are independent. A fully audited
slice can have an open fix. A timed-out slice is not clean, and a closed-unmerged
PR is not fixed. Resolve a finding only with accepted rationale or applicable
code plus the required deployment and backfill evidence.

## Durable checkpoint

Use [LGI-118](https://linear.app/lgitools/issue/LGI-118) as the initial rotation
state owner. If state moves to a successor issue or document, link both
locations and update the configured worker pointer before the next run. Keep a
short current index separate from historical result comments. Repo commits are
for guidance or implementation, not per-run bookkeeping.

The current index contains these fields:

- Cycle, ordered family and sub-slice IDs, and the next runnable cursor.
- Inventory revision, newly discovered tables or changed consumers, and their
  queued family/sub-slice. Derive changes from the inventory's source owners.
- Active run identity, guard owner, start time, audited base SHA, and last
  completed step. Re-delivery of the same run updates its existing checkpoint.
- Scope tables and paths; deployed environment/schema identity and observation
  time where inspected; explicit source-only or inaccessible portions.
- Audit status and outcome; remediation status; linked issue/PR and version;
  accepted rationale or evidence still required for resolution.
- Skipped or blocked slices, cause, owner, reassessment trigger, and resume
  boundary. Preserve these when the cursor advances.

Each result packet contains the scope, invariant, producer/consumer evidence,
all five lens conclusions, proposed change or no-finding rationale, tradeoffs,
verification actually performed, gaps, source/artifact links, and next cursor.
Keep test execution distinct from static reasoning and prior test evidence.

On interruption, reconcile the recorded SHA and last step before resuming.
Repeat only invalidated investigation. A stale guard requires checking that its
worker has ended before takeover. If that cannot be established, leave the
rotation blocked rather than run concurrently.

After a full cycle, enqueue new and materially changed domains first and retain
an age-based full sweep of unchanged domains. After two clean complete cycles,
propose a lower cadence. Measure coverage, accepted useful fixes, recurrence,
review burden, and usage. Finding, PR, table-deletion, and test counts are not
success quotas.

## Transition and activation

Preserve unfinished representation slices in
[LGI-47](https://linear.app/lgitools/issue/LGI-47), assigned work in
[LGI-99](https://linear.app/lgitools/issue/LGI-99), and these existing owners:

| Work | Reconcile before overlap |
| --- | --- |
| Targeted signature lookup | [LGI-109](https://linear.app/lgitools/issue/LGI-109), existing Origin draft 152 |
| Deferred index removal | [LGI-110](https://linear.app/lgitools/issue/LGI-110) and its consumer evidence |
| Online-state cutover | [LGI-57](https://linear.app/lgitools/issue/LGI-57) and [LGI-49](https://linear.app/lgitools/issue/LGI-49) |
| Map lifecycle cutover | [LGI-71](https://linear.app/lgitools/issue/LGI-71) and [LGI-73](https://linear.app/lgitools/issue/LGI-73) |
| Hosted migration, backfill, and contraction | [LGI-111](https://linear.app/lgitools/issue/LGI-111) |

These are transition references, not assertions of their current status. Refresh
their live states before activation or a related audit.

Activate only after the shared guidance and entrypoints are available on the
authoritative branch, the Linear index is initialized, dry-runs are reviewed,
Cursor repository/Linear access and model/usage settings are verified, and the
GitHub cutover is ready. Verify the supported single-run guard. Then disable
only the overlapping Grok Thursday representation responsibility, update Project
Lead routing and the house guide, and enable the replacement. Preserve other
Data Store work and confirm the old and new workers cannot write the same scope
concurrently.

The proposed initial slot is Thursday at 14:00 `America/New_York`, weekly. The
schedule must retain that timezone through daylight-saving changes. Adjust
cadence only after reviewing actual slice size, review backlog, and Cursor usage.
Track that usage separately from GitHub CI costs.

## Dry-run contract

Before activation, record evidence for a historical invalid-state slice, its
already-fixed current form, a legitimate projection, unavailable live access,
interruption/resume, an overlapping open PR, and a no-finding slice. The
[inventory's historical probes](data-design-inventory.md#historical-probes)
provide source-backed starting cases. Static walkthroughs are useful design
checks; label them static. They do not prove Cursor model binding, access,
scheduler exclusion, usage limits, or successful runtime execution.

For a clean-slice check, apply all five lenses to a bounded current scope and
explain why no actionable change follows under its evidence limits. Do not
broaden scope until a finding appears. Verify that the resulting checkpoint
advances and no cosmetic PR is created. Simulated unavailable-access and resume
cases must retain their missing evidence and unfinished steps.

## Cursor setup prompt

The prepared prompt routes to this workflow. It becomes runnable only after the
activation conditions above are satisfied.

> Read `docs/workflows/data-design-audit.md` from the authoritative LGI.tools
> repository and the configured Linear rotation checkpoint, initially LGI-118.
> Audit the next runnable slice using `docs/contributing/data-design.md` and
> applicable domain guidance. Follow the workflow's scope, evidence, draft,
> concurrency, and checkpoint rules. A no-finding result is valid. Keep noisy
> research and test output isolated and return the compact evidence packet.
> Do not merge or execute production migrations.
