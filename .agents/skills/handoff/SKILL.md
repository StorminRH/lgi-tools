---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section naming each skill and when to use it.
Give the target harness's path: `.cursor/skills/<name>/SKILL.md` for Cursor
or `.agents/skills/<name>/SKILL.md` for Codex. When the target is unknown,
include both. The next agent reads that path or uses its native skill invocation.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
