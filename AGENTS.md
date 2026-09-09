# LGI.tools

EVE Online multi-tool. GitHub hosts code and PRs.
Linear owns work tracking and durable handoffs.

## Work routing

Ordinary requests do not use lifecycle state or the resolver.
Planned lifecycle work begins through `start-session`.
When the user selects `poteto-mode`, use that workflow instead; do not also start lifecycle.

Feature work targets `development`. Promote is `development` → `staging`;
release is `staging` → `main`. Every merge onto `staging` or `main`
uses `close-out`. Preserve the promote threshold of 80 app-facing files.

Use `.cursor/skills/` and `.cursor/agents/` in Cursor; use `.agents/skills/`
and `.codex/agents/` in Codex. When both skill copies are visible, select
the active harness's folder.

## Context isolation

Delegate documentation research, repository exploration, and test execution
to their configured subagents. Keep raw tool output and investigation
history in the child context. Bring conclusions, decisive evidence,
failures, and unresolved questions back to the parent.

## Architecture

[`.fallowrc.json`](.fallowrc.json) defines the production-layer boundaries.
Preserve them. Use existing primitives; extract shared code for a real
second consumer.

Neon holds durable account, character, and ESI data. For changes to
data ownership or live state, read [Convex architecture](docs/CONVEX.md),
including the mapper's collaborative-chain exception.

For Atlas connections, use the glossary in
[`connection-door-types.ts`](src/data/maps/connection-door-types.ts).
Stored `from` and `to` are document ends, not outgoing versus incoming wormholes.

## Testing

When writing or changing tests, follow
[testing principles](docs/contributing/testing-principles.md).
For browser tests, also read
[end-to-end testing](docs/contributing/end-to-end-testing.md).

Local verification requirements live in [CONTRIBUTING.md](CONTRIBUTING.md).
Production builds run in CI and Vercel; agents do not run them locally.

## Environments

For local setup, read [Local development](README.md#local-development).
For Cursor Cloud provisioning, secrets, or VM-local e2e, read
[the cloud guide](.cursor/cloud-agent.md); its provisioning scripts apply
only to that VM.

Changes to `neon.ts` require an explicit apply.
Preview cleanup covers Vercel, Neon, and Convex separately;
deleting a Vercel Preview leaves its Convex deployment running.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
