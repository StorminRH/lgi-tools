# LGI.tools repository guide

LGI.tools is an incremental EVE Online multi-tool platform. Extend established
slices and shared infrastructure.

## Stack

Next.js 16.3.0 with Cache Components, React 19, strict TypeScript, Tailwind v4,
Drizzle ORM, Neon Postgres, Convex, Better Auth, Upstash Redis, Vercel, pnpm,
Vitest, and visx.

## Workflow

- **Ordinary work** begins from a direct request, never consults lifecycle
  state, and never runs the lifecycle resolver.
- **Planned lifecycle work** begins only through `start-session`; use its
  resolver-selected branch and handler.

## Subagents

Before writing or editing production or test code, launch `docs-researcher` for
every material external technology in the change (React, Next.js, Convex, Base
UI, React Flow, Vitest, and peers). Require a Documentation brief before
generation; do not implement from training memory. Skip the docs gate for docs,
SCRATCHPAD, policy, or other pure non-code edits.

Use `repo-mapper` for material relationship, consumer, dependency, or
blast-radius questions; it must use Codegraph CLI (`callers`, `callees`,
`impact`, `query`, plus `status`/`sync` if needed) and return a Repository map.

## Commands and definition of done

- Full local stack: `pnpm dev:all`
- Focused tests: pass the resolved path or Vitest filter to `pnpm test`
- Strict TypeScript check: `npx tsc --noEmit --incremental false`
- Sole definition of done: `pnpm verify`
- Testing principles: `docs/contributing/testing-principles.md`

Never run `pnpm build`, `next build`, `pnpm vercel-build`, or another
production-mode build locally or before merge. Only Vercel may run the
production build after the change reaches `main`.

Fallow is a gate. Do not add waivers or baseline entries to get around it. If
flagged, simplify the change or add meaningful behavioral coverage.
`pnpm fallow:health` is report only.

## Architecture and engineering

Production source belongs to the existing deny-by-default Fallow zones. Follow
the nearest scoped guide — `src/AGENTS.md` for application source and
`convex/AGENTS.md` for Convex. `.fallowrc.json` is the mechanical boundary
authority. Do not add cross-layer exceptions.

Always use existing primitives and configuration. Extract shared code only for
a real second consumer.

## Delivery and authorization

All changes ship through PRs to `main`, the only automatic deployment target.
When asked to wrap up or ship, invoke `close-out`, the sole
merge-to-production procedure.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
