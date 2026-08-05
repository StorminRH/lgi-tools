# End-to-end testing

How Playwright is used in this repository: a high bar, log-driven journeys, and
operator-owned visual review. Adapted from the
[Epic Web / Kent C. Dodds E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md)
for LGI.tools (Next.js, Better Auth + EVE SSO, Neon, Convex).

## Goals

- Validate a very small number of user-critical happy paths through the real app.
- Prefer assertion + console/network evidence over always-on screenshots.
- Keep tests readable and close to how a user describes behavior.
- Keep the bar for adding an E2E test very high.

## Commands

| Command | Role |
| --- | --- |
| `pnpm e2e:seed` | Seed local Better Auth E2E pilot + write `docs/ux-check/captures/auth-storage.json` |
| `pnpm test:e2e` | Seed (unless `E2E_SKIP_SEED=1`) then run Playwright specs; remote targets with `E2E_SKIP_SEED=1` require `E2E_STORAGE_STATE` / `UX_STORAGE_STATE` (storageState JSON, not cookie jars) |
| `pnpm ux-check <routes>` | Log-driven route sweep for changed paths (Ordered-work UX gate) |
| `pnpm verify:prod` | Post-merge Playwright prod proof against `https://lgi.tools` (origin-scoped bypass from env / `.env.local`) |
| `node docs/ux-check/run-probes.mjs …` | Durable interaction probes (same log-driven policy) |
| `python3 scripts/ensure-vercel-automation-bypass.py` | **Bootstrap/rotate only** — write bypass secret to `.env.local`; not needed once seeded |

None of these are part of `pnpm verify` today.

## Auth

EVE SSO is the only production login. Local/CI E2E uses a **test-only** Better
Auth instance with the official `testUtils` plugin (`e2e/auth-seed.ts`): it
creates a signed `better-auth.session_token` cookie against the same secret and
Postgres as the running app, plus a fake EVE `account` / `characters` row and
`activeCharacterId` so `getSession()` resolves.

Never put `testUtils()` on the production [`auth`](../../src/platform/auth/auth.ts)
export. Remote preview/production runs cannot forge that cookie against production
DB — use an operator-exported cookie jar / `storageState` instead (see
`docs/workflows/ux-check.md`).

## Failure artifacts

Pass/fail comes from assertions and diagnostics. On failure only, Playwright
writes screenshots and traces under `docs/ux-check/captures/` (gitignored).
Green runs stay log/JSON-only. Agents may open a failure artifact to diagnose a
red check; they still do not visually approve the UI. The operator owns visual
review after the log sweep.

## What to test

- Only the most important happy-path user flows.
- Primary routes that would make the product feel broken if they stopped working.

Avoid styling, pure utilities, edge cases, and low-probability regressions.
Prefer Vitest (and `*.db.test.ts` where SQL matters) whenever it can falsify the
behavior.

## Structure

- Flat `test(...)` where practical; avoid deep `describe` nesting.
- Role/label locators (`getByRole`, `getByLabel`); avoid CSS pins.
- Inline setup; assert intermediate states inside the same journey.
- Authenticated Convex surfaces need `pnpm dev:all`, not `pnpm dev` alone.
