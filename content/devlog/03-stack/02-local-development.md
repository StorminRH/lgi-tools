## Local Development
<!-- updated: 2026-06-30 -->

Local development started as a convenience and ended up becoming part of the architecture.

That sounds a little dramatic for “run the app on my laptop,” but it matters in this project. LGI.tools is built on managed services: Vercel for the app runtime, Neon for the database, Convex for live state, Upstash for shared short-term memory, EVE SSO for auth, and CCP’s API for live game data. A lot of the real system lives outside the code editor. If local development is too fake, it gives me confidence in changes that will fail the moment they touch production-shaped infrastructure.

At the same time, using hosted previews for every branch created its own problem. A Vercel preview is useful because it gives me a real URL and a real environment. But, as the Vercel section explains, a preview is still a deployment. It can create backing services, depend on cloud environment variables, and leave cleanup work behind. That is a lot of machinery to spin up just to answer basic questions like “does this page render,” “did the schema change apply,” or “does the planner still have the data it expects?”

So the rule changed: local development should catch as much as it reasonably can, and previews should be reserved for the things local cannot prove. [PR #120](https://github.com/StorminRH/lgi-tools/pull/120) made that explicit by turning off automatic per-branch previews and keeping manual previews as the exception. That decision only works if the local loop is not a toy version of the app. It has to be close enough to production to review AI-generated changes honestly.

[PR #112](https://github.com/StorminRH/lgi-tools/pull/112) is the mistake that made that obvious. The local database had fallen behind the schema, and data-backed pages started throwing 500s under `next dev`: wormhole sites, site detail pages, and industry planner pages were reading columns and tables that did not exist locally yet. That was not a production outage, but it was a process failure. If local development is where I inspect and correct AI output, then a broken local database means I am reviewing against a fiction.

The repo now treats local Postgres as a real dependency, not background noise. Docker Compose starts a stable `lgi_tools` database on port `5433` with the same user and password the example env file expects. The README walks through the setup in the order the app actually needs: install dependencies, start Postgres, copy the env file, run migrations, refresh the static EVE data, then start the dev stack. That sequence is intentionally boring. The point is to make the correct path easier to follow than the improvised one.<sup><a href="#code-local-docker">1</a></sup><sup><a href="#code-local-readme-flow">2</a></sup>

The static-data step is where “almost right” was not good enough. The local command is `pnpm db:refresh-sde`, not the raw SDE ingest. The raw ingest loads source data, but the planner depends on the full pipeline: ingest, blueprint tree resolution, and tracked-type price seeding. Without that, the local app can technically have EVE data and still be unable to review the Industry Planner. The SDE chapter explains the pipeline in more detail. The local-development lesson is simpler: setup commands have to produce a usable app, not just a populated database.<sup><a href="#code-local-readme-flow">2</a></sup><sup><a href="#code-local-scripts">3</a></sup>

The database driver split is the cleanest example of production architecture meeting local reality. In production, request-path reads use Neon’s serverless-friendly HTTP path. A local Docker Postgres cannot speak that protocol. [PR #60](https://github.com/StorminRH/lgi-tools/pull/60) added the explicit local escape hatch: `LOCAL_DB_DRIVER=postgres-js`. With that set, the request-path database client uses a normal TCP Postgres driver locally while production and previews stay on the hosted path. The important part is where the exception lives. It is one branch in the database layer, not a special case every feature has to remember.<sup><a href="#code-local-env-db">4</a></sup><sup><a href="#code-local-db-driver">5</a></sup>

[PR #145](https://github.com/StorminRH/lgi-tools/pull/145) tightened the rest of the loop into one command. `pnpm dev:all` brings up Docker, Next, and Convex together. Plain `pnpm dev` still works for public pages, but the signed-in surfaces depend on more than the Next server. They need the database, auth, and the live-data backend to agree. A single startup command removes one of the easiest human mistakes: testing a page while one of the supporting services is not actually running.<sup><a href="#code-local-scripts">3</a></sup>

Authentication is still the fussiest part because three different systems have to agree on the same local origin. The EVE developer app callback, `BETTER_AUTH_URL`, and Convex’s `AUTH_ISSUER_URL` all need to point at `http://localhost:3000`. If one of them drifts, the app can look broken even though the UI, database, and code are fine. The identity chain just does not validate. The local docs call that out directly because “check your env” is not useful enough when the failure crosses multiple services.<sup><a href="#code-local-auth-env">6</a></sup><sup><a href="#code-local-readme-flow">2</a></sup>

Not every cloud dependency needs a perfect local clone. Redis is the example. The Upstash variables can be blank locally because the rate limiter and ESI budget memory have dev/test fallbacks. That keeps the local loop usable without requiring a hosted Redis database for every developer run. Production uses a stricter posture: if shared Redis memory is required for a safety boundary, missing configuration should fail closed. Local development can be forgiving where the risk is low. Production cannot be clever with missing guardrails.

That is the balance I want from local development now. It should not pretend my laptop is Vercel, Neon, Convex, Upstash, EVE SSO, and CCP’s API all at once. But it should make the common failure modes visible before I reach for a hosted preview: schema drift, missing seed data, wrong database driver, absent live backend, broken auth origins, and setup commands that leave the app half-working.

Local development is now the first review gate for AI-generated work. A change has to run somewhere boring before it earns a cloud preview. That keeps previews useful without making them the default crutch, and it keeps the project honest about the difference between code that compiles and a system that actually starts.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-local-docker" file="docker-compose.yml" lines="3-23" lang="yaml" -->
```yaml id="myox72"
services:
  postgres:
    image: postgres:16-alpine
    container_name: lgi-tools-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: lgi
      POSTGRES_PASSWORD: lgi
      POSTGRES_DB: lgi_tools
    ports:
      - "5433:5432"
    volumes:
      - lgi_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lgi -d lgi_tools"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  lgi_pgdata:
```

<!-- uth:code id="code-local-readme-flow" file="README.md" lines="44-69" lang="md" -->
```md id="yyf3t9"
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

6. **Start the dev server.** `pnpm dev` runs only Next. Signed-in features
   also need the local Convex backend on `:3210`, so use the one-command startup:
   ```
   pnpm dev:all
   ```
   This brings up Postgres, Next (`:3000`), and Convex (`:3210`) together.
```

<!-- uth:code id="code-local-scripts" file="package.json" lines="18-40" lang="json" -->
```json id="4xhx8z"
"scripts": {
  "dev": "next dev",
  "predev:all": "docker compose up -d",
  "dev:all": "concurrently -k -n next,convex -c cyan,magenta \"next dev\" \"convex dev\"",
  "build": "next build",
  "vercel-build": "pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "db:migrate": "tsx src/db/migrate.ts",
  "db:ingest:sde": "tsx src/db/ingest-sde.ts",
  "db:refresh-prices": "tsx src/db/refresh-prices.ts",
  "db:refresh-sde": "tsx src/db/refresh-sde.ts"
}
```

<!-- uth:code id="code-local-env-db" file=".env.example" lines="9-27" lang="dotenv" -->
```dotenv id="wkid6p"
# Local dev points at the Postgres container started by docker-compose.yml.
# In production, Vercel injects DATABASE_URL from the Neon integration —
# this is the pooled (`-pooler`) endpoint, used by all request-path queries.
DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools

# Local dev only — leave UNSET in production/preview. The request-path DB client
# defaults to the neon-http driver, which speaks HTTP to a Neon SQL endpoint and
# CANNOT reach a plain local Postgres (every page would 500 with "fetch failed").
# Set this to `postgres-js` to build the local request client over TCP instead,
# so `pnpm dev` works against the docker-compose Postgres. Vercel never sets it.
LOCAL_DB_DRIVER=postgres-js
```

<!-- uth:code id="code-local-db-driver" file="src/db/index.ts" lines="17-42" lang="ts" -->
```ts id="rf3zct"
function getDb(): Db {
  if (_db) return _db;
  // Dev-only escape hatch: the neon-http driver speaks HTTP to a Neon SQL
  // endpoint and cannot reach a plain local Postgres, so local `next dev`
  // would 500 every request-path DB read. When LOCAL_DB_DRIVER=postgres-js is
  // set (only ever in a developer's .env.local), build the request client over
  // TCP postgres-js instead.
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}
```

<!-- uth:code id="code-local-auth-env" file=".env.example" lines="29-48,100-138" lang="dotenv" -->
```dotenv id="d8m21v"
# EVE Online SSO — register a dev app at https://developers.eveonline.com/applications
# Login runs through Better Auth's Generic OAuth plugin, so the redirect URI you
# register in the EVE app is now the plugin's callback path:
#   <BETTER_AUTH_URL>/api/auth/oauth2/callback/eve
# (locally: http://localhost:3000/api/auth/oauth2/callback/eve). EVE matches
# redirect URIs exactly — register one per origin you sign in against.
EVE_CLIENT_ID=
EVE_CLIENT_SECRET=

# BETTER_AUTH_URL is the canonical origin the callback URL is derived from —
# set it per environment (locally http://localhost:3000). It is ALSO the issuer
# (`iss`) of the Convex-facing JWT minted at <BETTER_AUTH_URL>/api/auth/token.
BETTER_AUTH_URL=http://localhost:3000

# Convex values are written into .env.local by `npx convex dev`.
# Lives in CONVEX's deployment env (`npx convex env set …`), NOT here:
#   AUTH_ISSUER_URL = the minting env's BETTER_AUTH_URL
#   AUTH_JWKS       = data:text/plain;charset=utf-8;base64,<base64 of JWKS>
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOYMENT=
```
<!-- uth:code-excerpts:end -->
