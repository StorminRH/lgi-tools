@AGENTS.md

## Claude Code adapter

- Treat the imported `AGENTS.md` as the canonical project policy. Do not copy shared rules back into this file.
- Files under `src/` load `src/CLAUDE.md`, which imports the canonical `src/AGENTS.md` source/UI guidance.
- Use the tracked `.claude/skills/` tree for Claude-specific workflow mechanics; shared policy remains in the canonical guides and workflow documents, and changes to either ship through normal commits.
- Invoke project skills with Claude's native `/skill-name` syntax, such as
  `/start-session`. Edits inside the existing tracked `.claude/skills/` tree reload in
  the current session; start a new session only if that top-level tree was
  created after the session began.
- Use Claude's background Bash execution for long-lived polls or servers and Claude's image/file reading tools for local UX artifacts.
- Never launch native Claude subagents. When a workflow needs a subagent, run a
  headless `codex exec -m gpt-5.6-sol` background task with
  `-c model_reasoning_effort="<effort>"`. Map the Claude seat to Codex effort:
  Opus 4.8 → `high`, Sonnet → `medium`, Haiku → `low`; use `xhigh` only when
  the workflow explicitly requires it or high cannot resolve the task. Set the
  Claude background task's visible description to
  `gpt-5.6-sol@<effort>: <bounded purpose>`.
- Give each headless worker one bounded responsibility and the sandbox it
  actually needs. Close stdin with a heredoc or `</dev/null>`, capture the final
  response with `--output-last-message`, and explicitly stop superseded tasks.
  The active project skill and main Claude session retain lifecycle judgment
  and any responsibility not explicitly delegated.
- After changing agent configuration or shared workflow policy, run `python3 .agent-local/check_agent_drift.py` and resolve every finding.
