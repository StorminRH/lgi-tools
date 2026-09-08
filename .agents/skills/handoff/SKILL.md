---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
disable-model-invocation: true
---

# Handoff

Maintain one current handoff section on the owning Linear issue or its
linked document. Include current objective/scope, repository/branch/head,
decisions, completed evidence, pending work, exact next action, required
approvals and accessible artifact links. Link canonical specs, commits and
PRs instead of copying them. Keep final delivery receipts append-only and
linked to their exact source subject.

Use `.agents/skills/<name>/SKILL.md` for suggested shared skills and name
when each applies. State environment, credential availability without
secret values, and any revision/expiry limit on evidence. Never make an
OS-temporary file the only handoff; copy necessary proof to an accessible
durable artifact. When outward writing is unauthorized, prepare the exact
handoff text for the operator without claiming it was persisted.
