# [LGI.tools](http://LGI.tools)

EVE Online multi-tool.

## Work routing

Feature work targets `development`. Promote is `development` → `staging`;
release is `staging` → `main`.

## Architecture

[.fallowrc.json](.fallowrc.json) defines the production-layer boundaries.
Preserve them. Use existing primitives; extract shared code for a real
second consumer.

Neon holds durable account, character, and ESI data. For changes to
data ownership or live state, read [Convex architecture](docs/CONVEX.md),
including the mapper's collaborative-chain exception.

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

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
