# LGI.tools

EVE Online multi-tool. Work lands in slices.

## Work and authority

Ordinary work starts from a direct request; skip lifecycle state and the
resolver. Planned lifecycle work starts only through `start-session` and
uses its resolver-selected branch/handler. Preserve explicit scope and
operator approval boundaries.

The GitHub migration is prepared until coordinated cutover acceptance.
Read [delivery](docs/workflows/delivery.md) when preparing a PR, reviewing,
landing, promoting, releasing or tearing down delivery environments. It
owns forge/CI authority, ordered gates and final evidence. Linear owns work
tracking and durable handoffs; GitHub Issues is not a second backlog.

## Guidance and context

Shared skills live in `.agents/skills`; native roles live in `.codex/agents`
for Codex and `.cursor/agents` for Cursor. Temporary `.cursor/skills`
entrypoints point to shared bodies pending local/Cloud discovery proof.
Read [agent calls](.agents/skills/_shared/agent-calls.md) before launching
roles. Preserve their model pins and tool permissions. Read applicable
nested `AGENTS.md` before edits; do not assume a child inherited them.
Before editing agent guidance, read `writing-for-agents`.

Use subagents to isolate noisy documentation, relationship exploration and
verification. Send bounded questions, revisions, authority and source
pointers; collect conclusions, decisive evidence, gaps and accessible logs.
Reuse a current applicable packet instead of repeating its investigation.

- Use `docs-researcher` for unresolved external API/version behavior before
  writing production/test code that depends on it. Generation waits for an
  applicable Documentation brief; a current brief can be reused.
- Use `repo-mapper` for unresolved relationships, consumers, dependencies
  or blast radius. It returns a Repository map using Codegraph.
- Select checks using [verification](docs/workflows/verification.md), then
  use `test-runner` for required execution. Classify the cumulative
  unverified diff including dirty/untracked files. Pure prose needs no app
  suite. Reuse evidence only when relevant inputs/environment are unchanged;
  final current GitHub checks remain mandatory. Native test-runner executes
  directly without recursively launching its own role.

Missing required role or load-bearing evidence blocks its dependent step.
Repair discovery rather than silently replacing a pin or permissions.

## Architecture and setup

Neon holds durable account, character and ESI data. Convex holds live
projections plus the mapper exception in `docs/CONVEX.md`. Production source
uses deny-by-default Fallow zones in `.fallowrc.json`; no new cross-layer
exceptions. Use existing primitives/configuration. Extract shared code for
a real second consumer. Atlas connection terminology is defined in
`src/data/maps/connection-door-types.ts`; read that glossary for connection
work and use systems, outgoing named holes and incoming K162s correctly.

For data-model, ownership, retention or cross-store changes, read
[data design](docs/contributing/data-design.md). Scheduled reviews use the
[data audit](docs/workflows/data-design-audit.md) and
[test cleanup](docs/workflows/test-cleanup.md) procedures at their named triggers.

For local/cloud setup and readiness, read
[development environments](docs/development-environments.md). Cursor VM
provisioning instructions apply to that VM, not the local workstation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
