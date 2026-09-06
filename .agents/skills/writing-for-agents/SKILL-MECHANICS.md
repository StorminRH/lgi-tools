# Skill mechanics

Read [writing-for-agents](SKILL.md) for instruction design. This reference
covers repository packaging, invocation, and routing.

## Harness packaging

Keep workflow rules aligned across the two repository skill trees. Select
invocation syntax and model pins for the running harness:

| Harness | Skill tree | Explicit invocation | Explicit-only policy |
| --- | --- | --- | --- |
| Cursor | `.cursor/skills/<name>/SKILL.md` | `/skill-name` | `disable-model-invocation: true` in frontmatter |
| Codex | `.agents/skills/<name>/SKILL.md` | `$skill-name` | `policy.allow_implicit_invocation: false` in `agents/openai.yaml` |

Every skill has a `name` and `description` in YAML frontmatter. Preserve an
existing invocation policy when editing or adapting it. New skills allow
implicit invocation unless the user requests explicit-only discovery.

Cursor also discovers `.agents/skills`. Follow the harness routing in root
`AGENTS.md` when both copies are present; directory discovery alone does not
select the correct tool syntax or model. Keep paired workflow changes in sync,
including relative references, while retaining each harness's metadata.

## Routing

A description provides the trigger for automatic selection. Explicit-only
policy limits automatic selection; it does not make supporting files
unreadable. When an authorized workflow needs another procedure, link its
file and state when to read and follow it. A file read grants no additional
permission to execute that procedure or publish its results.

A router selects the applicable file and keeps the steps in their owning
skill. Split a skill when the new part has a useful independent trigger or
workflow. Keep common reference behind a relative file link when it needs no
independent invocation.

## Verification

Check frontmatter, invocation metadata, concrete reference paths, and each
harness's exposed agent roles. Exercise changed routing with a bounded brief
that records the selected procedure and stopping point. Keep audits and smoke
tests separate from the delivery actions described by the files.

Discovery reference: [Cursor skills](https://cursor.com/docs/skills).
Use the active host's tool schema for agent calls.
