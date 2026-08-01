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

Prefer designed agents under `~/.cursor/agents/` for bounded research
(`docs-researcher`), exact verification (`gate-runner`), and independent
review roles named by workflows. Delegate when isolation or a structured
evidence packet helps; do not run a fixed preflight on every task, and do not
redo discovery the parent already completed.

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
`src/AGENTS.md`; `.fallowrc.json` is the mechanical boundary authority. Do not
add cross-layer exceptions.

Always use existing primitives and configuration. Extract shared code only for
a real second consumer.

## Delivery and authorization

All changes ship through PRs to `main`, the only automatic deployment target.
When asked to wrap up or ship, invoke `close-out`, the sole
merge-to-production procedure.
