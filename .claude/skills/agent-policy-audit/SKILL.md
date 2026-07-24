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

Use only the review or repository-local repair authority the operator supplied.
Lifecycle state, commits, PRs, delivery, deployment, and external writes remain
outside this skill.

## Claude Code runtime mechanics

- Represent the canonical audit phases with native Claude tasks and keep
  exactly one task active.
- Use background Bash only for long-running deterministic checks.
- Inspect current CLI help directly before retaining embedded runtime commands.
- Keep shared behavior in its canonical workflow or schema and restrict this
  adapter to Claude-native task, Agent-tool, Bash, and rendering mechanics.

## Return

Place the canonical agent-policy-audit Markdown result directly in chat and
include the complete changed-file inventory for operator review.
