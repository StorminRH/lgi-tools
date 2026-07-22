# LGI.tools

A multi-tool web platform for [EVE Online](https://www.eveonline.com)
players, built by Lo-Gang Industries. The live deployment is at
[https://lgi.tools](https://lgi.tools).

The current tool catalogue:

- **[Wormhole Sites](https://lgi.tools/sites)** — browse every wormhole site with live combat
  numbers (computed from EVE SDE) and live Jita resource pricing.
- **[Industry Planner](https://lgi.tools/industry)** — manufacturing profitability for blueprints and
  reactions, with build-location and market scoring.
- **[Skill Queues](https://lgi.tools/skills)** — view the live training queues
  for every linked character.
- **[Industry Jobs](https://lgi.tools/jobs)** — view personal and corporation
  industry jobs, including their scheduled completion.
- **[Structures](https://lgi.tools/structures)** — build custom structures or
  share corporation structures for use as build locations in the planner.

## Tech stack

- [Next.js](https://nextjs.org) (App Router, Cache Components) — see
  [CONTRIBUTING.md](CONTRIBUTING.md#this-isnt-the-nextjs-you-know) about API
  drift from prior versions.
- TypeScript (strict)
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team) on Postgres
- [Neon](https://neon.tech) (production) / Postgres 16 in Docker (local dev)
- [Convex](https://convex.dev) — live reactive backend for online-status state
  (runs on `:3210` in local dev)
- [Better Auth](https://better-auth.com) — sessions and EVE Online SSO
- [Upstash Redis](https://upstash.com) — rate limiting (production)
- [Vercel](https://vercel.com) (hosting + cron)
- pnpm + [Vitest](https://vitest.dev)

The project is sliced by feature (`src/features/<feature>/`); two
features never import from each other. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the full project conventions.

## Local development

You need Node 22+, pnpm, and Docker. (CI builds on Node 24.)

1. **Install dependencies.**
   ```
   pnpm install
   ```

2. **Start Postgres.** The docker-compose file boots Postgres 16 on
   port `5433` with user/db `lgi/lgi_tools`.
   ```
   docker compose up -d
   ```

3. **Create `.env.local`.** Copy `.env.example` and fill in the values.
   ```
   cp .env.example .env.local
   ```

   For a no-auth local boot you can leave the EVE/Discord/session/cron
   variables blank — the app will run; login and feedback won't. To
   exercise the full surface:
   - Register a dev app at
     [developers.eveonline.com/applications](https://developers.eveonline.com/applications)
     with the scopes in the authoritative
     [`EVE_SCOPES`](src/features/auth/eve-sso.ts) array and callback
     `http://localhost:3000/api/auth/oauth2/callback/eve`. Paste the
     resulting client id/secret into `EVE_CLIENT_ID` / `EVE_CLIENT_SECRET`.
   - Generate a session secret: `openssl rand -base64 32`. Paste into
     `SESSION_SECRET`.
   - Optionally set `SUPERADMIN_CHARACTER_ID` to your EVE character id
     to grant your account admin powers on first login.

4. **Apply migrations.** This also seeds the wormhole-sites tables —
   migration `0006_historical_seed.sql` populates ~69 canonical sites
   with their waves, NPCs, and resources via an empty-table guard.
   ```
   pnpm db:migrate
   ```

5. **Ingest EVE SDE.** First run only. Runs the full SDE pipeline —
   ingest, resolve blueprint trees, and seed tracked-type prices — that
   the combat-stats and industry planner depend on. Use `db:refresh-sde`,
   not `db:ingest:sde`: the bare ingest leaves the planner cascade empty.
   ```
   pnpm db:refresh-sde
   ```

6. **Start the dev server.** `pnpm dev` runs only Next. The complete signed-in
   experience, including the live online-status indicator, also needs the local
   Convex backend on `:3210`, so use the one-command startup:
   ```
   pnpm dev:all
   ```
   This brings up Postgres, Next (`:3000`), and Convex (`:3210`) together
   (plain `pnpm dev` is fine for the public/anonymous pages). For signed-in
   login to work, the dev port must match in three places — `.env.local`'s
   `BETTER_AUTH_URL`, the Convex deployment's `AUTH_ISSUER_URL`, and the EVE
   app callback above — all on `http://localhost:3000`.

   Open [http://localhost:3000](http://localhost:3000).

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server |
| `pnpm dev:all` | Start Postgres + Next + Convex together (full signed-in stack) |
| `pnpm build` | Production build (CI/Vercel only — do not run locally) |
| `pnpm verify` | Coverage-backed definition-of-done bundle: typecheck + lint + Vitest coverage + fallow |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm test` | Run the non-coverage Vitest suite once; focused Vitest arguments are supported |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | ESLint |
| `pnpm fallow` | Static-analysis gate (dead code, duplication, complexity, boundaries) |
| `pnpm db:migrate` | Apply Drizzle migrations against the local DB |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:studio` | Open Drizzle Studio against the local DB |
| `pnpm db:refresh-sde` | Full SDE pipeline: ingest + resolve trees + seed tracked prices |
| `pnpm db:refresh-prices` | One-shot pull of Jita prices and order-book depth from ESI |
| `pnpm ux-check` | Scripted Playwright UX capture of the given routes |

See `package.json` for the full set.

## Architecture overview

- `src/features/<feature>/` — self-contained feature slices (components,
  queries, types, tests). Features never import from each other.
- `src/components/ui/` — reusable presentational primitives shared by
  every feature.
- `src/data/` — shared data layers (EVE SDE, market prices, search
  registry).
- `src/app/api/` — Next.js route handlers (auth, telemetry, feedback,
  cron).
- `convex/` — the derived, regenerable live online-status projection, authenticated
  with a Better Auth-issued JWT. Neon remains authoritative.
- `drizzle/` — generated migrations. Schema sources live in each
  feature slice.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the working conventions (slice
boundaries, commit style, testing policy, etc.).

## Contributing

Contributions are welcome. Before opening a PR:

1. Open an issue for anything non-trivial so we can agree on shape
   before code is written.
2. Branch off `main` and open a PR back into `main`.
3. Run `pnpm verify` locally and confirm it passes — this bundles
   typecheck, lint, one coverage-enabled Vitest suite, and the `fallow`
   static-analysis gate. (CI runs
   the same gates plus a route-classification presence check.)
4. Follow the commit-message style in [CONTRIBUTING.md](CONTRIBUTING.md#commit-style) —
   plain English in the subject line, no file paths or function names.
5. Be civil. Reviews are conversations.

CI runs typecheck, lint, the coverage-enabled Vitest suite, and the `fallow` static-analysis
gate on every PR; a red check blocks merge. Branch deploys are off by
default — preview deploys are spun up manually on demand when a change needs
live data the local Docker database can't provide.

## License

[MIT](LICENSE) — Copyright (c) 2026 Lo-Gang Industries (Stormin).

EVE Online is a trademark of Fenris Creations (formerly CCP hf).
LGI.tools is an independent third-party tool not affiliated with,
endorsed by, or sponsored by Fenris Creations.
