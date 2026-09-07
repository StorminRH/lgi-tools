# Codex agent calls

Use `collaboration.spawn_agent` for subagents of the current task. Set a unique
`task_name`, the named `agent_type`, and a concrete brief. These calls are
asynchronous; collect every required final result before continuing.

For named roles, omit `model` and `reasoning_effort` so the Codex agent file
owns its pin. Use `fork_turns: "none"` and include the subject, authority,
required source paths, and return requirements in the brief. Confirm the
named role is exposed and has a repository `.codex/agents/<name>.toml`
definition. If it is missing, stop that dependent step and report the missing
role; an older global agent with the same name is not an adopted definition.

For general-purpose roles whose model is specified by the skill, use
`agent_type: "default"`, `fork_turns: "none"`, and separate `model` and
`reasoning_effort` fields. Read-only briefs authorize evidence collection only.
Keep existing sandbox permissions; model selection does not change authority.

Respect the live concurrency limit. Launch independent seats up to capacity
and run remaining seats in batches. Preserve one frozen subject across every
batch. Use `collaboration.wait_agent` and final messages to collect results;
never treat an acknowledgement or interim update as a verdict. Do not create
user-owned Codex tasks for these subagents.
