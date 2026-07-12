## Vercel

Vercel is the front door for LGI.tools.

At the simplest level, it is where the Next.js site is deployed. I connect the repo, push code, let the platform build it, and get a real URL back without managing a server by hand. That sounds like convenience, and it is, but it also changed the way I could work on the project. A branch was not just a pile of files. It could become something I could open, click through, screenshot, and break in a real browser.

That preview loop was one of the reasons Vercel fit the project. AI can produce a lot of plausible code very quickly, but plausible code still needs to be seen running. A preview deployment gives me a real environment to inspect before the work reaches production. The lesson I had to learn was that “easy to create” does not mean “free of consequences.” A preview is still a deployment. It can still need environment variables, talk to backing services, run build steps, and leave real infrastructure behind if I do not give it boundaries.

The other reason Vercel fit is that it bundles several jobs that would otherwise become separate pieces of infrastructure. It is a build system, a deployment pipeline, a global delivery network, a serverless runtime, and a scheduler. Static pages and assets can be served from the edge network close to visitors. Dynamic routes can wake up as serverless functions only when a request needs server-side work. A cron job, in this context, is not a process running inside my app forever; it is a scheduled platform trigger that calls one of my routes on a timer.

That combination is what made Vercel feel like the right outer shell for LGI.tools. The public pages should be fast and cacheable. The private or live parts should wake up only when they need to. Data refreshes should be scheduled explicitly. Builds should be real gates, not ceremonial commands. And previews should exist when they help me prove something, not because every branch automatically deserves its own little production-shaped world.

So Vercel became the project’s production control plane. It receives the GitHub branch, builds the app, decides which routes can ship as static artifacts, runs the request handlers, fires cron routes, and exposes previews when I deliberately ask for one. The hosting service is not just a place the code lands; it is the clock, the deploy gate, and the runtime boundary around the app.

The preview story is where that clicked first. Early on, I treated preview deployments as harmless because the platform made them feel harmless. Push a branch, get a live copy. That is genuinely useful. But in this project a preview could also provision backing services and keep scheduled work alive after I was done looking at it. [PR #8](https://github.com/StorminRH/lgi-tools/pull/8) came from noticing the cleanup gap around preview database branches. [PR #120](https://github.com/StorminRH/lgi-tools/pull/120) changed the rule more directly: automatic previews are off, `main` is the only automatic deployment target, and previews are now something I spin up deliberately when local development cannot prove the thing I need to prove.<sup><a href="#code-vercel-config">1</a></sup>

The region choice is another place where the repo records a decision instead of relying on whatever happened to work that day. [PR #65](https://github.com/StorminRH/lgi-tools/pull/65) pinned Vercel serverless compute to `iad1`, near the database. The flashy version of the idea would have been to move request handlers closer to users at the edge. The measured version was different: the expensive server-side work was mostly talking to data stores and external APIs. Splitting that across edge regions would make the internal path worse. So the project keeps server-side work near the data, not near the browser.<sup><a href="#code-vercel-config">1</a></sup>

The build step also grew into more than “compile the app.” The current `vercel-build` path deploys the live-data backend, runs the production build command, migrates the database, backfills users if needed, bootstraps required game data only when it is missing, builds Next.js, and then asserts the route rendering shape. That means a deploy is not just a bundle upload. It is a sequence of platform checks: schema first, required bootstrap data second, static/partial/dynamic route expectations last.<sup><a href="#code-vercel-build">2</a></sup>

That route assertion came out of the same lesson as the other rails. [PR #42](https://github.com/StorminRH/lgi-tools/pull/42) reclaimed static and partial-prerendered pages after the earlier all-dynamic phase, then added a post-build assertion so those pages could not quietly slide back into fully dynamic rendering. The repo keeps a committed route map and compares that map to the actual `.next` build artifacts. Later, [PR #135](https://github.com/StorminRH/lgi-tools/pull/135) proved why that boring metadata matters: a new endpoint missed the classification list, and the production build failed. That was annoying, but it was the right kind of annoying. The build caught a drift between the app and its deployment contract.<sup><a href="#code-vercel-route-map">3</a></sup><sup><a href="#code-vercel-route-assertion">4</a></sup>

The mistake that changed the build story most was the static game-data ingest. The app needs some EVE data available before `next build` prerenders data-backed pages, so the build path had a bootstrap step. But in [PR #149](https://github.com/StorminRH/lgi-tools/pull/149), that step had to be narrowed after a production deploy failed: a newer data release triggered a full re-ingest immediately before prerender, and that write burst loaded the production database enough that a build-time read timed out. The new rule is more precise. Build time may bootstrap missing data, but routine data drift belongs to scheduled refresh work, not the deploy path. The SDE section later goes through that pipeline in detail.<sup><a href="#code-vercel-sde-bootstrap">5</a></sup>

Vercel also supplies the clockwork. The cron list in `vercel.json` is where the platform schedule lives: data refreshes, search-console import, and cleanup sweeps. But a cron route is still just a URL. The repo does not treat “this path is in `vercel.json`” as authentication. Every cron route goes through a shared guard that forces the route to request time, checks the bearer token against `CRON_SECRET`, fails closed if the secret is missing, and returns unauthorized if the caller is not the platform cron invoker. One shared guard matters because otherwise each cron route becomes a chance to accidentally drift the auth behavior.<sup><a href="#code-vercel-cron-guard">6</a></sup>

That is the way I think about Vercel now. It is not just where the site lives. It is the place where architecture decisions become operational rules. What can deploy automatically? Only `main`. When should I use previews? When they prove something local development cannot. Where should server-side work run? Near the data. What does a build have to prove? Schema, bootstrap, render mode. What work belongs in deploy? Only the work needed to make the build valid, not routine data drift. What is a scheduled job? A locked-down route, not a hidden process.

The lesson is that managed hosting removes a lot of server maintenance, but it does not remove operational design. Vercel gives me the machinery. The repo has to encode the rules for how that machinery is allowed to behave.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-vercel-config" file="vercel.json" lines="3-39" lang="json" -->
```json id="v93pnk"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "git": {
    "deploymentEnabled": {
      "main": true,
      "**": false,
      "*": false,
      "*/*": false
    }
  },
  "crons": [
    { "path": "/api/cron/refresh-affiliations", "schedule": "20 11 * * *" },
    { "path": "/api/cron/refresh-prices", "schedule": "30 11 * * *" },
    { "path": "/api/cron/refresh-industry-indices", "schedule": "40 11 * * *" },
    { "path": "/api/cron/refresh-sde", "schedule": "50 11 * * *" },
    { "path": "/api/cron/refresh-gsc", "schedule": "0 9 * * *" },
    { "path": "/api/cron/sync-sweeper", "schedule": "*/15 * * * *" }
  ]
}
```

<!-- uth:code id="code-vercel-build" file="package.json" lines="18-24" lang="json" -->
```json id="k2t4qa"
"scripts": {
  "dev": "next dev",
  "predev:all": "docker compose up -d",
  "dev:all": "concurrently -k -n next,convex -c cyan,magenta \"next dev\" \"convex dev\"",
  "build": "next build",
  "vercel-build": "pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs"
}
```

<!-- uth:code id="code-vercel-route-map" file="scripts/route-classification.json" lines="3-35" lang="jsonc" -->
```jsonc id="hmzv7t"
{
  "_comment": "Expected `next build` render mode for every route, asserted by scripts/assert-route-classification.mjs after a build. Guards the conversion-track payoff: a route must not silently regress to a more dynamic mode. Modes: 'static' = ○, 'partial' = ◐, 'dynamic' = ƒ.",
  "_reasons": {
    "/": "Transient auth_error query param renders in a Suspense dynamic hole; hero + tiles are static.",
    "/sites": "Client-state class/type filters plus a searchParams-driven sort; the live-price overlay streams from a dynamic hole.",
    "/industry/[id]": "Per-blueprint planner ([id] param + cached structure/prices) streams from a dynamic hole; page chrome is the static shell.",
    "dynamic /api/*": "Route handlers — per-request by nature (auth, mutations, DB queries, crons, external calls). Justified dynamic."
  },
  "routes": {
    "/": "partial",
    "/changelog": "static",
    "/sites": "partial",
    "/sites/[id]": "partial",
    "/industry/[id]": "partial"
  }
}
```

<!-- uth:code id="code-vercel-route-assertion" file="scripts/assert-route-classification.mjs" lines="3-90" lang="js" -->
```js id="bxyx5r"
// Asserts that `next build`'s render mode for every route matches the committed
// expectation in route-classification.json. Runs after `next build` so a route
// can't silently regress to a more dynamic mode.

function classify(route) {
  if (!prerendered.has(route)) return 'dynamic';
  const metaPath = metaPathFor(route);
  if (!existsSync(metaPath)) return 'partial';
  return 'postponed' in readJson(metaPath) ? 'partial' : 'static';
}

if (errors.length > 0) {
  console.error('\n✗ Route render-mode classification check failed:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nIf the change is intentional, update scripts/route-classification.json in the same commit.\n');
  process.exit(1);
}
```

<!-- uth:code id="code-vercel-sde-bootstrap" file="src/db/ingest-sde-if-empty.ts" lines="3-17,119-150" lang="ts" -->
```ts id="a8g4sm"
// Deploy-time SDE BOOTSTRAP. Runs on every `pnpm vercel-build`, but only
// ingests when the eve-data tables are empty or incomplete. It deliberately does
// NOT re-ingest on CCP version DRIFT. A full pipeline run is a ~15s burst of DB
// writes, and running it immediately before prerender loads the DB enough to
// stall the prerender's own reads.

// Empty/incomplete tables — a fresh preview Neon or the first prod deploy
// shipping these tables. Bootstrap the full pipeline so the build can
// prerender SDE-backed static content.
if (!hasRows) {
  console.log('Auto-ingesting SDE (eve-data tables empty or incomplete on this branch)…');
  const summary = await runSdePipeline(db);
  if (remoteVersion) {
    await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
  }
  console.log('SDE pipeline complete.');
  console.log(JSON.stringify(summary, null, 2));
  return;
}

// Tables are populated: never re-ingest at build time. If CCP has drifted,
// the daily refresh-sde cron owns the re-ingest + cache revalidation.
```

<!-- uth:code id="code-vercel-cron-guard" file="src/lib/cron.ts" lines="7-23" lang="ts" -->
```ts id="n4j6xd"
// Shared Vercel-cron entry guard. Every cron route defers to request time (so
// Cache Components doesn't try to prerender it) and accepts only Vercel's cron
// invoker, which sends `Authorization: Bearer ${CRON_SECRET}`.

export async function requireCronAuth(req: Request): Promise<Response | null> {
  await connection();
  const secret = readEnv('CRON_SECRET');
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
```
<!-- uth:code-excerpts:end -->

