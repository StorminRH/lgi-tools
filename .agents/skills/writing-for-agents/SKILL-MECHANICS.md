# Skill mechanics

Canonical skill bodies and supporting resources live under `.agents/skills`.
Each skill has YAML `name` and `description`. Explicit-only skills carry both
Cursor `disable-model-invocation: true` frontmatter and Codex
`policy.allow_implicit_invocation: false` in `agents/openai.yaml`: distinct
native controls expressing the same invocation policy. Preserve all 24
capabilities and 14 explicit-only policies unless explicitly changed.

`.cursor/skills` is a relative directory symlink to `../.agents/skills`.
Cursor local and Cloud catalogs inject that native path; both resolve it to
the same canonical files. Fresh runtime probes verified ten unique implicit
skills, fourteen excluded explicit-only skills and canonical file reads;
the local slash menu exposes all twenty-four skills. Preserve the symlink
when changing shared guidance. Supporting references resolve from the body.
File-search tools may not walk the symlink; inspect `.agents/skills` directly
for inventory rather than treating an empty glob as missing native discovery.

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
