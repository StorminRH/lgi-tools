---
name: agent-policy-audit
description: >-
  Audit and reconcile LGI.tools agent-facing guides, workflow procedures,
  artifact schemas, paired Codex and Claude skills, hooks, manifests, and drift
  checks. Use when the operator asks to audit agent documentation, remove
  human-oriented workflow regressions, synchronize AGENTS.md and CLAUDE.md
  behavior, repair paired-skill drift, review a newly committed skill, or
  prepare the complete policy file list for manual review. Supports read-only
  findings or an explicitly requested repository-local repair.
---

# Audit LGI.tools agent policy

Procedure: `docs/workflows/agent-policy-audit.md`.

## Invocation authority

Follow the operator's requested review-only or repair mode. Repair authority is
limited to repository-local agent policy and its mechanical checks. Do not run
the lifecycle resolver, mutate lifecycle artifacts, commit, push, open a PR,
merge, deploy, or change external state.

## Codex runtime mechanics

- Track the canonical audit phases with native Codex tasks and keep exactly one
  task active.
- Use the persistent terminal for inventories and deterministic checks.
- Inspect current CLI help directly when a runtime adapter embeds a command.
- Keep canonical behavior in the workflow or schema; place only Codex-native
  task, subagent, terminal, and rendering mechanics in `.agents/skills/`.

## Return

Render the canonical agent-policy-audit Markdown result without a code fence.
Include every changed policy file in the operator-review list.
