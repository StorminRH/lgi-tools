# LGI.tools

EVE Online multi-tool. Work lands in slices.

## Workflow

- Ordinary work starts from a direct request. Skip lifecycle state and the
  resolver.
- Planned lifecycle work starts only through `start-session`. Use the
  resolver-selected branch and handler.

## Seats

Use a listed seat when the work isolates to it. Other subagents are fine when
they help.

Launch `docs-researcher` before writing or editing production or test code that
touches React, Next.js, Convex, Base UI, React Flow, Vitest, or peers.
Generation waits on a Documentation brief.

Launch `repo-mapper` for relationship, consumer, dependency, or blast-radius
questions. It uses Codegraph (`callers`, `callees`, `impact`, `query`;
`status`/`sync` if needed) and returns a Repository map.

Launch `gate-runner` before commits, and whenever a Gate result packet is
needed: `pnpm typecheck`, `pnpm lint`, Fallow `dead-code`, `dupes`, and
`health` (CRAP, no `--coverage`), plus caller-supplied focused tests for the
diff.

Name those seats and omit Task `model` so the agent file pin applies. `inherit`
and model slugs override the pin.

## Done

Land on Origin `development` with the local gate from Seats. Promote
(`development` → `staging`) and release (`staging` → `main`) wait on
that Origin PR's Depot pipeline with `origin pr checks --watch`.

Depot org `k2f4dzqwd4`, repo `stormin/lgi-tools`, workflow
`.depot/workflows/test.yml`. Pass `--org k2f4dzqwd4` when the account is in
more than one org. `run list` defaults to queued and running. PR runs use a
merge SHA (`refs/changes/N/merge`), not always `HEAD`. Skip `auth-storage.json`
in artifacts.

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

Feature work lands on Origin `development`. A push auto-deploys a
Vercel Preview: Neon `preview/development` (3-day TTL, 0.25-1 CU from
`neon.ts`) and Convex `preview/development`. Delete that Neon branch, Convex
preview, and Vercel Preview when the test cycle ends. The next push to
`development` creates them again.

Promote at 80 app-facing files versus `staging`. That Origin PR updates the
long-lived Preview: Neon `staging` and Convex `staging` (`proper-squid-200`).

`main` is the only Production auto-deploy. Promote or release through
`close-out`.

`vercel.json` auto-deploys `main`, `development`, and `staging` only. Neon
project `lively-mode-73649525`. Convex team `stormin-s-projects`, project
`lgi-tools`. Apply `neon.ts` with the CLI; nothing auto-applies it. Protected
Neon `main` needs `--allow-protected`. Connection strings use role
`neondb_owner`.

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

MCP: Neon `list_projects` / `describe_project` / `create_branch` /
`delete_branch`. Convex `status` / `logs`. Vercel is CLI (`vercel api`).

## Cloud Agent

Cloud Agent (this VM, Cloud secrets, e2e on the VM): `.cursor/cloud-agent.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
