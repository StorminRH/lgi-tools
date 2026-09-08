# Skill mechanics

Canonical skill bodies and supporting resources live under `.agents/skills`.
Each skill has YAML `name` and `description`. Explicit-only skills carry both
Cursor `disable-model-invocation: true` frontmatter and Codex
`policy.allow_implicit_invocation: false` in `agents/openai.yaml`: distinct
native controls expressing the same invocation policy. Preserve all 24
capabilities and 14 explicit-only policies unless explicitly changed.

Temporary `.cursor/skills` entrypoints contain native metadata and a pointer
to the canonical body. They remain until actual Cursor local/Cloud discovery
proves direct shared loading, explicit-only behavior and unambiguous names.
Their presence is an unresolved duplicate-discovery acceptance item, not
proof consolidation is complete. Remove them only after recorded runtime
acceptance. Supporting references resolve from the canonical body.

Shared procedures use [agent calls](../_shared/agent-calls.md) for native
launch differences. Native role TOML has no prompt-include facility; adapters
must explicitly read shared Markdown after resolving the repository root.
Check actual read/discovery traces and effective pin/permissions in fresh
clients. Static metadata and self-reported identity are insufficient.

Use concise descriptions naming the selection trigger, not the whole
procedure. A supporting file read grants no additional execution or posting
authority. Add a router only when distinct branches need separate procedures.

References: [Cursor skills](https://cursor.com/docs/skills),
[Codex skills](https://learn.chatgpt.com/docs/build-skills),
[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
