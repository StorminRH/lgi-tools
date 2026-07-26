# Claude Code / Codex Tooling Parity

This repository document records how LGI.tools keeps development capabilities
equivalent across Claude Code and Codex. Equivalent behavior does not require
identical UI syntax: runtime-native adapters are preferred over pretending one
runtime implements the other's plugin surface.

## Scope decisions

- Application/build tools stay repo-local and versioned in `package.json`
  (`next`, TypeScript, Vitest, Playwright, Drizzle, Fallow, and related tools).
- Authenticated operator CLIs stay user-level so both apps share credentials and
  project linkage: `vercel`, `neon`, and `gh`. The `codegraph` code-graph CLI is
  also user-level, installed pinned to the audited version via
  `npm i -g @colbymchenry/codegraph@1.4.1` (the package is published from an
  individual npm account, so anchor to a known-good version rather than floating
  `latest`).
- Context7 is a user-level CLI (`ctx7`) shared by both apps. The paired
  `find-docs` skills must remain byte-identical.
- Cursor Agent is a user-level CLI (`cursor-agent`) shared by both apps for the
  repository's economical independent adversarial-review lane. The canonical
  workflow owns reviewer roles and escalation; the paired runtime adapters own
  current Cursor model ids and exact command flags.
- PyYAML is a user-level Python tooling dependency used by the official skill
  validators and the Vercel adapter generator. It is not an LGI.tools runtime
  dependency.
- Repo hooks and house skills remain paired and runtime-tailored under
  `.claude/` and `.agents/`.

## Vercel capability mapping

Claude Code uses Vercel's native plugin:

- 25 skills;
- `/vercel-plugin:*` commands;
- `deployment-expert`, `performance-optimizer`, and `ai-architect` agents;
- a lightweight project-detection/session-start hook.

Vercel does not yet ship a native Codex manifest. The local adapter maps those
capabilities as follows:

- the 25 generated skills become personal Codex plugin skills;
- five slash commands become `vercel-bootstrap`, `vercel-deploy`, `vercel-env`,
  `vercel-marketplace`, and `vercel-status` skills;
- the three specialists become user-global TOML agents in `~/.codex/agents/`;
- `~/.codex/AGENTS.md` supplies the thin always-on context instead of emulating
  Claude's session hook.

Every generated skill and agent adds LGI.tools' explicit-production-approval and
Greptile-review constraints. The source Vercel content otherwise remains intact.

## Adversarial-review runtime

Before embedding or changing a Cursor command in either runtime adapter:

1. inspect `cursor-agent --version`, `cursor-agent --help`, and
   `cursor-agent --list-models`;
2. confirm the configured model ids exist for the authenticated account; and
3. verify current context, pricing, and read-only behavior through the
   `find-docs` procedure.

Both adapters run fresh Cursor sessions with `--mode plan`, sandboxing, explicit
workspace selection, and JSON output. Each reviewer uses two turns in one
session: the investigation, followed by a `--resume` collection turn whose JSON
`result` text is the verdict of record. On a repository's first run, satisfy the
workspace-trust prompt through an interactive operator grant or pause for the
operator's explicit authorization to use `--trust` for that invocation.

Never add `--force`, `--yolo`, `--trust`, or automatic MCP approval silently;
the per-run operator authorization above is the only exception for `--trust`.
A missing CLI, authentication failure, or unavailable required model blocks the
adversarial review; do not silently fall back to Codex or Claude and spend a
different capacity pool.

Current reviewed defaults are Composer 2.5 Standard for the bounded execution
role, Cursor Grok 4.5 Medium for the holistic role, and Cursor Grok 4.5 High for
one canonical escalation trigger. Treat model availability, context limits, and
pricing as runtime facts to recheck, not permanent product guarantees.

Runtime decision, 2026-07-26: adversarial reviewers use repository CLIs in plan
mode. Cursor has no configured MCP servers; the Codegraph MCP installation was
reverted and six stale Smithery entries were removed.

## Commands

Create the sanitized inventory (paths, names, versions, config sections, and
counts only; never config values or credentials):

```bash
python3 .agent-local/audit_tooling_parity.py
```

Output: `.agent-local/tooling-parity-report.json`.

Run the functional parity gate:

```bash
python3 .agent-local/check_tooling_parity.py
```

This is also called by `check_agent_drift.py` and therefore blocks close-out on
tooling drift.

After Claude's Vercel plugin updates, resolve the Codex skills root and the
personal plugin source, export them as `CODEX_SKILLS_ROOT` and
`PERSONAL_PLUGIN_SOURCE`, then rebuild and reinstall the Codex adapter:

```bash
CODEX_SKILLS_ROOT="$(python3 -c 'from pathlib import Path; print(Path.home() / ".codex/skills")')"
PERSONAL_PLUGIN_SOURCE="$(python3 -c 'from pathlib import Path; print(Path.home() / "plugins")')"
export CODEX_SKILLS_ROOT PERSONAL_PLUGIN_SOURCE
test -d "$CODEX_SKILLS_ROOT/.system/plugin-creator"
test -d "$PERSONAL_PLUGIN_SOURCE/vercel-plugin"
python3 .agent-local/sync_vercel_plugin.py --write
python3 "$CODEX_SKILLS_ROOT/.system/plugin-creator/scripts/validate_plugin.py" \
  "$PERSONAL_PLUGIN_SOURCE/vercel-plugin"
codex plugin add vercel-plugin@personal
python3 .agent-local/sync_vercel_plugin.py --check
python3 .agent-local/check_tooling_parity.py
```

The sync utility reads Claude's installed marketplace source, writes the personal
Codex plugin and global custom agents, and stamps the Claude version and Git SHA.
It never modifies Claude's plugin checkout or marketplace metadata.

## Intentional native differences

- Claude exposes plugin commands as slash commands; Codex exposes their adapters
  as skills.
- Claude packages specialist agents inside the plugin; Codex loads equivalent
  user-global custom agents.
- Codex desktop has bundled Browser, GitHub, document, PDF, presentation, and
  spreadsheet plugins/MCP capabilities that are native app features rather than
  Claude Code configuration. These do not replace repository workflows or grant
  broader deployment authority.
