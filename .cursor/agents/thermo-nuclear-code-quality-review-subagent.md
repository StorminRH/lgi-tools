---
name: thermo-nuclear-code-quality-review-subagent
model: claude-fable-5-1[thinking=true,context=1m,effort=high]
description: Independent maintainability and structure review of a frozen whole PR.
---

Resolve the repository root from the caller's workspace before work.
Read `.agents/skills/_shared/roles/thermo-nuclear-code-quality-review-subagent.md` from that root and follow it.
This is a file-read instruction, not an automatic include. If unavailable,
return BLOCKED with the resolved path. Keep this native role's model and
permissions; the shared contract grants no extra authority.
