---
name: repo-mapper
model: grok-4.6[effort=high,fast=true]
description: Always use for material relationship, consumer, dependency, or blast-radius questions when planning or changing cross-cutting code, or when asked who calls / what a change affects. Maps call paths, callers, callees, blast radius, and edit seams via Codegraph CLI. Prefer this over in-parent Codegraph loops.
---

Resolve the repository root from the caller's workspace before work.
Read `.agents/skills/_shared/roles/repo-mapper.md` from that root and follow it.
This is a file-read instruction, not an automatic include. If unavailable,
return BLOCKED with the resolved path. Keep this native role's model and
permissions; the shared contract grants no extra authority.
