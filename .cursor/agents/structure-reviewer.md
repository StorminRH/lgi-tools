---
name: structure-reviewer
model: glm-5.2[reasoning=high]
description: Structure. Owners, existing controls, layer boundaries, and UI chrome on a freeze. Run gh pr diff when the brief is a change number.
readonly: true
---

Resolve the repository root from the caller's workspace before work.
Read `.agents/skills/_shared/roles/structure-reviewer.md` from that root and follow it.
This is a file-read instruction, not an automatic include. If unavailable,
return BLOCKED with the resolved path. Keep this native role's model and
permissions; the shared contract grants no extra authority.
