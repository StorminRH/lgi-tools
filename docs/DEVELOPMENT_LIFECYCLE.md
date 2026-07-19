# Development Lifecycle (LGI.tools)

**Audience:** agents planning, executing, reviewing, auditing, or advancing
LGI.tools work.
**Constitution:** `docs/DESIGN_PRINCIPLES.md`.
**Purpose:** define the artifact state machine that connects master version
plans, session contracts, approved session plans, delivery, version audits, and
archival. This document owns transition semantics; the lifecycle resolver is the
sole mechanical owner of current-state validation and handler selection, and the
stage documents own their procedures.

---

## 1. Artifact ownership

Each decision has one home:

| Artifact | Owns | Must not own |
| --- | --- | --- |
| `docs/VERSION_X_Y_PLAN.md` | Version goals, ordered sub-versions, dependencies, and delivery status | Detailed implementation steps |
| `docs/session-contracts/X.Y/<session>.md` | One session's objective, boundaries, constraints, decisions, and acceptance criteria | Live-code implementation design |
| `docs/session-plans/X.Y/<session>.md` | The approved, current implementation plan derived from a contract and live code | Product scope beyond the contract |
| `docs/version-audits/X.Y/PLAN.md` | The approved audit execution plan, cycle evidence, and stable finding ledger for one version | The lasting health snapshot; Watch promotion triggers (the ledger cites the AF id only) |
| `docs/CODE_HEALTH_BASELINE.md` | The single current code-health snapshot, campaign queue, and Watch promotion triggers (one fenced `watch-trigger` block per Watch finding) | Procedure or historical log |
| `docs/SCRATCHPAD.md` | Observed handoff and current operational state | Planned product intent |
| `docs/backlog.md` | Deferred, unassigned work | Active-session tasks |

`docs/SESSION_CONTRACTS.md` owns contract and session-plan schemas.
`docs/SESSION_PLANNING.md` owns detailed session planning.
`docs/PRE_PR_DESIGN_REVIEW.md` owns the pre-PR design gate.
`docs/VERSION_AUDIT.md` owns audit measurement and classification, including
the `watch-trigger` block grammar.

Machine-readable marker and vocabulary requirements bind 3.9-and-later
artifacts. Archived pre-3.9 material is never retro-edited; checkers treat it
as legacy.

### Resolved directive

`python3 .agent-local/resolve_development_state.py --pretty` returns the current
artifact state plus one `directive`. The directive is the complete internal
dispatch contract:

| Field | Meaning |
| --- | --- |
| `action` | Plain-language next action |
| `reason` | Evidence-backed reason this action is next |
| `handler` | The one stage skill that owns the action, or null when direction is required |
| `mode` | `plan`, `execute`, or `report` |
| `authority` | The exact mutation/approval boundary for this action |
| `primaryArtifact` | The contract, plan, or audit artifact controlling scope |
| `pause` | The next mandatory approval or operator stop |

`stage` remains diagnostic state; callers never recreate a stage-to-handler
table. `start-session` reports the directive's action, reason, authority,
artifact, and pause, dispatches only its handler, then reruns the resolver after
the handler's outcome. A stage handler never selects a sibling handler. After a
planning handler's outcome, the rerun's directive is reported but not
dispatched (§5: planning outcomes are session-terminal).

Default resolver output depends only on lifecycle artifacts. Opt-in `--git`
adds advisory `warnings` for branch naming, a dirty plan-mode worktree, and a
local `main` behind the existing `origin/main` ref; it never fetches, changes a
stage, or turns a warning into an error. `--check --git` prints those warnings
without failing an otherwise valid state.

## 2. Runtime todo invariant

Every repository skill begins by creating a native runtime todo list from the
skill's phases and the numbered sections in the authoritative documents it
drives.

- Create one todo per applicable phase or gate; include conditional branches
  only when they apply.
- Keep exactly one item in progress.
- Complete an item only when its required evidence exists.
- Add newly discovered required work to the list instead of tracking it only in
  conversation.
- If a fix invalidates an earlier verification result, reopen that verification
  item and rerun it.
- The todo list is ephemeral execution state. Never append it to contracts,
  plans, SCRATCHPAD, or the baseline as a session log.

## 3. Master plan to session contracts

An active master version plan must contain a `## Status` table whose first
column is the sub-version and whose last column is its status. The roadmap owns
status. Terminal states are:

- `SHIPPED`
- `COMPLETE`
- `DEFERRED`
- `CANCELLED`

Terminal states are an exact closed set: a status cell contains exactly one of
those four tokens and nothing else. Delivery evidence (PR numbers, deploy ids)
lives in the changelog and SCRATCHPAD, never in the status cell. Any other
state, including `PLANNED` or `IN PROGRESS`, keeps the version open. The
resolver reports a nonterminal value that embeds a terminal token (for example,
`INCOMPLETE`, `NOT SHIPPED`, or `SHIPPED (PR #247)`) as an error naming the
roadmap and offending value.

`plan-version` reads the master plan, constitution, baseline, and backlog. It
proposes the session decomposition in Plan mode, then writes or reconciles the
version's `session-contracts/X.Y/INDEX.md` and contract files only after Ryan
approves the decomposition. The index maps session ids to contract files; it
does not duplicate delivery status.

When a master plan changes:

- add a contract for newly approved sessions;
- treat a material change to an existing contract as a re-approval event;
- move genuinely deferred intent to `docs/backlog.md` before retiring its active
  contract;
- never silently rewrite an approved session plan to follow changed scope.

An audit remediation extension is the one deliberate way a terminal roadmap is
reopened. `plan-audit-remediation` appends approved rows to the same master
version and creates their contracts; it never invents a parallel remediation
plan or moves the findings into the next master version.

## 4. Session contract to approved session plan

The resolver selects the next incomplete session from the roadmap and contract
index. Its `plan-session` directive follows `docs/SESSION_PLANNING.md` against
live code. Plan mode stays read-only. After Ryan approves the plan and the
runtime returns to execution mode, persist it at:

```text
docs/session-plans/X.Y/<full-session-id>.md
```

An executable plan carries these markers near the top:

```markdown
**Plan status:** Approved
**Approved:** YYYY-MM-DD
**Contract:** `docs/session-contracts/X.Y/<session>.md`
**Contract digest:** `sha256:<digest-at-approval>`
**Planning standard:** `docs/SESSION_PLANNING.md`
**Execution status:** Pending
**Baseline effect:** Neutral
```

Marker values are exact closed vocabularies: `Execution status` is exactly
`Pending` or `Complete`; `Baseline effect` is exactly one of `Improves`,
`Neutral`, or `Temporary pressure` (defined in `docs/SESSION_PLANNING.md`
Step 7); a contract's `**UX gate:**` header marker is exactly `Yes` or `No`.
For 3.9-and-later artifacts, the resolver reports a present invalid value as an
error naming the artifact and value. A missing `Baseline effect` or contract
`UX gate` routes the session back to planning, while archived pre-3.9 artifacts
remain exempt. A selected `UX gate: Yes` contract places Ryan's local browser
review directly in the execution directive's pause.

An absent marker, changed contract, material live-code contradiction, or stale
dependency makes the plan non-executable until `plan-session` reconciles and
Ryan re-approves it. Close-out changes `Execution status` to `Complete` only
after that session's required commit/push or merge evidence exists. The resolver
skips completed session plans and selects the next indexed contract.

## 5. Session execution and delivery

`start-session` resolves the lifecycle before acting, reports the resolver-owned
directive, and follows only its named handler. A planning handler remains
read-only until approval; an execution directive reconciles the approved plan
with live state before creating its implementation todo list. Missing product
direction or an invalid state has no handler and stops at the directive's pause.
After any handler outcome, `start-session` reruns the resolver rather than
predicting whether the next action is planning, execution, audit, remediation,
restart, or archival.

Lifecycle artifacts are tracked, but their terminal delivery evidence exists
only after merge. Close-out therefore reconciles the local artifacts immediately
after merge, reruns the resolver, and only then creates and names the branch for
the resolver-selected next lifecycle action. That reconciliation is the branch's
first commit and must pass `check_release_consistency.py --check --expect
reconciled`. The remote copy intentionally has a one-PR lag. Never mark delivery
terminal before evidence exists, choose a reconciliation branch before the
resolver rerun, open a second PR solely for reconciliation, or push directly to
`main` to eliminate the lag.

Planning handlers may use the headless GPT workers defined in `AGENTS.md` to
author their planning artifact. A fresh read-only `gpt-5.6-sol` xhigh worker
adversarially reviews every complete draft before Ryan sees it. The primary
planning session reconciles that feedback and retains all judgment,
operator-question, approval, and persistence ownership. After loading context
and before drafting, every planning handler discusses the intended shape of
its artifact with Ryan in plain English. Before asking for approval, it
presents a short plain-English summary alongside the formal reviewed artifact
so the intended outcome, important tradeoffs, and scope boundary are
understandable without reading the full artifact first.

**Planning outcomes are session-terminal: a session that planned an artifact
never executes it.** Runtime plan-mode acceptance authorizes artifact
persistence only. After a planning handler persists its approved artifact,
`start-session` reports the resolver's new directive and stops instead of
dispatching it; execution begins in a fresh `start-session`, whichever runtime
runs it. This is a session boundary, never a runtime assignment.

The approved session plan is the execution scope. The contract remains the
product boundary. Material scope or design changes return to Plan mode and
require an updated approved plan.

After implementation, `pre-pr-design-review` runs before `docs/PR_REVIEW.md`.
`close-out` follows `docs/SESSION_END.md`, invokes that design gate for a final
sub-version session, then follows the PR/review loop. Close-out updates the
roadmap status only when merge or the required non-code completion evidence is
real.

## 6. Version completion, remediation, and audit transition

When every master-plan status row is terminal, the version is implementation-
complete for its current roadmap but not lifecycle-complete.

1. The final close-out leaves the master plan, contracts, and session plans
   active and writes the resolver-selected audit planning or restart handoff to
   SCRATCHPAD.
2. The next lifecycle-aware skill must resolve the terminal roadmap rather than
   assuming it is ready to archive.
3. If `docs/version-audits/X.Y/PLAN.md` is absent or unapproved, the resolver
   selects `plan-version-audit` to derive it from the static audit procedure and
   the version's actual artifacts.
4. If the audit plan is Approved, the resolver selects `version-audit`.
5. If the audit records any confirmed Floss or Campaign, set
   `Audit status: Remediation required`, keep stable `AF-NNN` findings Open, and
   let the resolver select `plan-audit-remediation`.
6. After approval, that skill appends sub-version rows/contracts, marks the
   mapped findings Planned, and sets `Audit status: Remediation in progress`.
   Normal `plan-session`, `start-session`, and `close-out` own delivery.
7. Close-out marks a finding Delivered only after every mapped sub-version has
   terminal merge evidence. When all remediation rows are terminal, the
   resolver directs `version-audit` to restart the complete audit against
   current canonical `main`.
8. A fresh audit marks Delivered findings Verified only when their required
   outcomes hold. Reopened or new actionable findings repeat this loop using
   the next available sub-version numbers in the same master version.
9. Do not plan the next version or archive the current one before the audit is
   Complete.

An audit plan carries:

```markdown
**Audit status:** Approved
**Approved:** YYYY-MM-DD
**Version:** X.Y
**Audit mode:** Version close
**Audit cycle:** 1
**Audited ref:** <full lowercase commit SHA>
**Procedure:** `docs/VERSION_AUDIT.md`
**Procedure digest:** `sha256:<digest-at-approval>`
```

An explicitly requested in-version health pass uses `**Audit mode:** Periodic`;
it refreshes the baseline but never enters the archival transition. A completed
periodic plan is replaced by a separately approved version-close plan after all
roadmap rows become terminal.

The audit plan also carries one stable finding ledger:

```markdown
| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| AF-001 | 1 | Campaign | ... | ... | X.Y.N | Open |
```

Finding status is `Open`, `Planned`, `Delivered`, `Verified`, or `Watch`.
Floss and Campaign are actionable; Watch is non-blocking only with a measurable
promotion trigger. The resolver treats a stale procedure digest as
`audit-plan-needed` in every audit state; `plan-version-audit` reconciles the
procedure without erasing cycle evidence or findings.

`version-audit` changes `Audit status` to `Complete` only after every actionable
finding is Verified, the current cycle produces no new actionable finding, the
baseline matches `Audited ref`, and all verification/archive preconditions hold.

## 7. Archive and repeat

After the audit completes, archive one verified version bundle:

```text
../LGI Tools Document Archive/versions/X.Y/
├── VERSION_X_Y_PLAN.md
├── session-contracts/
├── session-plans/
└── version-audits/
```

Before copying or removing active files, run `python3
.agent-local/verify_archive.py --check --phase pre`. It mechanizes preconditions
1–4 below. After the copy and before removing the active sources, run `python3
.agent-local/verify_archive.py --check --phase post`; it additionally requires
every archived roadmap, contract, session plan, and audit-plan file to be
byte-identical to its active source.

The complete transition remains:

1. verify every roadmap row is terminal;
2. verify the audit plan says `Complete`;
3. verify every Floss/Campaign finding is Verified and the current audit cycle
   contains no new actionable finding;
4. verify `docs/CODE_HEALTH_BASELINE.md` contains the audited version and exact
   `Audited ref`;
5. copy/move the complete bundle and verify the destination contents;
6. update SCRATCHPAD and any active-document pointers;
7. run the workflow-state resolver and agent drift check.

`docs/CODE_HEALTH_BASELINE.md` is never archived or reset. It is the continuity
between versions. If no next master version plan exists after archival, stop for
Ryan's product direction rather than extrapolating product goals from health
metrics alone.

## 8. Health feedback loop

The baseline influences every stage without becoming policy:

- `plan-version` selects at most one elective queued structural campaign for a
  new version, or records why none is scheduled. The cap does not apply to
  archive-blocking audit remediation: every confirmed Campaign and Floss is
  scheduled before the audited version can close.
- Each contract names any hotspot it touches.
- Each session plan declares its expected baseline effect: `improves`, `neutral`,
  or a justified temporary pressure that the same version resolves.
- Any skill or workflow that changes a measured hotspot surface updates the
  affected baseline rows in the same change; pre-PR review verifies the targeted
  overwrite and its refreshed snapshot identity.
- The version audit fully remeasures and overwrites the baseline.
- The next master plan reads that refreshed state.

Metrics rank attention; `DESIGN_PRINCIPLES.md` determines whether a change is an
actual design improvement.
