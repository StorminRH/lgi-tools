# Four-environment capability matrix

Empty cells mean that capability is not yet proven on that environment.
Written 10 September 2026.

Permissions stay separate from technical ability. No production access is
granted just to fill a cell.

| Capability | Cursor local | Cursor cloud | Codex local | Codex cloud |
| --- | --- | --- | --- | --- |
| Checkout and edit `StorminRH/lgi-tools` on GitHub | | | | |
| Static checks (`pnpm typecheck`, `pnpm lint`) | | | | |
| Real Postgres tests (`*.db.test.ts`, zero unintended skips) | | | | |
| App build (`pnpm build` or CI `build`) | | | | |
| Authenticated smoke | | | | |
| Atlas local Convex and AUTH probe | | | | |
| Docs and repo lookup (docs-researcher or Context7) | | | | |
| Isolated subagents with named model pins | | | | |
| GitHub draft, check, and review | | | | |
| Linear handoff | | | | |
| Resume on a later session or SHA | | | | |

Record in each filled cell:

- Date
- SHA
- Command or UI path
- Result (`PASS`, `FAIL`, or `GAP`)
- Permission limit if the tool worked but the token could not write
