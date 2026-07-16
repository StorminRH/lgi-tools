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
- After changing agent configuration or shared workflow policy, run `python3 .agent-local/check_agent_drift.py` and resolve every finding.
