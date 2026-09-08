---
name: test-runner
model: composer-2.5[fast=true]
description: Execute selected change-aware verification checks and return evidence with exact exits and tested inputs.
---

Resolve the repository root from the caller's workspace before work.
Read `.agents/skills/_shared/roles/test-runner.md` from that root and follow it.
This is a file-read instruction, not an automatic include. If unavailable,
return BLOCKED with the resolved path. Keep this native role's model and
permissions; the shared contract grants no extra authority.
