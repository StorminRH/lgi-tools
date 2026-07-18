---
name: drive-session
description: >-
  Model-routing and delegated-execution rules for LGI.tools sessions. Use when
  executing an approved session plan (dispatch the sol executor), when fanning
  out exploration or mechanical sub-tasks to GPT workers, or when deciding
  which model handles a lifecycle stage. Complements start-session; never
  replaces its resolver directive, verification gates, or close-out.
---

# Drive a session with delegated model workers

<!-- shared-policy-revision: 22 -->

The orchestrating session owns judgment; delegated workers own volume. The
lifecycle spine — resolver directives, Plan-mode approvals, acceptance
verification, commits/push, the privacy scrub, the Greptile loop, merge, and
reconciliation — is never delegated. Greptile remains the review of record;
worker reviews are supplementary perspectives.

## Routing table

| Stage | Model / effort | Mode |
| --- | --- | --- |
| Planning, orchestration, acceptance, commits, PR, close-out | Orchestrating session (Claude main session) | native |
| Session execution — all sessions | `gpt-5.6-sol` @ high; **xhigh** when the approved plan tags the session harder (auth, migrations, cross-slice, complex backend) | `codex exec`, workspace-write |
| Plan review before approval; optional pre-PR final-diff second opinion | `gpt-5.6-sol` @ high | `codex exec`, read-only |
| Exploration fan-out during planning | `gpt-5.6-terra` @ high | `codex exec`, read-only, scoped self-contained prompts |
| Mechanical repo-navigating sub-tasks | `gpt-5.6-terra` @ medium | `codex exec`; worktree isolation when concurrent writers exist |
| Short-context piecework only | `gpt-5.6-luna` @ low–medium | never repo-wide or long-context work (documented long-context cliff) |
| Production deployment smoke | `gpt-5.6-terra` computer-use from the interactive codex TUI only — headless exec cannot start the Sky Computer Use service | fallback: Claude Chrome-extension browser review; last resort CLI runtime-log evidence with the caveat recorded |

Claude sonnet/haiku subagents are out of rotation; Claude tokens concentrate
on planning and judgment, GPT tokens on execution volume. Escalate model or
effort when output misses the bar — judge the output, not the price.

## Delegated execution procedure

1. Precondition: the resolver directive is an execute-mode dispatch with an
   approved plan matching its contract. Report the directive per
   `start-session` before any delegation.
2. Launch the executor as a background task:
   `codex exec -m gpt-5.6-sol -c model_reasoning_effort="high" -s workspace-write`
   with a self-contained prompt that names the approved plan and contract
   paths, scopes work to the plan's implementation steps, requires
   Graphify-first exploration, requires `pnpm verify` plus a final report
   (files changed, test evidence, deviations), and — load-bearing — requires
   the delegate to **stop before any commit, changelog, APP_VERSION bump,
   close-out, or PR**, even if its own lifecycle skills direct otherwise.
3. Question protocol: the prompt instructs the delegate to end its turn with
   `QUESTION FOR ORCHESTRATOR:` instead of guessing on anything
   scope-affecting. Answer from the plan, contract, policy, or code and
   continue with `codex exec resume --last "..."`. Surface to Ryan only
   operator-category decisions: scope changes, contradictions in the approved
   plan, destructive/production actions, UX taste.
4. Label every launched worker with its model in the task header
   (`sol@high: execute 3.9.4.1`, `terra: rename sweep`).
5. Acceptance gate, orchestrator-owned and never delegated: diff review
   against the plan; **re-run the DB suites — the codex sandbox blocks
   localhost, so `*.db.test.ts` suites silently SKIP inside delegated runs**;
   full `pnpm verify`; Fallow; comment-standard judgment. Two failed
   correction rounds → one retry at xhigh → then take the session over
   natively.
6. The orchestrator owns commits, push, and everything in
   `docs/SESSION_END.md` and `close-out` from that point on.
