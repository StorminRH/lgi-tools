---
name: plan-version
description: >-
  Internal lifecycle handler that turns an LGI.tools master version plan into
  approved, ordered session contracts. Normally dispatched by start-session;
  use directly for "plan the version", "break this roadmap into sessions", "generate
  session contracts", "extrapolate the master plan", or missing/stale contracts.
---

# Plan an LGI.tools version

<!-- shared-policy-revision: 18 -->

Use Claude Code Plan mode and the native task list. Sequence
`docs/DEVELOPMENT_LIFECYCLE.md` and `docs/SESSION_CONTRACTS.md`; do not duplicate
them. Read `docs/DESIGN_PRINCIPLES.md` and `docs/CODE_HEALTH_BASELINE.md` first.

Run the lifecycle resolver and require its directive to name `plan-version` as
the handler. Otherwise report it and return control to `start-session`; never
select a sibling handler here. Read the active master plan/SCRATCHPAD/backlog and
create one task per applicable contract-generation phase. Reconcile roadmap
intent with live state, dependencies, hotspot contact, and at most one health
campaign. Present the ordered index/contract proposal for Ryan's approval while
Plan mode remains read-only. After approval in execution mode, write only the
deterministic contract index and contract files. Rerun the resolver, report its
new directive, run the agent drift check, and stop — planning outcomes are
session-terminal; execution begins in a fresh `start-session`. Material
contract changes require re-approval; this skill never creates session
implementation plans.
