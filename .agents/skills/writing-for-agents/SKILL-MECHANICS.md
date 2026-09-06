# Skill mechanics

The skill-specific branch of [writing-for-agents](SKILL.md): frontmatter,
invocation policy, and router skills. The writing guidance stays in that file.

## Invocation

Every skill has a `name` and a `description` in `SKILL.md` frontmatter.
The description identifies its purpose and trigger. Codex discovers repository
skills under `.agents/skills` and follows symlinked skill folders.

Automatic invocation is the default. For an explicit-only skill, add
`agents/openai.yaml` within its folder:

```yaml
policy:
  allow_implicit_invocation: false
```

Explicit `$skill-name` invocation remains available. Preserve the source
skill's invocation policy when adapting it. A workflow that explicitly names
a supporting file should read that file at its path; it need not depend on
implicit skill selection or a Cursor Skill tool.

## Splitting and routers

Split off an independently discoverable skill when it has its own useful
trigger or workflow. Keep common reference behind a relative file link when
it does not need independent invocation. A router names the supporting files
and the condition for reading each one. Keep the steps in their owning skill.
