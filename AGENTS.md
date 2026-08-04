# LGI.tools repository guide

LGI.tools is an incremental EVE Online multi-tool platform. Extend established
slices and shared infrastructure.

## Stack

Next.js 16.2.11 with Cache Components, React 19, strict TypeScript, Tailwind v4,
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
generation; do not implement from training memory or in-parent Context7.
Skip the docs gate only for docs-only, SCRATCHPAD, policy-only, or other pure
non-code edits. Always use `repo-mapper` for Codegraph relationship or impact
questions (returns a Repository map); the parent keeps semantic search and grep
for conceptual discovery. Prefer `gate-runner`, `ow-reviewer`, and
workflow-named review roles when isolation or a structured evidence packet
helps. Fall back to a direct command when a role is unavailable. Do not run a
fixed discovery preflight on every task or redo discovery the parent already
completed; that ban does not excuse skipping the docs gate before code.

## Commands and definition of done

- Full local stack: `pnpm dev:all`
- Focused tests: pass the resolved path or Vitest filter to `pnpm test`
- Strict TypeScript check: `npx tsc --noEmit --incremental false`
- Sole definition of done: `pnpm verify`

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
