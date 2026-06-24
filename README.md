# LGI.tools

A multi-tool web platform for [EVE Online](https://www.eveonline.com)
players, built by Lo-Gang Industries. The live deployment is at
[https://lgi.tools](https://lgi.tools).

The current tool catalogue:

- **Wormhole Sites** — browse every wormhole site with live combat
  numbers (computed from EVE SDE) and live Jita resource pricing.
- **Industry Planner** *(coming soon)* — manufacturing profitability
  for blueprints and reactions.
- **Wormhole Roll Calculator** *(coming soon)* — plan hole rolls with
  live mass tracking.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) — see the warning in
  `CLAUDE.md` about API drift from prior versions.
- TypeScript (strict)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team) on Postgres
- [Neon](https://neon.tech) (production) / Postgres 16 in Docker (local dev)
- [Vercel](https://vercel.com) (hosting + cron)
- pnpm + [Vitest](https://vitest.dev)

The project is sliced by feature (`src/features/<feature>/`); two
features never import from each other. See `CLAUDE.md` for the full
project conventions.

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
     with scope `publicData` and callback
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

5. **Ingest EVE SDE.** First run only, ~30 seconds. Downloads and
   imports the EVE Static Data Export attribute tables that the
   combat-stats compute depends on.
   ```
   pnpm db:ingest:sde
   ```

6. **Start the dev server.** `pnpm dev` runs only Next. Signed-in features
   (the home character roster, skills, industry jobs) also need the local
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
| `pnpm build` | Production build |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Apply Drizzle migrations against the local DB |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:studio` | Open Drizzle Studio against the local DB |
| `pnpm db:refresh-prices` | One-shot pull of Jita prices from Fuzzwork |
| `pnpm db:ingest:sde` | Re-ingest the EVE SDE attribute tables |

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
- `drizzle/` — generated migrations. Schema sources live in each
  feature slice.

Read `CLAUDE.md` for the working conventions (slice boundaries, commit
style, testing policy, etc.).

## Contributing

Contributions are welcome. Before opening a PR:

1. Open an issue for anything non-trivial so we can agree on shape
   before code is written.
2. Branch off `main` and open a PR back into `main`.
3. Run `pnpm test`, `pnpm lint`, and `pnpm build` locally and confirm
   they pass.
4. Follow the commit-message style described in `CLAUDE.md` — plain
   English in the subject line, no file paths or function names.
5. Be civil. Reviews are conversations.

CI runs the Vitest suite on every PR; a red suite blocks merge. The
Vercel ↔ Neon integration automatically provisions a preview database
per branch, so your PR's preview deploy gets its own isolated DB.

## License

[MIT](LICENSE) — Copyright (c) 2026 Lo-Gang Industries (Stormin).

EVE Online is a trademark of Fenris Creations (formerly CCP hf).
LGI.tools is an independent third-party tool not affiliated with,
endorsed by, or sponsored by Fenris Creations.
