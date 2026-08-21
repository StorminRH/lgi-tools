# LGI.tools

EVE Online multi-tool. Work lands in slices.

## Workflow

- Ordinary work starts from a direct request. Skip lifecycle state and the
  resolver.
- Planned lifecycle work starts only through `start-session`. Use the
  resolver-selected branch and handler.

## Agents

Use a listed agent when the work isolates to it. Other sub-agents are fine
when they help.

Launch `docs-researcher` before writing or editing production or test code that
touches React, Next.js, Convex, Base UI, React Flow, Vitest, or peers.
Generation waits on a Documentation brief.

Launch `repo-mapper` for relationship, consumer, dependency, or blast-radius
questions. It uses Codegraph (`callers`, `callees`, `impact`, `query`;
`status`/`sync` if needed) and returns a Repository map.

Launch `test-runner` before commits, and whenever the local test suite
needs test results: `pnpm typecheck`, `pnpm lint`, Fallow
`dead-code`, `dupes`, and `health` (CRAP, no `--coverage`), plus
caller-supplied focused tests for the diff.

Name those agents and omit Task `model` so the agent file pin applies. `inherit`
and model slugs override the pin.

## Done

Land on Origin `development` with the local test suite. Promote
(`development` → `staging`) and release (`staging` → `main`) wait on
that Origin PR's Depot pipeline.

## Tools

Origin is the land forge. GitHub is the dump remote for bot review.
Linear is the ticket home. GitHub issues are not in use. Update watch
comments on standing `LGI-6`.

**origin** — Origin PRs and Checks. Create defaults to draft, so pass
`--status open`. A push snapshots a new version; `refresh` if `view`
or `checks` still show the previous head. Review comments are threads.
`origin pr create --status open`
`origin pr checks --watch`
`origin pr refresh`
`origin pr thread list --unresolved`
`origin pr merge`
`origin pr view` / `list` / `diff`

**gh** — GitHub dump PRs only. Add a `github` remote to
`https://github.com/StorminRH/lgi-tools.git` when it is missing.
`gh pr create` (`dump/...` → `staging`)

**depot** — Origin PR pipeline. Org `k2f4dzqwd4`, repo `stormin/lgi-tools`,
workflow `.depot/workflows/test.yml`. Pass `--org k2f4dzqwd4`. `run list`
defaults to queued and running. PR runs use a merge SHA
(`refs/changes/N/merge`), not always `HEAD`. `status` returns immediately.
Skip `auth-storage.json` in artifacts.

Watch Checks with `origin pr checks --watch`. When that list is empty,
`run list` then poll `status`. On red, `diagnose` first — it groups
failures and suggests a fix. Confirm against `logs` before acting.
`depot ci run list --repo stormin/lgi-tools --org k2f4dzqwd4`
`depot ci status <run-id> --org k2f4dzqwd4`
`depot ci diagnose --run <run-id> --org k2f4dzqwd4`
`depot ci logs <run-id> --job <job> --org k2f4dzqwd4`

**vercel** — Manual `development` Preview and the Vercel API.
`vercel deploy`
`vercel ls`
`vercel api`

**neon** — Branch policy. Nothing auto-applies `neon.ts`. Protected `main`
needs `--allow-protected`.
`neon config plan`
`pnpm neon:apply`
`neon branches delete preview/<branch>`

**convex** — Local and anonymous stay `pnpm exec convex`. Hosted preview
delete is the HTTP path under Delivery.
`pnpm exec convex dev`
`pnpm exec convex run`
`pnpm exec convex env set`

## Architecture

Neon holds durable account, character, and ESI data. Convex holds live
projections plus the mapper collaborative-chain exception in `docs/CONVEX.md`.

Production source lives in the deny-by-default Fallow zones. `.fallowrc.json`
is the boundary. No new cross-layer exceptions.

Use existing primitives and configuration. Extract shared code only for a real
second consumer.

## Atlas connections

When discussing Atlas connections, use the glossary at the top of
`src/data/maps/connection-door-types.ts`. Talk about a system and its class
when the class matters, the wormholes in that system, outgoing named holes vs
incoming K162s. Example: jump a P060, land in a C1, the way back is the K162.
Stored `from`/`to` are document ends, not incoming vs outgoing. Call them
systems, not origin or far side.

## Delivery

Feature work lands on Origin `development`. A `development` Preview is
manual (Vercel dashboard or CLI): Neon `preview/development` (3-day TTL,
0.25-1 CU from `neon.ts`) and Convex `preview/development`. Delete that
Neon branch, Convex preview, and Vercel Preview when the test cycle ends.

Promote at 80 app-facing files versus `staging`. That Origin PR updates the
long-lived Preview: Neon `staging` and Convex `staging` (`proper-squid-200`).

`main` is the only Production auto-deploy. Every merge onto `staging`
or `main` goes through `close-out`.

`vercel.json` auto-deploys `main` and `staging` only. Neon
project `lively-mode-73649525`. Convex team `stormin-s-projects`, project
`lgi-tools`. Connection strings use role `neondb_owner`.

Convex has no CLI list or delete. Ending a Vercel Preview leaves Convex
running. List and delete with a team access token or PAT, never
`CONVEX_DEPLOY_KEY`, against `https://api.convex.dev/v1`:

```text
GET  /teams/stormin-s-projects/projects/lgi-tools
GET  /projects/<numeric-id>/list_deployments?deploymentType=preview
POST /deployments/<animal-name>/delete
```

The delete path is the animal name (`robust-puffin-832`), not
`preview/development`. Preview Convex expires 5d or 14d from create.

## Cloud Agent

Cloud Agent (this VM, Cloud secrets, e2e on the VM): `.cursor/cloud-agent.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
