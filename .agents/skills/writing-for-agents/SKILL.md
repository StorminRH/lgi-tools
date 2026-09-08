---
name: writing-for-agents
description: Use when creating or editing skills, or modifying AGENTS.md, skills, subagents, or any other directly agent facing guidance and documentation. Writing documents for agents.
---

# Write agent guidance

1. Identify the document's owner, audience and trigger. Keep broad repository
   facts in AGENTS; ordered delivery/verification procedures in their owners;
   one capability's instructions in its shared skill; native invocation,
   model and permissions in its adapter.
2. State required inputs, bounded authority, ordered steps where needed,
   completion evidence and stopping conditions. Preserve meaningful operator
   decisions. A reference must say when to read it and resolve correctly
   from the file that owns it.
3. Author each behavior once. Point to current configuration for cheap facts
   instead of caching commands/versions in every caller. Disclose only the
   reference needed by the active branch; keep unrelated history in Linear.
4. Remove stale directives, unsupported absolutes and repeated instructions.
   A guardrail must address a concrete failure. Prefer an existing mechanism
   for recurring risk when its maintenance cost is justified.
5. Review changed meaning and links. For machine-consumed guidance, validate
   parsing, invocation controls and relevant runtime behavior. Static parsing
   does not prove discovery, effective model identity or shared-file loading.

When editing a skill, read [skill mechanics](SKILL-MECHANICS.md). For deeper
reasoning about pointers, completion and disclosure, consult
[authoring rationale](references/authoring-rationale.md).
