# Claude Code / Codex Tooling Parity

This local-only document records how LGI.tools keeps development capabilities
equivalent across Claude Code and Codex. Equivalent behavior does not require
identical UI syntax: runtime-native adapters are preferred over pretending one
runtime implements the other's plugin surface.

## Scope decisions

- Application/build tools stay repo-local and versioned in `package.json`
  (`next`, TypeScript, Vitest, Playwright, Drizzle, Fallow, and related tools).
- Authenticated operator CLIs stay user-level so both apps share credentials and
  project linkage: `vercel`, `neon`, `gh`, and `graphify`.
- Context7 is a user-level CLI (`ctx7`) shared by both apps. The paired
  `find-docs` skills must remain byte-identical.
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

After Claude's Vercel plugin updates, rebuild and reinstall the Codex adapter:

```bash
python3 .agent-local/sync_vercel_plugin.py --write
python3 <codex-home>/skills/.system/plugin-creator/scripts/validate_plugin.py \
  <personal-plugin-source>/vercel-plugin
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
