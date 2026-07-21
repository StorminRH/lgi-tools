---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approved LGI.tools
  implementation plan for one session contract. Normally dispatched by
  start-session; use directly for "plan this", "start a session on...", "design this feature",
  "let's build X", or when start-session finds no approved current plan.
  Includes mandatory adversarial review of every complete draft before approval.
---

# Plan an LGI.tools session

<!-- shared-policy-revision: 29 -->

Run the resolver and require its directive to name `plan-session` as the handler.
Otherwise report it and return control to `start-session`; never select a sibling
handler here. An explicit re-plan may proceed only after reconciling contract and
approval state. Use `docs/workflows/schema/session-plan.md` as the canonical
authoring guide and output schema in Claude Code Plan mode; do not restate it.
Treat the active agent guide and current code-health state as standing context,
read and reconcile the schema's authoring inputs, then create the native task list
from this sequence and the schema's authoring, drafting, review, approval,
and persistence gates.

Reconcile the contract with Graphify, live code, dependencies, and current
primary docs. After context is loaded, discuss the plan's intended shape with
Ryan in plain English before any fixed-schema drafting. Once the fixed-schema
draft is complete, launch a fresh read-only high `gpt-5.6-sol` worker to
adversarially review the full draft, contract, and cited evidence. Reconcile every finding; rerun
the review at most once, and only when the reconciliation materially changes
architecture, scope, or verification — one mandatory pass plus at most one
rerun is a hard cap. Reconcile review findings into the final design or stop on
a material conflict; never persist review history, transcripts, pass counts, or
superseded draft content. Then present the complete schema-conforming plan with
no missing section, mapping, marker, or unresolved placeholder. Present a short
plain-English summary alongside the formal plan before requesting Ryan's
approval, then wait without writing files.
After approval in execution mode, write the deterministic
`docs/session-plans/X.Y/<session>.md` path with
approval, contract-digest, planning-schema, and pending-execution markers. Rerun
the resolver, report its new directive, run the agent drift check, and stop — planning
outcomes are session-terminal. A session that planned an artifact never
executes it; execution begins in a fresh `start-session`. Never create a
separate prompt artifact or separate prompt file.
