## Introduction

This dev log has three jobs.

First, it is my own journal. I am not a developer by trade, and I need a written record of why things were built the way they were built. When I come back to a piece of the project weeks later, I want to understand the decision, not just the final code.

Second, it is a rough playbook for anyone else trying to build EVE tools. I do not want this to read like a polished victory lap where every choice was obvious from the start. A lot of the useful parts are the mistakes: the places where I misunderstood a system, put data in the wrong place, overbuilt something, or had to change direction after the code proved the first idea wrong.

Third, it is a plain-English bridge between the source code and the people using the site. The code is open, but code mostly tells you what happens. It does not explain the tradeoffs, the constraints, or the reason a feature took the shape it did. That is what this document is for.

Why build this when great tools already exist? The honest answer is that I built it for myself. For years, my setup was spreadsheets and one-off tools. After working with AI for a couple of years, I realized I could push those personal tools into a real web application instead of keeping them as private scraps. If it ends up being useful to other pilots, that is awesome. But the core premise was always simple: build the tool I wanted to use.

The rest of this log gets technical, but the structure is meant to build up gradually. I start with the broad shape of the system, then move into the services it runs on, then the stack it is written with, then the EVE-specific data layer and features. When a section makes a technical claim, I tie it back to the relevant files in the repository with inline file references. Those citations are there so the document stays honest. If the code changes, the explanation should change with it.

Treat this as a snapshot of my current understanding, not a permanent specification. The project is still moving, and this log will move with it.

## Building with AI

This project was built with AI. Not partially, not as autocomplete, and not as a small productivity boost. The web app exists because AI made it possible for me to build something I could not have built by hand.

That does not mean I treat the AI like magic. My role in this project has been architecture, research, planning, constraint-setting, review, and direction. I start with the idea for what I want the tool to do, then spend time trying to understand what kind of system that idea belongs in. Once I have a rough model, I work with AI to turn it into small, scoped implementation steps. The AI writes the code. My job is to make sure the work is pointed in the right direction and boxed in by enough rules that the result has a chance of looking like something a good developer would have designed.

The biggest lesson is that AI coding without constraints turns into slop very quickly. It can produce code that looks clean in isolation but duplicates existing logic, bypasses shared boundaries, invents patterns the rest of the repo does not use, or solves the immediate prompt while damaging the system around it. The output can be confident and wrong at the same time. That is the dangerous part.

So the process is not “ask for a feature and accept the answer.” It is closer to: research the problem, turn that into a small plan, give the AI one narrow piece at a time, tell it what it is not allowed to do, run the rails, and review the result against the architecture rather than just the visible page.

A lot of the project’s history is the story of turning painful lessons into rails. Early on, the checks were mostly the familiar ones: lint and tests. [PR #77](https://github.com/StorminRH/lgi-tools/pull/77) changed that into a local definition of done by bundling type-checking, linting, tests, and unused-code analysis into `pnpm verify`. Later, [PR #116](https://github.com/StorminRH/lgi-tools/pull/116) replaced the dead-code-only checker with Fallow, [PR #119](https://github.com/StorminRH/lgi-tools/pull/119) forced the repo through the cleanup needed to make that gate meaningful, and [PR #158](https://github.com/StorminRH/lgi-tools/pull/158) made new duplication fail instead of merely report. The rule did not appear fully formed. It started as “run some checks,” then became “this is what done means.”<sup><a href="#code-ai-verify-package">1</a></sup>

CI repeats that posture instead of trusting me, or an agent, to remember it. The workflow installs from a clean checkout, type-checks, lints, checks that route metadata has not drifted, runs the suite with coverage, and then runs Fallow against the actual change base. The coverage part looks like detail, but it is load-bearing: without it, a cross-cutting AI refactor can make inherited complexity or duplication look newly introduced just because the file entered the diff. The repo learned to make the machine compare the right thing, not just compare something.<sup><a href="#code-ai-ci-workflow">2</a></sup>

The second lesson was that prose rules are too easy for AI to miss. Architecture boundaries, design-token rules, typed API calls, environment handling, and route metadata all started as things a prompt could ask for. That was not good enough. The repo now turns many of those rules into lint checks, static-analysis checks, and build-time assertions. The exact examples get their own later sections, but the pattern is the important part here: “please follow the pattern” became “the repo will reject the wrong pattern.”<sup><a href="#code-ai-eslint-rails">3</a></sup>

Fallow is the wider structural net. It is where the repo checks for unused files and exports, dependency mistakes, boundary violations, complexity, and duplication. The useful lesson there was restraint. The goal was not to build the strictest possible machine. It was to build a machine that catches the failure modes this repo actually had. That is why the config has explicit entries, explicit exceptions, and a duplication baseline instead of pretending every repeated shape is automatically bad. Some repetition is debt. Some is boring framework shape. Some is a bad abstraction waiting to happen. The rail has to know the difference, or it just becomes noise.<sup><a href="#code-ai-fallow-rails">4</a></sup>

The route rails are a good example of that same process, but this is only the high-level version. The repo records what routes exist, what kind of rendering they are supposed to use, and what authorization class each API route belongs to. Later, the dedicated route-assertion section goes through the details. Here, the lesson is simpler: metadata that matters at deploy time cannot live only in my head or in an agent’s prompt. If a route changes, the repo should notice.<sup><a href="#code-ai-route-presence">5</a></sup><sup><a href="#code-ai-route-render-mode">6</a></sup><sup><a href="#code-ai-authz-markers">7</a></sup>

The softer side of this is documentation. [PR #162](https://github.com/StorminRH/lgi-tools/pull/162) moved contributor-facing conventions into a tracked guide instead of an internal working file, and [PR #167](https://github.com/StorminRH/lgi-tools/pull/167) wrote down the shared UI/component pattern. That matters because AI agents are only as good as the constraints they can see. If the repo has a house style but the prompt does not surface it, the AI will invent one. The fix is not to hope the agent guesses right. The fix is to put the decision where both humans and agents can find it.

That is the discipline around the whole project. I am not trying to pretend I hand-wrote a professional-grade application from scratch. I am trying to understand good design well enough to direct AI toward it, then build enough rails that bad output gets caught before it becomes part of the system. When something breaks through those rails, I treat that as a process failure and add a stronger boundary the next time.

<!-- uth:code-excerpts:start -->
<!-- Editor note: each snapshot below is defined by a header carrying id (required),
     file, lines, lang, and an OPTIONAL ref="<40-char commit sha>". A ref turns the
     file:lines label into a pinned GitHub permalink — add it only when `file` is a real
     repository path (never a prose label like a PR review thread), and the precise
     #Lx-Ly anchor is emitted only for a single clean line range. Keep each snapshot to
     about 30 lines; longer context belongs behind the permalink. -->
<!-- uth:code id="code-ai-verify-package" file="package.json" lines="43-50" lang="json" -->
```json
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"fallow": "fallow audit --fail-on-issues",
"fallow:health": "fallow health --coverage coverage/coverage-final.json",
"verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
```

<!-- uth:code id="code-ai-ci-workflow" file=".github/workflows/test.yml" lines="32-69" lang="yaml" -->
```yaml
- run: pnpm typecheck

- run: pnpm lint

# Lightweight presence gate (no build): every src/app route is classified
# in route-classification.json and vice-versa. The full render-MODE assert
# (assert:routes) needs `next build` and runs at deploy, so this catches a
# route added or removed without its classification entry here in plain CI.
- run: pnpm assert:routes-present

# Run the suite WITH coverage so the fallow audit below reads real
# per-function coverage. Without it the audit falls back to a static estimate
# whose new-only attribution can misflag PRE-EXISTING complexity and
# cross-file duplication as "introduced" the moment a PR pulls an already-
# complex/duplicated file into its diff.
- run: pnpm test:coverage

# The `pnpm fallow` script carries `--fail-on-issues`, so the gate now
# fails on ANY finding the changeset INTRODUCES — duplication included.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```

<!-- uth:code id="code-ai-eslint-rails" file="eslint.config.mjs" lines="12-185" lang="js" -->
```js
const cspSelectors = [
  { selector: "JSXAttribute[name.name='style']" },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']" },
  { selector: "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]" },
];

const hexColorSelectors = [
  { selector: "Literal[value=/\[[^\]]*#[0-9a-fA-F]{3,8}/]" },
  { selector: "TemplateElement[value.raw=/\[[^\]]*#[0-9a-fA-F]{3,8}/]" },
  { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]" },
];

const apiFetchSelectors = [
  { selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]` },
  { selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]` },
];

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
  },
];
```

<!-- uth:code id="code-ai-fallow-rails" file=".fallowrc.json" lines="36-163" lang="jsonc" -->
```jsonc
"rules": {
  "unused-files": "error",
  "unused-exports": "error",
  "unused-dependencies": "error",
  "unlisted-dependencies": "error",
  "boundary-violation": "error"
},
"health": {
  "maxCyclomatic": 20,
  "maxCognitive": 15,
  "maxCrap": 30.0,
  "thresholdOverrides": [
    {
      "files": ["src/**/*.tsx"],
      "maxCrap": 9999,
      "reason": "intentional-policy: presentational components are covered by visual/preview review, not unit tests."
    }
  ]
},
"boundaries": {
  "zones": [
    { "name": "ui", "patterns": ["src/components/ui/**"] },
    { "name": "features", "autoDiscover": ["src/features"] },
    { "name": "data", "autoDiscover": ["src/data"] }
  ]
},
"audit": {
  "gate": "new-only",
  "dupesBaseline": "fallow-baselines/dupes.json"
}
```

<!-- uth:code id="code-ai-route-presence" file="scripts/assert-routes-present.mjs" lines="1-67" lang="js" -->
```js
// CI presence check (no build required): every route-defining file under
// src/app has a classification entry in scripts/route-classification.json, and
// every classification entry still has a file. The full render-MODE assert
// (assert-route-classification.mjs) needs a `next build` and runs at deploy.

const missing = [...discovered].filter((k) => !classified.has(k)).sort();
const stale = [...classified].filter((k) => !discovered.has(k)).sort();

if (missing.length || stale.length) {
  console.error(`\nAdd new routes to (and remove deleted ones from) ${CLASSIFICATION_PATH} in the same change.`);
  process.exit(1);
}
```

<!-- uth:code id="code-ai-route-render-mode" file="scripts/assert-route-classification.mjs" lines="1-90" lang="js" -->
```js
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
  process.exit(1);
}
```

<!-- uth:code id="code-ai-authz-markers" file="src/app/api/authz-markers.test.ts" lines="8-77" lang="ts" -->
```ts
// Mechanical authorization-classification guard. Every route handler under
// src/app/api must self-declare its authorization class on its own comment line:
//
//   // authz: public | auth | admin | cron | service
//
// This asserts ONLY that the marker is present, unique, and well-formed.

const MARKER_RE = /^[ \t]*\/\/[ \t]*authz:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_CLASSES = new Set(['public', 'auth', 'admin', 'cron', 'service']);

it.each(ROUTE_FILES)('%s declares exactly one valid authz class', (file) => {
  const src = readFileSync(file, 'utf8');
  const matches = [...src.matchAll(MARKER_RE)];
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.length).toBeLessThan(2);
  expect(VALID_CLASSES.has(matches[0][1])).toBe(true);
});
```
<!-- uth:code-excerpts:end -->

# Services

## Serverless by Design

Before the individual services make sense, the runtime model needs a little setup.

LGI.tools is not built around one permanent server. There is no single Node process sitting there all day, holding memory, running loops, keeping sockets warm, and remembering what happened five minutes ago. Most of the app runs as serverless work: a request arrives, the platform starts or reuses a function, the function does its job, and then that local process can disappear.

That is different from the shape a lot of EVE tools naturally drift toward. EVE projects often want stateful behavior: a bot that stays logged in, a worker that polls ESI on a loop, a socket server that keeps a live map open, a process-local cache of characters or systems, a queue that lives in memory, or a cron script running on a VPS. That model can be straightforward because the server is the place where everything gathers. It is also easy to accidentally make the whole tool depend on one always-on box behaving well.

I wanted LGI.tools to be easier to host, easier to scale down, and harder to break with one stuck process. The tradeoff is that the app cannot pretend local memory is durable. A JavaScript variable is not a shared counter. A timer inside one request is not a scheduler. A cached database socket is not a contract. If a feature needs memory after the request ends, that memory has to live somewhere explicit.

That idea is the thread through the next few sections.

Vercel is the host and the clock. It serves the public pages, runs the request handlers, builds the site, and triggers scheduled routes. That is where the app chooses regional serverless compute near the database instead of spreading everything to the edge. The point is not that edge compute is bad. The point is that LGI.tools spends a lot of time talking to its database, cache, and EVE data sources, so the request handler belongs near the data more than it belongs near every individual visitor.<sup><a href="#code-serverless-vercel">1</a></sup>

Neon is where durable relational state lives. Accounts, linked characters, saved structures, SDE tables, market snapshots, planner inputs, and audit-style records need a real database. But serverless Postgres still has serverless behavior: it can sleep when idle, wake on demand, and expose different connection paths for different jobs. Normal request reads should behave like short fresh calls. The few jobs that need real session-level coordination have to use a more deliberate connection path. That difference is why the Neon section spends time on “one database, two ways in.”<sup><a href="#code-serverless-db">2</a></sup>

Convex is the live layer, not the main filing cabinet. It is useful for small pieces of state that should react on screen without the browser polling: online status, presence, and the live-sync machinery around them. But it is also the place where I learned that “live” can become expensive if I treat every changing thing as a subscription. In a serverless architecture, a live system is powerful because it gives the app a place to coordinate without a permanent app server. It also needs a narrow job.

Upstash Redis is the shared short-term memory. A serverless function cannot enforce rate limits, abuse controls, or a shared ESI budget with an in-process map because there may be many function instances and none of them is guaranteed to survive. Redis gives the app a small common scratchpad for counters, retry blocks, and cache metadata. The important distinction is that module state can cache a client, but it cannot be the truth for a cross-request limit.<sup><a href="#code-serverless-rate-limit">3</a></sup>

Once I accepted that split, some failure modes became easier to reason about. Build-time database reads get their own cold-start retry because a sleeping database should not randomly kill a deploy, but that retry must never hide real SQL errors or cache an empty result. Scheduled work is declared as platform cron routes, not as a custom worker loop. Preview database branches need cleanup because managed services still create real external state. Those details are small, but they all come from the same rule: state has to be placed deliberately.<sup><a href="#code-serverless-cold-start">4</a></sup><sup><a href="#code-serverless-preview-cleanup">5</a></sup>

So “serverless by design” does not mean the app has no state. LGI.tools has plenty of state. The point is that each kind of state has a home: durable records in Neon, live reactive state in Convex, short-lived counters in Redis, scheduled execution in Vercel, and source-of-truth EVE data behind the ESI/SDE boundaries. The rest of this infrastructure chapter is really about those homes, and the mistakes that taught me where the boundaries needed to be.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-serverless-vercel" file="vercel.json" lines="3-39" lang="json" -->
```json id="b9mqe2"
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

<!-- uth:code id="code-serverless-db" file="src/db/index.ts" lines="17-103" lang="ts" -->
```ts id="f4x2vz"
function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  // Neon HTTP driver: one `fetch` per query, no TCP connection held. A Neon
  // compute that has scaled to zero slows the first query instead of erroring
  // it on a dead socket — that's the production-outage fix.
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}

export function resolveLockConnectionUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isPooledHost(url)) {
    throw new Error(
      'Refusing to hold a session advisory lock on a pooled (-pooler) connection: ' +
        'set DATABASE_URL_UNPOOLED to the direct Neon endpoint. ' +
        'Session-scoped locks do not hold through PgBouncer transaction-mode pooling.',
    );
  }
  return url;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const directClient: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getDirectClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

<!-- uth:code id="code-serverless-rate-limit" file="src/lib/rate-limit.ts" lines="7-113" lang="ts" -->
```ts id="6w5h9v"
// Shared sliding-window rate limiter backed by Upstash Redis. Stateless
// across Vercel serverless invocations (in-process counters don't survive
// scale-out, so we cannot use a Map here).
//
// One limiter instance per `name` is memoised — recreating Ratelimit on
// every call would still work but allocates a new internal cache each
// time. The Upstash SDK is connectionless (REST under the hood), so module
// state is safe across serverless cold starts.

const limiters = new Map<string, Ratelimit>();

function getLimiter(options: RateLimitOptions): Ratelimit {
  const cacheKey = `${options.name}:${options.perMinute}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl()!, token: redisToken()! }),
    limiter: Ratelimit.slidingWindow(options.perMinute, "60 s"),
    analytics: true,
    prefix: `lgi:ratelimit:${options.name}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

await result.pending;
```

<!-- uth:code id="code-serverless-cold-start" file="src/lib/neon-cold-start-retry.ts" lines="3-76" lang="ts" -->
```ts id="p6w8gn"
// Retry wrapper for the prerender-reachable `'use cache'` DB reads. During
// `next build`, static prerender can hit a Neon compute that scaled to zero,
// and Vercel never retries a failed prerender: one connection-class error kills
// the whole deploy.
//
// Design constraints:
// - NEVER catch-and-return-empty — an empty result would be cached into the
//   long-lived `use cache` entries.
// - Retry ONLY the connection-class error signature of a cold start.
// - The whole envelope must stay well under Next's ~50 s prerender cache-fill
//   ceiling.

export async function withColdStartRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isNeonColdStartError(err)) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `[neon-cold-start-retry] attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

<!-- uth:code id="code-serverless-preview-cleanup" file=".github/workflows/delete-neon-branch.yml" lines="5-33" lang="yaml" -->
```yaml id="wuhfag"
# Previews are manual-on-demand only. When someone spins up a manual
# preview, the Vercel ↔ Neon integration creates `preview/<branch-name>` but
# never deletes it on PR close — this workflow does.

on:
  pull_request:
    types: [closed]

jobs:
  delete-branch:
    runs-on: ubuntu-latest
    steps:
      - name: Delete preview/<branch> in Neon
        continue-on-error: true
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch: preview/${{ github.event.pull_request.head.ref }}
          api_key: ${{ secrets.NEON_API_KEY }}
```
<!-- uth:code-excerpts:end -->

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

## Neon

Neon is the boring part of LGI.tools on purpose: it is Postgres.

That was the appeal. I did not want the project’s most important records living in a clever app-specific store that only made sense while the current architecture stayed exactly the same. Accounts, linked EVE characters, tokens, market snapshots, SDE tables, planner inputs, structures, telemetry, and purge records all need to survive beyond one request and outlive whatever UI I build on top of them. For that kind of state, I wanted a real relational database with migrations, constraints, indexes, SQL, and a data model I could inspect directly.

Neon gives me that, but in a shape that fits the rest of the serverless stack. It is still Postgres, but it is managed like a cloud service: it can branch, it can scale down when idle, and it has connection options meant for short-lived serverless functions. That combination is the reason it fit LGI.tools. I got the familiarity of Postgres without having to run a permanent database server myself.

The tradeoff is that “serverless Postgres” is not the same mental model as a traditional always-on database sitting beside a VPS. A quiet database can be asleep. A preview branch can be a real copy of the data shape, not just a pretend environment. A pooled connection can be exactly right for normal web traffic and exactly wrong for code that depends on a stable database session. The service makes some hard things easier, but it also means the repo has to be explicit about which kind of database access each job is allowed to use.

That is why this section is called “one database, two ways in.” The database itself is the durable core. The connection path is the part that needed discipline.

The repo keeps the data model feature-shaped instead of piling every table into one giant schema file. Feature and data slices own their tables near the code that uses them, then `src/db/schema.ts` re-exports those slices so Drizzle sees one complete relational model when it generates migrations. That is a small structure decision, but it matters with AI-generated code. A new feature can add its own schema without being allowed to invent a second database pattern. The later feature chapters explain what these slices actually do; this section is about the database boundary itself.<sup><a href="#code-neon-schema">1</a></sup>

The first path is the normal request path. Most user-facing reads should be short, fresh, and disposable. A Vercel function wakes up, asks the database for what it needs, returns the page or API response, and goes away. For that work, the repo uses Neon’s HTTP driver. That choice came from [PR #58](https://github.com/StorminRH/lgi-tools/pull/58), after the site hit a serverless failure mode I had not fully appreciated: when the hosted database scaled down, a long-held connection could look fine from the app’s side but be dead in practice. The first visitor after a quiet period could get a database error instead of a page. Moving request-path reads to the HTTP driver changed the shape of that failure. Each query behaves like a fresh HTTP request, so a sleeping compute turns into a slower first read instead of a stale socket.<sup><a href="#code-neon-request-db">2</a></sup>

That fixed production and immediately broke local development. A local Docker Postgres is not a Neon HTTP endpoint. [PR #60](https://github.com/StorminRH/lgi-tools/pull/60) added the explicit local-only escape hatch: when `LOCAL_DB_DRIVER=postgres-js`, the request path uses a TCP driver locally, while production and preview stay on Neon HTTP. I like that compromise because it does not hide the difference. The repo admits that local and hosted environments have different connection mechanics, then fences that difference behind one env-controlled branch instead of scattering special cases through the app.<sup><a href="#code-neon-request-db">2</a></sup>

The second path exists because a few jobs need a stable Postgres session. Most of the app should not hold database sessions open. But some shared data refreshes need database-level coordination so two copies do not rewrite the same tables at the same time. In [PR #34](https://github.com/StorminRH/lgi-tools/pull/34), I learned that the original lock path was not as safe as it looked. The jobs were using Neon’s pooled endpoint, and PgBouncer transaction pooling can recycle the backend between statements. A session-scoped advisory lock only means something if the session is stable. Through the pooler, the code could appear to take a lock while not actually serializing the work.

That became a hard boundary: request-path queries use the connectionless HTTP lane; lock-holding jobs use the direct, unpooled lane. The resolver prefers `DATABASE_URL_UNPOOLED`, falls back to `DATABASE_URL` for local Docker, and fails closed if the resolved URL is still a `-pooler` host. That fail-closed part is important. A missing direct connection should stop the job, not let it run with a lock that only looks real.<sup><a href="#code-neon-direct-db">3</a></sup>

[PR #49](https://github.com/StorminRH/lgi-tools/pull/49) tightened that into a regression rail. The resolver test proved the rule in isolation, but there was still a gap: a future refactor could accidentally construct the direct client without going through the resolver. The added test mocks the `postgres` driver and touches the lazy proxy, proving that `directClient` actually resolves through the unpooled path and throws before constructing anything when only a pooled URL is available. That is exactly the kind of bug AI can reintroduce during “cleanup” work, so the code now tests the wiring, not just the helper.<sup><a href="#code-neon-direct-tests">4</a></sup><sup><a href="#code-neon-connection-tests">5</a></sup>

There is also a build-time version of the same database lesson. Once pages became mostly static or partial-prerendered, `next build` itself started reading from Neon. That made database sleep behavior a deploy concern, not just a runtime concern. [PR #99](https://github.com/StorminRH/lgi-tools/pull/99) added a narrow retry wrapper around build-time cached reads: retry the cold-start-shaped database errors, never retry real SQL or logic errors, and never return an empty result just to make a build pass. The data-pipeline chapter later gets into the specific bootstrap work that had to be narrowed after a deploy failure; the Neon lesson is simpler: build-time database reads have their own failure mode, and pretending they are the same as request-time reads is how bad cached output gets shipped.

That is the pattern Neon forced into the architecture. The database is durable, but the connection is not a generic detail. Normal reads, coordinated background writes, build-time reads, local development, and preview cleanup all have different failure modes. The mistake would be treating Postgres as one simple resource and letting every AI-generated feature reach for it however it wants.

The better rule is more specific: put durable relational state in Neon, keep schemas owned by their feature slices, use HTTP for request-path work, use direct unpooled sessions only when a job truly needs session semantics, and make dangerous paths fail loudly when the environment is wrong.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-neon-schema" file="src/db/schema.ts" lines="3-20" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts id="r6v2bk"
// Feature tables live alongside their feature in `src/features/<name>/schema.ts`
// and are re-exported from here so drizzle-kit sees them all in one place.
// Schema stays extensible; features add their own tables.

export * from '../features/wormhole-sites/schema';
export * from '../data/eve-data/schema';
export * from '../data/market-prices/schema';
export * from '../data/market-history/schema';
export * from '../data/industry-indices/schema';
export * from '../features/auth/schema';
export * from '../features/owned-blueprints/schema';
export * from '../features/owned-assets/schema';
export * from '../features/owned-structures/schema';
export * from '../features/custom-structures/schema';
export * from '../features/skill-queue/schema';
export * from '../features/industry-jobs/schema';
export * from '../data/telemetry/schema';
export * from '../data/gsc/schema';
```

<!-- uth:code id="code-neon-request-db" file="src/db/index.ts" lines="17-42" lang="ts" -->
```ts id="nv7hk4"
function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  // Neon HTTP driver: one `fetch` per query, no TCP connection held. A Neon
  // compute that has scaled to zero slows the first query instead of erroring
  // it on a dead socket — that's the production-outage fix.
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  // Dev-only escape hatch: the neon-http driver speaks HTTP to a Neon SQL
  // endpoint and cannot reach a plain local Postgres, so local `next dev`
  // would 500 every request-path DB read.
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}
```

<!-- uth:code id="code-neon-direct-db" file="src/db/index.ts" lines="45-103" lang="ts" -->
```ts id="h9m3qd"
// A Neon connection string is "pooled" when its host carries the `-pooler`
// suffix — that endpoint is PgBouncer in transaction mode, which recycles the
// underlying backend between statements and so cannot hold a session-scoped
// advisory lock.

export function resolveLockConnectionUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isPooledHost(url)) {
    throw new Error(
      'Refusing to hold a session advisory lock on a pooled (-pooler) connection: ' +
        'set DATABASE_URL_UNPOOLED to the direct Neon endpoint. ' +
        'Session-scoped locks do not hold through PgBouncer transaction-mode pooling.',
    );
  }
  return url;
}

function getDirectClient(): Sql {
  if (_directClient) return _directClient;
  _directClient = postgres(resolveLockConnectionUrl(), { max: 3 });
  return _directClient;
}

export const directClient: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getDirectClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

<!-- uth:code id="code-neon-direct-tests" file="src/db/direct-client.test.ts" lines="5-43" lang="ts" -->
```ts id="mz2v18"
// Guards C-1: the lock-holder connection `directClient`
// must resolve its URL through resolveLockConnectionUrl, so it stays fail-closed off
// a pooled (`-pooler`) endpoint even if the connection wiring is later refactored.
// connection.test.ts guards the resolver in isolation; this guards that directClient
// actually goes through it — the gap a wiring change could silently reopen.

describe('directClient wiring (lock-holder connection)', () => {
  it('constructs on the unpooled endpoint via resolveLockConnectionUrl', async () => {
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('DATABASE_URL_UNPOOLED', DIRECT);
    const { directClient } = await import('./index');
    void directClient.reserve; // trigger the lazy Proxy → getDirectClient()
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(DIRECT, expect.anything());
  });

  it('fails closed when only a pooled connection is configured', async () => {
    vi.stubEnv('DATABASE_URL', POOLED); // no DATABASE_URL_UNPOOLED
    const { directClient } = await import('./index');
    expect(() => void directClient.reserve).toThrow(/-pooler/);
    expect(postgresMock).not.toHaveBeenCalled(); // threw before constructing
  });
});
```

<!-- uth:code id="code-neon-connection-tests" file="src/db/connection.test.ts" lines="40-66,77-84" lang="ts" -->
```ts id="p5vqun"
describe('resolveLockConnectionUrl', () => {
  it('prefers DATABASE_URL_UNPOOLED and resolves to a non-pooled host', () => {
    const url = resolveLockConnectionUrl({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
    });
    expect(url).toBe(DIRECT);
    expect(isPooledHost(url)).toBe(false);
  });

  it('fails closed when only a pooled DATABASE_URL is available', () => {
    expect(() => resolveLockConnectionUrl({ DATABASE_URL: POOLED })).toThrow(
      /-pooler/,
    );
  });
});

describe('request-path db (Neon HTTP driver)', () => {
  it('lazily constructs the neon-http client off DATABASE_URL on first use', async () => {
    const { db } = await import('./index');
    expect(neonMock).not.toHaveBeenCalled();
    void db.select;
    expect(neonMock).toHaveBeenCalledWith(POOLED);
  });
});
```
<!-- uth:code-excerpts:end -->

## Convex

Convex is the service in the stack that needs the most explanation, because it does not map cleanly to the older “app server plus database” picture.

The short version is that Convex gives an app a backend built around live data. It has a database, server-side functions, and client libraries that know how to subscribe to query results. A browser asks for data through a Convex query. Convex tracks what that query read. When the underlying data changes, the subscribed client can update without me building a separate websocket server, cache-invalidation layer, or polling loop.

That is why it was attractive for LGI.tools. EVE has several kinds of data that feel like they should move while the user is looking at the page: whether a character is online, whether a sync is running, whether shared map state changed, who is currently looking at a thing, and eventually the edits multiple scouts make to the same wormhole chain. In a more traditional EVE-tool setup, I might solve that with an always-on worker, a websocket server, an in-memory presence map, and a database behind it. Convex offered a managed version of that live coordination layer that fit better with the serverless shape of the rest of the project.

The catch is that Convex makes live state feel easy, and that is exactly where it can become dangerous. A reactive query is not just a nicer database read. It is a subscription. A write is not just a stored value. It may wake up clients. A heartbeat is not just a tiny ping. It is a repeated function call with cost and fan-out attached. The lesson I had to learn was that “this data changes” is not the same thing as “this data belongs in Convex.”

That is where the whiteboard metaphor came from. Neon is the filing cabinet: durable records, relational truth, tables I can rebuild features around. Convex is the whiteboard: small, live, watched state that should change in front of people while they are using the app. A whiteboard is useful because everyone looking at it sees the same thing. It is not where I should store every document in the building.

The current Convex schema encodes that boundary directly. Convex is a regenerable projection keyed by the same `userId` and `characterId` identities that live in Neon. It is not the system of record and it is not a home for EVE’s static domain data. If the Convex tables are wiped, the app should be able to rebuild the state from Neon plus EVE’s API. That boundary had to be clear before I could safely direct AI into the live-data work.<sup><a href="#code-convex-schema">1</a></sup>

[PR #90](https://github.com/StorminRH/lgi-tools/pull/90) was the foundation, and it was deliberately narrow. It connected Convex to the existing sign-in system without moving token custody there. Convex validates a short-lived JWT minted by the Next app, using the Better Auth user id as the subject. The browser-side client is also null-safe: if no Convex deployment URL is configured, the rest of the site keeps running. That matters because Convex is an optional live layer around specific features, not the thing the whole app must boot through.<sup><a href="#code-convex-auth">2</a></sup><sup><a href="#code-convex-client">3</a></sup>

The first real use case was broader than the system eventually needed. [PR #94](https://github.com/StorminRH/lgi-tools/pull/94) proved the end-to-end path with live skill queues: signed-in user identity, server-side character enumeration, external EVE reads, batched Convex writes, and reactive reads back to the page. Then [PR #97](https://github.com/StorminRH/lgi-tools/pull/97) generalized that into a presence-gated sync engine. A visible tab heartbeats the subject, a Convex cron scans due subjects, and bounded sync work keeps the data fresh while someone is watching. The goal was reasonable: cost should scale with subjects people are actively watching, not with the total number of linked characters sitting in the account database.<sup><a href="#code-convex-engine">4</a></sup>

That was a good architecture experiment, but it also exposed the mistake. Skill queues, personal industry jobs, and corporation industry jobs were useful features, but they were not really whiteboard data. They were slow EVE API data with cache windows. The visible countdowns could be derived in the browser from timestamps. Keeping an always-on reactive connection for them made the architecture more expensive without making the data meaningfully more live. [PR #175](https://github.com/StorminRH/lgi-tools/pull/175) moved those boards back to Neon as stale-gated on-view reads, and [PR #176](https://github.com/StorminRH/lgi-tools/pull/176) removed the dormant Convex tables and narrowed the engine down to one live consumer.

That correction changed the rule. Convex is not the place for “anything that updates.” Convex is for state where the live coordination itself is the feature.

The current keeper consumer is online status. [PR #174](https://github.com/StorminRH/lgi-tools/pull/174) added the live dot on character portraits before the slower boards moved away, so the engine would still have a real live feature exercising it. Online status is a better fit: it is tiny, it changes when the character logs in or out, and the user experience genuinely benefits from seeing that flip without a manual refresh. Even there, the implementation avoids noisy writes. An unchanged read writes nothing, an errored read keeps the last-known state, and a fresh response only patches the row if the online value or ETag actually changed. In a reactive system, no-op writes are not harmless because they can wake readers for no user-visible reason.<sup><a href="#code-convex-online">5</a></sup>

The client side of the engine follows the same rule. `useSyncSubject` does not poll the data endpoint. It sends a heartbeat over the existing Convex connection while the tab is visible, stops when the tab is hidden, and beats immediately when the tab becomes visible again. The server-side cold window owns the teardown. That means a background tab does not keep syncing just because it was once open, and a returning tab refreshes quickly without turning every hidden browser into background work.<sup><a href="#code-convex-heartbeat">6</a></sup>

The cost lessons are now part of the code. The engine separates the heartbeat clock from the sync cadence. Heartbeats are just liveness; dataset cadence lives in a registry. Presence lives in its own table so interval beats do not invalidate the heavier watched payload through Convex’s reactivity model. The scan has batch caps because a live backend still has capacity walls. These details are not incidental. They are the guardrails that keep a live system from becoming a quiet bill generator.<sup><a href="#code-convex-sync-config">7</a></sup><sup><a href="#code-convex-engine">4</a></sup>

The bigger reason Convex still matters is the mapper. A wormhole map is different from a skill queue. It is user-authored shared state: signatures, connections, notes, topology, presence, and edits that multiple scouts need to see together. That is the kind of data that actually behaves like a whiteboard. The current online-status tracker keeps the engine alive and proven, but the architecture is really being held open for that future use case.

So the Convex rule is now much clearer than it was when the live trackers first landed: use Convex for regenerable, live, watched state; keep durable truth and slow cached data in Neon; never store EVE token custody in Convex; and treat every reactive write as something that can wake up readers. Live is a feature, not a default storage choice.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-convex-schema" file="convex/schema.ts" lines="6-29,82-108" lang="ts" -->
```ts
// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data. Wiping these tables and re-syncing must
// reproduce the same state from Neon + ESI.
//
// Since MIGRATE.B the engine serves a SINGLE live consumer — onlineStatus.

export default defineSchema({
  syncSubjects: defineTable({
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    lastRequestedAt: v.number(),
    workId: v.union(v.string(), v.null()),
    nextDueAt: v.union(v.number(), v.null()),
    minExpiresAt: v.union(v.number(), v.null()),
    syncedCharacterIds: v.array(v.number()),
  }).index('by_user_dataset', ['userId', 'dataset']),

  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),
});
```

<!-- uth:code id="code-convex-auth" file="convex/auth.config.ts" lines="5-46" lang="ts" -->
```ts
// Validation of the spine's Convex-facing JWT. The minting side lives in the
// Next.js app (Better Auth jwt plugin): ES256, `iss` = BETTER_AUTH_URL,
// `aud` = 'convex', `sub` = the Better Auth user id.
//
// No EVE credentials ever live in Convex; token custody and refresh stay on
// the Neon side.

const issuer = process.env.AUTH_ISSUER_URL;
const jwks = process.env.AUTH_JWKS;

export default {
  providers:
    issuer && jwks
      ? [
          {
            type: 'customJwt',
            issuer,
            algorithm: 'ES256',
            jwks,
            applicationID: 'convex',
          },
        ]
      : [],
} satisfies AuthConfig;
```

<!-- uth:code id="code-convex-client" file="src/data/convex/client.ts, src/features/auth/components/ConvexClientProvider.tsx" lines="5-15,23-52" lang="tsx" -->
```tsx
// NEXT_PUBLIC_CONVEX_URL is a literal static read by design: Next inlines it
// into every bundle at build time, and on Vercel the value exists ONLY in the
// build env. When unset, the client is null and every consumer degrades
// gracefully — the rest of the site runs.

export const convexClient: ConvexReactClient | null = url ? new ConvexReactClient(url) : null;

function useAuthForConvex() {
  const { session, loading } = useAuth();
  const isAuthenticated = session !== null;

  const fetchAccessToken = useCallback(async () => {
    try {
      const result = await apiFetch(tokenEndpoint);
      return result.ok ? result.data.token : null;
    } catch {
      return null;
    }
  }, []);

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
```

<!-- uth:code id="code-convex-engine" file="convex/engine.ts" lines="3-35,84-112,121-132" lang="ts" -->
```ts
// THE presence-gated sync engine. A subject (dataset × user) is refreshed on
// its dataset's cadence only while some visible tab is heartbeating it; cost
// scales with concurrently-watched subjects, never with total linked characters.
//
// Mechanism: heartbeats maintain presence and dispatch immediately when the
// data is stale; a static 30s cron scans subjects whose nextDueAt has arrived,
// skips cold or still-running ones, and dispatches the rest through the Workpool.

const pool = new Workpool(components.workpool, { maxParallelism: 4 });

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

const syncDatasetValidator = v.literal('onlineStatus');

const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

export const SCAN_DISPATCH_BATCH = 1024;
```

<!-- uth:code id="code-convex-online" file="convex/onlineStatus.ts" lines="23-44,75-123,125-155" lang="ts" -->
```ts
// The COLD-equivalent viewer wire: the calling user's per-character online flag.
// The apply writes that table ONLY on a genuine online↔offline change, so this
// query re-fires only when a character's online state actually flips.

export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, online: doc.online })),
    };
  },
});

async function applyOnlineResult(ctx, userId, result, existing) {
  if (result.error !== null) return null;
  if (result.online === null) return result.expiresAt;

  if (existing === undefined) {
    await ctx.db.insert('characterOnline', {
      userId,
      characterId: result.characterId,
      online: result.online,
      etag: result.etag,
    });
  } else if (existing.online !== result.online || existing.etag !== result.etag) {
    await ctx.db.patch(existing._id, { online: result.online, etag: result.etag });
  }
  return result.expiresAt;
}
```

<!-- uth:code id="code-convex-heartbeat" file="src/data/convex/use-sync-subject.ts" lines="5-53" lang="ts" -->
```ts
// The client half of the presence-gated sync engine: a visibility-gated
// heartbeat. While the tab is visible, beat every HEARTBEAT_MS; on hide, stop;
// on return, beat immediately so a stale view refreshes at once.

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const beat = (reason: 'mount' | 'visible' | 'interval') =>
      void heartbeat({ dataset, characterIdsHint, reason });

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (reason: 'mount' | 'visible') => {
      beat(reason);
      timer = setInterval(() => beat('interval'), HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    if (document.visibilityState === 'visible') start('mount');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dataset, characterIdsKey, heartbeat]);
}
```

<!-- uth:code id="code-convex-sync-config" file="src/lib/sync-engine.ts" lines="16-63,76-97" lang="ts" -->
```ts
// The engine serves a SINGLE live consumer: onlineStatus. The three slow
// trackers moved to Neon stale-gated on-view reads in MIGRATE.B.

export const SYNC_DATASETS = ['onlineStatus'] as const;

export const SYNC_DATASET_CONFIG: Record<
  SyncDataset,
  { cadenceFloorMs: number; tokenGroup: string }
> = {
  onlineStatus: { cadenceFloorMs: 60_000, tokenGroup: 'char-online' },
};

export const HEARTBEAT_MS = 20_000;
export const COLD_AFTER_MS = 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;

export function isColdFromPresence(lastSeenAt: number | null, now: number): boolean {
  return lastSeenAt === null || isCold(lastSeenAt, now);
}

export function isRunningFresh(
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): boolean {
  return status === 'running' && now - lastRequestedAt < STALE_RUNNING_MS;
}
```
<!-- uth:code-excerpts:end -->

## Redis

Redis is a small tool with a big temptation.

At its core, Redis is a fast key-value store. It is good at things like counters, short-lived cache entries, locks, queues, and little bits of shared operational memory. Upstash gives me that shape as a managed service that works well from serverless runtimes: instead of opening a long-lived TCP connection from a permanent app server, the app can talk to Redis through a connectionless service boundary that fits Vercel functions.

That made it useful for LGI.tools right away. A serverless function cannot safely say, “I’ll just keep this counter in memory.” There may be several function instances, they may start and stop independently, and none of them is guaranteed to see what the others saw. If I need a public feedback route to know how many times an IP has posted recently, or an ESI wrapper to know whether the whole app is near a shared API budget limit, that memory has to live somewhere outside the function.

But Redis is not a database in the way Neon is a database. That distinction matters. Redis is fast, shared, and convenient, which means it is very easy to start putting too much in it. The line I try to keep is simple: Redis can remember the operational state the app needs right now, but it should not become a second source of durable truth. If Redis disappears, LGI.tools may slow down, pause, or refuse some work. It should not forget what a character owns, what a structure is, or what the SDE says.

So Upstash has the narrowest job of the infrastructure services. Vercel runs the app. Neon keeps durable records. Convex handles small live projections. Upstash Redis is the shared scratchpad: rate limits, short-lived blocks, ESI budget mirrors, and cache metadata.

The first use was the easiest one to understand: rate limiting. [PR #29](https://github.com/StorminRH/lgi-tools/pull/29) added an Upstash-backed limiter for public POST routes. The feedback endpoint needed it because an unthrottled feedback form is a Discord-webhook spam vector. The market-price refresh endpoint needed it because the Industry Planner was going to let browsers request live price refreshes. Those are not permanent records, but they do need to be shared across every serverless instance handling traffic at that moment. An in-process `Map` would only protect one function instance. Upstash gives all of them the same counter.<sup><a href="#code-upstash-rate-limit">1</a></sup><sup><a href="#code-upstash-route-usage">2</a></sup>

That small feature also caught a real integration lesson. [PR #30](https://github.com/StorminRH/lgi-tools/pull/30) fixed a production failure caused by the app expecting one set of environment variable names while the Vercel marketplace integration provided another. The same Redis database existed, but the app was not reading the contract Vercel gave it. The limiter failed closed, which was the right safety posture, but it meant protected routes returned 500 in production. The fix was not to make the limiter permissive. The fix was to accept both provisioning shapes, prefer the Vercel marketplace names when present, and cover that behavior in tests. Managed services still have contracts, and those contracts need rails too.<sup><a href="#code-upstash-rate-limit">1</a></sup>

The second use is the one that matters most to the EVE side of the project: shared API budgeting. CCP’s API limits are not scoped to one JavaScript process. LGI.tools might have several serverless instances running at once, and all of them are spending from the same practical ESI budget. If each instance kept its own memory of recent responses, they would all make locally reasonable decisions that add up to a globally bad one.

That is why [PR #92](https://github.com/StorminRH/lgi-tools/pull/92) moved the ESI budget mirror into Redis. Before an ESI request goes out, the wrapper can ask the shared scoreboard what the app has recently observed: error counts, retry blocks, cached ETags, and route-specific cooldowns. After a response comes back, it can report what it learned so the next instance sees the same picture. The ESI section later goes deeper on the policy. The Redis point is simpler: the budget memory has to be shared because the budget risk is shared.<sup><a href="#code-upstash-scoreboard-resolver">3</a></sup>

This is also where Redis’ disposability is useful instead of scary. An ESI retry block is not a permanent fact. A budget echo is not user data. An ETag cache entry is only useful inside a response window. These values should expire. They should be cheap to read and write. They should be available to all serverless instances. That is Redis’ lane.<sup><a href="#code-upstash-redis-scoreboard">4</a></sup>

The failure behavior follows from that lane. If Redis is missing in development, the app can use an in-memory fallback so local work is not blocked. In production, missing Redis is different. If the shared ESI scoreboard is not configured, automated ESI dispatch should fail closed instead of pretending each instance has enough context to keep calling upstream. A paused refresh is annoying. Blindly spending a shared external API budget is worse.

[PR #117](https://github.com/StorminRH/lgi-tools/pull/117) cleaned up the scoreboard after it grew past its original shape. The first version had too much packed into one shared utility: types, key construction, Redis storage, memory fallback, and request policy. Splitting those pieces did not change the feature, but it made the boundary easier to review. That matters in an AI-built repo because a giant “shared helper” file invites the next agent to add one more unrelated responsibility. Smaller modules make the job harder to misunderstand.

That is the Upstash rule now: Redis is memory the whole serverless app can share, not a place to hide durable product state. It coordinates, throttles, blocks, and caches short-lived operational facts. When it is present, the app can make better shared decisions. When it is absent, the app should be conservative, not clever.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-upstash-rate-limit" file="src/lib/rate-limit.ts" lines="7-123" lang="ts" -->
```ts
// Shared sliding-window rate limiter backed by Upstash Redis. Stateless
// across Vercel serverless invocations (in-process counters don't survive
// scale-out, so we cannot use a Map here).
//
// One limiter instance per `name` is memoised. The Upstash SDK is
// connectionless (REST under the hood), so module state is safe across
// serverless cold starts.

function redisUrl(): string | undefined {
  return readEnv("KV_REST_API_URL") ?? readEnv("UPSTASH_REDIS_REST_URL");
}

function redisToken(): string | undefined {
  return readEnv("KV_REST_API_TOKEN") ?? readEnv("UPSTASH_REDIS_REST_TOKEN");
}

function getLimiter(options: RateLimitOptions): Ratelimit {
  const cacheKey = `${options.name}:${options.perMinute}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl()!, token: redisToken()! }),
    limiter: Ratelimit.slidingWindow(options.perMinute, "60 s"),
    analytics: true,
    prefix: `lgi:ratelimit:${options.name}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export async function rateLimit(
  identifier: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  if (!isConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }
    throw new Error(
      "Rate limiter not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (direct Upstash)",
    );
  }

  const limiter = getLimiter(options);
  const result = await limiter.limit(identifier);
  await result.pending;

  if (result.success) return { ok: true, remaining: result.remaining };
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfter };
}
```

<!-- uth:code id="code-upstash-route-usage" file="src/app/api/feedback/route.ts, src/app/api/market-prices/refresh/route.ts" lines="18-21,73-84;54-65" lang="ts" -->
```ts
// Feedback POSTs fan out to a Discord webhook, so an unthrottled endpoint is a
// webhook-spam vector. 5/min is generous for a real user typing thoughtfully
// but cuts a scripted flood off fast.

const limit = await rateLimit(clientIdentifier(request.headers), {
  name: 'feedback',
  perMinute: FEEDBACK_LIMIT_PER_MINUTE,
});
if (!limit.ok) {
  return Response.json(
    { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
    {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfter) },
    },
  );
}

// Market-price refresh uses the same shared limiter shape.
const limit = await rateLimit(clientIdentifier(request.headers), {
  name: "market-prices-refresh",
  perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
});
```

<!-- uth:code id="code-upstash-scoreboard-resolver" file="src/lib/esi/scoreboard/index.ts" lines="8-77" lang="ts" -->
```ts
// Shared ESI budget scoreboard. CCP's limits are per-IP / per-app — shared
// across every serverless instance we run — so the mirror of what we've spent
// must be shared too. Upstash Redis is the real, shared thing; the in-process
// fallback is for dev/test only.

function redisUrl(): string | undefined {
  return readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
}

function redisToken(): string | undefined {
  return readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
}

export function resolveScoreboard(): EsiScoreboard | null {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    const cached = redisScoreboards.get(url);
    if (cached) return cached;
    const created = new RedisScoreboard(url, token);
    redisScoreboards.set(url, created);
    return created;
  }

  if (process.env.NODE_ENV !== 'production') {
    memoryScoreboard ??= new MemoryScoreboard();
    return memoryScoreboard;
  }

  console.error('[esi] budget scoreboard not configured ... ESI dispatch is failing closed');
  return null;
}
```

<!-- uth:code id="code-upstash-redis-scoreboard" file="src/lib/esi/scoreboard/redis.ts" lines="29-105,108-184" lang="ts" -->
```ts
// Hard timeout on every Redis REST call — the scoreboard sits on the go/no-go
// path of every ESI call and must fail fast, not stall it.
const REDIS_TIMEOUT_MS = 1500;

// Upstash Redis (REST over plain fetch, so it runs in every serverless/runtime path that needs shared memory).
export class RedisScoreboard implements EsiScoreboard {
  async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
    const minute = epochMinute();
    const pipeline = this.redis.pipeline();
    pipeline.get(keyErrorCount(minute));
    pipeline.get(keyErrorCount(minute - 1));
    pipeline.get(KEY_ERROR_ECHO);
    pipeline.get(keyBlock(normalizeEsiPath(url)));
    if (wantEtag) pipeline.get(keyEtagMeta(url));
    const rows = await pipeline.exec<(string | null)[]>();

    const selfCount =
      (parseStoredInt(rows[0]) ?? 0) + (parseStoredInt(rows[1]) ?? 0);
    const echo = parseStoredInt(rows[2]);

    return {
      effectiveRemaining: Math.min(
        echo ?? ESI_ERROR_CEILING,
        ESI_ERROR_CEILING - selfCount,
      ),
      blockedRetryAfter: blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
      etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
    };
  }

  async report(report: EsiReport): Promise<void> {
    const pipeline = this.redis.pipeline();
    const queued = [
      this.queueErrorCount(pipeline, report),
      this.queueErrorEcho(pipeline, report),
      this.queueGroupState(pipeline, report),
      this.queueRetryBlock(pipeline, report),
      this.queueEtag(pipeline, report),
    ];
    if (queued.some(Boolean)) await pipeline.exec();
  }
}
```

<!-- uth:code-excerpts:end -->

# Stack

## The Toolchain

The service sections explain where LGI.tools runs. This section is about what the app is written with, and why those choices matter.

I do not think about the stack as a list of favorite technologies. That would be the wrong framing for this project. LGI.tools was built with AI, so the tools around the code have to do more than make development pleasant. They have to make the project harder to accidentally damage.

That shaped almost every choice.

I wanted boring, common, well-documented tools where possible. Not because boring is exciting, but because an AI agent is much more likely to stay inside the rails when the rails are built around familiar patterns. A strange custom framework would put more hidden context in my head. A conventional TypeScript/React/Next/Postgres stack gives the repo patterns that are easier to inspect, easier to test, and easier to explain back to the next coding session.

So the stack is less about taste and more about leverage. Each tool gives the repo a kind of pressure I can use: TypeScript for static shape, Zod for runtime validation, Drizzle for database schema, Better Auth for session scaffolding, Tailwind for UI composition, Vitest for behavior, ESLint for local bans, Fallow for repo structure, and Next.js/Vercel for the app and deployment model.

The public repo started from a fairly ordinary modern web shape: Next.js, React, TypeScript, Tailwind, Drizzle, Postgres, Vercel, pnpm, and Vitest. [PR #22](https://github.com/StorminRH/lgi-tools/pull/22) was the point where it stopped feeling like a private experiment and started acting like a project someone else could clone: a README, license, `.env.example`, documented commands, and local setup notes. That mattered because AI-built projects need more written structure, not less. Every missing convention is an invitation for the next agent to invent one.<sup><a href="#code-stack-package">1</a></sup>

Next.js gives the app its main shape. Pages, layouts, route handlers, server-side reads, client islands, and the production build all live inside one framework. That consistency is useful because each feature does not need to invent its own web-server pattern. The tradeoff is that framework behavior becomes load-bearing. Rendering mode, server/client boundaries, cached reads, route handlers, and build output all affect the final app. That is why later rails exist around route classification and build assertions. The stack choice gave the app a clear shape, but the repo still had to prove that shape did not drift.<sup><a href="#code-stack-package">1</a></sup>

TypeScript is the first compile-time rail. The repo runs with `strict` and `noEmit`, which means type-checking is a proof step, not the thing that produces JavaScript. That may sound like a small distinction, but it is important. I am not asking TypeScript to build the app. I am asking it to stop the branch when two parts of the repo disagree about a value’s shape. The dedicated TypeScript rails section goes deeper on API contracts, env reads, and typed boundaries; at the stack level, the point is that “does this typecheck?” became one of the first questions every generated change has to answer.<sup><a href="#code-stack-tsconfig">2</a></sup>

Drizzle is the database layer because it keeps the database shape close to the TypeScript code while still producing migrations. I wanted the schema to be reviewable as code, not described in one place and remembered somewhere else. `drizzle.config.ts` points migration generation at the central schema export, while the actual table definitions stay owned by feature and data slices. That fits the broader rule: the feature that owns a concept should own its table shape, but the database still needs one coherent model when migrations are generated.<sup><a href="#code-stack-drizzle">3</a></sup>

Zod fills the gap TypeScript cannot cover. TypeScript can describe what the app expects, but it cannot prove that a browser POST, URL param, environment variable, or external API response actually matches that expectation at runtime. That is why the stack uses Zod at boundaries. Route handlers validate untrusted input. API contract files pair request schemas with response types. The typed `apiFetch` helper lets clients consume those contracts instead of papering over responses with hand-written casts. This is one of the places the stack becomes a real safety system: the route and the client share one declared wire shape instead of two separate guesses.<sup><a href="#code-stack-api-client">4</a></sup><sup><a href="#code-stack-api-contract-test">5</a></sup>

Environment variables are another boundary that needed more discipline than I expected. Raw `process.env` reads are easy to scatter and hard to audit. They also hide subtle behavior: some values should treat an empty string as missing, while others need the empty string to remain meaningful. The env registry makes those differences explicit and lazy. It validates when a value is read, not when a module is imported, so the repo keeps the side-effect-free import behavior that matters for tests, scripts, and serverless startup.<sup><a href="#code-stack-env">6</a></sup>

Authentication is handled by Better Auth rather than a fully custom session system. That was a deliberate “buy the boring part” decision. LGI.tools still has plenty of EVE-specific identity rules: character linking, owner hashes, token custody, EVE scopes, admin roles, and account purge behavior. I did not also want AI-generated code to invent a session framework from scratch. Better Auth provides the spine, and the repo owns the EVE-specific edges around it. The account chapter goes into that boundary more deeply.<sup><a href="#code-stack-auth">7</a></sup>

The styling stack follows the same pattern. Tailwind makes the UI fast to compose, but the repo does not let arbitrary styling spread forever. Theme variables in `globals.css` define the palette, and lint rules push call sites toward tokens and shared tone helpers instead of raw color literals. [PR #68](https://github.com/StorminRH/lgi-tools/pull/68) applied the same idea to charts: before using a charting library for real features, the repo proved SVG charts could work under the project’s CSP constraints without inline-style surprises. That is the version of a stack decision I trust most: prove the constraint before building a feature on top of it.<sup><a href="#code-stack-theme">8</a></sup><sup><a href="#code-stack-lint">9</a></sup>

The verification tools are part of the stack too. Vitest tests behavior. ESLint catches local syntax and policy violations. Fallow watches the broader repo graph: unused files, unused exports, dependency drift, boundary violations, duplication, and complexity. Those tools matter because AI can leave behind code that is plausible but heavy. A helper can be clean in isolation and still be in the wrong layer. A file can compile and still be dead. An export can look useful and still have no consumer.<sup><a href="#code-stack-package">1</a></sup><sup><a href="#code-stack-fallow">10</a></sup>

That is the way I think about the stack now. It is not just the list of libraries the app happens to use. It is a layered set of constraints around an AI-directed project. Next.js gives the app one framework shape. TypeScript makes static disagreement visible. Zod checks runtime boundaries. Drizzle keeps the database model in code. Better Auth keeps session machinery out of the custom-code pile. Tailwind and theme tokens keep the UI from drifting. Vitest, ESLint, and Fallow turn review instincts into repeatable checks.

The rule I keep coming back to is simple: when I direct AI to make a change, the stack should make the safe path easier than the clever path. The tools do not replace judgment, but they reduce how much trust I have to place in any single generated answer.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-stack-package" file="package.json" lines="17-81" lang="json" -->
```json
"scripts": {
  "dev": "next dev",
  "predev:all": "docker compose up -d",
  "dev:all": "concurrently -k -n next,convex -c cyan,magenta \"next dev\" \"convex dev\"",
  "build": "next build",
  "vercel-build": "pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
},
"dependencies": {
  "@neondatabase/serverless": "^1.1.0",
  "@upstash/ratelimit": "^2.0.8",
  "@upstash/redis": "^1.38.0",
  "@visx/event": "^4.0.0",
  "@visx/scale": "^4.0.0",
  "@visx/shape": "^4.0.0",
  "@visx/tooltip": "^4.0.0",
  "better-auth": "^1.6.15",
  "convex": "^1.42.0",
  "drizzle-orm": "^0.45.2",
  "next": "16.2.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "zod": "^4.4.3"
}
```

<!-- uth:code id="code-stack-tsconfig" file="tsconfig.json" lines="4-25" lang="json" -->
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

<!-- uth:code id="code-stack-drizzle" file="drizzle.config.ts" lines="13-20" lang="ts" -->
```ts
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
} satisfies Config;
```

<!-- uth:code id="code-stack-api-client" file="src/lib/api-client.ts" lines="3-31,35-71" lang="ts" -->
```ts
// Typed fetch for our own /api routes. Each JSON-speaking route's owning slice
// exports an ApiEndpoint from its api-contract.ts; callers go through apiFetch
// and get the contract's response type back — raw fetch('/api/…') is lint-banned.

export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  request: z.ZodType<unknown, TIn> | null;
  response: z.ZodType<TData> | null;
}

export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown>,
  init: CallInit & { body?: unknown } = {},
): Promise<ApiResult<unknown>> {
  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(`[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`, check.error);
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-stack-api-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-14,48-62" lang="ts" -->
```ts
// Mechanical API-contract guard. Every route handler under src/app/api must
// import from its owning slice's api-contract module, where its request schema
// and response types live, so the route and its clients share one wire shape.

describe('api contract imports', () => {
  it.each(ROUTE_FILES)('%s imports from its slice\'s api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts.`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-stack-env" file="src/lib/env.ts" lines="3-23,29-41,43-63,70-87" lang="ts" -->
```ts
// Typed, lazily-read server env. One registry of every server-side variable;
// a read validates on access — never at import, never cached — so module import
// stays side-effect-free and vi.stubEnv keeps working in tests.

const REQUIRED_ENV = {
  DATABASE_URL: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  CRON_SECRET: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

const VERBATIM_ENV = {
  DATABASE_URL_UNPOOLED: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
} as const;

export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
```

<!-- uth:code id="code-stack-auth" file="src/features/auth/auth.ts" lines="3-13,87-116" lang="ts" -->
```ts
// The Better Auth server instance — the spine of identity/authz.
//
// Replaces the hand-rolled JWE-cookie + EVE PKCE flow with Better Auth on the
// Drizzle/Neon adapter. EVE SSO is wired as a Generic OAuth provider; identity
// comes from the verified access-token JWT, and the user↔character link lives
// in the `account` row.

const options = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, jwks },
  }),
  secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'),
  baseURL: readEnv('BETTER_AUTH_URL'),
  databaseHooks: {
    account: {
      create: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
      update: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
    },
  },
  account: {
    accountLinking: { allowDifferentEmails: true },
  },
};
```

<!-- uth:code id="code-stack-theme" file="src/app/globals.css" lines="3-15,50-55,89-92" lang="css" -->
```css
@import "tailwindcss";

@theme {
  --color-bg-deep:     #060708;
  --color-bg:          #0b0d10;
  --color-section:     #0f1216;
  --color-tooltip:     #161b22;
  --color-border:      #1d232c;
  --color-border-soft: #141821;

  /* Call-site color tokens. The no-raw-hex lint rule keeps call sites pointed here. */

  /* Tone hues — pill/dot text + feature error text. Mirror toneHex. */
  --color-tone-green-strong: #44dd99;
  --color-tone-orange:       #d68c3d;
}
```

<!-- uth:code id="code-stack-lint" file="eslint.config.mjs" lines="15-34,58-73" lang="js" -->
```js
// Typed-API-call enforcement: a literal fetch('/api/…') bypasses the shared
// contracts, so client code must go through apiFetch with the owning slice's
// endpoint object instead.

const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
];

// Typed-env enforcement: server code reads env through the validated registry
// in src/lib/env.ts, never process.env directly.

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented.",
  },
];
```

<!-- uth:code id="code-stack-fallow" file=".fallowrc.json" lines="8-18,36-52,54-75" lang="json" -->
```json
{
  "entry": [
    "src/db/migrate.ts",
    "src/db/backfill-users-if-empty.ts",
    "src/db/ingest-sde-if-empty.ts",
    "src/db/ingest-sde.ts",
    "src/db/refresh-prices.ts",
    "src/db/refresh-sde.ts",
    "scripts/assert-route-classification.mjs",
    "drizzle.config.ts"
  ],
  "rules": {
    "unused-files": "error",
    "unused-exports": "error",
    "unused-dependencies": "error",
    "unlisted-dependencies": "error",
    "boundary-violation": "error",
    "stale-suppressions": "warn"
  },
  "health": {
    "maxCyclomatic": 20,
    "maxCognitive": 15,
    "maxCrap": 30.0
  }
}
```
<!-- uth:code-excerpts:end -->

## Borrowed vs. Built

A lot of this project starts with other people’s work.

That is not a weakness. EVE is too large to rebuild from memory, and the web has already solved plenty of problems I should not ask AI to invent again. The harder question is where borrowing stops. A spreadsheet, a community API, a library, or a first-party export can be a good starting point, but if the app depends on that thing for correctness, I eventually need to decide whether LGI.tools owns the rule or is just reflecting someone else’s snapshot.

The first version of the wormhole-sites data came from a community-maintained Google Sheet. That was the right early move. It let the site get a useful feature on screen before I had native tooling for every piece of EVE data behind it. But it also created a hidden problem: the Sheet was still shaped like the source of truth. A routine ingest could wipe out any local correction the next time it ran. [PR #1](https://github.com/StorminRH/lgi-tools/pull/1) changed that boundary. The Sheet became a historical seed, and Postgres became authoritative for the site catalogue. The schema still remembers some of the Sheet’s vocabulary, like source tabs and signature labels, because that is useful provenance. But the app no longer treats the Sheet as something it must keep asking for permission.<sup><a href="#code-borrowed-site-schema">1</a></sup>

That same pattern repeated with combat math. The Sheet carried precomputed sleeper DPS, EHP, and EWAR values. Those numbers were useful, but they were also frozen outputs. If the formulas were wrong, stale, or based on old game data, the database would faithfully preserve the mistake. [PR #2](https://github.com/StorminRH/lgi-tools/pull/2) moved that work into code. The repo now keeps pure combat-stat formulas that take raw EVE attributes and compute the values directly. The old Sheet snapshot became a test fixture, not the runtime authority. That is the difference I care about: borrowed data can verify the implementation, but it should not silently own the implementation forever.<sup><a href="#code-borrowed-npc-math">2</a></sup>

Prices had a similar transition. Fuzzwork was a practical source for market aggregates, and keeping it was better than pretending the app could absorb every upstream failure cleanly. But once the app needed better control over freshness, source attribution, and order-book behavior, the primary path moved to EVE’s official market API in [PR #28](https://github.com/StorminRH/lgi-tools/pull/28). Fuzzwork stayed, but as a fallback path with explicit attribution. That matters because “this price came from the official source” and “this price came from the circuit breaker” are not the same claim. The row records that difference, and the fallback code is isolated enough that it can be removed later if the project stops needing it.<sup><a href="#code-borrowed-market-source">3</a></sup><sup><a href="#code-borrowed-fuzzwork-fallback">4</a></sup>

The bigger version of this lesson is the SDE, EVE’s Static Data Export. Early on, the app used third-party-shaped SDE data because it was available and easy to ingest. That was fine while the project was proving itself. But as the Industry Planner and combat calculations became more important, the translation layer became a liability. [PR #71](https://github.com/StorminRH/lgi-tools/pull/71) moved the pipeline to CCP’s first-party JSONL and reshaped the database around CCP’s records instead of around the old flat files. The later SDE section goes into the ingest pipeline and validation gates; the important point here is ownership. If CCP is the permanent source, the repo should store the data in CCP’s shape and make any app-specific transformation explicit.<sup><a href="#code-borrowed-eve-schema">5</a></sup>

That is the pattern I try to follow now. Borrow the source when it helps me learn the domain. Borrow the library when the problem is generic. Keep the fallback when removing it would make the app brittle. But once a borrowed thing becomes load-bearing, I try to move the rule into the repo: a schema, a parser, a test fixture, a validator, a source-attribution field, or a narrow adapter with a clear deletion path.

This is especially important because the codebase is AI-built. An AI agent will happily build around whatever looks authoritative. If a stale snapshot sits in the database, it may treat that snapshot as truth. If a third-party response shape is consumed without validation, it may build features on assumptions nobody reviewed. If two sources produce similar data with no provenance, it may merge them as if they mean the same thing.

So “what I borrowed” and “what I built” is not a moral distinction. It is an ownership boundary. Borrowed sources helped LGI.tools move quickly. Built boundaries are what keep those sources from becoming invisible dependencies.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-borrowed-site-schema" file="src/features/wormhole-sites/schema.ts" lines="11-23,45-67,83-99" lang="ts" -->
```ts
// Raw labels from the Sheet's row-2 col-B "signature label".
// Kept distinct from `site_type` because the Sheet's wording is its own source of truth.
export const SIGNATURE_LABELS = [
  'Anomaly',
  'Relic Signature',
  'Data Signature',
  'Gas Signature',
  'Ore Signature',
] as const;

export const sites = pgTable('sites', {
  id: serial('id').primaryKey(),
  sourceTab: text('source_tab').notNull(),
  name: text('name').notNull(),
  siteType: siteTypeEnum('site_type').notNull(),
  signatureLabel: text('signature_label').notNull(),
  wormholeClass: wormholeClassEnum('wormhole_class'),
  blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
  resourceValueIsk: bigint('resource_value_isk', { mode: 'number' }),
});

// Per-NPC combat stats are computed live from raw EVE SDE attributes via
// src/data/npc-stats as of 2.7.1. The columns that used to cache them are
// dropped in drizzle/0009. `type_id` is the new join key.
export const npcs = pgTable('npcs', {
  sleeperName: text('sleeper_name').notNull(),
  sleeperClassCode: text('sleeper_class_code').notNull(),
  typeId: integer('type_id').notNull(),
});
```

<!-- uth:code id="code-borrowed-npc-math" file="src/data/npc-stats/math.ts" lines="3-12,16-61,98-107" lang="ts" -->
```ts
// Pure formulas for per-NPC combat stats. No DB imports — takes a flat
// `{ attrId: value }` map and returns typed shapes. Spec is the
// historical snapshot fixtures + spot-checks recorded in math.test.ts.
//
// SDE attribute IDs that show up here are real CCP IDs from dgmAttributeTypes.

const ATTR = {
  rateOfFire: 51,
  turretDamageMult: 64,
  damageEm: 114,
  damageTherm: 116,
  damageKin: 117,
  damageExp: 118,
  structureHp: 9,
  shieldHp: 263,
  armorHp: 265,
  webSpeedFactor: 20,
  warpScramCount: 105,
  neutAmount: 97,
  rrepAmount: 1455,
} as const;

function computeTurretDps(attrs: AttrMap) {
  const mult = val(attrs, ATTR.turretDamageMult);
  const rofMs = val(attrs, ATTR.rateOfFire);
  if (mult <= 0 || rofMs <= 0) return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  const alpha = scaleDamage(damageQuad(attrs), mult);
  const dps = divideDamage(alpha, rofMs / 1000);
  return { dps, alpha };
}
```

<!-- uth:code id="code-borrowed-market-source" file="src/data/market-prices/source.ts, src/data/market-prices/types.ts" lines="22-31,42-47" lang="ts" -->
```ts
// ESI source dispatcher. Above BULK_THRESHOLD types stale at once, the
// region-dump path streams every order in The Forge and filters in memory.
// Below the threshold, per-type calls are cheaper. Either way, a Fuzzwork
// fallback covers ESI degradation — preserving the per-row staleness
// contract so the next cron tick gets a fresh attempt.

// ESI's /markets/{region}/orders/ response item shape — only the fields
// we actually use. Boundary schema: ESI sends more keys; z.object ignores
// the unknown ones, so an upstream addition can't break parsing.

export type PriceSource = 'esi' | 'fuzzwork-fallback' | 'fuzzwork';
```

<!-- uth:code id="code-borrowed-fuzzwork-fallback" file="src/data/market-prices/source-fallback.ts" lines="9-17,26-47,76-82" lang="ts" -->
```ts
// Fuzzwork fallback path. Retained as a circuit-breaker target for the ESI
// source in source.ts: if ESI bulk returns 5xx or the per-type calls fail,
// the dispatcher reaches into this file for one batch round-trip and rewrites
// the source attribution to 'fuzzwork-fallback' on the way out.
//
// This file is intentionally self-contained — the dispatcher in source.ts is
// the only consumer. When Fuzzwork is eventually retired, the entire file
// deletes cleanly.

const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';

const fuzzworkSideSchema = z.object({
  weightedAverage: z.string(),
  max: z.string(),
  min: z.string(),
  percentile: z.string(),
});

// Source attribution is 'fuzzwork' here. The dispatcher in source.ts
// rewrites to 'fuzzwork-fallback' when calling this as a circuit-breaker
// target.
```

<!-- uth:code id="code-borrowed-eve-schema" file="src/data/eve-data/schema.ts" lines="17-23,88-104,116-124" lang="ts" -->
```ts
// Eve Static Data Export (SDE) tables. Sourced from CCP's first-party SDE,
// published straight from the Tranquility build pipeline as one zip of `.jsonl`
// files. The tables are shaped to CCP's native records rather than a flat
// per-table remap.

// typeDogma — every type's dogma attributes, one JSONB row per type, mirroring
// CCP's `typeDogma.jsonl` record (`{ _key: typeID, dogmaAttributes: [...] }`).
export const typeDogma = pgTable('type_dogma', {
  typeId: integer('type_id').primaryKey(),
  attributes: jsonb('attributes').notNull(),
});

// Industry blueprints — one JSONB document per blueprint, mirroring CCP's
// `blueprints.jsonl` record. `activities` holds CCP's whole nested object verbatim.
export const industryBlueprints = pgTable('industry_blueprints', {
  blueprintTypeId: integer('blueprint_type_id').primaryKey(),
  maxProductionLimit: integer('max_production_limit').notNull(),
  activities: jsonb('activities').notNull(),
});
```
<!-- uth:code-excerpts:end -->

## Local Development

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

# EVE Data

## ESI and the SDE

This is where LGI.tools stops being a generic web app and becomes an EVE tool.

EVE data does not come from one place, and that was one of the first lessons I had to encode into the architecture. There is the static shape of the game, and there is the live state of the game. Those are different problems.

The static side is the SDE, EVE’s Static Data Export. That is where the app gets the durable universe model: item types, groups, categories, dogma attributes, blueprints, map data, stations, and the raw facts that make the planner and combat calculations possible. The SDE is not something I want a page to nibble from while a user is waiting. The repo treats it as a bulk archive: download it, extract only the files the app actually needs, parse it, store it locally, and query the local database afterward.<sup><a href="#code-eve-sde-source">1</a></sup>

The live side is ESI, EVE’s HTTP API. That is where the app gets data that changes outside the static export: market orders, authenticated character data, corporation data, online status, jobs, assets, and similar records. ESI is not a one-time archive. It has cache windows, rate limits, error limits, authentication rules, response-shape risk, and player-specific privacy boundaries. So the app does not treat ESI as “just fetch a URL.” It treats ESI as a boundary that every caller has to approach through shared code.<sup><a href="#code-eve-esi-posture">2</a></sup>

A mistake I made early was thinking mostly about whether the data arrived, not enough about how the app identified itself and what contract it was asking for. [PR #37](https://github.com/StorminRH/lgi-tools/pull/37) tightened that posture. Every outbound EVE-facing call now uses one self-identifying User-Agent, and the ESI base URL avoids the moving `/latest` label. Instead, the repo pins the compatibility date in one config constant. That means an ESI route shape should change only when I deliberately review and bump the date, not because a provider-side label drifted while the app was asleep.<sup><a href="#code-eve-user-agent">3</a></sup><sup><a href="#code-eve-esi-config">4</a></sup>

[PR #48](https://github.com/StorminRH/lgi-tools/pull/48) added the other half of that boundary: outside services do not get to hold a serverless function forever, and their response bodies do not become trusted just because the HTTP status was 200. The shared timeout wrapper now sits in front of outbound calls, while Zod schemas validate the pieces of external responses the app actually consumes. That includes market responses and fallback responses. The pattern is simple: fail fast at the edge, then let the caller choose the existing fallback or degradation path.<sup><a href="#code-eve-market-boundary">5</a></sup>

The SDE has its own shape. [PR #71](https://github.com/StorminRH/lgi-tools/pull/71) moved the project away from third-party-shaped flat SDE files and onto CCP’s first-party JSONL export. That is the right long-term source, but it also meant the pipeline had to respect the size of the data. The source module downloads the latest JSONL zip, streams it to disk with atomic renames, and extracts only the selected files the app uses. It does not inflate the whole archive into memory just because that would be easier to ask an AI agent to write.<sup><a href="#code-eve-sde-source">1</a></sup>

The ingest layer keeps the same discipline. Large JSONL files are read line by line and written in batches. The universe parser runs before the database transaction opens, because parsing a large file is CPU-bound work and should not hold a database transaction or pinned connection hostage. Only after the download and parse work is done does the pipeline start the database write. That is a small detail, but it reflects the same rule that shows up elsewhere in the project: do not mix slow network or parsing work with scarce database coordination unless there is a reason.<sup><a href="#code-eve-sde-ingest">6</a></sup>

ESI has the opposite problem. It is not huge in one request, but it is easy to waste calls. Public market data can be cached or fall back when degraded. Authenticated reads need a different posture because they carry a player or corporation token. The shared authenticated reader handles the ordinary mechanics once: attach the bearer token, replay the held ETag when there is one, understand `304 Not Modified`, walk paginated collections, and return soft errors for owner-specific 4xx responses. The later ESI gate section goes into the budget and caching machinery; the point here is that every ESI consumer should not rediscover conditional and paginated reads for itself.<sup><a href="#code-eve-authed-read">7</a></sup>

That distinction changed how I direct feature work. If a feature needs item definitions, blueprint activities, dogma stats, or map facts, the right question is usually: “is the SDE pipeline storing the right local shape?” If a feature needs current market state or player-owned data, the right question is: “which ESI path owns the request, the cache window, the auth boundary, and the fallback behavior?” Those questions keep AI from turning every missing value into a new ad hoc fetch.

So this chapter is the bridge between the source material and the machinery. The SDE is bulk, static, first-party, and local after ingest. ESI is live, budgeted, conditional, and sometimes authenticated. Treating them as the same thing would make the code simpler for one session and worse for every session after that.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-eve-sde-source" file="src/data/eve-data/source.ts" lines="19-41,91-124,151-171" lang="ts" -->
```ts
// CCP first-party SDE (JSON Lines) — the ACTIVE source.
//
// CCP publishes the Static Data Export straight from the Tranquility build
// pipeline as one zip of `.jsonl` files (one JSON object per line). This module
// owns only "bytes → the files we need on disk"; parsing those lines into
// rows is the ingest layer's job.

const CCP_SDE_BASE = 'https://developers.eveonline.com/static-data';
const CCP_SDE_LATEST_ZIP_URL = `${CCP_SDE_BASE}/eve-online-static-data-latest-jsonl.zip`;
const CCP_SDE_LATEST_MANIFEST_URL = `${CCP_SDE_BASE}/tranquility/latest.jsonl`;

// Stream the zip to a `.tmp` file then atomically rename. A mid-stream network
// drop would otherwise leave a partial zip at `dest`, and Vercel reuses /tmp
// across warm Lambda invocations.
async function downloadZipTo(dest: string): Promise<void> {
  const res = await fetchWithTimeout(
    CCP_SDE_LATEST_ZIP_URL,
    { headers: { 'User-Agent': OUTBOUND_USER_AGENT } },
    SDE_DOWNLOAD_TIMEOUT_MS,
  );
  // ...
}

// Extract just the files we need out of the zip on disk, streaming each
// entry to its own atomically-renamed `.tmp`.
export async function downloadSdeJsonl(): Promise<SdeJsonlPaths> {
  await mkdir(JSONL_CACHE_DIR, { recursive: true });
  // ...
  await downloadZipTo(zipPath);
  try {
    await extractEntries(zipPath, paths);
  } finally {
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}
```

<!-- uth:code id="code-eve-esi-posture" file="src/lib/esi/index.ts" lines="66-82" lang="ts" -->
```ts
// Label-less by design: CCP warns against the `/latest` label (it can shift
// behavior when they bump what it points at), so we drop it and pin the
// contract via the X-Compatibility-Date header instead (src/config/esi.ts).
const ESI_BASE_URL = 'https://esi.evetech.net';

// The only sanctioned way to construct an ESI URL — the host literal is
// lint-banned outside this slice so every consumer arrives here, where
// esiFetch (and the shared budget) is the only dispatch on offer.
export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  // ...
}
```

<!-- uth:code id="code-eve-user-agent" file="src/config/user-agent.ts" lines="5-14" lang="ts" -->
```ts
// Maintainer contact for outbound API etiquette. CCP's ESI guidelines and
// Fuzzwork both want a reachable contact so they can warn before throttling
// rather than cut us off.
const OUTBOUND_CONTACT = 'https://lgi.tools/contact';

// Sent on every outbound third-party call (ESI, Fuzzwork). Conventional ESI
// User-Agent shape `App/<version> (<contact>)`.
export const OUTBOUND_USER_AGENT = `LGI.tools/${APP_VERSION} (${OUTBOUND_CONTACT})`;
```

<!-- uth:code id="code-eve-esi-config" file="src/config/esi.ts" lines="1-8" lang="ts" -->
```ts
// ESI request posture. The base URL is label-less (no /latest, /dev, /legacy);
// this reviewed date pins the API contract so a CCP-side `latest` bump can't
// silently reshape what we parse. Sent as a forced header on every ESI call.
export const ESI_COMPATIBILITY_DATE = '2025-08-26';
```

<!-- uth:code id="code-eve-market-boundary" file="src/data/market-prices/source.ts" lines="28-47,75-86" lang="ts" -->
```ts
// ESI's /markets/{region}/orders/ response item shape — only the fields
// we actually use. Boundary schema: ESI sends more keys; z.object ignores
// the unknown ones, so an upstream addition can't break parsing, but a
// changed/missing consumed field rejects the body at the boundary.
const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
});

function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

// Bounded-concurrency worker pool. If any worker throws, a shared `cancelled`
// flag short-circuits the other workers' next iteration.
```

<!-- uth:code id="code-eve-sde-ingest" file="src/data/eve-data/ingest.ts" lines="51-83,86-123" lang="ts" -->
```ts
// Generic streaming pipeline: JSONL file → one parsed object per line → batched
// insert. `types.jsonl` is ~149 MB / 52k lines, so we read line-by-line via
// readline and never buffer the whole file.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  // ...
}

export async function runIngest(
  db: PostgresJsDatabase,
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const paths: SdeJsonlPaths = await downloadSdeJsonl();

  // Parse the universe files into the in-memory dataset BEFORE opening the
  // transaction: parsing is CPU-bound and touches no DB, so it must not hold a
  // pinned connection / open transaction.
  const universe = await parseUniverse(paths);

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}, ${industryBlueprints}, ${typeDogma}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
      );
      // ...
    });
  } finally {
    // ...
  }
}
```

<!-- uth:code id="code-eve-authed-read" file="src/lib/esi/authed-read.ts" lines="3-23,44-60,109-138" lang="ts" -->
```ts
// Authed ESI reads — the ONE shared conditional + paginated reader for every
// per-owner ESI consumer.
//
// The gate's own ETag cache is unauthenticated-only, so an authed reader replays
// its own held ETag and the raw 304 passes straight through.
//
// 5xx / 420 / budget-exhaustion throw out of esiFetch. A 4xx (403 a missing
// role, 404 a vanished owner) is a soft 'error' result, not a throw.

export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl?: RlSnapshot,
): Promise<EsiAuthedRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  if (res.status === 304) return { kind: 'unchanged', expiresAt };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

export async function readEsiPagedAuthed(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
  rl?: RlSnapshot,
): Promise<EsiPagedRead> {
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken, rl);
  // ...
}
```
<!-- uth:code-excerpts:end -->

## The ESI Gate

ESI is CCP’s live API for EVE Online. It is how LGI.tools reaches outside its own database and asks the game what is true right now: market orders, character data, corporation data, industry jobs, skills, affiliations, structures, and all the other moving pieces that cannot come from the static data export.

That makes ESI powerful, but it also makes it one of the easiest places to hurt the whole app. A bad database query usually breaks one feature. A bad UI component usually breaks one screen. A bad ESI caller can spend the same shared API budget every other feature needs. It can also keep retrying when EVE is already telling the app to slow down.

That problem gets sharper in a serverless app. LGI.tools does not have one permanent process that remembers every outbound request. Several Vercel functions can wake up at the same time, each handling a different user, cron route, or refresh. If each function only trusts its own local memory, each one can make a locally reasonable decision that adds up to globally bad behavior. ESI needed one shared door.

The other thing that makes ESI different from a normal API integration is that the response itself carries operational information. EVE tells callers about error-budget state, retry timing, cache windows, ETags, and compatibility expectations. Ignoring that information would be wasteful at best and hostile at worst. So the job was not just “fetch from CCP.” The job was to build a boundary where every ESI call follows the same outbound rules.

The first version of that boundary lived inside market pricing because market prices were the first serious ESI consumer. That made sense at the time. The wrapper identified the app, pinned the compatibility date, tracked the error budget it could see, and let price fetching fall back when ESI was unhealthy. The mistake was leaving that protection owned by a data slice. Once character and corporation features were coming, the pricing module could not be the place every future ESI caller imported from. Rebuilding the same wrapper somewhere else would have been worse, because two wrappers would each think they owned a budget that is actually shared.

[PR #91](https://github.com/StorminRH/lgi-tools/pull/91) changed the rule: ESI became shared infrastructure. The public surface moved to `src/lib/esi`, with two sanctioned operations: build the URL with `esiUrl`, then dispatch with `esiFetch`. The gate is deliberately OAuth-agnostic. If a caller passes an `Authorization` header, the gate leaves it alone. That lets public market reads and authenticated character reads share one outbound policy without putting token logic inside the gate itself.<sup><a href="#code-esi-entry">1</a></sup>

[PR #92](https://github.com/StorminRH/lgi-tools/pull/92) is where the serverless lesson landed. A module-level counter was good enough for one hourly price cron. It was not good enough for concurrent, user-triggered ESI work. Each Vercel instance could start with a clean local counter and dispatch as if nobody else had spent anything. The fix was to move the mirror into a shared scoreboard. In production, that scoreboard is Upstash Redis. In dev and tests, it can fall back to in-process memory so the local loop still works. If production has no scoreboard, the gate fails closed instead of pretending blind dispatch is safe.<sup><a href="#code-esi-scoreboard-resolver">2</a></sup>

The current gate has a pre-dispatch step before any request leaves the app. It asks the scoreboard for the effective remaining error budget, any active retry block for that route, and any stored ETag metadata for that URL. The error budget is intentionally pessimistic: it combines the app’s own recent error count with the lowest remaining-budget header any instance observed. Under-counting is the dangerous failure mode. Over-counting means the app backs off early, which is annoying but survivable.<sup><a href="#code-esi-scoreboard-model">3</a></sup><sup><a href="#code-esi-redis-scoreboard">4</a></sup>

The refusal behavior is explicit. If the scoreboard is unavailable, non-interactive work does not dispatch. Interactive callers can opt into a small per-instance trickle, which is useful for a person clicking something in the UI but not enough to let a background job stampede ESI. If a route is under a retry block or the effective error budget is below the floor, the gate throws the same budget-exhausted error shape with a reason attached. Callers then degrade in their own domain: pricing can use its fallback source, a tracker can skip that owner, and telemetry can record that the budget path was the reason.<sup><a href="#code-esi-dispatch-budget">5</a></sup><sup><a href="#code-esi-errors">6</a></sup>

When the gate does dispatch, it standardizes the request. It sets the project User-Agent if the caller did not provide one, forces the ESI compatibility date, attaches an ETag only when that request is eligible, and uses the shared timeout wrapper. The caller still receives a normal `Response`, which is important. The gate owns policy and accounting, but the consuming feature still owns the endpoint contract and the meaning of the body it asked for.<sup><a href="#code-esi-dispatch-budget">5</a></sup>

ETags are where this got subtle. Public unauthenticated GETs can use the shared cache. Authenticated requests cannot. The shared cache must never hold per-character or per-corporation data, so any request carrying `Authorization` is excluded from the gate’s ETag cache. For eligible public reads, the gate can store ETag metadata and a small body, revalidate with `If-None-Match`, and synthesize the 200 response the caller expected when ESI replies `304 Not Modified`.<sup><a href="#code-esi-entry">1</a></sup><sup><a href="#code-esi-cache-body">7</a></sup>

That cache also produced one of the more useful mistakes. The gate originally tried to decide whether a response was small enough to cache by cloning and reading the body when the size was not declared. During industry cost-index work, that showed up as intermittent “Body has already been read” failures on large streamed responses. [PR #102](https://github.com/StorminRH/lgi-tools/pull/102) fixed the root cause in the gate instead of keeping a feature-local workaround. The rule now is stricter: only fixed `Content-Length` responses at or under the cache cap are body-cached. A chunked response with no declared size is handed to the caller untouched. The lesson was that a shared gate bug is not local. If the gate mishandles a response body, every feature using ESI inherits the risk.<sup><a href="#code-esi-cache-body">7</a></sup>

[PR #93](https://github.com/StorminRH/lgi-tools/pull/93) used an admin-only ESI sandbox to prove the next boundary before building on top of it. It requested the broader character permission set once, then exercised the live authenticated endpoints through the shared gate. That caught a planned permission name that no longer existed and proved the gate could pass bearer tokens through while still applying the shared outbound policy. This is the process I want around EVE integration now: do not guess the live response shape, do not guess the permission string, and do not bypass the gate to “just test one endpoint.”

The final rail is mechanical. ESLint bans hand-written `esi.evetech.net` literals outside the gate and its tests. That is not because a string literal is dangerous by itself. It is dangerous because it is the easiest way for AI-generated code to create a second, invisible door to ESI. The rule forces future code through the same URL builder, the same budget check, the same compatibility date, and the same reporting path.<sup><a href="#code-esi-lint-rail">8</a></sup>

So the ESI gate is not just a rate limiter. It is the project’s EVE API boundary. It standardizes identity, pins the contract, centralizes budget accounting, keeps shared cache behavior away from authenticated data, fails closed when shared state is missing, and makes bypasses noisy. That is the important part for an AI-built codebase: the safe path is the obvious path, and the unsafe path has to fight the repo.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-esi-entry" file="src/lib/esi/index.ts" lines="14-35,54-90" lang="ts" -->
```ts
// Both limits are shared across every serverless instance we run, so the
// budget state lives in a shared Upstash Redis scoreboard: every esiFetch
// consults it before dispatch and reports every response's headers back to it.
// This gate is the single door — all ESI consumers route through esiFetch.
// The gate is OAuth-agnostic: headers passed via `init` go through untouched.
//
// Authenticated calls never touch the shared cache and dispatch every time.

const ESI_BASE_URL = 'https://esi.evetech.net';

export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  const pre = await consultPreDispatch(sb, url, wantEtag);
  enforceBudget(pre, opts);

  const liveSb = pre !== null ? sb : null;
  const etagMeta = pre !== null && wantEtag ? pre.etag : null;

  if (etagMeta !== null && liveSb !== null) {
    const cached = await serveFromExpiresWindow(url, etagMeta, liveSb);
    if (cached !== null) return cached;
  }

  return dispatch(url, init, wantEtag, liveSb, etagMeta);
}
```

<!-- uth:code id="code-esi-scoreboard-resolver" file="src/lib/esi/scoreboard/index.ts" lines="8-13,43-76" lang="ts" -->
```ts
// Shared ESI budget scoreboard. CCP's limits are per-IP / per-app — shared
// across every serverless instance we run — so the mirror of what we've spent
// must be shared too. This is the storage layer: Upstash Redis (the real,
// shared thing) with an in-process fallback for dev/test.

export function resolveScoreboard(): EsiScoreboard | null {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    const cached = redisScoreboards.get(url);
    if (cached) return cached;
    const created = new RedisScoreboard(url, token);
    redisScoreboards.set(url, created);
    return created;
  }

  if (process.env.NODE_ENV !== 'production') {
    memoryScoreboard ??= new MemoryScoreboard();
    return memoryScoreboard;
  }

  console.error(
    '[esi] budget scoreboard not configured: set KV_REST_API_URL + KV_REST_API_TOKEN ' +
      '(Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
      '(direct Upstash) — ESI dispatch is failing closed',
  );
  return null;
}
```

<!-- uth:code id="code-esi-scoreboard-model" file="src/lib/esi/scoreboard/types.ts" lines="7-24,26-31,46-82" lang="ts" -->
```ts
// Two CCP limit systems are mirrored:
//  • Legacy error limit — per-IP, ALL routes, fixed 60s window, 100 non-2xx/3xx
//    responses, then 420 everywhere. Mirrored two ways and combined
//    pessimistically: a self-count of our own error responses and an echo of
//    the lowest X-ESI-Error-Limit-Remain any instance observed.
//  • Token-bucket rate limit — per-group X-Ratelimit-* state is stored for
//    observability, and a 429's Retry-After becomes a block key on the
//    normalized route path that pre-dispatch honors.
//
// ETag state also lives in the scoreboard: per-URL meta and the cached body a
// 304 revalidation re-serves. Bodies are stored only for unauthenticated GETs.

export const ESI_ERROR_CEILING = 100;
export const BODY_CACHE_MAX_BYTES = 131_072;

export interface PreDispatchState {
  effectiveRemaining: number;
  blockedRetryAfter: number | null;
  etag: CachedEtagMeta | null;
}

export interface EsiReport {
  url: string;
  status: number;
  errorLimitRemain: number | null;
  errorLimitReset: number | null;
  rateLimitGroup: string | null;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitUsed: number | null;
  retryAfter: number | null;
  etagToStore: (CachedEtagMeta & { body: string }) | null;
  refreshEtag: CachedEtagMeta | null;
}
```

<!-- uth:code id="code-esi-redis-scoreboard" file="src/lib/esi/scoreboard/redis.ts" lines="64-91,108-184" lang="ts" -->
```ts
async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
  const minute = epochMinute();
  const pipeline = this.redis.pipeline();
  pipeline.get(keyErrorCount(minute));
  pipeline.get(keyErrorCount(minute - 1));
  pipeline.get(KEY_ERROR_ECHO);
  pipeline.get(keyBlock(normalizeEsiPath(url)));
  if (wantEtag) pipeline.get(keyEtagMeta(url));
  const rows = await pipeline.exec<(string | null)[]>();

  const selfCount =
    (parseStoredInt(rows[0]) ?? 0) + (parseStoredInt(rows[1]) ?? 0);
  const echo = parseStoredInt(rows[2]);
  const blockExpiry = parseStoredInt(rows[3]);
  const blockRemaining =
    blockExpiry !== null ? blockExpiry - Math.floor(Date.now() / 1000) : null;
  return {
    effectiveRemaining: Math.min(
      echo ?? ESI_ERROR_CEILING,
      ESI_ERROR_CEILING - selfCount,
    ),
    blockedRetryAfter:
      blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
    etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
  };
}

private queueErrorCount(pipeline: Pipeline, report: EsiReport): boolean {
  if (report.status < 400) return false;
  const key = keyErrorCount(epochMinute());
  pipeline.incr(key);
  pipeline.expire(key, ERROR_COUNT_TTL_SECONDS);
  return true;
}

private queueRetryBlock(pipeline: Pipeline, report: EsiReport): boolean {
  if (report.status !== 429) return false;
  const retryAfter = resolveRetryAfter(report.retryAfter);
  pipeline.set(
    keyBlock(normalizeEsiPath(report.url)),
    String(Math.floor(Date.now() / 1000) + retryAfter),
    { ex: retryAfter },
  );
  return true;
}
```

<!-- uth:code id="code-esi-dispatch-budget" file="src/lib/esi/dispatch.ts" lines="26-30,68-95,237-290,105-135" lang="ts" -->
```ts
export interface EsiFetchOptions {
  interactive?: boolean;
}

// Conditional requests and body caching apply only to unauthenticated GETs:
// the shared cache must never hold per-character data.
export function isEtagEligible(init?: RequestInit): boolean {
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return false;
  return !new Headers(init?.headers).has('Authorization');
}

function buildHeaders(init?: RequestInit, etag?: string | null): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
  headers.set('X-Compatibility-Date', ESI_COMPATIBILITY_DATE);
  if (etag != null) headers.set('If-None-Match', etag);
  return headers;
}

export function enforceBudget(
  pre: PreDispatchState | null,
  opts?: EsiFetchOptions,
): void {
  if (pre === null) {
    if (opts?.interactive !== true) {
      throw new EsiBudgetExhaustedError(0, 'scoreboard_unavailable');
    }
    if (trickleCount >= TRICKLE_MAX_PER_MINUTE) {
      throw new EsiBudgetExhaustedError(0, 'trickle_capped');
    }
    trickleCount += 1;
    return;
  }
  if (pre.blockedRetryAfter !== null) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'rate_limited');
  }
  if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'error_budget');
  }
}

export async function dispatch(
  url: string,
  init: RequestInit | undefined,
  wantEtag: boolean,
  liveSb: EsiScoreboard | null,
  etagMeta: CachedEtagMeta | null,
): Promise<Response> {
  const headers = buildHeaders(init, etagMeta?.etag ?? null);
  const res = await fetchWithTimeout(url, { ...init, headers });
  // report, error handling, and return follow...
}
```

<!-- uth:code id="code-esi-errors" file="src/lib/esi/errors.ts" lines="7-35,38-56" lang="ts" -->
```ts
// Refuse to dispatch when the effective error-budget remaining falls below
// this floor. ESI's ceiling is 100 errors per window; refusing at 20 left
// leaves slack for in-flight calls and for the egress-IP sharing that makes
// our mirror an approximation.
export const ESI_BUDGET_FLOOR = 20;

export type EsiBudgetExhaustedReason =
  | 'error_budget'
  | 'esi_420'
  | 'rate_limited'
  | 'scoreboard_unavailable'
  | 'trickle_capped';

export class EsiBudgetExhaustedError extends Error {
  constructor(
    public readonly remaining: number,
    public readonly reason: EsiBudgetExhaustedReason = 'error_budget',
  ) {
    super(
      `ESI error budget exhausted (${reason}): ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`,
    );
    this.name = 'EsiBudgetExhaustedError';
  }
}

export class EsiServerError extends Error { /* 5xx */ }
export class EsiContractError extends Error { /* malformed body */ }
```

<!-- uth:code id="code-esi-cache-body" file="src/lib/esi/dispatch.ts" lines="128-164,167-185,216-234" lang="ts" -->
```ts
// Capture the body for the shared ETag cache when it's worth storing — but only
// for a response that arrives with a fixed Content-Length at or under the cap.
//
// A no-Content-Length body can't be size-bounded without reading it, and reading
// it here via res.clone() is exactly what intermittently consumes the CALLER's
// body. Not reading it leaves the caller's body untouched.
async function captureBodyForCache(res: Response): Promise<string | null> {
  const contentLength = parseIntHeader(res.headers, 'Content-Length');
  if (contentLength === null || contentLength > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  const text = await res.clone().text();
  if (new TextEncoder().encode(text).length > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  return text;
}

function synthesizeRevalidated(
  res304: Response,
  body: string,
  meta: CachedEtagMeta,
): Response {
  const headers = new Headers(res304.headers);
  if (!headers.has('Content-Type') && meta.contentType !== null) {
    headers.set('Content-Type', meta.contentType);
  }
  headers.set('x-lgi-esi-cache', 'revalidated');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

export async function serveFromExpiresWindow(
  url: string,
  etagMeta: CachedEtagMeta,
  liveSb: EsiScoreboard,
): Promise<Response | null> {
  if (!isWithinExpiresWindow(etagMeta.expires)) return null;
  const body = await liveSb.getCachedBody(url).catch(() => null);
  if (body === null) return null;
  return synthesizeFromCache(body, etagMeta);
}
```

<!-- uth:code id="code-esi-lint-rail" file="eslint.config.mjs" lines="3-21" lang="js" -->
```js
// Banning the host literal outside src/lib/esi means the only way to target
// ESI is the gate's own exports (esiUrl + esiFetch). Scoped to the API host
// exactly: images.evetech.net stays legitimately used across the UI.
const esiHostSelectors = [
  {
    selector: String.raw`Literal[value=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget.",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs (template literal) — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget.",
  },
];
```
<!-- uth:code-excerpts:end -->

## The SDE Pipeline

The SDE pipeline is the quieter half of EVE integration. ESI is live and budgeted; the SDE is bulk, static, and heavy. It is the game’s reference dump: types, groups, categories, dogma attributes, blueprints, map data, stations, and the raw facts that the planner and combat calculations stand on.

The mistake would be treating that as just another API response.

The first serious SDE pipeline in the repo came from [PR #32](https://github.com/StorminRH/lgi-tools/pull/32). At that point the goal was practical: give the Industry Planner enough static data to understand blueprint recipes, compute build trees, and seed the market-price table with every type the planner would later need. The app used third-party-shaped flat data because it was available and easy to reason about. That let the planner move forward, but it also meant the app was shaped around someone else’s flattening of CCP’s data.

That changed in [PR #71](https://github.com/StorminRH/lgi-tools/pull/71). I directed the pipeline toward CCP’s first-party JSONL export and kept the database close to CCP’s native records. A blueprint is no longer split first into a set of flat activity tables just because that was the old shape. The SDE source module downloads CCP’s latest archive, streams it to disk, extracts only the files LGI.tools actually uses, and returns file paths to the ingest layer. The important rail is that large files stay large-file work: stream to disk, extract selected entries, read JSONL line by line, and avoid buffering the world into memory because that was the easiest code to generate.<sup><a href="#code-sde-source">1</a></sup>

The ingest layer keeps network, parsing, and database work separated. It downloads and extracts first. It parses the universe files before opening the database transaction. Only then does it truncate and refill the SDE-backed tables. That order matters. A slow download or CPU-bound parse should not hold a database transaction or a pinned session open. This is the same lesson that shows up in the rest of the repo: scarce coordination belongs around the part that needs coordination, not around everything that happens to be nearby.<sup><a href="#code-sde-ingest">2</a></sup>

The pipeline itself is deliberately above the feature slices. It composes the EVE data ingest, the blueprint tree resolver, market-price type seeding, and station-name resolution from one orchestration layer instead of making those slices import each other. That boundary matters because the SDE is not “an Industry Planner thing.” The planner uses it heavily, but wormhole NPC stats, search, map data, station names, and price tracking all touch pieces of the same static foundation.<sup><a href="#code-sde-pipeline">3</a></sup>

The blueprint resolver is where the SDE work became more than importing rows. EVE blueprints are a graph. A finished item can require intermediate components, those components can require more components, and reactions sit beside manufacturing. The resolver materializes two outputs: nested build trees and flat raw-material totals. Those outputs are stored in Postgres because computing the entire graph on every page view would turn static data into request-time work.

The first resolver also taught me not to trust a high-level assumption just because it sounds like game logic. I had treated cycle warnings as if the SDE contained legitimate self-referential recipes. [PR #33](https://github.com/StorminRH/lgi-tools/pull/33) proved that was wrong. Those rows were deprecated non-recipes where an item was listed as an ingredient of itself. The fix was not to ignore cycles in general. The repo now drops that narrow self-reference shape, demotes a blueprint whose whole recipe was self-referential, and still fails loudly if any unexpected cycle appears. That is the kind of correction I want in the dev log: I did not just patch the symptom; the rule changed.<sup><a href="#code-sde-tree-index">4</a></sup><sup><a href="#code-sde-tree-write">5</a></sup>

[PR #72](https://github.com/StorminRH/lgi-tools/pull/72) tightened the resolver after the CCP-native migration. The earlier CCP-native pipeline still flattened each blueprint’s nested activity object into intermediate row lists because that matched the old resolver. That was safe, but it was also needless translation. The resolver now builds indexes directly from the native `activities` JSON. The validation gate proved the output stayed byte-identical, so the refactor removed overhead without changing the user-facing result.<sup><a href="#code-sde-tree-index">4</a></sup>

Validation is the part that made the source migration possible. Once the schema moved from third-party flat files to CCP-native JSONL, raw-table equality stopped being a useful proof. The repo needed to prove the output instead. The validation script compares flat materials, nested trees, and sleeper combat stats against committed fixtures. When those differ, the script does not silently bless the new result. It forces the difference into the open: real CCP data change or reshaping bug. The Archon divergence during the migration is the example that made that rule feel worth it. The gate found a real recipe change, not a parser failure, and that difference had to be signed off instead of hidden inside a “successful” import.<sup><a href="#code-sde-validation">6</a></sup>

The SDE refresh path also has to serialize. A full re-ingest is a destructive rewrite of shared reference tables, followed by derived tree rebuilding and seeding. [PR #34](https://github.com/StorminRH/lgi-tools/pull/34) fixed the advisory-lock path after I learned that session-scoped locks do not protect anything if they run through Neon’s pooled endpoint. For the SDE pipeline, that is not theoretical. Two overlapping ingests can leave the app in a torn state. So cron and build-time callers use the direct, unpooled connection and fail closed if the lock connection would be unsafe.

The daily SDE cron owns real drift. It checks the stored SDE version against CCP’s manifest, exits quickly when the version matches, records the “remote unreachable” case without doing doomed work, takes the SDE advisory lock only when needed, runs the full pipeline, updates the stored version, and revalidates the cached blueprint structure tag. That last step matters because much of the planner reads SDE-backed structure through long-lived caches. A no-deploy SDE update still needs to invalidate those static reads.<sup><a href="#code-sde-cron">7</a></sup>

The biggest operational correction came later in [PR #149](https://github.com/StorminRH/lgi-tools/pull/149). I had allowed the deploy-time SDE step to re-ingest when CCP published a new SDE build. That sounded safe because the code was idempotent. In practice it failed a production deploy: the build-time gate ran a write-heavy SDE import immediately before `next build` prerendered pages that also needed the database, and the prerender hit a timeout. The fix was to narrow the deploy-time job to bootstrap only. If a preview branch or first production deploy has empty SDE tables, the build loads the data because the pages need it. If the database is already populated and CCP has drifted, the deploy stands down and lets the daily cron handle the refresh.<sup><a href="#code-sde-bootstrap">8</a></sup>

That is a good example of how “idempotent” is not the same as “safe anywhere.” A heavy operation can be logically repeatable and still be the wrong thing to run in the middle of a deploy.

So the SDE pipeline’s final shape is more specific than “import game data.” Download only the needed CCP files. Stream and parse them without holding database coordination. Store CCP-native structures where that preserves meaning. Materialize expensive derived outputs once. Validate output, not just inputs. Serialize destructive rewrites on a real session lock. Let cron own drift. Let deploys bootstrap empty databases, not surprise production with a full re-ingest at build time.

That is the version of SDE work that fits an AI-built project: every broad instruction becomes a set of rails, and every mistake that was easy for AI to repeat becomes a rule the repo can enforce.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-sde-source" file="src/data/eve-data/source.ts" lines="19-41,91-124,151-171" lang="ts" -->
```ts id="k9j7rm"
// CCP first-party SDE (JSON Lines) — the ACTIVE source.
//
// CCP publishes the Static Data Export straight from the Tranquility build
// pipeline as one zip of `.jsonl` files. This module owns only
// "bytes → the files we need on disk"; parsing those lines into rows is the
// ingest layer's job.
const CCP_SDE_BASE = 'https://developers.eveonline.com/static-data';
const CCP_SDE_LATEST_ZIP_URL = `${CCP_SDE_BASE}/eve-online-static-data-latest-jsonl.zip`;
const CCP_SDE_LATEST_MANIFEST_URL = `${CCP_SDE_BASE}/tranquility/latest.jsonl`;

// Stream the zip to a `.tmp` file then atomically rename. A mid-stream network
// drop would otherwise leave a partial zip at `dest`, and Vercel reuses /tmp
// across warm Lambda invocations.
async function downloadZipTo(dest: string): Promise<void> {
  const res = await fetchWithTimeout(
    CCP_SDE_LATEST_ZIP_URL,
    { headers: { 'User-Agent': OUTBOUND_USER_AGENT } },
    SDE_DOWNLOAD_TIMEOUT_MS,
  );
  const tmp = `${dest}.tmp`;
  await pipeline(Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>), createWriteStream(tmp));
  await rename(tmp, dest);
}

// Extract just the files we need out of the zip on disk, streaming each entry
// to its own atomically-renamed `.tmp`.
export async function downloadSdeJsonl(): Promise<SdeJsonlPaths> {
  await mkdir(JSONL_CACHE_DIR, { recursive: true });
  const zipPath = join(JSONL_CACHE_DIR, 'sde-jsonl.zip');
  await downloadZipTo(zipPath);
  try {
    await extractEntries(zipPath, paths);
  } finally {
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}
```

<!-- uth:code id="code-sde-ingest" file="src/data/eve-data/ingest.ts" lines="51-83,86-123" lang="ts" -->
```ts id="p4nfxe"
// Generic streaming pipeline: JSONL file → one parsed object per line → batched
// insert. `types.jsonl` is ~149 MB / 52k lines, so we read line-by-line via
// readline and never buffer the whole file.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let batch: T[] = [];
  for await (const line of rl) {
    const mapped = mapRow(JSON.parse(line.trim()) as Record<string, unknown>);
    if (!mapped) continue;
    batch.push(mapped);
    if (batch.length >= BATCH_SIZE) {
      await flush(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await flush(batch);
}

export async function runIngest(db: PostgresJsDatabase): Promise<IngestSummary> {
  const paths = await downloadSdeJsonl();

  // Parse the universe files into the in-memory dataset BEFORE opening the
  // transaction: parsing is CPU-bound and touches no DB, so it must not hold a
  // pinned connection / open transaction.
  const universe = await parseUniverse(paths);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}, ${industryBlueprints}, ${typeDogma}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
    );
    // streaming inserts follow...
  });
}
```

<!-- uth:code id="code-sde-pipeline" file="src/db/sde-pipeline.ts" lines="43-106" lang="ts" -->
```ts id="s3r0uu"
// Seed market_prices with one row per tracked type ID that isn't already
// present. NULL prices, epoch staleness, source 'esi' — the next price-refresh
// cron tick (or on-demand request) fills them in.
export async function seedTrackedTypes(db: AnyPgDb): Promise<SeedSummary> {
  const tracked = await listTrackedTypeIds(db);
  const missing = await listMissingTypeIds(db, tracked);
  if (missing.length === 0) return { tracked: tracked.length, missing: 0, inserted: 0 };

  for (let i = 0; i < rows.length; i += BATCH) {
    const written = await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoNothing()
      .returning({ typeId: marketPrices.typeId });
    inserted += written.length;
  }

  return { tracked: tracked.length, missing: missing.length, inserted };
}

export async function runSdePipeline(db: AnyPgDb): Promise<SdePipelineSummary> {
  const ingest = await runIngest(db);
  const resolve = await resolveAllTrees(db);
  const seed = await seedTrackedTypes(db);
  const stationNames = await resolveNpcStationNames(db);
  return { ingest, resolve, seed, stationNames, durationMs: Date.now() - start };
}
```

<!-- uth:code id="code-sde-tree-index" file="src/data/eve-data/tree-resolver.ts" lines="112-133,149-220" lang="ts" -->
```ts id="hv6s4w"
export function activitiesToRows(
  blueprintTypeId: number,
  activities: BlueprintActivities,
): { mats: MaterialRow[]; prods: ProductRow[] } {
  const mats: MaterialRow[] = [];
  const prods: ProductRow[] = [];
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const act = activities?.[name];
    if (!act) continue;
    for (const m of act.materials ?? []) {
      mats.push({ blueprintTypeId, materialTypeId: m.typeID, quantity: m.quantity });
    }
    for (const p of act.products ?? []) {
      prods.push({ blueprintTypeId, productTypeId: p.typeID, quantity: p.quantity });
    }
  }
  return { mats, prods };
}

export function buildIndexesFromActivities(rows: BlueprintActivityRow[]): Indexes {
  const ordered = [...rows].sort((a, b) => {
    const au = a.published === false ? 1 : 0;
    const bu = b.published === false ? 1 : 0;
    return au - bu || a.blueprintTypeId - b.blueprintTypeId;
  });

  for (const { blueprintTypeId, activities } of ordered) {
    const { mats, prods } = activitiesToRows(blueprintTypeId, activities);
    const ownProducts = new Set(prods.map((p) => p.productTypeId));
    const realMaterials = mats
      .filter((m) => !ownProducts.has(m.materialTypeId))
      .map((m) => ({ typeId: m.materialTypeId, quantity: m.quantity }));
    if (realMaterials.length > 0) blueprintMaterials.set(blueprintTypeId, realMaterials);

    const degenerate = mats.length > 0 && realMaterials.length === 0;
    if (degenerate) continue;
    for (const p of prods) {
      if (productToBlueprint.has(p.productTypeId)) continue;
      productToBlueprint.set(p.productTypeId, { blueprintTypeId, quantityPerRun: p.quantity });
    }
  }

  return { blueprintMaterials, productToBlueprint };
}
```

<!-- uth:code id="code-sde-tree-write" file="src/data/eve-data/tree-resolver.ts" lines="25-43,160-170,239-296,520-575" lang="ts" -->
```ts id="v54c19"
// How many runs of a producing blueprint a parent's need represents, as a
// FRACTION — `quantity / quantityPerRun`, deliberately NOT rounded up.
function runsFor(quantity: number, quantityPerRun: number): number {
  if (quantityPerRun === 0) throw new Error('runsFor: quantityPerRun is zero');
  return quantity / quantityPerRun;
}

// Content hash of the blueprint recipe data, the resolver's idempotency gate.
// Sensitive to recipe edits in the reference blueprints plus global edge counts.
export async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  // ...folds algorithm version, blueprint count, edge counts, reference samples,
  // and published flags into one hash...
}

export async function resolveAllTrees(db: AnyPgDb): Promise<ResolveSummary> {
  const hashBefore = await getSdeMetaValue(db, SDE_META_KEY_TREE_HASH);
  const hashAfter = await computeTreeResolverHash(db);
  if (!forceRebuild && hashBefore === hashAfter && (await hasResolvedTrees(db))) {
    return { skipped: true, hashBefore, hashAfter, durationMs: Date.now() - start, /* ... */ };
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}`);
    // write flat materials and trees in batches...

    const { cycleWarnings } = resolver.stats();
    if (cycleWarnings.length > 0) {
      throw new Error(
        `tree resolver detected ${cycleWarnings.length} unexpected cycle(s); ` +
          `first few: ${cycleWarnings.slice(0, 5).join(' | ')}`,
      );
    }

    await setSdeMetaValue(tx, SDE_META_KEY_TREE_HASH, hashAfter);
  });
}
```

<!-- uth:code id="code-sde-validation" file="scripts/validate-resolver-output.ts" lines="3-37,52-67,172-205,211-236" lang="ts" -->
```ts id="m9u3hf"
/**
 * The SDE source/schema was redesigned from Fuzzwork's flat CSV tables to CCP's
 * native nested JSONL. The old "identical raw tables" proof no longer applies,
 * so correctness is asserted at the OUTPUT layer instead.
 *
 * The golden fixtures are captured ONCE from the pre-migration pipeline and
 * committed. After the migration this script re-reads the same outputs from a
 * CCP-native pipeline and asserts equality.
 */
const REFERENCE_BLUEPRINTS = {
  Rifter: 691,
  Drake: 24699,
  Archon: 23758,
  Legion: 29987,
};
const SLEEPER_TYPE_IDS = [30188, 30189, 30190, 30191, 30192, 30193, 30194, 30195, 30196, 30197];

async function main(): Promise<void> {
  const [flat, trees, sleeper] = await Promise.all([
    readFlatMaterials(),
    readTrees(),
    readSleeperStats(),
  ]);

  console.log('[check] flat materials (cost basis)');
  // compare fixtures...

  if (failures > 0) {
    console.error(
      `[check] FAILED — ${failures} divergence(s). Investigate (real CCP data ` +
        `difference vs reshaping bug) and get operator sign-off before updating any fixture.`,
    );
    process.exit(1);
  }
}
```

<!-- uth:code id="code-sde-cron" file="src/app/api/cron/refresh-sde/route.ts" lines="30-43,55-87,89-133" lang="ts" -->
```ts id="eu5t8z"
// On drift (stored sde_version != CCP's current build number), acquires the
// SDE advisory lock and runs the full pipeline inline: JSONL ingest → tree
// resolver → tracked-types seeding.
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const db = drizzle(directClient);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  if (remoteVersion !== null && storedVersion === remoteVersion) {
    await logSdeCronEvent({ outcome: 'up-to-date', sdeVersion: storedVersion });
    return Response.json({ status: 'up-to-date', sdeVersion: storedVersion });
  }

  if (storedVersion !== null && remoteVersion === null) {
    await logSdeCronEvent({ outcome: 'remote-unreachable', sdeVersion: storedVersion });
    return Response.json({ status: 'remote-unreachable', sdeVersion: storedVersion });
  }

  const reserved = await directClient.reserve();
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) return Response.json({ status: 'busy' });

    const summary = await runSdePipeline(db);
    if (remoteVersion) await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    revalidateTag(BLUEPRINT_STRUCTURE_TAG, 'max');
    const marketPrices = await summarizeMarketPricesRowCount(db);
    return Response.json({ status: 'reingested', summary, marketPrices });
  } finally {
    try {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    } finally {
      reserved.release();
    }
  }
}
```

<!-- uth:code id="code-sde-bootstrap" file="src/db/ingest-sde-if-empty.ts" lines="3-21,91-155,169-174" lang="ts" -->
```ts id="pe7gns"
// Deploy-time SDE BOOTSTRAP. Runs on every `pnpm vercel-build`, but only
// ingests when the eve-data tables are empty or incomplete — a brand-new branch
// or the first prod deploy that ships these tables.
//
// It deliberately does NOT re-ingest on CCP version DRIFT. A full pipeline run
// is a ~15s burst of DB writes, and running it immediately before prerender
// loads the DB enough to stall the prerender's own reads.

const hasRows =
  Number(rowCount) > 0 &&
  Number(universeRowCount) > 0 &&
  Number(jumpsRowCount) > 0;

if (!hasRows) {
  console.log('Auto-ingesting SDE (eve-data tables empty or incomplete on this branch)…');
  const summary = await runSdePipeline(db);
  if (remoteVersion) await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
  console.log('SDE pipeline complete.');
  console.log(JSON.stringify(summary, null, 2));
  return;
}

const drifted = remoteVersion !== null && storedVersion !== remoteVersion;
console.log(
  drifted
    ? `SDE re-ingest deferred to the daily cron (drift: stored=${storedVersion ?? '<none>'} remote=${remoteVersion}; ${rowCount} attribute rows present).`
    : `SDE ingest skipped (already at SDE version "${storedVersion}", ${rowCount} attribute rows present).`,
);

const resolve = await resolveAllTrees(db);
```
<!-- uth:code-excerpts:end -->

## Market Prices & Indices

Market prices are not static game data, and they are not private character data. They sit in the middle.

CCP’s ESI docs frame the constraint the same way they did for the gate: ESI is a shared resource, callers should identify themselves, respect cache headers, and avoid wasting requests. The `Expires` header is the contract for when updated data should be available, and the docs warn that fetching before the cache window can waste resources or be treated as cache circumvention. The same page says cache circumvention can get an app banned from ESI, which is why the market system cannot be “just refresh everything whenever a page wants it.” citeturn566653view0turn566320view0

That is the external shape of the problem. Market data needs to feel current enough for a planner, but it still has to behave like a good ESI citizen. LGI.tools needs Jita prices when a pilot opens a blueprint, stale-but-usable values when ESI or a fallback source is having a bad day, and daily CCP industry inputs for job-fee math. Those are related datasets, but they are not the same thing.

The first market-price version used Fuzzwork because it was practical. PR #28 moved the primary source to ESI and kept Fuzzwork as a circuit-breaker fallback. That split still matters. ESI is the preferred source because it is CCP’s official order data. Fuzzwork remains an escape hatch because a planner that can show a clearly attributed fallback value is more useful than a planner that collapses every time ESI has a rough minute. The row’s `source` field preserves that difference, so later code can tell an official ESI row from a fallback row instead of treating all prices as equally fresh truth.<sup><a href="#code-market-schema">1</a></sup>

The market source module turns raw orders into the narrower projection the app actually uses: best buy, best sell, 5-percent buy and sell, side volumes, and near-touch depth. The 5-percent calculation is one of those details that looks small until it is wrong. The first implementation walked to the price where the threshold crossed, which let thin top orders skew the result. The corrected version computes a volume-weighted average over the closest 5 percent of side volume, matching the Fuzzwork-style semantic the app had already been relying on. That made the source swap a real migration instead of a hidden change in pricing math.<sup><a href="#code-market-price-math">2</a></sup>

The later depth ladder is the same kind of defensive projection. Best price alone does not tell you how much market is actually there. A one-unit order at the top of book can make the “best” number look good while the usable liquidity is somewhere behind it. The repo now stores cumulative volume within fixed bands from the best price. The important rule is that the bands are anchored to the touch price, not to the 5-percent value, because a far-out whale order can distort a 5-percent calculation by changing total volume. Anchoring depth to best price makes that particular manipulation less useful.<sup><a href="#code-market-constants">3</a></sup><sup><a href="#code-market-price-math">2</a></sup>

Fetching has two shapes. When the app needs a large stale set, it can stream The Forge region order book page by page and filter to the requested type IDs in memory. When it needs a smaller set, it calls ESI per type with bounded concurrency. Both paths go through the shared ESI gate. Both validate the response body before using it. Both preserve the fallback path. And the bulk path has a cancellation flag so one failing page does not leave the other workers draining hundreds of pages and burning budget after the result is already doomed.<sup><a href="#code-market-source-dispatch">4</a></sup><sup><a href="#code-market-fetch-paths">5</a></sup>

Persistence is deliberately boring. The `market_prices` table is keyed by EVE type ID, has nullable price and volume fields so “no orders” is different from zero, and carries `updated_at`, `stale_after`, and `source`. Writes are chunked because the full tracked type set would otherwise run into Postgres bind-parameter limits. The price rows are independent and idempotent, so splitting the upsert is safer than pretending every refresh must be one giant transaction. That also keeps the same write path usable from both the cron’s postgres-js client and the request-path Neon HTTP driver.<sup><a href="#code-market-schema">1</a></sup><sup><a href="#code-market-persist">6</a></sup>

PR #62 changed the user-facing freshness model. Instead of treating the background job as the only source of truth, the app refreshes prices when someone actually opens a blueprint or other price-consuming surface. The server reads the durable database seed, performs a coalesced live fetch, returns the freshest value it has, and persists the fresh row behind the response. If the live fetch fails and a seed exists, the user still gets a value, but the path does not pretend that value was just confirmed.<sup><a href="#code-market-refresh-on-view">7</a></sup>

PR #64 then demoted the background job into a backstop. The nightly sweep now refreshes only rows whose `stale_after` has expired, which means it mostly covers the cases the browser path does not: crawlers, link previews, server-rendered snapshots, missed user traffic, or ESI being unavailable when someone viewed a page. That also let the project remove the price-refresh advisory lock. The cron is the only bulk writer, and a race with an on-view refresh is last-write-wins between two freshly fetched rows. The SDE ingest still needs destructive serialization; prices do not.<sup><a href="#code-market-cache">8</a></sup>

PR #51 added the observability I wish had been there earlier. A fallback is not just a success with a different source. It is a degraded source path. The refresh summary carries source counts and whether the ESI budget was exhausted, and the cron records skipped runs separately from refreshed runs. That distinction matters because “nothing needed refreshing,” “ESI degraded and Fuzzwork saved us,” and “the budget gate refused dispatch” are three different operational stories. If they all look green, the site can be quietly unhealthy for a long time.<sup><a href="#code-market-persist">6</a></sup>

Industry indices are the other half of this chapter. These are not order-book prices. They are CCP’s daily inputs for industry job-fee math: per-system cost indices and adjusted item prices. PR #100 added them as their own data slice because the planner eventually needs them, but they should not be tangled into the market-price table. They live in pure number space, keyed by raw CCP IDs, with no foreign keys back to the SDE tables. That keeps the daily feed independent of whether a static-data ingest has just run.<sup><a href="#code-industry-index-schema">9</a></sup>

The industry-index source is intentionally narrower than the market-price source. It makes two gated ESI calls: `/industry/systems/` for cost indices and `/markets/prices/` for adjusted prices. Both responses are validated at the boundary. Cost indices are flattened from CCP’s nested per-system shape into one row per system and activity. Adjusted prices preserve the difference between a real zero and a missing value by storing absent `adjusted_price` as `null`.<sup><a href="#code-industry-index-source">10</a></sup>

The refresh path treats those two datasets independently. If cost indices fail, adjusted prices can still refresh. If adjusted prices fail, cost indices can still refresh. The cron has its own advisory lock, but the lock is there to avoid redundant double-pulls, not because overlapping writes would corrupt the data. Each dataset is upserted in chunks, and the cron records the result of each side separately.<sup><a href="#code-industry-index-refresh">11</a></sup><sup><a href="#code-industry-index-cron">12</a></sup>

That is the pattern this section is really about. Market prices are live enough to refresh on view, durable enough to seed future reads, and honest enough to preserve source attribution when they fall back. Industry indices are slower daily inputs, refreshed as bulk public datasets and kept separate from order-book pricing. Both go through the ESI gate. Both validate external shapes before storing them. Both write to Neon as reusable shared data instead of making every feature invent its own fetch path.

The mistake would be letting the planner ask ESI directly because it “just needs a price.” The better rule is that EVE market data has an owner: source reads, fallback behavior, staleness, persistence, and telemetry live in the data layer. Features consume the resulting rows and can explain what they mean.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-market-schema" file="src/data/market-prices/schema.ts" lines="15-23,25-46" lang="ts" -->
```ts
// Live market prices keyed by Eve type ID. Region is fixed to Jita
// (10000002) — set in phase 2. No FK to eve_types: this slice operates
// in pure number space and must not depend on the eve-data slice's
// schema being populated first.
//
// Nullable price + volume columns: when a market side has zero orders
// we store NULL so consumers can distinguish "no live price" from a
// real value. updated_at + stale_after are set explicitly on every
// refresh batch; the bulk refresh path filters on stale_after < NOW().

export const marketPrices = pgTable(
  'market_prices',
  {
    typeId: integer('type_id').primaryKey(),
    bestBuy: doublePrecision('best_buy'),
    bestSell: doublePrecision('best_sell'),
    pct5Buy: doublePrecision('pct5_buy'),
    pct5Sell: doublePrecision('pct5_sell'),
    buyVolume: bigint('buy_volume', { mode: 'bigint' }),
    sellVolume: bigint('sell_volume', { mode: 'bigint' }),
    buyDepth: jsonb('buy_depth').$type<DepthBand[]>(),
    sellDepth: jsonb('sell_depth').$type<DepthBand[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    staleAfter: timestamp('stale_after', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('fuzzwork'),
  },
  (t) => ({
    staleAfterIdx: index('market_prices_stale_after_idx').on(t.staleAfter),
  }),
);
```

<!-- uth:code id="code-market-price-math" file="src/data/market-prices/source.ts" lines="138-187,189-221,224-241" lang="ts" -->
```ts
export function computeSide(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
): { best: number | null; pct5: number | null; volume: bigint | null } {
  if (orders.length === 0) return { best: null, pct5: null, volume: null };

  const sorted = [...orders].sort((a, b) =>
    direction === 'asc' ? a.price - b.price : b.price - a.price,
  );
  const best = sorted[0].price;

  let totalVolume = BigInt(0);
  for (const o of sorted) totalVolume += o.volume;

  const fivePct = totalVolume * BigInt(5);
  const threshold =
    fivePct % BigInt(100) === BigInt(0)
      ? fivePct / BigInt(100)
      : fivePct / BigInt(100) + BigInt(1);

  let used = BigInt(0);
  let weightedSum = 0;
  for (const o of sorted) {
    const remaining = threshold - used;
    if (remaining <= BigInt(0)) break;
    const take = o.volume < remaining ? o.volume : remaining;
    weightedSum += o.price * Number(take);
    used += take;
  }

  return { best, pct5: weightedSum / Number(used), volume: totalVolume };
}

export function computeDepth(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
  best: number | null,
): DepthBand[] | null {
  if (best === null || orders.length === 0) return null;
  const sums = DEPTH_BANDS_PCT.map(() => 0);
  for (const o of orders) {
    for (let i = 0; i < DEPTH_BANDS_PCT.length; i++) {
      const band = DEPTH_BANDS_PCT[i];
      const within =
        direction === 'desc'
          ? o.price >= best * (1 - band / 100)
          : o.price <= best * (1 + band / 100);
      if (within) sums[i] += Number(o.volume);
    }
  }
  return DEPTH_BANDS_PCT.map((pct, i) => ({ pct, cumVolume: sums[i] }));
}
```

<!-- uth:code id="code-market-constants" file="src/data/market-prices/constants.ts" lines="8-15,22-37,52-63" lang="ts" -->
```ts
// Per-row TTL. Every write sets stale_after = NOW() + STALE_AFTER_TTL_MS.
// Its only remaining role is the "last refreshed" marker the nightly sweep
// keys off. It does NOT gate the live view path: getLivePrices always fetches
// live regardless of staleAfter.
export const STALE_AFTER_TTL_MS = 24 * 60 * 60 * 1000;

export const BULK_THRESHOLD = 100;
export const PAGE_CONCURRENCY = 8;
export const PER_TYPE_CONCURRENCY = 10;

// Price-distance bands (percent from the BEST price on each side) for the
// near-touch depth ladder.
export const DEPTH_BANDS_PCT = [0.5, 1, 2, 5, 10] as const;
```

<!-- uth:code id="code-market-source-dispatch" file="src/data/market-prices/source.ts" lines="22-31,42-63,75-86" lang="ts" -->
```ts
// ESI source dispatcher. Above BULK_THRESHOLD types stale at once, the
// region-dump path streams every order in The Forge and filters in memory.
// Below the threshold, per-type calls are cheaper. Either way, a Fuzzwork
// fallback covers ESI degradation.

const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
});

function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

function filterRawByWantedType(body: unknown, wanted: Set<number>): unknown[] {
  if (!Array.isArray(body)) throw new EsiContractError();
  return body.filter((o) => {
    const typeId = (o as { type_id?: unknown } | null)?.type_id;
    return typeof typeId === 'number' && wanted.has(typeId);
  });
}

// Bounded-concurrency worker pool. If any worker throws, a shared `cancelled`
// flag short-circuits the other workers' next iteration.
```

<!-- uth:code id="code-market-fetch-paths" file="src/data/market-prices/source.ts" lines="258-264,266-319,339-390" lang="ts" -->
```ts
function regionDumpPageUrl(page: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?order_type=all&page=${page}`);
}

function perTypeUrl(typeId: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?type_id=${typeId}&order_type=all`);
}

async function fetchViaEsiRegionDump(typeIds: number[]): Promise<RawMarketPrice[]> {
  const wanted = new Set(typeIds);
  const buckets = new Map<number, OrderBucket>();

  const firstRes = await esiFetch(regionDumpPageUrl(1));
  if (!firstRes.ok) throw new EsiServerError(firstRes.status);

  const totalPages = Number(firstRes.headers.get('X-Pages') ?? '1');
  const firstOrders = parseEsiOrders(await firstRes.json());
  absorbOrders(firstOrders, wanted, buckets);

  if (totalPages > 1) {
    const pages: number[] = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);
    await runConcurrent(pages, PAGE_CONCURRENCY, async (page) => {
      const res = await esiFetch(regionDumpPageUrl(page));
      if (!res.ok) throw new EsiServerError(res.status);
      const orders = parseEsiOrders(filterRawByWantedType(await res.json(), wanted));
      absorbOrders(orders, wanted, buckets);
    });
  }

  return bucketsToRawPrices(typeIds, buckets);
}

export async function fetchPricesFromSource(
  typeIds: number[],
): Promise<{ prices: RawMarketPrice[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { prices: [], budgetExhausted: false };
  const unique = dedupe(typeIds);

  if (unique.length >= BULK_THRESHOLD) {
    try {
      return { prices: await fetchViaEsiRegionDump(unique), budgetExhausted: false };
    } catch (err) {
      const prices = await fallbackToFuzzwork(unique);
      return { prices, budgetExhausted: err instanceof EsiBudgetExhaustedError };
    }
  }

  return fetchViaEsiPerType(unique);
}
```

<!-- uth:code id="code-market-persist" file="src/data/market-prices/ingest.ts" lines="10-22,61-90,106-145" lang="ts" -->
```ts
export interface RefreshSummary {
  requested: number;
  fetched: number;
  written: number;
  durationMs: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

export async function persistPrices(
  db: AnyPgDb,
  raw: RawMarketPrice[],
  meta?: { requested?: number; budgetExhausted?: boolean },
): Promise<RefreshSummary> {
  const updatedAt = new Date();
  const staleAfter = new Date(updatedAt.getTime() + STALE_AFTER_TTL_MS);

  const rows = raw.map((r) => ({
    typeId: r.typeId,
    bestBuy: r.bestBuy,
    bestSell: r.bestSell,
    pct5Buy: r.pct5Buy,
    pct5Sell: r.pct5Sell,
    buyVolume: r.buyVolume,
    sellVolume: r.sellVolume,
    buyDepth: r.buyDepth,
    sellDepth: r.sellDepth,
    updatedAt,
    staleAfter,
    source: r.source,
  }));

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: marketPrices.typeId,
        set: {
          bestBuy: excluded('best_buy'),
          bestSell: excluded('best_sell'),
          pct5Buy: excluded('pct5_buy'),
          pct5Sell: excluded('pct5_sell'),
          buyVolume: excluded('buy_volume'),
          sellVolume: excluded('sell_volume'),
          buyDepth: excluded('buy_depth'),
          sellDepth: excluded('sell_depth'),
          updatedAt: excluded('updated_at'),
          staleAfter: excluded('stale_after'),
          source: excluded('source'),
        },
      });
  }
}
```

<!-- uth:code id="code-market-refresh-on-view" file="src/data/market-prices/refresh-on-view.ts" lines="12-21,51-68,92-155" lang="ts" -->
```ts
// Refresh-on-view engine: read the durable DB seed, fetch live (coalesced so
// concurrent viewers of the same item share one source call), return the freshest
// available value, and persist the fresh rows back as the new seed behind the
// response.

async function fetchLivePrice(
  typeId: number,
): Promise<{ raw: RawMarketPrice | null; budgetExhausted: boolean }> {
  'use cache: remote';
  cacheTag(priceTag(typeId));
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, budgetExhausted } = await fetchPricesFromSource([typeId]);
  return { raw: prices[0] ?? null, budgetExhausted };
}

export async function getLivePrices(typeIds: number[]): Promise<LivePricesResult> {
  const ids = [...new Set(typeIds)];
  const seed = await getPrices(ids);

  const live = await mapBounded(ids, PER_TYPE_CONCURRENCY, async (id) => {
    try {
      return await fetchLivePrice(id);
    } catch {
      return { raw: null as RawMarketPrice | null, budgetExhausted: false };
    }
  });

  const prices = new Map<number, MarketPrice>();
  const freshRaws: RawMarketPrice[] = [];

  ids.forEach((id, i) => {
    const { raw } = live[i];
    if (raw) {
      freshRaws.push(raw);
      prices.set(id, { ...raw, updatedAt: now, staleAfter });
    } else {
      const seeded = seed.get(id);
      if (seeded) prices.set(id, seeded);
    }
  });

  if (freshRaws.length > 0) {
    after(async () => {
      try {
        await persistPrices(db, freshRaws);
      } catch (err) {
        console.error('[market-prices/refresh-on-view] write-behind failed', err);
      }
    });
  }

  return { prices, degraded };
}
```

<!-- uth:code id="code-market-cache" file="src/data/market-prices/cache.ts" lines="46-64,81-107" lang="ts" -->
```ts
export const PRICES_FRESHNESS_TAG = 'market-prices-freshness';

export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  return withColdStartRetry(() => getPricesFreshness(db));
}

// Nightly backstop sweep. Refreshes only the type IDs with stale_after < NOW()
// — the rows the on-demand view path hasn't refreshed within the TTL window.
export async function refreshStalePrices(client: Sql): Promise<CachedRefreshResult> {
  const db = drizzle(client);

  const typeIds = await listStaleTypeIds(db);
  if (typeIds.length === 0) {
    const { lastUpdatedAt } = await getPricesFreshness(db);
    return { status: 'cached', reason: 'empty-set', lastUpdatedAt };
  }

  const summary = await refreshPrices(db, typeIds);
  const { lastUpdatedAt } = await getPricesFreshness(db);
  return {
    status: 'refreshed',
    lastUpdatedAt: lastUpdatedAt ?? new Date(),
    summary,
  };
}
```

<!-- uth:code id="code-industry-index-schema" file="src/data/industry-indices/schema.ts" lines="12-24,25-46" lang="ts" -->
```ts
// Two daily-refreshed CCP datasets that feed industry job-fee math (EIV +
// cost-index). Both operate in pure number space — no FK to eve-data — keyed by
// raw CCP IDs, the same decoupling as market_prices.

export const industryCostIndices = pgTable(
  'industry_cost_indices',
  {
    solarSystemId: integer('solar_system_id').notNull(),
    activity: text('activity').notNull(),
    costIndex: doublePrecision('cost_index').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.solarSystemId, t.activity] }),
  }),
);

export const adjustedPrices = pgTable('adjusted_prices', {
  typeId: integer('type_id').primaryKey(),
  adjustedPrice: doublePrecision('adjusted_price'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
```

<!-- uth:code id="code-industry-index-source" file="src/data/industry-indices/source.ts" lines="8-18,25-47,51-88" lang="ts" -->
```ts
// ESI source for the two daily industry datasets. Both endpoints return the
// full dataset in a single response, so each is one gated GET.

const costIndicesBodySchema = z.array(
  z.object({
    solar_system_id: z.number(),
    cost_indices: z.array(
      z.object({ activity: z.string(), cost_index: z.number() }),
    ),
  }),
);

const adjustedPricesBodySchema = z.array(
  z.object({
    type_id: z.number(),
    adjusted_price: z.number().optional(),
  }),
);

export function parseCostIndices(body: unknown): RawCostIndex[] {
  const result = costIndicesBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();

  const out: RawCostIndex[] = [];
  for (const system of result.data) {
    for (const entry of system.cost_indices) {
      if (!isIndustryActivity(entry.activity)) continue;
      out.push({
        solarSystemId: system.solar_system_id,
        activity: entry.activity,
        costIndex: entry.cost_index,
      });
    }
  }
  return out;
}

export async function fetchCostIndices(): Promise<RawCostIndex[]> {
  const res = await esiFetch(esiUrl('/industry/systems/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseCostIndices(await res.json());
}

export async function fetchAdjustedPrices(): Promise<RawAdjustedPrice[]> {
  const res = await esiFetch(esiUrl('/markets/prices/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseAdjustedPrices(await res.json());
}
```

<!-- uth:code id="code-industry-index-refresh" file="src/data/industry-indices/ingest.ts" lines="22-36,89-130" lang="ts" -->
```ts
export interface DatasetResult {
  ok: boolean;
  written: number;
  error?: string;
}

export interface RefreshIndicesSummary {
  costIndices: DatasetResult;
  adjustedPrices: DatasetResult;
  durationMs: number;
}

// Fetch + persist one dataset, isolating its failure so the sibling still runs.
async function refreshDataset<T>(
  fetcher: () => Promise<T[]>,
  persist: (rows: T[]) => Promise<number>,
): Promise<DatasetResult> {
  try {
    const rows = await fetcher();
    const written = await persist(rows);
    return { ok: true, written };
  } catch (err) {
    return {
      ok: false,
      written: 0,
      error: err instanceof Error ? err.constructor.name : 'unknown',
    };
  }
}

export async function refreshIndustryIndices(db: AnyPgDb): Promise<RefreshIndicesSummary> {
  const start = Date.now();
  const updatedAt = new Date();

  const [costIndices, adjustedPricesResult] = await Promise.all([
    refreshDataset(fetchCostIndices, (rows) => persistCostIndices(db, rows, updatedAt)),
    refreshDataset(fetchAdjustedPrices, (rows) => persistAdjustedPrices(db, rows, updatedAt)),
  ]);

  return {
    costIndices,
    adjustedPrices: adjustedPricesResult,
    durationMs: Date.now() - start,
  };
}
```

<!-- uth:code id="code-industry-index-cron" file="src/app/api/cron/refresh-industry-indices/route.ts" lines="23-33,45-79,80-92" lang="ts" -->
```ts
// Refreshes both daily CCP industry datasets (system cost indices + adjusted
// prices) under an advisory lock that skips an overlapping run of itself — the
// upserts are idempotent, so the lock guards against a redundant double ESI
// pull, not data integrity.

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      await logCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({ status: 'busy' } satisfies CronRefreshIndustryIndicesResponse);
    }
    lockHeld = true;

    const summary = await refreshIndustryIndices(drizzle(directClient));
    await logCronEvent({
      outcome: 'refreshed',
      costIndices: summary.costIndices,
      adjustedPrices: summary.adjustedPrices,
      durationMs: summary.durationMs,
    });

    return Response.json({ status: 'refreshed', costIndices, adjustedPrices });
  } finally {
    try {
      if (lockHeld) {
        await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
      }
    } finally {
      reserved.release();
    }
  }
}
```
<!-- uth:code-excerpts:end -->

# Features

## Wormhole Sites

The wormhole sites tool is the first feature that made LGI.tools feel useful instead of theoretical.

It is also the first feature that taught me a rule I kept reusing later: reference data is still architecture. It can look like a simple table of names and ISK values, but once the app depends on it, I need to know who owns it, how it can be corrected, what parts are derived, and which values are live estimates rather than stable facts.

The first version leaned on a community-maintained Google Sheet. That was the right starting point. EVE wormhole sites are full of domain-specific details: combat waves, sleeper names, triggers, blue-loot estimates, ore and gas resources, relic and data cans, and class ranges that are obvious to experienced pilots but not obvious to a database schema. Borrowing the Sheet let the feature exist before I had a full data pipeline.

The problem was that the Sheet was still acting like the authority. A routine ingest could delete and reinsert rows, which meant any local correction I made later could be silently wiped out. [PR #1](https://github.com/StorminRH/lgi-tools/pull/1) changed that boundary. The Sheet became a historical seed, and Postgres became the source of truth for the catalogue. The schema still preserves some Sheet vocabulary, like `sourceTab` and `signatureLabel`, because provenance is useful. But the app no longer treats the Sheet as a live dependency.<sup><a href="#code-sites-schema">1</a></sup>

That ownership decision showed up again in the combat numbers. The Sheet carried precomputed DPS, EHP, alpha, and EWAR totals. They were convenient, but they were also frozen outputs. If the Sheet’s formula drifted, or if a single aggregate was stale, the app would preserve the wrong number forever. [PR #2](https://github.com/StorminRH/lgi-tools/pull/2) moved those stats out of the site seed and into the SDE-backed NPC stat layer. The site tables now keep the join key, `typeId`, while the query layer computes the NPC and wave stats from raw EVE attributes.<sup><a href="#code-sites-schema">1</a></sup><sup><a href="#code-sites-combat">2</a></sup>

That was one of the better early corrections. It kept the wire format mostly stable for the UI, but changed where the truth came from. The site catalogue still says which Sleeper appears in which wave. The combat math layer says what that Sleeper does. Those are different responsibilities, and the code now treats them that way.

The current query shape follows that split. A site detail read starts with the local catalogue, fetches waves and resources in parallel, then fetches NPC rows and batches the distinct `typeId`s through the NPC-stats layer. The wave aggregate is rebuilt from that derived combat data before the response is assembled. The structural read is cached as deploy-static because the catalogue only changes when the repo ships a new seed or migration. Live market values are layered separately.<sup><a href="#code-sites-catalog-query">3</a></sup>

Gas sites forced one of the smaller but useful domain corrections. Their stored `wormholeClass` is not enough, because the name encodes a spawn range: Perimeter, Frontier, Core. The class filter now treats gas sites differently, deriving the range from the name and filtering in JavaScript after the small catalogue read. That is less “pure database query,” but it is more faithful to the game data. With roughly seventy rows, clarity wins over pretending every rule belongs in SQL.<sup><a href="#code-sites-class-filter">4</a></sup>

The live layer is intentionally narrow. Ore and gas rows can take a Jita price overlay when they have a resolved `typeId`, a positive unit count, and a matching SDE type row. The overlay uses the market-price slice, computes resource ISK from units and the 5-percent buy price, and falls back to the Sheet-seeded total when a live value is missing. Combat blue-loot stays static for now. I deferred “live blue loot” because the Sheet did not contain proper drop quantities, only an already-priced total. Guessing a drop table would have made the number look more official than it was.<sup><a href="#code-sites-live-overlay">5</a></sup>

[PR #63](https://github.com/StorminRH/lgi-tools/pull/63) made that live pricing visible in the interaction model. Opening an ore or gas site now confirms its resource prices through the shared refresh-on-view engine, then updates the resource rows, footer total, and card headline together. The key detail is that the refresh is gated by opening the site. Browsing a long list of collapsed cards should not fan out dozens of ESI calls just because the page exists. The static site facts stay in the prerendered shell; only the live estimates shimmer and settle.<sup><a href="#code-sites-refresh-on-view">6</a></sup>

The page itself went through the same kind of correction. At first, it was easy to render every card with every wave and every NPC breakdown up front. That worked when I was looking at a small feature, but it did not scale well once the list had card view, table view, live prices, filters, and richer combat detail. [PR #115](https://github.com/StorminRH/lgi-tools/pull/115) changed the default cost: render the summary first, and mount the heavy detail body only when a card or table row is opened. The individual site page still renders the full detail server-side, because that page is meant to be crawlable and shareable. The index does not need to pay for every hidden wave tree on first paint.<sup><a href="#code-sites-lazy-detail">7</a></sup>

The filtering layer is another place where I had to separate concerns. The server loads and prices the whole catalogue once, then hands server-rendered card and table nodes to a client filter layout. The client owns class filters, type filters, the cards/table preference, and the detail-mode preference. That keeps the page from turning every filter click into a new server fetch, while still letting the server own the expensive data assembly and live price seed.<sup><a href="#code-sites-page">8</a></sup><sup><a href="#code-sites-filter-layout">9</a></sup>

The table view from [PR #24](https://github.com/StorminRH/lgi-tools/pull/24) came from a usability problem: cards are good for browsing, but they are not the best way to compare all sites quickly. The table can sort by the important summary fields and expand a row into the same detail body the cards use. That reuse matters. Two views should not mean two interpretations of a site. If the card and table disagree, the feature is teaching the user to mistrust the tool.

Later UI passes kept pushing the same rule. [PR #138](https://github.com/StorminRH/lgi-tools/pull/138) added Sleeper ship-class summaries to the card header, derived from the already-loaded wave/NPC tree instead of another query. [PR #139](https://github.com/StorminRH/lgi-tools/pull/139) added the lightbox mode, but it still reuses the same card header and detail body. The UI can get easier to read without inventing another source of truth.<sup><a href="#code-sites-ship-summary">10</a></sup><sup><a href="#code-sites-lightbox">11</a></sup>

The public API followed the same cleanup. [PR #54](https://github.com/StorminRH/lgi-tools/pull/54) routed the JSON endpoints through the cached query paths the pages already use. The list endpoint returns the deploy-static catalogue shape. The single-site endpoint uses the priced detail read, so it has the same freshness model as the page instead of doing its own direct overlay work. That is less exciting than a new feature, but it is the kind of consistency that keeps a public API from becoming a second implementation.<sup><a href="#code-sites-api">12</a></sup>

Looking back, the wormhole sites feature is where a lot of the later architecture first appeared in smaller form. The Sheet was useful, but the repo had to take ownership. Precomputed stats were useful, but the repo had to derive them from raw game data. Static catalogue reads were useful, but live prices had to be layered carefully. Expanding every detail up front was simple, but the page needed to pay only for what the user opened.

That is the lesson I carried forward: do not let “reference data” become a junk drawer. The stable facts, derived combat math, live estimates, UI presentation, and public API all need boundaries. Once those boundaries exist, AI can help fill in the feature without being allowed to blur what each number means.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-sites-schema" file="src/features/wormhole-sites/schema.ts" lines="45-63,65-87,106-128,130-170" lang="ts" -->
```ts id="86n2e6"
export const sites = pgTable(
  'sites',
  {
    id: serial('id').primaryKey(),
    sourceTab: text('source_tab').notNull(),
    name: text('name').notNull(),
    siteType: siteTypeEnum('site_type').notNull(),
    signatureLabel: text('signature_label').notNull(),
    wormholeClass: wormholeClassEnum('wormhole_class'),
    blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
    iskPerEhp: integer('isk_per_ehp'),
    resourceValueIsk: bigint('resource_value_isk', { mode: 'number' }),
  },
  (t) => ({
    sourceNameUnique: uniqueIndex('sites_source_tab_name_unique').on(t.sourceTab, t.name),
  }),
);

// Wave aggregates are recomputed live in queries.ts via npc-stats.
export const waves = pgTable('waves', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  waveNumber: integer('wave_number').notNull(),
  waveLabel: text('wave_label').notNull(),
});

// Per-NPC combat stats are computed live from raw EVE SDE attributes.
// `type_id` is the join key.
export const npcs = pgTable('npcs', {
  id: serial('id').primaryKey(),
  waveId: integer('wave_id').notNull().references(() => waves.id, { onDelete: 'cascade' }),
  orderInWave: integer('order_in_wave').notNull(),
  triggerLabel: text('trigger_label'),
  quantity: integer('quantity').notNull(),
  sleeperName: text('sleeper_name').notNull(),
  sleeperClassCode: text('sleeper_class_code').notNull(),
  typeId: integer('type_id').notNull(),
});

export const siteResources = pgTable('site_resources', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  orderInSite: integer('order_in_site').notNull(),
  resourceKind: text('resource_kind').notNull(),
  resourceName: text('resource_name').notNull(),
  units: bigint('units', { mode: 'number' }),
  volumeM3: bigint('volume_m3', { mode: 'number' }),
  totalIsk: bigint('total_isk', { mode: 'number' }),
  typeId: integer('type_id'),
});
```

<!-- uth:code id="code-sites-combat" file="src/features/wormhole-sites/queries.ts" lines="48-82,85-153" lang="ts" -->
```ts id="2rdvsw"
function mergeNpc(base: NpcRow, stats: CombatStats | undefined): Npc {
  const { waveId: _waveId, typeId: _typeId, ...rest } = base;
  if (!stats) {
    return {
      ...rest,
      scram: null, web: null, neut: null, rrep: null,
      sig: null, speed: null, distance: null, velocity: null,
      dps: null, alpha: null, ehp: null,
    };
  }
  return {
    ...rest,
    scram: stats.ewar.scram,
    web: stats.ewar.web !== 0 ? 1 : 0,
    neut: -stats.ewar.neutCount,
    rrep: stats.ewar.rrepCount,
    sig: stats.movement.sigRadius,
    speed: stats.movement.maxVelocity,
    distance: stats.movement.orbitDistance,
    velocity: stats.movement.orbitVelocity,
    dps: Math.round(stats.total.dps),
    alpha: Math.round(stats.total.alpha),
    ehp: Math.round(stats.hp.ehp),
  };
}

function aggregateWave(
  row: WaveRow,
  npcRows: NpcRow[],
  statsByType: Map<number, CombatStats>,
): Wave {
  const enriched: Npc[] = npcRows.map((n) => mergeNpc(n, statsByType.get(n.typeId)));
  const contributing = npcRows
    .map((n) => ({ stats: statsByType.get(n.typeId), quantity: n.quantity }))
    .filter((x): x is { stats: CombatStats; quantity: number } => x.stats !== undefined);
  const totals = summariseWave(contributing);

  return {
    id: row.id,
    waveNumber: row.waveNumber,
    waveLabel: row.waveLabel,
    dpsTotal: totals.dpsTotal,
    alphaTotal: totals.alphaTotal,
    ehpTotal: totals.ehpTotal,
    npcs: enriched,
  };
}
```

<!-- uth:code id="code-sites-catalog-query" file="src/features/wormhole-sites/queries.ts" lines="198-208,220-307,69-72" lang="ts" -->
```ts id="8h8hcx"
export async function listSiteDetails(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteDetail[]> {
  // The catalogue is deploy-static. Live prices are layered on separately.
  'use cache';
  cacheLife('max');

  return withColdStartRetry(async () => {
    const allRows = await db.select(SITE_LIST_COLUMNS).from(sites);
    const siteRows = filters.wormholeClass
      ? allRows.filter((s) => matchesClass(s, filters.wormholeClass!))
      : allRows;

    const siteIds = siteRows.map((s) => s.id);
    const [waveRows, resourceRows] = await Promise.all([
      db.select({ id: waves.id, siteId: waves.siteId, waveNumber: waves.waveNumber, waveLabel: waves.waveLabel })
        .from(waves)
        .where(inArray(waves.siteId, siteIds)),
      db.select({
        id: siteResources.id,
        siteId: siteResources.siteId,
        resourceName: siteResources.resourceName,
        units: siteResources.units,
        volumeM3: siteResources.volumeM3,
        totalIsk: siteResources.totalIsk,
        typeId: siteResources.typeId,
      })
        .from(siteResources)
        .where(inArray(siteResources.siteId, siteIds)),
    ]);

    const npcRows = waveIds.length > 0
      ? await db.select({ typeId: npcs.typeId, waveId: npcs.waveId, quantity: npcs.quantity })
          .from(npcs)
          .where(inArray(npcs.waveId, waveIds))
      : [];

    const distinctTypeIds = [...new Set(npcRows.map((n) => n.typeId))];
    const statsByType = await getCombatStatsBatch(distinctTypeIds);

    return siteRows.map((site) => ({
      ...site,
      waves: wavesBySiteId.get(site.id) ?? [],
      resources: resourcesBySiteId.get(site.id) ?? [],
    }));
  });
}
```

<!-- uth:code id="code-sites-class-filter" file="src/features/wormhole-sites/queries.ts" lines="156-166,169-195" lang="ts" -->
```ts id="eg79ph"
// Class match accounts for ordinary classed sites and gas sites whose
// `wormhole_class` is NULL but whose name encodes a class range.
function matchesClass(
  s: Pick<SiteListItem, 'name' | 'siteType' | 'wormholeClass'>,
  cls: WormholeClass,
): boolean {
  if (s.wormholeClass === cls) return true;
  if (s.siteType === 'gas') {
    const range = gasClassRange(s.name);
    return range !== null && classRangeIncludes(range, cls);
  }
  return false;
}

export async function listSites(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteListItem[]> {
  'use cache';
  cacheLife('max');
  const rows = await withColdStartRetry(() =>
    db.select(SITE_LIST_COLUMNS).from(sites).orderBy(sites.sourceTab, sites.name),
  );

  return filters.wormholeClass
    ? rows.filter((s) => matchesClass(s, filters.wormholeClass!))
    : rows;
}
```

<!-- uth:code id="code-sites-live-overlay" file="src/features/wormhole-sites/live-prices.ts" lines="8-26,35-64,66-77" lang="ts" -->
```ts id="okuaop"
// Overlays live Jita 5%-percentile buy values onto a list of sites.
//
// Strategy:
// - Collect every non-null typeId across all sites' resources.
// - Batch-fetch market prices and SDE volumes.
// - For each resource: liveIsk = round(units × pct5Buy).
// - effectiveIsk = liveIsk ?? totalIsk per row.
// - At the site level, resourceValueIsk is recomputed as sum(effectiveIsk).

export async function overlayLivePrices(sites: SiteDetail[]): Promise<SiteDetail[]> {
  const allTypeIds = new Set<number>();
  for (const s of sites) {
    for (const r of s.resources) {
      if (r.typeId != null) allTypeIds.add(r.typeId);
    }
  }
  if (allTypeIds.size === 0) return sites;

  const typeIdList = [...allTypeIds];
  const [prices, types] = await Promise.all([
    getPrices(typeIdList),
    getTypesByIds(typeIdList),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));

  return sites.map((site) => {
    const newResources = site.resources.map((r) => {
      const liveEligible = isLiveEligible(r, typeById);
      const liveIsk = liveEligible
        ? liveIskFor(r.units, prices.get(r.typeId!)?.pct5Buy ?? null)
        : null;
      const effectiveIsk = liveIsk ?? r.totalIsk;
      return { ...r, liveIsk, effectiveIsk, liveEligible };
    });

    return {
      ...site,
      resources: newResources,
      resourceValueIsk: newResources.reduce((sum, r) => sum + (r.effectiveIsk ?? 0), 0),
    };
  });
}
```

<!-- uth:code id="code-sites-refresh-on-view" file="src/features/wormhole-sites/components/SiteResourcesLive.tsx" lines="19-29,40-60,62-80,83-110" lang="tsx" -->
```tsx id="6pfqds"
// Live ore/gas pricing for one site. The provider wraps the whole card so
// the card total and resource rows refresh from one engine call.

export function SiteLiveProvider({ resources, children }: {
  resources: SiteResource[];
  children: ReactNode;
}) {
  const eligibleTypeIds = useMemo(() => eligibleTypeIdsOf(resources), [resources]);
  const [enabled, setEnabled] = useState(false);
  const requestEnable = useCallback(() => setEnabled(true), []);
  const { prices, isPending } = useRefreshOnView(eligibleTypeIds, { enabled });

  const value = useMemo<SiteLiveValue>(
    () => ({ priceOf: (typeId) => prices.get(typeId), isPending, requestEnable }),
    [prices, isPending, requestEnable],
  );

  return <SiteLiveContext.Provider value={value}>{children}</SiteLiveContext.Provider>;
}

// Zero-height marker placed at the top of the collapsed-hidden body.
// Fires the first time it is opened and on screen.
function ViewSentinel() {
  const { requestEnable } = useSiteLive();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        requestEnable();
        observer.disconnect();
      }
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [requestEnable]);
  return <div ref={ref} aria-hidden className="h-0" />;
}
```

<!-- uth:code id="code-sites-lazy-detail" file="src/features/wormhole-sites/components/LazySiteDetails.tsx" lines="10-25,27-60" lang="tsx" -->
```tsx id="3b8cgd"
/**
 * Defers the large site detail body until the parent <details> is first opened.
 * The <details> element still owns open/closed state natively — this only gates
 * when the body mounts, listening to the same native `toggle` event UrlSync taps.
 *
 * The /sites/[id] detail page renders SiteDetailsBody directly server-side
 * instead, keeping that page's NPC content in the initial HTML for SEO.
 */
export function LazySiteDetails({ site, zoom = false }: { site: SiteDetail; zoom?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const details = ref.current?.closest('details');
    if (!details) return;
    if (details.open) {
      setOpen(true);
      return;
    }
    const onToggle = () => {
      if (details.open) flushSync(() => setOpen(true));
    };
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [open]);

  return (
    <div ref={ref} className={zoom ? 'sites-detail-zoom' : 'contents'}>
      {open ? <SiteDetailsBody site={site} /> : null}
    </div>
  );
}
```

<!-- uth:code id="code-sites-page" file="src/app/sites/page.tsx" lines="36-42,44-88,99-114" lang="tsx" -->
```tsx id="d0qfbh"
// Per-request memo for the whole priced catalogue. Filtering moved client-side,
// so the server loads ALL sites once and overlays live prices in a single pass.
const loadAllSites = cache(async (): Promise<SiteDetail[]> => {
  const rawSites = await listSiteDetails({});
  return overlayLivePrices(rawSites);
});

async function SitesContent({ searchParams }: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const raw = await searchParams;
  const sortKey = parseSortKey(raw.sort);
  const sortDir = parseSortDir(raw.dir);
  const initialView = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(sitesView))?.value,
    sitesView,
  );
  const sites = await loadAllSites();

  const cards = sites.map((site) => ({
    meta: { id: site.id, type: site.siteType, clsSet: siteClassSet(site) },
    node: (
      <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
        <SiteCard site={site} />
      </UrlSync>
    ),
  }));

  const table = <SitesTable sites={sites} sortKey={sortKey} sortDir={sortDir} />;

  return <SitesFilterLayout cards={cards} table={table} total={sites.length} initialView={initialView} />;
}

export default function SitesPage({ searchParams }: { searchParams: Promise<SitesSearchParams> }) {
  return (
    <PageShell>
      <Suspense fallback={<SitesLoading />}>
        <SitesContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
```

<!-- uth:code id="code-sites-filter-layout" file="src/features/wormhole-sites/components/SitesFilterLayout.tsx" lines="5-14,43-63,71-86,93-108,156-217" lang="tsx" -->
```tsx id="0qdr3e"
// Client filter layout for /sites. Owns Class chips + Type rows, the Cards/Table
// toggle, and the persistent rail. The priced site cards and sortable table are
// rendered server-side and handed in as nodes.

export function SitesFilterLayout({ cards, table, total, initialView }: {
  cards: SiteCardItem[];
  table: ReactNode;
  total: number;
  initialView: 'cards' | 'table';
}) {
  const [cls, setCls] = useState<WormholeClass[]>([]);
  const [types, setTypes] = useState<SiteType[]>([]);
  const [view, setView] = usePreference(sitesView, { serverValue: initialView });
  const [detailMode, setDetailMode] = usePreference(sitesDetailMode);

  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.sites-table-row').forEach((details) => {
      const rowType = details.getAttribute('data-site-type') as SiteType | null;
      const rowCls = (details.getAttribute('data-site-cls') ?? '').split(',');
      const ok = matchesFilter({ type: rowType, clsSet: rowCls }, { cls, types });
      const wrapper = details.parentElement;
      if (wrapper) wrapper.hidden = !ok;
    });
  });

  return (
    <>
      <PageHead
        crumb="sites"
        title="Wormhole Sites"
        meta={<><b>{filteredCount}</b> of {total} sites · jita <b>live</b></>}
      />
      {/* filter rail, cards/table toggle, detail-mode toggle */}
      {view === 'cards'
        ? SECTION_ORDER.map((type) => (
            <section key={type}>
              <div className="sites-grid">{sectionCards.map((c) => c.node)}</div>
            </section>
          ))
        : <div ref={tableRef}>{table}</div>}
    </>
  );
}
```

<!-- uth:code id="code-sites-ship-summary" file="src/features/wormhole-sites/npc-summary.ts, src/features/wormhole-sites/components/SiteShipClasses.tsx" lines="13-36,1-28" lang="tsx" -->
```tsx id="3z91mr"
export function summariseSiteShipClasses(site: SiteDetail): ShipClassSummary[] {
  const counts = new Map<SleeperClassCode, number>();

  for (const wave of site.waves) {
    for (const npc of wave.npcs) {
      const code = npc.sleeperClassCode;
      if (!isSleeperClassCode(code)) continue;
      counts.set(code, (counts.get(code) ?? 0) + npc.quantity);
    }
  }

  const summary: ShipClassSummary[] = [];
  for (const code of SLEEPER_CLASS_ORDER) {
    const count = counts.get(code);
    if (count) summary.push({ code, count });
  }
  return summary;
}

export function SiteShipClasses({ site }: { site: SiteDetail }) {
  const classes = summariseSiteShipClasses(site);
  if (classes.length === 0) return null;

  return (
    <div className="sites-card-ships">
      {classes.map((c) => (
        <span key={c.code} className="sites-card-ship">
          <ShipClassIcon code={c.code} size={18} />
          <span className="sites-card-ship-label">{SLEEPER_CLASS_LABEL[c.code]}</span>
          <span className="sites-card-ship-count">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
```

<!-- uth:code id="code-sites-lightbox" file="src/features/wormhole-sites/components/SiteCard.tsx, src/features/wormhole-sites/components/SiteCardLightbox.tsx" lines="11-20,31-46,13-27,62-88" lang="tsx" -->
```tsx id="gvq03o"
// SiteCard owns the card chrome and collapsed summary. The expanded body lives
// in SiteDetailsBody so the table view and lightbox render identical detail.

export function SiteCard({ site, defaultOpen = false }: {
  site: SiteDetail;
  defaultOpen?: boolean;
}) {
  const liveResources = displayableResources(site.resources);

  return (
    <div className="sites-card">
      <SiteLiveProvider resources={liveResources}>
        <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
          <summary className="sites-card-summary">
            <SiteCardHeader site={site} />
          </summary>
          {defaultOpen ? <SiteDetailsBody site={site} /> : <LazySiteDetails site={site} zoom />}
        </details>
        {!defaultOpen && <SiteCardLightbox site={site} />}
      </SiteLiveProvider>
    </div>
  );
}

export function SiteCardLightbox({ site }: { site: SiteDetail }) {
  const [mode] = usePreference(sitesDetailMode);
  return (
    <>
      {mode === 'lightbox' && (
        <Dialog className="sites-lightbox-dialog">
          <div className="sites-lightbox-panel">
            <div className="sites-lightbox-zoom">
              <div className="sites-card-summary">
                <SiteCardHeader site={site} />
              </div>
              <SiteDetailsBody site={site} />
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
```

<!-- uth:code id="code-sites-api" file="src/app/api/sites/route.ts, src/app/api/sites/[id]/route.ts" lines="16-43,7-24" lang="ts" -->
```ts id="brvwim"
// src/app/api/sites/route.ts
// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = sitesQuerySchema.safeParse({
    type: request.nextUrl.searchParams.get('type') ?? undefined,
    class: request.nextUrl.searchParams.get('class') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query' } satisfies ApiError, { status: 400 });
  }

  const result = await listSites({
    type: parsed.data.type,
    wormholeClass: parsed.data.class,
  });

  return Response.json(result.map(toApiShape) satisfies SiteListApiItem[]);
}

// src/app/api/sites/[id]/route.ts
// authz: public
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = siteIdParamSchema.safeParse(await params);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid id' } satisfies ApiError, { status: 400 });
  }

  const site: SiteDetail | null = await getPricedSiteDetail(parsed.data.id);
  if (!site) return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  return Response.json(site satisfies SiteDetail);
}
```
<!-- uth:code-excerpts:end -->

## Industry Planner

The Industry Planner is where the earlier architecture stops being abstract.

A blueprint planner sounds simple from the outside: pick an item, see what it takes to build, compare the input cost to the sell price, and decide whether the build is worth doing. In EVE, that is not a flat problem. A blueprint can produce one item or many. It can require components that are also built from other blueprints. Those components can require reactions. Reactions produce batches. Manufacturing blueprints can have material efficiency and time efficiency. Market prices are live. Job fees depend on a system’s industry index. Structures can change material, time, and cost. A signed-in player may already own blueprints, materials, and build locations.

That is a lot of ways for one number to become dishonest.

The first version of the planner in [PR #44](https://github.com/StorminRH/lgi-tools/pull/44) deliberately split the feature into two halves. The stable blueprint structure comes from the SDE and renders as the page’s static shell. The price-dependent view streams in separately. The route starts the price and market-history work, but it does not make the structure wait for those reads. That matters because the shape of a blueprint is game reference data, while the margin is a live estimate. If those are coupled too tightly, a slow price read can make the whole planner feel broken even though the build tree is already known.<sup><a href="#code-industry-page">1</a></sup>

The feature layer is the only place allowed to compose the slices. The SDE slice owns blueprint trees and type labels. The market-price slice owns stored Jita prices and live refresh. The industry-index slice owns cost indices and adjusted prices. The pure math slice owns profitability and fee formulas. The planner sits above those boundaries and joins them into a page. That is an important AI rail: do not let the data slices import each other just because one feature needs their combined answer.<sup><a href="#code-industry-structure">2</a></sup>

`getBlueprintStructure` is the stable half. It loads the blueprint output, the materialized tree, every type label needed for display, activity IDs, and job times. It then converts the SDE tree into the planner’s build tree and display map. That read is cached with the SDE structure tag because it should change when the SDE pipeline changes, not when a user opens the page. This is why the page can show the product, the build stages, and the raw-material categories before any price work finishes.<sup><a href="#code-industry-structure">2</a></sup>

The first major mistake was cost basis.

The early planner could produce a correct-looking answer for simple T1 items and still be badly wrong for deep builds. The bug showed up on Tech III cruisers and capitals. The planner was effectively rounding production at the wrong place in the graph, so a small need for an intermediate could pull the cost of an entire batch, and that overbuild compounded as the tree got deeper. [PR #46](https://github.com/StorminRH/lgi-tools/pull/46) changed the rule. The SDE resolver can keep a marginal tree for structure and validation, but the planner’s cost basis has to be re-derived as a batch ledger: aggregate demand, round buildable jobs to whole runs at the correct level, and carry one ledger forward for both raw-material cost and the build-plan display.<sup><a href="#code-industry-batch-ledger">3</a></sup>

That fix became a pattern. The app should not have one set of quantities in the cost panel and another set in the build plan. The batch ledger is the shared source for the raw totals and the buildable run counts. Later, when owned material efficiency and structure bonuses arrived, they were added to the same walk instead of creating a second costing path. The comments in that file are longer than usual because this is exactly the kind of bug AI can reintroduce if the rule is only implied.<sup><a href="#code-industry-batch-ledger">3</a></sup>

The price side has the same rail. `getBlueprintPricing` does one batched price lookup across the raw materials, the product, and buildable intermediates. Raw materials are the cost basis. The product price drives revenue. Intermediate prices are carried only as a confidence/readout side-channel, not folded into the cost basis. Then everything goes through `assemblePricing`, the same pure assembly function the client uses after live prices refresh. The streamed seed and the refreshed result are not two formulas that happen to agree; they are the same formula with newer inputs.<sup><a href="#code-industry-pricing-query">4</a></sup><sup><a href="#code-industry-assembler">5</a></sup>

[PR #62](https://github.com/StorminRH/lgi-tools/pull/62) changed the user-facing price model. Opening a blueprint now re-confirms the relevant prices live through the shared refresh-on-view engine. The page starts with the durable last-known seed, then the provider refreshes raw materials, the product, and intermediates as one set. As batches return, the provider merges live rows over the seed and recomputes the full pricing snapshot. The user sees a number immediately, but the UI marks that number as something being confirmed, not as a fresh truth just because it painted.<sup><a href="#code-industry-provider-refresh">6</a></sup>

The provider is the planner’s state hub. It owns run count, selected build system, optional station, selected structure, market history, owned blueprint data, owned assets, manual ME/TE overrides, the ME-aware ledger, and build-time totals. That sounds like too much state, but the alternative is worse: each component inventing its own idea of the plan. The provider keeps those inputs in one place and recomputes through the same assembler when any of them changes.<sup><a href="#code-industry-provider-core">7</a></sup>

[PR #105](https://github.com/StorminRH/lgi-tools/pull/105) moved the planner from gross material margin toward net margin. The important design decision was that net margin should be an overlay, not a rewrite of gross margin. The fee math lives in a pure dependency-free leaf. The planner fetches build-location data only when the user picks a system: stations, the system’s manufacturing and reaction indices, and the adjusted prices for the blueprint’s direct base materials. The net path preserves nulls instead of pretending unknowns are zero. A missing cost index means the job fee total is unknown, but facility tax and SCC surcharge can still be shown. A missing adjusted price is flagged, not silently dropped.<sup><a href="#code-industry-build-location">8</a></sup><sup><a href="#code-industry-fees">9</a></sup>

Runs created another boundary. Runs scale output units, raw-material demand, fees, and margin. They do not change what the blueprint is. The run control lives in the cockpit UI and flows back through the provider. That same row also exposes the top blueprint’s ME and TE fields when the job is manufacturing. The UI is allowed to be interactive; the calculation still has to pass through the same central state and assembly path.<sup><a href="#code-industry-cockpit">10</a></sup>

Owned blueprints were the next hard layer. [PR #171](https://github.com/StorminRH/lgi-tools/pull/171) made the planner understand the blueprints a signed-in player owns. That data cannot live in the static server seed because it is per-user and comes from authenticated ESI reads. The provider fetches it once on blueprint open, derives a material-efficiency map for the cost path, and keeps the owner/location/time-efficiency detail on a separate readout channel. ME changes cost. TE changes time. Owner and location explain the source. Those are related, but they are not the same input.<sup><a href="#code-industry-provider-overlays">11</a></sup><sup><a href="#code-industry-batch-ledger">3</a></sup>

That separation matters because EVE’s ME rounding is not a simple multiplier slapped on the final total. The ME-aware ledger has to aggregate demand topologically before applying each buildable blueprint’s material efficiency and propagating its adjusted inputs downward. TE is deliberately separate from the cost path and feeds build-time calculation instead. This is one of the places where I had to direct the architecture away from a tempting simplification: “efficiency” is not one knob. ME, TE, job fees, and structure bonuses touch different parts of the calculation.<sup><a href="#code-industry-provider-derived">12</a></sup>

[PR #173](https://github.com/StorminRH/lgi-tools/pull/173) added owned assets. That overlay answers a different question: not “what does this build cost from an empty hangar?” but “how much of this do I already have?” The owned-asset map fills the quantity rings and ledgers, but it never enters the cost compute. That is intentional. Owned inventory changes acquisition planning; it does not change the market value of the build. If the UI wants a later “cash still needed” mode, that should be a new explicit mode, not a hidden mutation of build cost.<sup><a href="#code-industry-provider-overlays">11</a></sup>

[PR #178](https://github.com/StorminRH/lgi-tools/pull/178) added corporation structures as build locations, and that made the location model more realistic. A structure is not just a label beside a system. Its type and fitted rigs can reduce material, time, and job cost. The planner maps one selected structure into per-node factors based on each node’s activity. Manufacturing material bonuses apply to manufacturing nodes; reactions do not get manufacturing ME just because they live in the same tree. Time bonuses are activity-specific. Job-cost reduction applies to the top manufacturing job’s net-fee path. The structure code is pure because it needs to be trusted before it is allowed to touch the central planner numbers.<sup><a href="#code-industry-structure-factors">13</a></sup>

The corporation-sharing part also reinforced a privacy rule that shows up elsewhere in the app. Corporation structures are useful to all members, but they are not safe to pull just because one character loads a planner page. Sharing defaults off. A Station Manager has to opt the corporation in, and turning sharing off wipes the stored structure catalogue and recorded rigs. Only after that consent gate do shared structures become build locations in the planner. That is the right place for the feature to be opinionated: convenience should not accidentally expose corporation infrastructure.

The current planner UI is the result of all those layers. It opens with a cockpit-style page: product identity, run controls, ME/TE controls, build-location selector, KPI tiles, and a consolidated build plan. The UI changed several times, but the underlying rule stayed stable: the page can show many views, but they all read the same structure, the same pricing snapshot, the same ledger, and the same overlays.<sup><a href="#code-industry-cockpit">10</a></sup>

This is why the Industry Planner became the stress test for LGI.tools. It crosses almost every boundary in the repo: SDE data, ESI prices, daily industry indices, cached static structure, live refresh, authenticated player data, corporation data, and pure math. The feature only stays understandable because each layer has a job.

The planner’s lesson is the same one I keep coming back to: do not let a useful number hide its assumptions. Gross margin is not net margin. Market price is not adjusted price. Owned assets are not reduced cost. ME is not TE. A structure’s security and rigs matter. A fallback price is not the same as an ESI price. When those distinctions are visible in the code, AI can help build the surface without quietly flattening the domain.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-industry-page" file="src/app/industry/[id]/page.tsx" lines="56-63,70-98" lang="tsx" -->
```tsx
// The structure read is cached 'max', so the tree + hero chrome paint fast.
// The price read is started here but NOT awaited — the promise is handed to
// PricingProvider, which resolves it in its own isolated Suspense and fans the
// prices out while the build structure never waits on them.
async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number.parseInt(rawId, 10);

  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();

  const pricingPromise = getBlueprintPricing(id);
  const historyPromise = getMarketHistoryInputs([structure.product.typeId]);

  return (
    <PricingProvider
      structure={structure}
      pricingPromise={pricingPromise}
      historyPromise={historyPromise}
    >
      <CockpitPlanner structure={structure} />
    </PricingProvider>
  );
}
```

<!-- uth:code id="code-industry-structure" file="src/features/industry-planner/queries.ts" lines="38-41,86-99,107-168" lang="ts" -->
```ts
// The industry-planner feature is the composition layer that sits ABOVE the
// eve-data, market-prices, and industry-math data slices — the one place
// allowed to join them. The pure margin math lives in industry-math; everything
// here is glue + caching.

export async function getBlueprintStructure(
  blueprintId: number,
): Promise<BlueprintStructure | null> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  return withColdStartRetry(async () => {
    const chosen = await getBlueprintOutput(blueprintId);
    if (!chosen) return null;

    const treeResult = await getBlueprintTree(blueprintId);
    const tree = treeResult?.treeJson ?? [];
    const rawTypeIds = collectRawTypeIds(tree);
    const labelIds = dedupe([chosen.productTypeId, ...collectTreeTypeIds(tree)]);
    const blueprintIds = collectBlueprintIds(tree);

    const [labels, activityByBlueprint, activityTimeMap] = await Promise.all([
      getTypeLabels(labelIds),
      getActivityByBlueprint([...blueprintIds]),
      getBlueprintActivityTimes([blueprintId, ...blueprintIds]),
    ]);

    const { buildTree, buildNodeDisplay, rootHeight } = toBuildTree({
      tree,
      labels,
      heights: computeHeights(tree),
      activityByBlueprint,
      product: {
        typeId: chosen.productTypeId,
        quantityPerRun: chosen.quantity,
        activityId: chosen.activityId,
      },
    });

    return { blueprintTypeId: blueprintId, activityId: chosen.activityId, tree, buildTree, buildNodeDisplay, rootHeight };
  });
}
```

<!-- uth:code id="code-industry-batch-ledger" file="src/features/industry-planner/build-batch.ts" lines="5-15,67-85,88-128,173-188,208-260" lang="ts" -->
```ts
// Whole-run raw-material totals — the cost basis for the planner.
// What a player must actually BUY to build the target from an empty hangar:
// you can't run 1.68 of a reaction, you run 2. Demand is summed across all
// parents before the ceil, so a shared sub-component is counted once.

export interface BatchLedger {
  raws: Map<number, number>;
  builds: Map<number, { runs: number; batch: number; me: number; blueprintTypeId: number }>;
}

export function computeBatchLedger(tree: TreeNode[], requestedRuns = 1): BatchLedger {
  const recipes = flattenRecipes(tree);
  const ledger = new Map<number, { required: number; runs: number }>();
  const raws = new Map<number, number>();

  const walk = (typeId: number, qtyNeeded: number) => {
    const recipe = recipes.get(typeId);
    if (!recipe) {
      raws.set(typeId, (raws.get(typeId) ?? 0) + qtyNeeded);
      return;
    }
    let entry = ledger.get(typeId) ?? { required: 0, runs: 0 };
    ledger.set(typeId, entry);
    const prevRuns = entry.runs;
    entry.required += qtyNeeded;
    entry.runs = recipe.batch > 0 ? Math.ceil(entry.required / recipe.batch) : 0;
    const additionalRuns = entry.runs - prevRuns;
    if (additionalRuns > 0) {
      for (const input of recipe.inputs) walk(input.typeId, additionalRuns * input.qty);
    }
  };

  for (const node of tree) walk(node.typeId, node.quantity * requestedRuns);
  return { raws, builds };
}

function meAdjust(qty: number, runs: number, me: number, structureMult = 1): number {
  const meMult = me > 0 ? 1 - me / 100 : 1;
  const mult = meMult * structureMult;
  if (mult >= 1) return qty * runs;
  return Math.max(runs, Math.ceil(roundTo2(qty * runs * mult)));
}

export function computeBatchLedgerWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): BatchLedger {
  // ME-aware: aggregate demand first, then apply each buildable's ME once over
  // its final run total before propagating adjusted inputs downward.
}
```

<!-- uth:code id="code-industry-pricing-query" file="src/features/industry-planner/queries.ts" lines="171-219" lang="ts" -->
```ts
export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG, BLUEPRINT_STRUCTURE_TAG);

  const structure = await getBlueprintStructure(blueprintId);
  if (!structure) return null;

  const priceIds = dedupe([
    ...collectRawTypeIds(structure.tree),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ]);
  const priceMap = await getPrices(priceIds);

  return assemblePricing(structure, (typeId): PriceLite | undefined => {
    const p = priceMap.get(typeId);
    if (!p) return undefined;
    return {
      bestBuy: p.bestBuy,
      bestSell: p.bestSell,
      pct5Buy: p.pct5Buy,
      pct5Sell: p.pct5Sell,
      buyVolume: p.buyVolume === null ? null : Number(p.buyVolume),
      sellVolume: p.sellVolume === null ? null : Number(p.sellVolume),
      buyDepth: p.buyDepth,
      sellDepth: p.sellDepth,
      source: p.source,
      staleAfterMs: p.staleAfter.getTime(),
    };
  });
}
```

<!-- uth:code id="code-industry-assembler" file="src/features/industry-planner/build-pricing.ts" lines="22-26,106-132,174-275" lang="ts" -->
```ts
// One assembly path: the server query builds it from the DB price snapshot, and
// the client rebuilds it from live on-demand prices after a refresh. Same inputs
// → same margin, no drift between them.

export interface AssembleOptions {
  runs?: number;
  fee?: {
    adjustedPriceOf: AdjustedPriceOf;
    systemCostIndex: number | null;
    structureCostBonusPct?: number;
  };
  meOf?: (blueprintTypeId: number) => number | undefined;
  structureMeFactorOf?: (blueprintTypeId: number) => number;
}

export function assemblePricing(
  structure: BlueprintStructure,
  priceOf: PriceLiteOf,
  opts: AssembleOptions = {},
): BlueprintPricing {
  const runs = opts.runs ?? 1;
  const materials =
    opts.meOf || opts.structureMeFactorOf
      ? computeBatchMaterialsWithMe(structure.tree, runs, {
          meOf: opts.meOf ?? (() => undefined),
          topBlueprintTypeId: structure.blueprintTypeId,
          structureMeFactorOf: opts.structureMeFactorOf,
        })
      : computeBatchMaterials(structure.tree, runs);

  const buildCost = computeBuildCost(materials, buyOf);
  const outputUnits = structure.product.quantityPerRun * runs;
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: outputUnits,
  });

  return {
    rows,
    intermediatePrices,
    product,
    summary: { inputCost: buildCost.total, revenue: margin.revenue, margin: margin.margin },
    net: computeNet(structure, opts.fee, runs, buildCost.total, productPrice?.bestSell ?? null, outputUnits),
  };
}
```

<!-- uth:code id="code-industry-build-location" file="src/features/industry-planner/queries.ts" lines="19-24,25-51" lang="ts" -->
```ts
// Per-pick build-location read: the system's industry stations + both relevant
// cost indices + the CCP adjusted prices for THIS blueprint's direct ME0 base
// materials. The join lives here, in the feature layer, never inside a data slice.
export async function getBuildLocation(
  systemId: number,
  blueprintId: number,
): Promise<BuildLocationData> {
  const structure = await getBlueprintStructure(blueprintId);
  const baseTypeIds = dedupe(
    structure?.buildTree[0]?.inputs.map((i) => i.typeId) ?? [],
  );

  const [stations, costIndices, adjustedMap] = await Promise.all([
    getIndustryStationsForSystem(systemId),
    getSystemCostIndices(systemId),
    getAdjustedPrices(baseTypeIds),
  ]);

  return {
    stations,
    costIndices: {
      manufacturing: costIndices.get('manufacturing') ?? null,
      reaction: costIndices.get('reaction') ?? null,
    },
    adjustedPrices: [...adjustedMap.entries()].map(([typeId, adjustedPrice]) => ({ typeId, adjustedPrice })),
  };
}
```

<!-- uth:code id="code-industry-fees" file="src/data/industry-math/fees.ts" lines="15-21,84-124,169-212" lang="ts" -->
```ts
// Null-propagation honesty: a missing input is FLAGGED, never silently zeroed;
// a value we genuinely don't know is null, while values we do know stay visible.

export function computeJobInstallationFee(
  baseMaterials: MaterialQty[],
  adjustedPriceOf: AdjustedPriceOf,
  systemCostIndex: number | null,
  rates: FeeRates = DEFAULT_FEE_RATES,
  structureCostBonusPct = 0,
): JobInstallationFee {
  const missingAdjustedPriceTypeIds: number[] = [];
  let estimatedItemValue = 0;

  for (const m of baseMaterials) {
    const adjusted = adjustedPriceOf(m.typeId);
    if (adjusted === null) {
      missingAdjustedPriceTypeIds.push(m.typeId);
      continue;
    }
    estimatedItemValue += adjusted * m.quantity;
  }

  const facilityTax = estimatedItemValue * rates.facilityTax;
  const sccSurcharge = estimatedItemValue * rates.sccSurcharge;
  const missingSystemCostIndex = systemCostIndex === null;
  const jobGrossCost = missingSystemCostIndex
    ? null
    : estimatedItemValue * systemCostIndex * (1 - structureCostBonusPct / 100);
  const total = jobGrossCost === null ? null : jobGrossCost + facilityTax + sccSurcharge;

  return { estimatedItemValue, jobGrossCost, facilityTax, sccSurcharge, total, missingAdjustedPriceTypeIds, missingSystemCostIndex };
}

export function computeNetMargin(input: NetMarginInput): NetMargin {
  const gross = computeMargin(input);
  const jobFee = computeJobInstallationFee(input.baseMaterials, input.adjustedPriceOf, input.systemCostIndex, rates, input.structureCostBonusPct ?? 0);
  const sellSide = computeSellSideFees(gross.revenue, rates);
  const netCost = jobFee.total === null ? null : input.buildCost + jobFee.total;
  const netMargin = gross.revenue === null || sellSide.total === null || netCost === null
    ? null
    : gross.revenue - sellSide.total - netCost;
  return { revenue: gross.revenue, buildCost: input.buildCost, grossMargin: gross.margin, jobFee, sellSide, netCost, netMargin, incomplete };
}
```

<!-- uth:code id="code-industry-provider-core" file="src/features/industry-planner/components/PricingProvider.tsx" lines="58-66,120-143,145-224" lang="tsx" -->
```tsx
// The planner's single live-pricing store. Prices arrive via an un-awaited
// promise the server hands down, so the cascade structure never waits on price.

export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  seeded: boolean;
  refreshing: boolean;
  runs: number;
  setRuns: (runs: number) => void;
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation | null) => void;
  availableStructures: AvailableStructure[] | null;
  selectedStructure: AvailableStructure | null;
  structureFactors: StructureFactors;
  ownedMe: Map<number, number> | null;
  ownedDetail: Map<number, OwnedComponentDetail> | null;
  ownedAssets: Map<number, OwnedAssetEntry> | null;
  meOverrides: Map<number, number>;
  teOverrides: Map<number, number>;
  ledger: BatchLedger;
  buildTimes: BuildTimes;
}
```

<!-- uth:code id="code-industry-provider-refresh" file="src/features/industry-planner/components/PricingProvider.tsx" lines="99-134,214-249" lang="tsx" -->
```tsx
const assemble = useCallback(() => {
  const lookup = (typeId: number): PriceLite | undefined =>
    liveRef.current.get(typeId) ?? seedMapRef.current.get(typeId);
  const loc = locationRef.current;
  const sf = structureFactorsRef.current;
  const fee = loc
    ? {
        adjustedPriceOf: (id: number) => loc.adjustedPrices.get(id) ?? null,
        systemCostIndex: loc.costIndices.manufacturing ?? null,
        structureCostBonusPct: sf.structureCostBonusPct,
      }
    : undefined;

  const owned = ownedMeRef.current;
  const overrides = meOverridesRef.current;
  const meOf = owned || overrides.size ? effectiveMeOf(owned, overrides) : undefined;

  setPricing(assemblePricing(structure, lookup, {
    runs: runsRef.current,
    fee,
    meOf,
    structureMeFactorOf: sf.active ? sf.structureMeFactorOf : undefined,
  }));
}, [structure]);

const toRefresh = useMemo(
  () => [...new Set<number>([
    ...collectRawTypeIds(structure.tree),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ])],
  [structure],
);

const { refreshing } = useRefreshOnView(toRefresh, {
  enabled: seeded && !!pricing,
  onBatch,
});
```

<!-- uth:code id="code-industry-provider-overlays" file="src/features/industry-planner/components/PricingProvider.tsx" lines="32-37,69-76,96-108" lang="tsx" -->
```tsx
// Owned-blueprint ME overlay: fetch the caller's owned ME for this build's
// blueprints once on open. Per-user data can't live in the static seed.
useEffect(() => {
  const blueprintTypeIds = collectBlueprintTypeIds(structure.tree, structure.blueprintTypeId);
  apiFetch(ownedBlueprintsEndpoint, { body: { blueprintTypeIds }, cache: 'no-store' })
    .then((res) => {
      if (!res.ok) return;
      setOwnedMe(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, b.me])));
      setOwnedDetail(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, {
        te: b.te,
        ownerType: b.ownerType,
        ownerName: b.ownerName,
        locationName: b.locationName,
        locationFlag: b.locationFlag,
      }])));
    })
    .catch(() => {});
}, [structure]);

// Owned-asset overlay: on-hand quantity + holdings for every material/product.
// Never read by the cost compute.
useEffect(() => {
  apiFetch(ownedAssetsEndpoint, { body: { typeIds: toRefresh }, cache: 'no-store' })
    .then((res) => {
      if (res.ok) setOwnedAssets(new Map(res.data.assets.map((a) => [a.typeId, a])));
    })
    .catch(() => {});
}, [structure, toRefresh]);
```

<!-- uth:code id="code-industry-provider-derived" file="src/features/industry-planner/components/PricingProvider.tsx" lines="178-211" lang="tsx" -->
```tsx
const ledger = useMemo<BatchLedger>(
  () =>
    computeBatchLedgerWithMe(structure.tree, runs, {
      meOf: effectiveMeOf(ownedMe, meOverrides),
      topBlueprintTypeId: structure.blueprintTypeId,
      structureMeFactorOf: structureFactors.structureMeFactorOf,
    }),
  [structure.tree, structure.blueprintTypeId, runs, ownedMe, meOverrides, structureFactors],
);

// TE-adjusted build-time figures. Its own memo, separate from cost — TE never
// enters the cost path. Reads the shared ME ledger for per-node batched runs.
const buildTimes = useMemo<BuildTimes>(
  () =>
    computeBuildTimes({
      topBlueprintTypeId: structure.blueprintTypeId,
      topProductTypeId: structure.product.typeId,
      topJobSeconds: structure.topJobSeconds,
      nodeJobSeconds: structure.nodeJobSeconds,
      runs,
      builds: ledger.builds,
      teOf: effectiveTeOf(ownedTe, teOverrides),
      structureTeFactorOf: structureFactors.structureTeFactorOf,
    }),
  [structure, runs, ledger, ownedTe, teOverrides, structureFactors],
);
```

<!-- uth:code id="code-industry-structure-factors" file="src/features/industry-planner/structure-factors.ts" lines="3-18,85-120" lang="ts" -->
```ts
// Maps the single selected build structure onto the per-node engine factors.
// The model is role-agnostic: one selected structure bonuses each build node by
// THAT node's activity. The security a rig scales against is the structure's own
// system (corp structure) or the planner's selected build location (custom).

export function structureFactorsFor(args: {
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint } = args;
  const manufacturingBonus = bonusFor(selectedStructure, MANUFACTURING_ACTIVITY, locationSecurity);
  const reactionBonus = bonusFor(selectedStructure, REACTION_ACTIVITY, locationSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}
```

<!-- uth:code id="code-industry-cockpit" file="src/features/industry-planner/components/CockpitPlanner.tsx" lines="21-26,51-63,64-144" lang="tsx" -->
```tsx
// The Cockpit planner body reads the live pricing store and lays the product
// economics out as a page head, identity bar, KPI tiles, and build plan.

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const {
    runs,
    setRuns,
    ownedMe,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
  } = usePricing();

  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <>
      <PlannerHead name={structure.product.name} group={group} activity={activityLabel(structure.activityId)} />
      <div className="rounded-md border border-border bg-section px-[18px] py-4">
        <TypeIcon typeId={structure.product.typeId} variant="render" size={52} alt={structure.product.name} />
        {isManufacturing && (
          <>
            <MeField blueprintTypeId={structure.blueprintTypeId} ownedMe={ownedMe} meOverrides={meOverrides} setMeOverride={setMeOverride} resetMeOverride={resetMeOverride} />
            <TeField blueprintTypeId={structure.blueprintTypeId} ownedTe={ownedTe} teOverrides={teOverrides} setTeOverride={setTeOverride} resetTeOverride={resetTeOverride} />
          </>
        )}
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
      </div>
      {isManufacturing && <BuildLocationSelector blueprintId={structure.blueprintTypeId} />}
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
```
<!-- uth:code-excerpts:end -->

## Characters & Accounts

Account work in LGI.tools is not just “add login.”

For a normal web app, the identity model is usually one human, one account, one session. EVE makes that more complicated. One human can own many characters. Each character can grant a different set of ESI scopes. A character can be sold to another EVE account. A corporation-level feature may need a linked character with the right in-game role. And once the site starts storing skill queues, jobs, assets, blueprints, preferences, and structures, unlinking a character is not the same thing as deleting all traces of that character’s data.

The first EVE login in [PR #10](https://github.com/StorminRH/lgi-tools/pull/10) was intentionally small. It proved the basics: start EVE SSO, verify the returned JWT, parse the character identity, upsert a `characters` row, and issue a session. That was the right move for a beta tool that only needed to know who was signed in. It also made an early decision that still holds up: because nothing was reading ESI yet, the first version discarded refresh tokens instead of storing long-lived access before the app had a real need for it.

That changed once live character tools became real. [PR #82](https://github.com/StorminRH/lgi-tools/pull/82) replaced the hand-rolled auth flow with Better Auth and turned the account model into the real spine of the app. The `user` row represents the human LGI.tools account. The `account` row represents a linked EVE character: provider `eve`, account ID equal to the EVE character ID. The old `characters` row stays as the per-character profile and telemetry anchor. Sessions belong to the user, and the active character is a field on the user row, not a separate login.<sup><a href="#code-account-schema">1</a></sup>

That distinction matters. Admin access is per user. A character profile is per character. EVE tokens are per linked character. The UI may show the active character’s portrait, but the account is the human who linked it. The session enrichment resolves that active character every time the app asks for the session, so the header and server gates read the same current identity instead of trusting whichever character happened to sign in last.<sup><a href="#code-account-auth-spine">2</a></sup>

EVE SSO still needed custom handling inside Better Auth. EVE does not provide a separate userinfo endpoint for this flow, so identity comes from the verified access-token JWT. The token exchange also needs CCP-friendly request shape: HTTP Basic client auth, PKCE verifier, and the outbound User-Agent. Better Auth owns the framework-level session and account flow, but LGI.tools still owns the EVE-specific edges: token exchange, JWT verification, scope list, owner-hash reconciliation, and character profile refresh.<sup><a href="#code-account-auth-spine">2</a></sup><sup><a href="#code-account-eve-sso">3</a></sup>

Token custody is where I stopped treating OAuth as a generic checkbox. A refresh token is a long-lived bearer credential for a pilot’s ESI access. The repo encrypts EVE access and refresh tokens before they reach Neon using AES-256-GCM under a dedicated `EVE_TOKEN_ENCRYPTION_KEY`, separate from the Better Auth session secret. Decryption failure means “this character must reconnect,” not “try forwarding the value anyway.” That is an important failure mode: tampered, legacy, or unreadable token material should never become an outbound EVE request.<sup><a href="#code-account-token-crypto">4</a></sup>

The vending path follows the same rule. Features do not read refresh tokens. The token service reads the encrypted account row, decrypts only inside that layer, returns a short-lived access token, and refreshes against EVE only when the stored token is near expiry. The compare-and-swap write is there because two live sync jobs can ask for the same character at the same time. A rotated refresh token must not be overwritten by a slower loser, and an `invalid_grant` from a raced stale token must not wrongly disconnect the pilot.<sup><a href="#code-account-token-service">5</a></sup>

The first real scope mistake came quickly. [PR #83](https://github.com/StorminRH/lgi-tools/pull/83) fixed a sign-in failure caused by asking EVE for a scope name that did not exist. The wrong value was only one namespace off, but EVE rejected the whole authorize request. That changed the rule for scopes: exact strings are not “copy.” They are an integration contract. The requested scope set now lives in one module, with comments explaining every read and the naming traps that have already hurt the project.<sup><a href="#code-account-eve-sso">3</a></sup>

[PR #156](https://github.com/StorminRH/lgi-tools/pull/156) made that scope policy stricter. The site asks for the read-only EVE scopes it actually uses and no write scopes. When features were added later, the scope list grew deliberately, with each scope tied to a shipped consumer. The access-health code is also per-feature capable: a missing scope should degrade the surface that needs it, not make the whole account look broken. The Characters page then shows what each linked character has actually granted, including legacy scopes that were granted earlier but are no longer requested.<sup><a href="#code-account-scopes">6</a></sup><sup><a href="#code-account-characters-page">7</a></sup>

That page is the user-facing version of the model. A signed-in pilot can link another character, switch the active one, reconnect one with missing access, see granted scopes, and unlink a character. The switch route is deliberately boring but security-critical: it never trusts the posted character ID and checks that the account row belongs to the signed-in user. The unlink route guards the last remaining character and repoints the active character if the removed one was active.<sup><a href="#code-account-characters-page">7</a></sup><sup><a href="#code-account-character-routes">8</a></sup>

[PR #85](https://github.com/StorminRH/lgi-tools/pull/85) is the reason that model works for alts instead of only for a single main. Each EVE character is a separate account row under the same user. Linking an alt does not overwrite the user’s display identity, and switching active character changes who the site acts as without changing who owns the LGI.tools account. [PR #86](https://github.com/StorminRH/lgi-tools/pull/86) added the admin recovery tools for the messy transition case: early standalone character accounts could be reassigned or force-unlinked without asking a pilot to solve an account-shape bug manually.<sup><a href="#code-account-linked-queries">9</a></sup>

The most EVE-specific identity fix was owner-hash binding. EVE’s JWT includes a character-owner hash that changes when a character transfers to another EVE account. Without using that claim, a sold character could potentially sign the new human into the old LGI.tools account because the character ID is the same. The reconcile path compares the JWT owner hash against the stored one before Better Auth completes the account lookup. A mismatch purges the prior owner’s credential tier and lets the new owner link fresh.<sup><a href="#code-account-owner-hash">10</a></sup>

That owner-hash work exposed the bigger cleanup problem. By the time the app had skills, jobs, owned blueprints, assets, online status, preferences, telemetry, and structures, there was no longer one obvious place to delete “a character’s data.” [PR #179](https://github.com/StorminRH/lgi-tools/pull/179) added the purge registry so every data-owning slice declares its own teardown. The orchestrator runs credential first, then regenerable caches, then durable app-authored data. That order is deliberate: kill the EVE link and tokens before anything else can re-sync, then clear mirrors, then remove durable user-owned records.<sup><a href="#code-account-purge-types">11</a></sup><sup><a href="#code-account-purge-register">12</a></sup>

The registry also has a build-time gate. It reflects the Drizzle schema, finds user-, character-, or owner-keyed tables, and fails if a table is neither claimed by a purge contributor nor explicitly retained with a reason. That is one of the more important rails in the repo because personal data coverage should not rely on remembering a checklist. If a future AI session adds a new per-character table, the build should ask where its deletion path lives before the feature ships.<sup><a href="#code-account-purge-gate">13</a></sup>

The current account-safety primitives build on that registry. A per-character purge revokes the EVE refresh token at CCP first, then runs the full purge, then either repoints the account to a surviving character or deletes the user if that was the last character. A full account nuke enumerates linked characters, revokes and purges each one, runs the user-level purge, and deletes the user row. The code re-enumerates during account deletion because a character linked concurrently should not be cascade-orphaned with surviving per-character caches.<sup><a href="#code-account-purge-entrypoints">14</a></sup>

So the account surface is not just a Characters page. It is the project’s identity boundary: user versus character, active character versus linked character, granted scope versus requested scope, access token versus refresh token, owner-intrinsic character data versus owner-authored data, unlink versus purge. Those distinctions are easy for AI to flatten. The repo’s job is to make them hard to flatten.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-account-schema" file="src/features/auth/schema.ts" lines="47-81,83-138" lang="ts" -->
```ts
// Better Auth core tables. `user` is the human/main-account row.
// `account` is the EVE link — providerId 'eve', accountId = the character id.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: characterRoleEnum('role').default('USER').notNull(),
  activeCharacterId: bigint('active_character_id', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    scope: text('scope'),
    ownerHash: text('owner_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  ],
);
```

<!-- uth:code id="code-account-auth-spine" file="src/features/auth/auth.ts" lines="39-77,143-193,197-208,236-249" lang="ts" -->
```ts
function encryptAccountTokens<T extends {
  providerId?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}>(data: T): T {
  if (data.providerId != null && data.providerId !== EVE_PROVIDER_ID) return data;
  const out: T = { ...data };
  if (typeof out.accessToken === 'string' && !out.accessToken.startsWith(CIPHERTEXT_PREFIX)) {
    out.accessToken = encryptToken(out.accessToken);
  }
  if (typeof out.refreshToken === 'string' && !out.refreshToken.startsWith(CIPHERTEXT_PREFIX)) {
    out.refreshToken = encryptToken(out.refreshToken);
  }
  return out;
}

genericOAuth({
  config: [{
    providerId: EVE_PROVIDER_ID,
    authorizationUrl: EVE_AUTHORIZE_URL,
    tokenUrl: EVE_TOKEN_URL,
    scopes: [...EVE_SCOPES],
    pkce: true,
    prompt: 'consent',
    getToken: async ({ code, codeVerifier }) => {
      const token = await exchangeCodeForToken({ code, codeVerifier: codeVerifier ?? '', clientId, clientSecret });
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: [...EVE_SCOPES],
      };
    },
    getUserInfo: async (tokens) => {
      const claims = await verifyEveJwt(tokens.accessToken);
      const character = claimsToCharacter(claims);
      await reconcileCharacterOwner(character.characterId, claims.owner);
      await upsertCharacterOnLogin(character);
      return { id: String(character.characterId), name: character.name, image: character.portraitUrl, email: syntheticEmail(character.characterId), emailVerified: true };
    },
  }],
});

customSession(async ({ user: u, session: s }) => {
  const active = await resolveActiveCharacter(u.id, u.activeCharacterId ?? null);
  const characterId = active?.characterId ?? null;
  return { user: u, session: s, characterId, name: active?.name ?? u.name, portraitUrl: active?.portraitUrl ?? u.image ?? '', isAdmin: computeIsAdmin(characterId, role) };
}, options);
```

<!-- uth:code id="code-account-eve-sso" file="src/features/auth/eve-sso.ts" lines="18-35,37-101,141-160" lang="ts" -->
```ts
export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
export const EVE_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
export const EVE_AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

// The exact scope set the site requests. Strict least privilege: read-only scopes
// tied to shipped features, with naming traps documented in the same place.
export const EVE_SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-characters.read_blueprints.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-assets.read_assets.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-location.read_online.v1',
  'esi-corporations.read_structures.v1',
] as const;

function buildTokenRequestInit(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): RequestInit {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
      'User-Agent': OUTBOUND_USER_AGENT,
    },
    body: body.toString(),
  };
}
```

<!-- uth:code id="code-account-token-crypto" file="src/features/auth/token-crypto.ts" lines="3-13,18-24,28-39,42-63" lang="ts" -->
```ts
// Encryption at rest for EVE OAuth tokens. The access + refresh tokens live in
// the account row, but a refresh token is a long-lived bearer of a pilot's ESI
// access — it must never sit in the database as plaintext and must never leave Neon.

export const TOKEN_CRYPTO_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function key(): Buffer {
  const raw = requireEnv('EVE_TOKEN_ENCRYPTION_KEY');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) throw new Error('EVE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  return decoded;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_CRYPTO_VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptToken(value: string): string | null {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== TOKEN_CRYPTO_VERSION) return null;
  // authenticate + decrypt; return null for tamper/legacy/wrong key
}
```

<!-- uth:code id="code-account-token-service" file="src/features/auth/eve-token-service.ts" lines="3-19,95-122,124-168,170-228" lang="ts" -->
```ts
// Per-character ESI token custody. Reads stored tokens, vends a fresh short-lived
// access token, and re-encrypts + persists the rotated refresh token. The refresh
// token is decrypted, used, and re-encrypted entirely within this layer.

export async function revokeCharacterToken(characterId: number): Promise<void> {
  try {
    const row = await loadAccountRow(characterId);
    const refreshToken = row?.refreshToken ? decryptToken(row.refreshToken) : null;
    if (refreshToken === null) return;
    await revokeEveRefreshToken({ refreshToken, clientId: requireEnv('EVE_CLIENT_ID'), clientSecret: requireEnv('EVE_CLIENT_SECRET') });
  } catch (err) {
    console.error('[eve-token] revoke failed', err);
  }
}

export async function getFreshAccessTokenForCharacter(
  characterId: number,
): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };

  const refreshCiphertext = row.refreshToken;
  const refreshToken = refreshCiphertext ? decryptToken(refreshCiphertext) : null;
  if (refreshToken === null || refreshCiphertext === null) return { kind: 'reauth_required' };

  if (
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    const cached = decryptToken(row.accessToken);
    if (cached !== null) {
      return { kind: 'ok', accessToken: cached, expiresAt: row.accessTokenExpiresAt, characterId, scopes };
    }
  }

  const result = await refreshEveToken({ refreshToken, clientId, clientSecret });
  if (result.kind === 'retryable') return { kind: 'upstream_error' };

  if (result.kind === 'dead') {
    const nulled = await db.update(account).set({ accessToken: null, refreshToken: null }).where(
      and(eq(account.id, row.id), eq(account.refreshToken, refreshCiphertext)),
    );
    if (nulled.length === 0) return reflectStoredToken(characterId);
    return { kind: 'reauth_required' };
  }

  const written = await db.update(account).set({
    accessToken: encryptToken(result.access_token),
    refreshToken: encryptToken(result.refresh_token),
    accessTokenExpiresAt: expiresAt,
  }).where(and(eq(account.id, row.id), or(eq(account.refreshToken, refreshCiphertext), isNull(account.refreshToken))));

  if (written.length === 0) return reflectStoredToken(characterId);
  return { kind: 'ok', accessToken: result.access_token, expiresAt, characterId, scopes };
}
```

<!-- uth:code id="code-account-scopes" file="src/features/auth/scope-health.ts" lines="3-19,33-81,83-132" lang="ts" -->
```ts
// Scope health. Given what's stored on a linked account row and a set of REQUIRED
// scopes, decide whether the pilot must reconnect to restore that access.

export function deriveScopeHealth(
  { scope, hasRefreshToken }: { scope: string | null | undefined; hasRefreshToken: boolean },
  required: readonly string[],
): CharacterHealth {
  const granted = parseScopes(scope);
  const missingScopes = required.filter((s) => !granted.has(s));
  return {
    needsReconnect: !hasRefreshToken || missingScopes.length > 0,
    missingScopes,
  };
}

export function deriveCharacterHealth(input: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): CharacterHealth {
  return deriveScopeHealth(input, EVE_SCOPES);
}

// List what a character has ACTUALLY granted, not the ideal set. Active scopes
// come first; legacy scopes follow so old broad grants are visible.
export function listGrantedScopes(scope: string | null | undefined): GrantedScope[] {
  const granted = tokenizeScopes(scope);
  const grantedSet = new Set(granted);
  const activeSet = new Set<string>(EVE_SCOPES);
  const active = EVE_SCOPES.filter((id) => grantedSet.has(id)).map((id) => describeScope(id, 'active'));
  const legacy = granted.filter((id) => !activeSet.has(id)).map((id) => describeScope(id, 'legacy'));
  return [...active, ...legacy];
}
```

<!-- uth:code id="code-account-characters-page" file="src/app/characters/page.tsx" lines="44-64,95-126,131-147,167-203" lang="tsx" -->
```tsx
function CharacterRow({ character, isActive, isOnlyCharacter }: {
  character: LinkedCharacter;
  isActive: boolean;
  isOnlyCharacter: boolean;
}) {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const scopes = listGrantedScopes(character.scope);

  return (
    <div className="border-t border-border-soft">
      <EntityRow
        name={character.name}
        chips={<><Pill tone="neutral">ID {character.characterId}</Pill>{isActive ? <Chip tone="green">Active</Chip> : null}</>}
        trailing={
          <>
            {health.needsReconnect ? <LinkCharacterButton label="Reconnect" emphasis="reconnect" /> : null}
            {isActive ? null : <SwitchCharacterForm characterId={character.characterId} />}
            <UnlinkCharacterForm characterId={character.characterId} disabled={isOnlyCharacter} />
          </>
        }
      />
      {scopes.length > 0 ? <GrantedScopesList scopes={scopes} /> : null}
    </div>
  );
}

async function CharactersContent({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/?auth_error=login_required');

  const [{ error: rawError }, characters] = await Promise.all([
    searchParams,
    listLinkedCharacters(session.user.id),
  ]);

  return (
    <Card>
      <SectionHeader label="Your characters" hint={`${characters.length} linked`} />
      {characters.map((character) => (
        <CharacterRow
          key={character.characterId}
          character={character}
          isActive={character.characterId === session.characterId}
          isOnlyCharacter={characters.length <= 1}
        />
      ))}
      <LinkCharacterButton label="Link another character" />
      <a href={EVE_AUTHORIZED_APPS_URL}>EVE authorized apps</a>
    </Card>
  );
}
```

<!-- uth:code id="code-account-character-routes" file="src/app/api/account/active-character/route.ts, src/app/api/account/characters/unlink/route.ts" lines="46-52,60-86" lang="ts" -->
```ts
// active-character route: never trust the posted id.
if (!(await accountBelongsToUser(session.user.id, characterId))) {
  return new Response('Character not linked to your account', { status: 400 });
}
await setActiveCharacter(session.user.id, characterId);

// unlink route: clean errors before Better Auth's backstop, then repoint active.
const linked = await listLinkedCharacters(session.user.id);
if (!linked.some((c) => c.characterId === characterId)) {
  return redirectWithError(request, 'not_linked');
}
if (linked.length <= 1) {
  return redirectWithError(request, 'last_character');
}

await auth.api.unlinkAccount({
  body: { providerId: EVE_PROVIDER_ID, accountId: String(characterId) },
  headers: h,
});

const activeCharacterId = await getStoredActiveCharacterId(session.user.id);
if (activeCharacterId === characterId) {
  await repointActiveToOldest(session.user.id);
}
```

<!-- uth:code id="code-account-linked-queries" file="src/features/auth/queries.ts" lines="193-224,226-263,278-299,519-565" lang="ts" -->
```ts
// Multi-character platform. A user can link several EVE characters; these helpers
// list them, resolve the active one, and move the active pointer.

export async function listLinkedCharacters(userId: string): Promise<LinkedCharacter[]> {
  const rows = await db.select({ accountId: account.accountId, scope: account.scope, refreshToken: account.refreshToken, createdAt: account.createdAt, name: characters.name, portraitUrl: characters.portraitUrl })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  return rows.map((r) => ({
    characterId: Number(r.accountId),
    name: r.name ?? `Character ${r.accountId}`,
    portraitUrl: r.portraitUrl ?? portraitUrl(Number(r.accountId)),
    scope: r.scope,
    hasRefreshToken: r.refreshToken != null && r.refreshToken.length > 0,
    linkedAt: r.createdAt,
  }));
}

export async function accountBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const [row] = await db.select({ id: account.id })
    .from(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .limit(1);
  return row != null;
}

export async function deleteLinkedCharacter(userId: string, characterId: number): Promise<boolean> {
  const deleted = await db.delete(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .returning({ id: account.id });
  return deleted.length > 0;
}

export async function reassignCharacter({ characterId, fromUserId, toUserId }: ReassignInput) {
  await db.update(account).set({ userId: toUserId, updatedAt: new Date() }).where(
    and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId)), eq(account.userId, fromUserId)),
  );
  // delete empty source user or repoint its active character
}
```

<!-- uth:code id="code-account-owner-hash" file="src/features/auth/queries.ts" lines="67-83,83-113,115-143" lang="ts" -->
```ts
// Owner-hash identity binding. EVE's JWT owner claim is stable for one human
// and changes only when the character is transferred to a different EVE account.

export async function reconcileCharacterOwner(
  characterId: number,
  jwtOwnerHash: string | null | undefined,
): Promise<void> {
  if (!jwtOwnerHash) return;

  const [row] = await db.select({ userId: account.userId, ownerHash: account.ownerHash })
    .from(account)
    .where(and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))))
    .limit(1);

  if (!row) return;
  const action = classifyOwnerReconcile(row.ownerHash, jwtOwnerHash);
  if (action === 'noop') return;
  if (action === 'backfill') {
    await db.update(account).set({ ownerHash: jwtOwnerHash, updatedAt: new Date() });
    return;
  }

  await purgeTransferredCharacter(row.userId, characterId);
}

export async function purgeTransferredCharacter(priorUserId: string, characterId: number): Promise<void> {
  await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);
  await reconcileAfterCharacterRemoval(priorUserId, characterId);
}
```

<!-- uth:code id="code-account-purge-types" file="src/purge/types.ts" lines="3-20,22-52" lang="ts" -->
```ts
// Each user/character-keyed slice declares one contributor. It claims its tables
// and provides the teardown the orchestrator runs.

export type PurgeTier = 'credential' | 'cache' | 'durable';

export type PurgeSubject =
  | { readonly kind: 'character'; readonly userId: string; readonly characterId: number }
  | { readonly kind: 'user'; readonly userId: string };

export interface RetainedTable {
  readonly table: PgTable;
  readonly reason: string;
}

export interface PurgeContributor {
  readonly name: string;
  readonly tier: PurgeTier;
  readonly claims: readonly PgTable[];
  readonly retained?: readonly RetainedTable[];
  purgeCharacter?(subject: PurgeCharacterSubject): Promise<void>;
  purgeUser?(subject: PurgeUserSubject): Promise<void>;
}
```

<!-- uth:code id="code-account-purge-register" file="src/purge/orchestrator.ts, src/purge/register-all.ts" lines="3-33,23-33" lang="ts" -->
```ts
const TIER_ORDER: readonly PurgeTier[] = ['credential', 'cache', 'durable'];

export async function runPurge(
  subject: PurgeSubject,
  tiers: readonly PurgeTier[] = TIER_ORDER,
): Promise<void> {
  for (const tier of TIER_ORDER) {
    if (tiers.includes(tier)) await runTier(tier, subject);
  }
}

export const PURGE_CONTRIBUTORS: readonly PurgeContributor[] = [
  authPurgeContributor,
  skillQueuePurgeContributor,
  industryJobsPurgeContributor,
  ownedAssetsPurgeContributor,
  ownedBlueprintsPurgeContributor,
  onlineStatusPurgeContributor,
  telemetryPurgeContributor,
  preferencesPurgeContributor,
  customStructuresPurgeContributor,
];
```

<!-- uth:code id="code-account-purge-gate" file="src/purge/registry.test.ts" lines="3-13,28-67,76-95" lang="ts" -->
```ts
// THE PURGE GATE — DB-free, fail-closed. Reflects the Drizzle schema, finds every
// user/character/owner-keyed table, and asserts each is claimed by a purge
// contributor OR declared retained. A new user-data table without a contributor
// fails this test.

const flagged = tables.filter(isUserDataTable).map(tableName);
const claimed = new Set(PURGE_CONTRIBUTORS.flatMap((c) => c.claims.map(tableName)));
const retained = new Set(
  PURGE_CONTRIBUTORS.flatMap((c) => (c.retained ?? []).map((r) => tableName(r.table))),
);

it('every user/character/owner-keyed table is claimed or declared-retained', () => {
  const unclaimed = findUnclaimed(flagged, claimed, retained);
  expect(
    unclaimed,
    `Unclaimed user-data table(s): ${unclaimed.join(', ')}. Declare a purge contributor ` +
      `in the owning slice (claim the table), or a retained entry with a reason.`,
  ).toEqual([]);
});

it('corp_access_audit is declared-retained', () => {
  expect(retained.has('corp_access_audit')).toBe(true);
});
```

<!-- uth:code id="code-account-purge-entrypoints" file="src/features/auth/queries.ts" lines="208-227,238-250,517-529" lang="ts" -->
```ts
export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  return reconcileAfterCharacterRemoval(userId, characterId);
}

export async function nukeAccount(userId: string): Promise<void> {
  let linked = await eveAccountIdsFor(userId);
  while (linked.length > 0) {
    for (const characterId of linked) {
      await revokeCharacterToken(characterId);
      await runPurge({ kind: 'character', userId, characterId });
    }
    linked = await eveAccountIdsFor(userId);
  }

  await runPurge({ kind: 'user', userId });
  await db.delete(user).where(eq(user.id, userId));
}
```
<!-- uth:code-excerpts:end -->

## Live Trackers

The live tracker work is where I had to unlearn one of my early assumptions.

At first, it felt natural to put anything that changed on screen into the live backend. Skill queues count down. Industry jobs progress. Jobs flip from active to ready. Character portraits can show online or offline. All of that feels live to the user, so the first instinct was to make it live in the infrastructure too.

That turned out to be too broad.

The better distinction is this: **live on screen** is not the same thing as **needs a live server loop**. A countdown can be live because the browser has a timestamp. A job can become ready because `end_date` passed. A skill can show progress because the queue entry carries start and finish times. None of those require the server to keep polling while the user watches. Online status is different. It is a small, genuinely live signal that changes outside the page and is useful across many surfaces at once.

That distinction is the current architecture.<sup><a href="#code-live-sync-registry">1</a></sup>

[PR #90](https://github.com/StorminRH/lgi-tools/pull/90) introduced Convex as the live backend, but it started correctly: identity and plumbing only. Convex could validate the site’s JWT, the browser could connect over the websocket, and the app could run without Convex configured. It was not allowed to become a second database for EVE domain data. That boundary mattered later because the first real trackers were tempting. Once a live backend exists, AI-generated code will naturally keep putting live-looking things there unless the repo says no.<sup><a href="#code-live-convex-schema">2</a></sup>

[PR #94](https://github.com/StorminRH/lgi-tools/pull/94) put skill queues on that foundation. [PR #96](https://github.com/StorminRH/lgi-tools/pull/96) did the same for industry jobs. Those were good proofs of the full chain: signed-in user, linked characters enumerated server-side, short-lived per-character token, authenticated ESI read, held ETags, one batched write, and reactive browser updates. They also had the right authority model. The client could request “sync my view,” but it could not post a character ID and grant itself access. The action re-enumerated the user’s linked characters from Neon every run.

The mistake was not security. The mistake was placement.

[PR #97](https://github.com/StorminRH/lgi-tools/pull/97) made the live engine smarter instead of merely more active. The engine became presence-gated: while a tracker page is open in a visible tab, a heartbeat keeps the subject warm; when the tab is hidden or gone, the subject goes cold. A static Convex cron scans due subjects, skips cold ones, and dispatches work through a bounded Workpool with per-token-group smoothing. That was a good rail. It made cost scale with watched subjects instead of total users.<sup><a href="#code-live-heartbeat">3</a></sup><sup><a href="#code-live-convex-engine">4</a></sup>

Then the scaling audits forced a sharper question: should these boards be in that engine at all?

Skills and jobs are slow data. EVE caches them. The page can compute progress locally. A finished job can flip to ready from its own timestamp. Holding a reactive connection open does not make that data meaningfully fresher; it just adds a live-data cost model to something that is mostly a stale-gated read. The hardening PRs made that visible. [PR #103](https://github.com/StorminRH/lgi-tools/pull/103) split heartbeat presence away from heavy payload reads. [PR #169](https://github.com/StorminRH/lgi-tools/pull/169) split heavy payload subscriptions from small run-state subscriptions so unchanged refreshes stopped re-sending full boards. [PR #170](https://github.com/StorminRH/lgi-tools/pull/170) capped due-subject reads so a large backlog could not hit Convex’s per-mutation ceiling. Those were all useful improvements, but they also made the smell clearer: a lot of machinery was being spent to keep slow cached boards in a live store.

[PR #174](https://github.com/StorminRH/lgi-tools/pull/174) added the permanent live consumer the engine actually needed: online status. It is small, per-character, useful anywhere a portrait appears, and tied to a short upstream cache. The provider subscribes once to Convex and shares a character-id-to-online map through context. Every portrait reads the same map, so the nav, roster, character page, and tracker cards do not each create their own subscription. The heartbeat hints the active character, but the sync action re-enumerates the full linked roster server-side.<sup><a href="#code-live-online-provider">5</a></sup><sup><a href="#code-live-portrait">6</a></sup>

Online status also has the right write discipline for Convex. The `characterOnline` row carries only the online boolean and held ETag. It does not carry per-cycle bookkeeping like `lastSyncedAt` or `expiresAt`; that belongs on the subject row. A `304` writes nothing. An errored read writes nothing. A fresh body patches the row only when `online` or `etag` actually changes. That means the reactive query wakes up when the visible state changes, not merely because a background cycle happened.<sup><a href="#code-live-online-apply">7</a></sup><sup><a href="#code-live-online-sync">14</a></sup>

[PR #175](https://github.com/StorminRH/lgi-tools/pull/175) is the correction. Skill queues, personal industry jobs, and corporation industry jobs moved out of Convex and into Neon. They now load from the database when the page opens and refresh behind the response through stale-gated write-behind. The user-facing behavior stayed live where it mattered: progress bars keep moving, countdowns keep ticking, and jobs become ready when their end time passes. But that liveness is derived in the browser from stored timestamps instead of pushed by a live scheduler.<sup><a href="#code-live-skills-schema">8</a></sup><sup><a href="#code-live-industry-jobs-schema">9</a></sup>

The on-view reads now use the same pattern as the planner’s owned-data overlays. Read the cached rows immediately. Resolve names from the SDE where needed. Start a refresh after the response. Inside the refresh, check staleness before vending a token. A re-open inside the cache window does zero ESI work. A `304` stamps freshness without rewriting the payload. A fresh response replaces the cached board.<sup><a href="#code-live-skills-on-view">10</a></sup><sup><a href="#code-live-jobs-on-view">11</a></sup>

[PR #177](https://github.com/StorminRH/lgi-tools/pull/177) cleaned up the duplication created by that migration. Skills, jobs, owned assets, owned blueprints, and corporation reads had all grown versions of the same dance: enumerate owners, check whether the stored copy is stale, vend a token, resolve a corporation role-holder when needed, make an authenticated conditional ESI read, and write the result back. The shared owner-sync engine now owns that mechanical flow. Each feature supplies a descriptor: its owner axes, eligibility rule, endpoint read, persist plan, and save/stamp functions. The engine lives in `src/lib`, so it cannot import feature code; the feature builds the descriptor and passes it in. That is exactly the boundary I want for AI-directed work: shared mechanism in one place, domain decisions still owned by the slice.<sup><a href="#code-live-owner-sync-types">12</a></sup><sup><a href="#code-live-owner-sync-engine">13</a></sup>

[PR #176](https://github.com/StorminRH/lgi-tools/pull/176) then removed the dormant Convex tables and narrowed the live engine’s dataset registry to one active consumer: `onlineStatus`. That is the final shape. Convex still matters, but it is no longer the default home for anything that animates. It is the home for small, truly live projections. Neon is the home for slow per-owner ESI mirrors. The browser is allowed to derive time-based movement from timestamps. The ESI gate remains the outbound budget boundary for both paths.

The lesson is a placement rule, not a technology preference. Use the live backend when the source is genuinely live, the payload is small, and many UI surfaces benefit from the same reactive signal. Use Neon plus stale-gated on-view refresh when the source is cached, regenerable, and mostly read by one page. Use the browser when “live” just means time passing.

That rule only exists because I got it wrong first. The early live trackers were useful because they proved the auth, token, ESI, and reactive path. The later migration was useful because it admitted that the proof had become too expensive for the slow boards. The architecture is better now because the repo can say where a tracker belongs before AI starts building it.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-live-sync-registry" file="src/lib/sync-engine.ts" lines="16-30,32-50,52-70,126-161" lang="ts" -->
```ts
// The datasets registered with the engine — one entry per live consumer.
// Adding a future consumer is a config change here plus a syncRef in
// convex/engine.ts, not new machinery.
//
// The engine serves a SINGLE live consumer: onlineStatus, the ≤2-min canary
// that keeps it exercised + proven for the v4.0 mapper. The three slow trackers
// moved to Neon stale-gated on-view reads.
export const SYNC_DATASETS = ['onlineStatus'] as const;
export type SyncDataset = (typeof SYNC_DATASETS)[number];

export const SYNC_DATASET_CONFIG: Record<
  SyncDataset,
  { cadenceFloorMs: number; tokenGroup: string }
> = {
  onlineStatus: { cadenceFloorMs: 60_000, tokenGroup: 'char-online' },
};

export const HEARTBEAT_MS = 20_000;
export const COLD_AFTER_MS = 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;
export const STALE_RUNNING_MS = 3 * 60_000;

export function computeNextDueAt(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
  random: () => number = Math.random,
): number {
  const due = Math.max(minExpiresAt ?? 0, now + cadenceFloorMs);
  return due + Math.floor(random() * SYNC_JITTER_MS);
}

export function minCacheWindow(windows: Array<number | null>): number | null {
  if (windows.length === 0 || windows.some((w) => w === null)) return null;
  return Math.min(...(windows as number[]));
}
```

<!-- uth:code id="code-live-convex-schema" file="convex/schema.ts" lines="6-17,19-57,59-108" lang="ts" -->
```ts
// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data.
//
// Since MIGRATE.B the engine serves a SINGLE live consumer — onlineStatus.
// The three slow trackers moved to Neon stale-gated on-view reads.

export default defineSchema({
  syncSubjects: defineTable({
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    lastRequestedAt: v.number(),
    workId: v.union(v.string(), v.null()),
    nextDueAt: v.union(v.number(), v.null()),
    minExpiresAt: v.union(v.number(), v.null()),
    syncedCharacterIds: v.array(v.number()),
    lastFinishedAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_next_due', ['nextDueAt']),

  syncPresence: defineTable({
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    lastSeenAt: v.number(),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_last_seen', ['lastSeenAt']),

  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),
});
```

<!-- uth:code id="code-live-heartbeat" file="src/data/convex/use-sync-subject.ts" lines="5-17,23-54" lang="ts" -->
```ts
// The client half of the presence-gated sync engine: a visibility-gated heartbeat.
// While the tab is visible, beat every HEARTBEAT_MS; on hide, stop; on return,
// beat immediately so a stale view refreshes at once.

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const beat = (reason: 'mount' | 'visible' | 'interval') =>
      void heartbeat({ dataset, characterIdsHint, reason });

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (reason: 'mount' | 'visible') => {
      beat(reason);
      timer = setInterval(() => beat('interval'), HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    if (document.visibilityState === 'visible') start('mount');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dataset, characterIdsKey, heartbeat]);
}
```

<!-- uth:code id="code-live-convex-engine" file="convex/engine.ts" lines="3-18,26-35,84-112,121-132,154-235,238-285" lang="ts" -->
```ts
// THE presence-gated sync engine — the one sanctioned presence/scheduling
// machinery. A subject (dataset × user) is refreshed on its dataset's cadence
// only while some visible tab is heartbeating it; cost scales with concurrently
// watched subjects, never with total linked characters.

const pool = new Workpool(components.workpool, { maxParallelism: 4 });

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

const syncDatasetValidator = v.literal('onlineStatus');

const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

export const SCAN_DISPATCH_BATCH = 1024;

export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    const userId = identity.subject;
    const now = Date.now();

    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence === null) {
      await ctx.db.insert('syncPresence', { dataset, userId, lastSeenAt: now });
    } else {
      await ctx.db.patch(presence._id, { lastSeenAt: now });
    }

    if (reason === 'interval') return;

    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', {
        dataset,
        userId,
        status: 'idle',
        lastRequestedAt: 0,
        workId: null,
        nextDueAt: null,
        minExpiresAt: null,
        syncedCharacterIds: [],
        lastFinishedAt: null,
        lastError: null,
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
        rlUsed: null,
      });
      subject = await ctx.db.get(id);
      if (subject === null) return;
    }

    if (!hasSyncTarget(subject.syncedCharacterIds, characterIdsHint)) return;
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (!isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, characterIdsHint, now)) {
      return;
    }
    await dispatch(ctx, subject, now);
  },
});

export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await dueSubjects(ctx, now);
    for (const subject of due) {
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (isColdFromPresence(presence?.lastSeenAt ?? null, now)) {
        await ctx.db.patch(subject._id, { nextDueAt: null });
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
    if (due.length === SCAN_DISPATCH_BATCH) {
      logBatchCapped('engine:scan', 'scan_batch_capped', due.length);
    }
  },
});
```

<!-- uth:code id="code-live-online-provider" file="src/components/OnlineStatusProvider.tsx" lines="5-14,35-66" lang="tsx" -->
```tsx
// Mounted once in the root layout: one subscription feeds every CharacterPortrait.
// The heartbeat hints only the active character; the sync action re-enumerates
// every linked character server-side.

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return <OnlineStatusSubscribed>{children}</OnlineStatusSubscribed>;
}

function OnlineStatusSubscribed({ children }: { children: ReactNode }) {
  const view = useQuery(api.onlineStatus.forViewer);
  const map = useMemo(() => {
    const next = new Map<number, boolean>();
    for (const c of view?.characters ?? []) next.set(c.characterId, c.online);
    return next;
  }, [view]);

  return (
    <OnlineStatusContext.Provider value={map}>
      <Authenticated>
        <OnlineStatusHeartbeat />
      </Authenticated>
      {children}
    </OnlineStatusContext.Provider>
  );
}

function OnlineStatusHeartbeat() {
  const { session } = useAuth();
  useSyncSubject('onlineStatus', session ? [session.characterId] : []);
  return null;
}
```

<!-- uth:code id="code-live-portrait" file="src/components/character-portrait.tsx" lines="5-15,35-60,62-84" lang="tsx" -->
```tsx
// The one character portrait used everywhere — a round avatar with a live online
// dot. The dot is read from OnlineStatusProvider by characterId and lights only
// for the viewer's own characters.

export function CharacterPortrait({
  characterId,
  name,
  size,
  src,
  className,
  loading = 'lazy',
}: {
  characterId?: number;
  name: string;
  size: PortraitSize;
  src?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const online = deriveOnlineState(useOnlineFlag(characterId ?? -1));
  const imageSrc = src ?? (characterId !== undefined ? characterPortraitUrl(characterId, 128) : '');

  return (
    <span className={cn('relative inline-block shrink-0', SIZE_CLASS[size], className)}>
      <img src={imageSrc} alt={name} width={size} height={size} className="size-full rounded-full border border-border-idle object-cover" />
      {online !== 'unknown' && (
        <StatusDot state={online} className="absolute top-[7%] right-[7%] translate-x-[2px] -translate-y-[2px]" />
      )}
    </span>
  );
}
```

<!-- uth:code id="code-live-online-apply" file="convex/onlineStatus.ts" lines="23-44,75-120,125-155" lang="ts" -->
```ts
// The viewer wire reads only characterOnline, so it re-fires only when that table
// changes — not on per-cycle dispatch/completion writes.

export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, online: doc.online })),
    };
  },
});

export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'onlineStatus', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db.query('characterOnline').withIndex('by_user', (q) => q.eq('userId', args.userId)).collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));

    for (const result of args.results) {
      const window = await applyOnlineResult(ctx, args.userId, result, byCharacter.get(result.characterId));
      windowsByCharacter.set(result.characterId, window);
    }

    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
  },
});

async function applyOnlineResult(ctx: MutationCtx, userId: string, result: CharacterResult, existing: Doc<'characterOnline'> | undefined) {
  if (result.error !== null) return null;
  if (result.online === null) return result.expiresAt;
  if (existing === undefined) {
    await ctx.db.insert('characterOnline', { userId, characterId: result.characterId, online: result.online, etag: result.etag });
  } else if (existing.online !== result.online || existing.etag !== result.etag) {
    await ctx.db.patch(existing._id, { online: result.online, etag: result.etag });
  }
  return result.expiresAt;
}
```

<!-- uth:code id="code-live-online-sync" file="convex/onlineStatusSync.ts" lines="3-16,55-87,91-152" lang="ts" -->
```ts
// One run refreshes every linked character's online state for one user:
// heldState → Neon enumeration → eligibility + token vend + /online through the
// shared gate → one applySyncResults mutation.

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();
    const held = await ctx.runQuery(internal.onlineStatus.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h.etag]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };

    for (const character of characters) {
      const heldEtag = heldByCharacter.get(character.characterId) ?? null;
      const outcome = await syncOnlineCharacter(env, character, heldEtag, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') break;
    }

    await ctx.runMutation(internal.onlineStatus.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: characters.map((c) => c.characterId),
      results,
      ...rl,
    });
  },
});

async function syncOnlineCharacter(env: SyncEnv, character: SyncCharacter, heldEtag: string | null, rl: RlSnapshot) {
  if (!canSyncOnline(character)) {
    return { kind: 'result', result: errorResult(character.characterId, 'reauth_required', heldEtag) };
  }

  const vend = await vendCharacterToken(env, character.characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') return { kind: 'result', result: errorResult(character.characterId, 'reauth_required', heldEtag) };

  const read = await readEsiAuthed(`/characters/${character.characterId}/online`, vend.accessToken, heldEtag, rl);
  if (read.kind === 'unchanged') {
    return { kind: 'result', result: { characterId: character.characterId, online: null, etag: heldEtag, expiresAt, error: null } };
  }

  const online = parseOnlineBody(read.body);
  return { kind: 'result', result: { characterId: character.characterId, online, etag: read.etag, expiresAt, error: null } };
}
```

<!-- uth:code id="code-live-skills-schema" file="src/features/skill-queue/schema.ts" lines="3-16,27-47" lang="ts" -->
```ts
// Neon storage for the skill-queue tracker — replacing the live Convex skills
// datasets. The skills + skillqueue ESI endpoints cache 120s and queue completion
// is a pure timestamp flip derived client-side.

export const characterSkills = pgTable('character_skills', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  totalSp: bigint('total_sp', { mode: 'number' }).notNull(),
  unallocatedSp: bigint('unallocated_sp', { mode: 'number' }),
  queue: jsonb('queue').$type<SkillQueueEntry[]>().notNull().default([]),
});

export const characterSkillSyncs = pgTable('character_skill_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  queueEtag: text('queue_etag'),
  skillsEtag: text('skills_etag'),
});
```

<!-- uth:code id="code-live-industry-jobs-schema" file="src/features/industry-jobs/schema.ts" lines="3-17,21-42,44-91" lang="ts" -->
```ts
// Neon storage for the personal industry-jobs tracker — replacing the live
// Convex industry-jobs datasets. The ESI endpoint caches 300s, and a job's
// "ready" is derived client-side from end_date.

export const characterIndustryJobs = pgTable('character_industry_jobs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
});

export const characterIndustryJobSyncs = pgTable('character_industry_job_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  jobsEtag: text('jobs_etag'),
});

// Corp jobs are keyed by (user_id, corporation_id), not corporation alone, because
// the board and role verdict are private to the signed-in user.
export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

export const corpIndustryJobSyncs = pgTable(
  'corp_industry_job_syncs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    jobsEtag: text('jobs_etag'),
    syncError: text('sync_error'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);
```

<!-- uth:code id="code-live-skills-on-view" file="src/db/skills-sync.ts" lines="3-14,63-76,83-92" lang="ts" -->
```ts
// Skill-queue composition layer. It touches BOTH auth (token vend, scope reads)
// AND the skill-queue slice, so it lives above the slices.

export async function getSkillsForUserOnView(userId: string): Promise<ViewerSkillsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getSkillsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterSyncState(id))),
  ]);
  after(() => refreshSkillsForUser(makeSkillsPort(), userId));

  const characters: ViewerSkills[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const nameMap = await getTypeNames([...skillIds]);
  return { characters, names };
}
```

<!-- uth:code id="code-live-jobs-on-view" file="src/db/industry-jobs-sync.ts" lines="3-13,61-74,75-86" lang="ts" -->
```ts
// Personal industry-jobs composition layer. It reads cached boards immediately
// and fires a stale-gated write-behind refresh behind the response.

export async function getJobsForUserOnView(userId: string): Promise<ViewerJobsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getJobsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterJobSyncState(id))),
  ]);
  after(() => refreshJobsForUser(makeJobsPort(), userId));

  const characters: ViewerJobs[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const nameMap = await getTypeNames([...new Set(jobTypeIds(characters))]);
  return { characters, names };
}
```

<!-- uth:code id="code-live-owner-sync-types" file="src/lib/owner-sync/types.ts" lines="3-11,73-108" lang="ts" -->
```ts
// Generic per-owner sync engine. The engine owns the mechanical dance every
// per-owner ESI→Neon slice clones: enumerate → stale-gate-before-vend → token /
// Director resolution → conditional fetch + plan → write-behind dispatch.

export interface OwnerSyncDescriptor<TOwner, TState, TSave> {
  now(): Date;
  enumerate(userId: string): Promise<EnumeratedOwner[]>;
  precondition?(owner: TOwner): Promise<boolean>;
  vendToken(characterId: number): Promise<string | null>;
  isStale(state: TState | null, now: Date): boolean;
  characterAxis?: OwnerAxis<TOwner>;
  corpAxis?: CorpOwnerAxis<TOwner>;
  readState(owner: TOwner): Promise<TState | null>;
  fetchAndPlan(owner: TOwner, accessToken: string, state: TState | null): Promise<PersistVerdict<TSave>>;
  save(owner: TOwner, payload: TSave): Promise<void>;
  stampFresh(owner: TOwner): Promise<void>;
  saveGateState?(owner: TOwner): Promise<void>;
}
```

<!-- uth:code id="code-live-owner-sync-engine" file="src/lib/owner-sync/engine.ts" lines="19-37,83-120,130-155" lang="ts" -->
```ts
export async function runOwnerSync<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  userId: string,
): Promise<void> {
  const owners = await descriptor.enumerate(userId);
  if (descriptor.characterAxis !== undefined) {
    await runCharacterPass(descriptor, descriptor.characterAxis, owners);
  }
  if (descriptor.corpAxis !== undefined) {
    await runCorpPass(descriptor, descriptor.corpAxis, userId, owners);
  }
}

// One owner, gated by staleness. resolveToken runs ONLY when the owner is stale.
async function syncOwner<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  owner: TOwner,
  resolveToken: () => Promise<TokenOutcome>,
): Promise<void> {
  if (descriptor.precondition !== undefined && !(await descriptor.precondition(owner))) return;

  const state = await descriptor.readState(owner);
  if (!descriptor.isStale(state, descriptor.now())) return;

  const token = await resolveToken();
  if (token.kind === 'skip') return;
  if (token.kind === 'needs_role') {
    await descriptor.saveGateState?.(owner);
    return;
  }

  const verdict = await descriptor.fetchAndPlan(owner, token.accessToken, state);
  switch (verdict.kind) {
    case 'skip':
      return;
    case 'stamp':
      await descriptor.stampFresh(owner);
      return;
    case 'needs_role':
      await descriptor.saveGateState?.(owner);
      return;
    case 'save':
      await descriptor.save(owner, verdict);
      return;
  }
}
```
<!-- uth:code-excerpts:end -->

## Corps & Roles

Corporation data looks like character data until the first permission question shows up.

A personal skill queue or job board asks a fairly direct question: does this signed-in user have this character linked, and did that character grant the right read-only scope? Corporation data has more layers. A linked character can be in the corporation, but still lack the in-game role for the endpoint. A user can have multiple characters in the same corporation, only one of which has the useful role. A corporation can have data that is private to one viewer, like the board that user is allowed to see, and data that is shared by the corporation itself, like owned structures. And some corporation data should not be fetched at all unless the corporation has explicitly opted in.

That is the shape I want the code to preserve: **scope is not membership, membership is not role, and role is not consent.**

The first rail is membership. LGI.tools caches each linked character’s corporation, alliance, and faction on the character profile row. That data is character-intrinsic and public from EVE’s affiliation endpoint, so it lives beside the character’s name and portrait rather than on the per-user EVE token link. But the membership predicate is fail-closed. A missing or stale affiliation does not count as membership. Before a corporation access decision, the app refreshes stale affiliations best-effort, then decides on fresh-enough cached data. If the refresh fails, the stale row still fails closed instead of granting access from old information.<sup><a href="#code-corp-affiliation-schema">1</a></sup><sup><a href="#code-corp-membership">2</a></sup>

[PR #168](https://github.com/StorminRH/lgi-tools/pull/168) turned that into an audited access gate. The gate does not just return true or false. It records every decision, allow and deny, with the user, corporation, decision reason, and the linked character whose fresh affiliation granted access. That is not analytics. It is an authorization trail. Denied attempts matter, and the audit row is deliberately retained even if the user or character is later deleted.<sup><a href="#code-corp-access-gate">3</a></sup><sup><a href="#code-corp-audit-schema">4</a></sup><sup><a href="#code-corp-audit-retention">5</a></sup>

The next mistake would have been treating EVE scopes as the whole answer. They are not. A character can grant `esi-industry.read_corporation_jobs.v1`, but EVE can still reject the corporation jobs endpoint if that character does not have the in-game Factory Manager or Director role. A character can grant `esi-corporations.read_structures.v1`, but the structures endpoint needs Station Manager. The code keeps those as separate axes: the eligibility file checks refresh-token and scope health; the owner-sync engine resolves in-game role holders later, by vending tokens for linked members and reading their roles. That split is important because reconnecting can fix a missing scope, but it cannot give someone an in-game corporation role.<sup><a href="#code-corp-scope-vs-role">6</a></sup><sup><a href="#code-corp-role-resolution">7</a></sup>

Corporation industry jobs are the private version of corporation data. The board is keyed by `(user_id, corporation_id)`, not by corporation alone. That is intentional. Two members of the same corporation may have different linked characters, different token health, and different role outcomes. The board belongs to the viewer’s account boundary, not to the corporation as a public object. The sync state can also carry `needs_role`, which is a user-specific condition: this user has a character in the corp, but none of their linked characters can read the corp job endpoint.<sup><a href="#code-corp-jobs-schema">8</a></sup>

The refresh path preserves that distinction. The shared owner-sync engine groups eligible linked characters by corporation, resolves a role-bearing token, and then reads one corporation endpoint. If no usable member token exists, the refresh skips as a transient miss. If member tokens exist but none has the needed role, the refresh records `needs_role`. If EVE returns `403` mid-run because the role changed after resolution, the planner maps that to the same graceful state instead of pretending it is a network error. A role problem should show as a role problem.<sup><a href="#code-corp-jobs-refresh">9</a></sup>

Corporation structures forced a different rule because the data is not private per viewer. A corporation’s owned Upwell structures are the same structures no matter which member is looking. For that feature, the store is keyed by `corporation_id` alone, and the staleness stamp is shared. The first eligible member view in a cache window can refresh the catalogue; every other member reads the same refreshed rows without spending another ESI call. But that shared shape raised a privacy problem: if the first Station Manager page view automatically pulled structures, then a corporation’s infrastructure could become visible to every member just because one authorized member opened a page.

That was the branch-level mistake that changed the rule. The final implementation made sharing default off. No row means disabled. A disabled corporation dispatches zero ESI, stores zero structures, and returns no structures even if leftover rows somehow exist. A Station Manager has to opt the corporation in before the pull runs. Only then do shared structures become build locations for members.<sup><a href="#code-corp-structures-schema">10</a></sup><sup><a href="#code-corp-structures-refresh">11</a></sup><sup><a href="#code-corp-structures-read">12</a></sup>

The route that flips structure sharing is deliberately a trust boundary. The user ID comes from the session, never from the request body. The route first runs the audited corporation membership decision, then checks whether any linked member character holds `Station_Manager`. Enabling sharing records consent. Disabling sharing flips consent off and wipes the corporation’s pulled structures, sync state, and authored rig fits. The order matters: consent is turned off first so every read filter, sync precondition, and late save re-check fails closed before cleanup finishes.<sup><a href="#code-corp-sharing-route">13</a></sup><sup><a href="#code-corp-sharing-write">14</a></sup>

That last re-check is one of the details I care about most. The refresh path is write-behind. A member can open the structures page, start an ESI pull, and then a Station Manager can disable sharing before the pull finishes. Without a second consent read immediately before saving, that late refresh could resurrect the catalogue after it had been wiped. The repo now treats that as a resurrection bug: `saveCorpStructures` reads consent again right before delete-and-insert, and no-ops when sharing is no longer enabled.<sup><a href="#code-corp-sharing-write">14</a></sup>

Structure rigs added one more app-authored layer. EVE exposes the corporation’s structures, but not their fitted rigs. A Station Manager can record rigs so the planner bonus math is exact. That authored data survives the hourly full-replace pull because it is not regenerable from EVE. It is wiped only when sharing is disabled. The rig route uses the same membership-plus-Station-Manager gate, and then validates that the structure belongs to the corporation and that the rig actually fits that structure type. A bad rig should not silently add a zero bonus and look accepted.<sup><a href="#code-corp-rigs-route">15</a></sup><sup><a href="#code-corp-structures-schema">10</a></sup>

The planner consumes the result through a source-agnostic structure seam. Custom structures and corporation structures both become `AvailableStructure` rows. Custom structures have no fixed system. Corporation structures carry their real system and SDE-derived security band, so selecting one locks the build to that structure’s home system and applies the correct structure and rig bonuses. That is the right boundary: the planner does not need to know how the corporation catalogue was authorized, only that the available row is already scoped to what the user may use.<sup><a href="#code-corp-planner-structures">16</a></sup>

Looking back, corporation data is where “least privilege” stopped being only an OAuth phrase. The site can ask for read-only scopes and still be wrong if it ignores membership freshness, in-game roles, consent, per-user versus shared storage, late write-behind races, or purge/retention rules. The rule I use now is: corporation features need an explicit data-class decision before the first fetch. Is this private to the viewer, shared by the corporation, or app-authored consent? Who can turn it on? Who can see it? What happens when a role changes, a character leaves, or sharing is disabled?

That is exactly the kind of boundary AI will flatten if the repo lets it. “Fetch corp data” is too vague. The code has to make the safer question unavoidable: which corporation, which member, which role, which consent state, which storage key, and which teardown rule?

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-corp-affiliation-schema" file="src/features/auth/schema.ts" lines="24-41" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts
export const characters = pgTable('characters', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  portraitUrl: text('portrait_url').notNull(),
  role: characterRoleEnum('role').default('USER').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}).notNull(),
  // Corp affiliation cache. Character-INTRINSIC public data, so it lives here
  // beside name/portrait — NOT a per-link custody fact like account.owner_hash.
  corporationId: bigint('corporation_id', { mode: 'number' }),
  allianceId: bigint('alliance_id', { mode: 'number' }),
  factionId: bigint('faction_id', { mode: 'number' }),
  affiliationRefreshedAt: timestamp('affiliation_refreshed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});
```

<!-- uth:code id="code-corp-membership" file="src/features/auth/membership.ts" lines="13-18,32-43,45-58,61-87" lang="ts" -->
```ts
// FAIL CLOSED: a null or stale affiliation reads as "not a member", so an
// un-refreshed character never leaks corp access.
export const AFFILIATION_TTL_MS = 60 * 60 * 1000;

export function isAffiliationStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > AFFILIATION_TTL_MS;
}

export function memberCharacterIdInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number | null {
  const match = affiliations.find(
    (a) => a.corporationId === corporationId && !isAffiliationStale(a.refreshedAt, now),
  );
  return match ? match.characterId : null;
}

export function memberCorpIds(affiliations: CachedAffiliation[], now: Date): number[] {
  const ids = new Set<number>();
  for (const a of affiliations) {
    if (a.corporationId !== null && !isAffiliationStale(a.refreshedAt, now)) {
      ids.add(a.corporationId);
    }
  }
  return [...ids];
}
```

<!-- uth:code id="code-corp-access-gate" file="src/features/auth/corp-access.ts" lines="3-13,33-49" lang="ts" -->
```ts
// Audited corp-access gate. A standalone, corp-id-parameterized, FAIL-CLOSED
// decision: refresh stale affiliations → decide on ≤1h-fresh data → record.

export async function decideCorpAccess(input: {
  userId: string;
  corporationId: number;
}): Promise<CorpAccessDecision> {
  const { userId, corporationId } = input;
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const characterId = memberCharacterIdInCorp(affiliations, corporationId, new Date());
  const allowed = characterId !== null;
  const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
```

<!-- uth:code id="code-corp-audit-schema" file="src/features/auth/schema.ts" lines="167-190" lang="ts" -->
```ts
// Corp-access decision ledger — one row per decision made by the audited gate,
// allow AND deny. A security/authz audit trail, NOT analytics telemetry.
export const corpAccessAudit = pgTable(
  'corp_access_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    userId: text('user_id').notNull(),
    characterId: bigint('character_id', { mode: 'number' }),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    allowed: boolean('allowed').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    index('corp_access_audit_corp_decided_idx').on(t.corporationId, t.decidedAt.desc()),
    index('corp_access_audit_allowed_decided_idx').on(t.allowed, t.decidedAt.desc()),
  ],
);
```

<!-- uth:code id="code-corp-audit-retention" file="src/features/auth/purge.ts" lines="25-35" lang="ts" -->
```ts
export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions must outlive the user or character they record, so it is deliberately never purged.',
    },
  ],
};
```

<!-- uth:code id="code-corp-scope-vs-role" file="src/features/industry-jobs/corp-sync-eligibility.ts, src/features/owned-structures/corp-sync-eligibility.ts" lines="3-13,20-29,3-13,20-29" lang="ts" -->
```ts
// Corp jobs: scope is separate from in-game role.
export const CORP_INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
] as const;

export const CORP_INDUSTRY_JOBS_REQUIRED_ROLES = ['Factory_Manager', 'Director'] as const;

// Corp structures: scope is separate from Station_Manager.
export const CORP_STRUCTURES_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
] as const;

export const CORP_STRUCTURES_REQUIRED_ROLES = ['Station_Manager'] as const;
```

<!-- uth:code id="code-corp-role-resolution" file="src/lib/owner-sync/engine.ts" lines="130-155" lang="ts" -->
```ts
async function resolveCorpToken<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: CorpOwnerAxis<TOwner>,
  members: EnumeratedOwner[],
): Promise<TokenOutcome> {
  const resolved = await Promise.all(
    members.map(async (member): Promise<CorpMemberCandidate | null> => {
      const accessToken = await descriptor.vendToken(member.characterId);
      if (accessToken === null) return null;
      const roles = await axis.readRoles(member.characterId, accessToken);
      if (roles === null) return null;
      const hasRole = axis.requiredRoles.some((role) => roles.includes(role));
      return { vendingCharacterId: member.characterId, accessToken, hasRole };
    }),
  );
  const candidates = resolved.filter((candidate): candidate is CorpMemberCandidate => candidate !== null);
  const resolution = classifyCorpDirector(candidates);
  if (resolution.kind === 'unavailable') return { kind: 'skip' };
  if (resolution.kind === 'needs_role') return { kind: 'needs_role' };
  return { kind: 'token', accessToken: resolution.accessToken };
}
```

<!-- uth:code id="code-corp-jobs-schema" file="src/features/industry-jobs/schema.ts" lines="44-91" lang="ts" -->
```ts
// Corp jobs are keyed by (user_id, corporation_id), NOT corp alone: a corp board
// is per-user and private here, and the role verdict is per-user.
export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

export const corpIndustryJobSyncs = pgTable(
  'corp_industry_job_syncs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    jobsEtag: text('jobs_etag'),
    syncError: text('sync_error'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);
```

<!-- uth:code id="code-corp-jobs-refresh" file="src/features/industry-jobs/corp-refresh.ts" lines="10-16,23-45,60-80" lang="ts" -->
```ts
// Corp jobs is keyed (userId, corporationId). The engine checks staleness before
// any vend or roles read, resolves a Director among member characters, and
// surfaces needs_role through saveGateState.
export function planCorpJobsPersist(read: JobsEsiRead): CorpJobsPersistPlan {
  if (read.kind === 'error') {
    return read.code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip' };
  }
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip' };
  return { kind: 'save', jobs, etag: read.etag };
}

function makeDescriptor(port: CorpJobsPort): OwnerSyncDescriptor<CorpOwner, CorpJobsSyncState, CorpJobsSave> {
  return {
    isStale: (state, now) => isJobsStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpIndustryJobs(owner),
      ownerOf: (userId, corporationId) => ({ userId, corporationId }),
      requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  };
}
```

<!-- uth:code id="code-corp-structures-schema" file="src/features/owned-structures/schema.ts" lines="3-18,40-70,72-106" lang="ts" -->
```ts
// Corp owned structures are keyed by corporation_id ALONE, shared by all members.
export const corpStructures = pgTable(
  'corp_structures',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    systemId: integer('system_id').notNull(),
    securityClass: securityClassEnum('security_class').notNull(),
    name: text('name'),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);

export const corpStructureSyncs = pgTable('corp_structure_syncs', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  pageEtags: jsonb('page_etags').$type<string[]>().default([]).notNull(),
});

// Sharing consent is app-authored system-of-record. Default OFF.
export const corpStructureSharing = pgTable('corp_structure_sharing', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  enabled: boolean('enabled').default(false).notNull(),
  setBy: bigint('set_by', { mode: 'number' }),
  setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
});

// Authored rig fits survive the full-replace ESI pull and are wiped only when
// sharing is disabled.
export const corpStructureRigs = pgTable(
  'corp_structure_rigs',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    rigTypeIds: jsonb('rig_type_ids').$type<number[]>().default([]).notNull(),
    setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);
```

<!-- uth:code id="code-corp-structures-refresh" file="src/features/owned-structures/refresh.ts" lines="30-62" lang="ts" -->
```ts
function makeDescriptor(
  port: CorpStructuresPort,
): OwnerSyncDescriptor<CorpOwner, CorpStructuresSyncState, StructuresSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listMembers(userId),
    vendToken: (characterId) => port.vendToken(characterId),
    // Consent gate, FIRST in the engine — skipped before staleness, vend, or roles.
    precondition: (owner) => port.isSharingEnabled(owner.corporationId),
    isStale: (state, now) => isStructuresStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpStructures(owner),
      // userId ignored: the owner key is the corporation alone.
      ownerOf: (_userId, corporationId) => ({ corporationId }),
      requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner.corporationId),
    save: (owner, payload) => port.saveStructures(owner.corporationId, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner.corporationId),
    // NO saveGateState: a role-less member's needs_role is a skip.
  };
}
```

<!-- uth:code id="code-corp-structures-read" file="src/db/corp-structures-sync.ts" lines="73-103,116-138" lang="ts" -->
```ts
export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  const [structuresByCorp, syncStates, sharings] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
    readCorpStructureSharings(corporationIds),
  ]);
  after(() => refreshCorpStructuresForUser(makeCorpStructuresPort(), userId));

  // Fail reads closed on consent.
  const corporations: ViewerCorpStructures[] = corporationIds.map((corporationId) => ({
    corporationId,
    structures: sharings.get(corporationId)?.enabled ? structuresByCorp.get(corporationId) ?? [] : [],
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));

  return { corporations };
}

export async function getAvailableCorpStructuresForUser(userId: string): Promise<AvailableCorpStructure[]> {
  const { corporations } = await getCorpStructuresForUserOnView(userId);
  const rigsByStructure = await getCorpStructureRigs(corporations.map((c) => c.corporationId));
  // flatten sharing-enabled corp rows for the planner
}
```

<!-- uth:code id="code-corp-sharing-route" file="src/app/api/account/corp-structures/sharing/route.ts" lines="15-40" lang="ts" -->
```ts
// POST /api/account/corp-structures/sharing — flip a corp's structure-sharing consent.
// The user id comes from the session, never the body.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCorpStructureSharingRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, enabled } = parsed.data;

  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }

  await setCorpStructureSharing(corporationId, enabled, await getSessionCharacterId());
  return Response.json({ corporationId, enabled } satisfies CorpStructureSharingResponse);
}
```

<!-- uth:code id="code-corp-sharing-write" file="src/features/owned-structures/queries.ts" lines="113-147,190-216" lang="ts" -->
```ts
export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {
  // Resurrection guard: a late write-behind refresh cannot reinsert rows after
  // sharing has been disabled and wiped.
  if (!(await isCorpStructureSharingEnabled(corporationId))) return;
  const now = new Date();
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  if (rows.length > 0) await db.insert(corpStructures).values(/* projected rows */);
  await db.insert(corpStructureSyncs).values({ corporationId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({ target: corpStructureSyncs.corporationId, set: { lastRefreshedAt: now, pageEtags: etags } });
  revalidateTag(corpStructuresTag(corporationId), 'max');
}

export async function setCorpStructureSharing(
  corporationId: number,
  enabled: boolean,
  setBy: number | null,
): Promise<void> {
  await db.insert(corpStructureSharing).values({ corporationId, enabled, setBy, setAt: new Date() })
    .onConflictDoUpdate({ target: corpStructureSharing.corporationId, set: { enabled, setBy, setAt: new Date() } });
  if (enabled) return;
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  await db.delete(corpStructureSyncs).where(eq(corpStructureSyncs.corporationId, corporationId));
  await db.delete(corpStructureRigs).where(eq(corpStructureRigs.corporationId, corporationId));
  revalidateTag(corpStructuresTag(corporationId), 'max');
}
```

<!-- uth:code id="code-corp-rigs-route" file="src/app/api/account/corp-structures/rigs/route.ts" lines="17-54" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCorpStructureRigsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, structureId, rigTypeIds } = parsed.data;

  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }

  const structure = (await getCorpStructures([corporationId]))
    .get(corporationId)
    ?.find((s) => s.structureId === structureId);
  if (!structure) return new Response('Unknown structure for this corporation', { status: 400 });

  const fittingRigIds = new Set(rigs.filter((r) => rigFitsStructure(r, structureType)).map((r) => r.typeId));
  if (rigTypeIds.some((id) => !fittingRigIds.has(id))) {
    return new Response('One or more rigs do not fit this structure', { status: 400 });
  }

  await upsertCorpStructureRigs(corporationId, structureId, rigTypeIds);
  return Response.json({ structureId, rigTypeIds } satisfies CorpStructureRigsResponse);
}
```

<!-- uth:code id="code-corp-planner-structures" file="src/app/api/account/structures/route.ts" lines="15-24,29-36,52-89" lang="ts" -->
```ts
// GET /api/account/structures. Custom structures and corp-pulled structures are
// merged into the planner's source-agnostic AvailableStructure seam.
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ structures: [] } satisfies AvailableStructuresResponse);

  const [custom, corp, structureTypes] = await Promise.all([
    listCustomStructures(userId),
    getAvailableCorpStructuresForUser(userId),
    getStructureTypes(),
  ]);

  const structures: AvailableStructure[] = [];
  for (const c of custom) {
    structures.push({
      id: c.id,
      source: 'custom',
      name: c.name,
      structureTypeId: c.structureTypeId,
      systemId: null,
      securityClass: null,
      structureAttrs: dogma.get(c.structureTypeId) ?? {},
      rigAttrs: c.rigTypeIds.map((r) => dogma.get(r) ?? {}),
    });
  }
  for (const s of corp) {
    structures.push({
      id: `corp:${s.structureId}`,
      source: 'corp',
      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      systemId: s.systemId,
      securityClass: s.securityClass,
      structureAttrs: dogma.get(s.typeId) ?? {},
      rigAttrs: s.rigTypeIds.map((r) => dogma.get(r) ?? {}),
    });
  }
  return Response.json({ structures } satisfies AvailableStructuresResponse);
}
```
<!-- uth:code-excerpts:end -->

## Search

Search started as a convenience feature and turned into an architectural boundary.

The user-facing problem is simple: LGI.tools has too many surfaces for navigation to depend only on menus. Wormhole sites, blueprints, tools, commands, and recently opened rows all want to be reachable from the keyboard. But the code problem is different. Each searchable thing belongs to a different slice, and I do not want the search box to learn every feature’s schema just so it can show a result.

The first version in [PR #13](https://github.com/StorminRH/lgi-tools/pull/13) was intentionally local: a terminal-style search on `/sites`. It parsed inputs like `c5/relic`, `c2`, or `ore` into the existing site filters. That was the right first move because it did not invent a platform before there was a second consumer. It also set the tone for the later design: the typed command should be a small contract over existing state, not a second filtering system.

[PR #18](https://github.com/StorminRH/lgi-tools/pull/18) made search global. The header search became a Spotlight-style navigator with sources for sites, tools, commands, and recents. That is where the boundary started to matter. A site result is owned by the wormhole-sites feature. A command is owned by the platform. A tool row comes from the tools registry. A recent row comes from local browser storage. The search layer should know how to ask sources for results and render those results. It should not know how a site calculates ISK, how a blueprint resolves its product, or how auth signs a user out.

The current search contract reflects that. A `SearchResult` is a display-and-dispatch shape: kind, stable ID, label, optional subtitle, href, optional icon data, match indices, optional side-effect handler, and disabled state. A `SearchSource` is an async function from query plus context to result rows. Even synchronous sources use the async shape because the large sources were always going to arrive later. The registry caps each source, lets only opt-in sources appear on empty input, accepts a cancellation signal, and keeps side effects behind `onSelect` instead of adding one-off command flags.<sup><a href="#code-search-registry">1</a></sup>

The first structural mistake was where that registry lived. Search originally sat under `src/data`, and sources registered themselves by importing the registry. That worked until the registry had to compose feature sources and data sources at the same time. It created import-rule exceptions just to make search boot. [PR #76](https://github.com/StorminRH/lgi-tools/pull/76) fixed the direction: search moved to top-level `src/search`, above the feature and data slices. Sources now export descriptors. The manifest pulls those descriptors from above and registers them in one place. That inversion removed the search-specific lint exceptions and made the architecture match the intent.<sup><a href="#code-search-manifest">2</a></sup>

There was also a Next.js-specific trap. The registry has to be populated in the client module graph, because the dropdown runs in the client. Importing the manifest from a server component would populate the server’s copy of the module and leave the client registry empty. The shell imports `@/search/register-all` from `AppHeaderShell`, the client coordinator for the interactive header slots. That is a small line of code, but it is load-bearing. It records the fact that server and client module graphs are not one shared singleton.<sup><a href="#code-search-client-graph">3</a></sup>

The header component owns the interactive behavior around that registry. It seeds the sites source with a server-rendered site index, reads recents from localStorage after mount, debounces input, dispatches through `searchAll`, and creates an `AbortController` for each debounced query. When a user types quickly, an older in-flight search should not be allowed to overwrite newer results. That mattered once the blueprint source became lazy-loaded; it matters even more for any future source that has to fetch or import a larger index.<sup><a href="#code-search-global-ui">4</a></sup>

[PR #25](https://github.com/StorminRH/lgi-tools/pull/25) changed the matching model before the blueprint index landed. Exact substring search was fine for a 69-row site catalogue, but not for thousands of blueprints. The repo wrapped `fuzzysort` in one project-shaped helper so every source uses the same score and the same per-character highlight data. The UI renders `matchIndices`, not a single contiguous range, which is why a query like `ffrd` can highlight the individual letters in “Forgotten Frontier Recursive Depot.” That sounds cosmetic, but it is a trust cue. The dropdown should show why it matched something, especially when fuzzy matching returns a result the user did not type contiguously.<sup><a href="#code-search-match">5</a></sup>

The blueprint source is the reason the registry had to be async and lazy. The source descriptor is cheap to register, but the matcher and index do not load until the user actually types something that reaches that source. The index fetch is memoized for the session and deliberately not bound to the first caller’s abort signal; otherwise, one cancelled keystroke could poison the shared index for every later query. Cancellation happens after the await, before the source spends work mapping stale results into the dropdown.<sup><a href="#code-search-blueprint-lazy">6</a></sup>

The site source shows the other side of the design. It does not fetch on every keystroke. The server already has the small site index when it renders the header shell, so the client seeds a module-scoped index once and each search runs synchronously against that list. The result shape is still the same as every other source: label, subtitle, href, icon text, tone, and match indices. The feature owns what a site result means; search owns how it is presented beside other sources.<sup><a href="#code-search-sites-source">7</a></sup>

Commands are the place where I had to avoid another tempting shortcut. Logging out is not navigation. Logging in is not navigation either; it has to start an OAuth flow. The early search command model had special command flags for those cases, but [PR #25](https://github.com/StorminRH/lgi-tools/pull/25) collapsed them into one `onSelect` side-effect contract. A command can still have an `href` for display or fallback, but the result itself owns what happens when it is selected. The command source also gates rows from context: logged-out users see login, logged-in users see logout, admins see admin commands.<sup><a href="#code-search-commands-source">8</a></sup>

Recents are deliberately local and untrusted. They live in localStorage, not the database, because they are a browser convenience. But localStorage can be stale, malformed, or edited by the user. The storage reader validates rows with Zod, caps the list, drops disabled rows, and preserves the original source kind so a recent blueprint can still render like a blueprint. [PR #74](https://github.com/StorminRH/lgi-tools/pull/74) added real item icons to search rows by carrying `typeId` on results that represent an EVE type. The recents path had to preserve that field too, or a recently opened blueprint would fall back to a meaningless text glyph the next time the dropdown opened.<sup><a href="#code-search-recents">9</a></sup><sup><a href="#code-search-icons-storage">10</a></sup>

The lesson from search is that cross-cutting UI needs a composition layer just as much as data pipelines do. It is easy for AI-generated code to bolt a search helper directly into each feature, especially because each helper looks harmless in isolation. The cost appears later, when every source ranks differently, every command dispatches differently, and every feature imports across boundaries to get into the dropdown.

The current rule is cleaner: features and data slices export search sources; `src/search` composes them from above; the header owns interaction; sources own their projection; the matcher is shared; recents are validated; large sources are lazy; side effects go through one contract. Search stays useful because it is centralized where it should be and decentralized where the domain knowledge lives.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-search-registry" file="src/search/index.ts" lines="3-29,36-87,130-155,167-211" lang="ts" -->
```ts id="4tw6zn"
// Cross-source search registry. Each searchable surface exports a SearchSource
// from its own slice; the wiring manifest in ./register-all pulls those values
// and registers them here — composition above the slices.
export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  typeId?: number;
  originKind?: string;
  matchIndices?: number[];
  onSelect?: (router: AppRouterInstance) => void;
  disabled?: boolean;
};

export type SearchContext = {
  session: Session | null;
  isAdmin: boolean;
  recents: SearchResult[];
  signal?: AbortSignal;
};

export type SearchSource = {
  name: string;
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  limit?: number;
  showOnEmpty?: boolean;
};

export function registerLazySearchSource(meta: LazySearchSource): void {
  let loadPromise: Promise<SearchSource> | null = null;
  registerSearchSource({
    name: meta.name,
    limit: meta.limit,
    showOnEmpty: meta.showOnEmpty,
    async search(query, ctx) {
      if (!loadPromise) {
        loadPromise = meta.load().catch((err) => {
          loadPromise = null;
          throw err;
        });
      }
      const resolved = await loadPromise;
      if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return resolved.search(query, ctx);
    },
  });
}

export async function searchAll(query: string, ctx: SearchContext): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;
  const settled = await Promise.allSettled(
    sources.map(async (s) => {
      if (isEmpty && !s.showOnEmpty) return { name: s.name, results: [] };
      const raw = await s.search(trimmed, ctx);
      return { name: s.name, results: raw.slice(0, s.limit ?? 5) };
    }),
  );
  if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return settled.flatMap((r) => r.status === 'fulfilled' && r.value.results.length ? [r.value] : []);
}
```

<!-- uth:code id="code-search-manifest" file="src/search/register-all.ts" lines="3-22" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts id="bv8c9t"
// Search-source wiring manifest. Lives in the unclassified src/search/ layer
// ABOVE the data and feature slices. Registration order = dropdown section order.
import { registerSearchSource, registerLazySearchSource } from '@/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { sitesSearchSource } from '@/features/wormhole-sites/search';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { commandsSearchSource } from '@/data/commands/search';

registerSearchSource(recentsSearchSource);
registerSearchSource(sitesSearchSource);
registerLazySearchSource(blueprintsSearchSource);
registerSearchSource(toolsSearchSource);
registerSearchSource(commandsSearchSource);
```

<!-- uth:code id="code-search-client-graph" file="src/components/AppHeaderShell.tsx" lines="25-30,32-47" lang="tsx" -->
```tsx id="9ypybu"
// Side-effect import: registers every search source on the CLIENT instance
// of the registry. Lives here because Next.js's server + client module graphs
// are separate, and the search dropdown renders client-side.
import '@/search/register-all';

export function AppHeaderShell({ siteIndex, serverStatus }: Props) {
  const [searchActive, setSearchActive] = useState(false);
  return (
    <>
      <GlobalSearch
        active={searchActive}
        onActiveChange={setSearchActive}
        siteIndex={siteIndex}
      />
      {/* other header slots */}
    </>
  );
}
```

<!-- uth:code id="code-search-global-ui" file="src/components/GlobalSearch.tsx" lines="55-98,100-140,197-250" lang="tsx" -->
```tsx id="4q9vhe"
export function GlobalSearch({ active, onActiveChange, siteIndex }: Props) {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [recents, setRecents] = useState<SearchResult[]>([]);

  useEffect(() => setSiteSearchIndex(siteIndex), [siteIndex]);
  useEffect(() => { setRecents(readRecents()); }, []);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    const controller = new AbortController();
    searchAll(debounced, { session, isAdmin, recents, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setSections(next);
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      });
    return () => controller.abort();
  }, [debounced, session, isAdmin, recents]);

  function fireResult(result: SearchResult) {
    if (result.disabled) return;
    pushRecent(result);
    setRecents(readRecents());
    setValue('');
    onActiveChange(false);
    if (result.onSelect) return result.onSelect(router);
    router.push(result.href);
  }

  return sections.map((section) =>
    section.results.map((row) =>
      row.typeId ? <TypeIcon typeId={row.typeId} size={22} /> : <span>{row.iconText}</span>,
    ),
  );
}
```

<!-- uth:code id="code-search-match" file="src/search/match.ts" lines="3-35" lang="ts" -->
```ts id="z8mgck"
// Project-shaped wrapper around fuzzysort. Every search source uses this helper
// for both ranking and per-character match highlighting.
import fuzzysort from 'fuzzysort';

export type FuzzyMatch = {
  score: number;
  matchIndices: number[];
};

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, matchIndices: [] };
  const result = fuzzysort.single(query, target);
  if (result === null) return null;
  return {
    score: result.score,
    matchIndices: [...result.indexes],
  };
}
```

<!-- uth:code id="code-search-blueprint-lazy" file="src/features/industry-planner/search.ts, src/features/industry-planner/blueprints-source.ts" lines="3-15,19-39,42-71" lang="ts" -->
```ts id="q42y6k"
// search.ts — cheap descriptor registered by the manifest.
export const blueprintsSearchSource: LazySearchSource = {
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
};

// blueprints-source.ts — loaded only on the first blueprint keystroke.
let indexPromise: Promise<BlueprintIndexEntry[]> | null = null;

function loadIndex(): Promise<BlueprintIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = apiFetch(blueprintsEndpoint)
      .then((result) => {
        if (!result.ok) throw new Error(`blueprint index ${result.status}`);
        return result.data.blueprints;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export const blueprintsSource: SearchSource = {
  name: 'Blueprints',
  limit: 6,
  async search(query, ctx) {
    if (query.length === 0) return [];
    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];
    return index.flatMap((entry) => {
      const match = fuzzyMatch(query, entry.name);
      return match ? [{ kind: 'blueprint', id: `blueprint:${entry.blueprintTypeId}`, label: entry.name, href: `/industry/${entry.blueprintTypeId}`, typeId: entry.productTypeId, matchIndices: match.matchIndices }] : [];
    });
  },
};
```

<!-- uth:code id="code-search-sites-source" file="src/features/wormhole-sites/search.ts" lines="3-18,36-67" lang="ts" -->
```ts id="2ab0q1"
// Sites search source. Reads from a module-scoped site index that
// AppHeaderShell seeds once at mount via setSiteSearchIndex().
let SITE_INDEX: SiteSearchEntry[] = [];

export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
}

export const sitesSearchSource: SearchSource = {
  name: 'Sites',
  limit: 6,
  async search(query) {
    const matches: { entry: SiteSearchEntry; match: FuzzyMatch }[] = [];
    for (const entry of SITE_INDEX) {
      const match = fuzzyMatch(query, entry.name);
      if (match) matches.push({ entry, match });
    }
    matches.sort((a, b) => b.match.score - a.match.score);
    return matches.map<SearchResult>(({ entry, match }) => ({
      kind: 'site',
      id: `site:${entry.id}`,
      label: entry.name,
      sub: `${SITE_TYPE_LABEL[entry.siteType]} · ${formatIskCompact(primaryIsk(entry))}`,
      href: `/sites/${entry.id}`,
      iconText: entry.wormholeClass ?? '—',
      iconTone: iconTone(entry),
      matchIndices: match.matchIndices,
    }));
  },
};
```

<!-- uth:code id="code-search-commands-source" file="src/data/commands/search.ts" lines="3-17,34-107,111-134" lang="ts" -->
```ts id="nqnqfa"
// Commands search source. Rows with side effects use onSelect(router) instead
// of href-driven navigation.
const COMMANDS: CommandEntry[] = [
  { id: 'cmd:open-changelog', label: 'Open changelog', href: '/changelog', iconText: '→', visible: () => true },
  { id: 'cmd:open-admin', label: 'Open admin', href: '/admin', iconText: '→', visible: (ctx) => ctx.isAdmin },
  {
    id: 'cmd:logout',
    label: 'Log out',
    href: '/',
    iconText: '⏏',
    onSelect: () => {
      void apiFetch(signOutEndpoint, { body: {} }).then((result) => {
        if (result.ok) window.location.href = '/';
      });
    },
    visible: (ctx) => ctx.session !== null,
  },
  {
    id: 'cmd:login',
    label: 'Log in with EVE',
    href: '/',
    iconText: '↪',
    onSelect: () => {
      void apiFetch(signInOauth2Endpoint, { body: { providerId: 'eve', callbackURL: '/' } })
        .then((result) => {
          if (result.ok && result.data.url) window.location.href = result.data.url;
        });
    },
    visible: (ctx) => ctx.session === null,
  },
];

export const commandsSearchSource: SearchSource = {
  name: 'Commands',
  limit: 5,
  async search(query, ctx) {
    return COMMANDS.filter((c) => c.visible(ctx)).flatMap((cmd) => {
      const match = fuzzyMatch(query, cmd.label);
      return match ? [{ kind: 'command', id: cmd.id, label: cmd.label, href: cmd.href, iconText: cmd.iconText, onSelect: cmd.onSelect, matchIndices: match.matchIndices }] : [];
    });
  },
};
```

<!-- uth:code id="code-search-recents" file="src/features/search-recents/search.ts" lines="3-34" lang="ts" -->
```ts id="59trve"
// Recent search source. The ONLY source that opts into showOnEmpty: true.
export const recentsSearchSource: SearchSource = {
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  async search(query, ctx) {
    if (query.length === 0) {
      return ctx.recents.map<SearchResult>((r) => ({ ...r, matchIndices: [] }));
    }
    const matched = ctx.recents
      .map((r) => ({ row: r, match: fuzzyMatch(query, r.label) }))
      .filter((entry): entry is { row: SearchResult; match: NonNullable<typeof entry.match> } => entry.match !== null);
    matched.sort((a, b) => b.match.score - a.match.score);
    return matched.map<SearchResult>(({ row, match }) => ({ ...row, matchIndices: match.matchIndices }));
  },
};
```

<!-- uth:code id="code-search-icons-storage" file="src/features/search-recents/storage.ts" lines="13-38,49-58,60-91,99-117" lang="ts" -->
```ts id="ire6pg"
// What gets persisted is a thin subset of SearchResult. typeId is kept so a
// recent row that maps to an EVE type still renders its icon.
type StoredRecent = Pick<
  SearchResult,
  'kind' | 'id' | 'label' | 'sub' | 'href' | 'iconText' | 'iconTone' | 'typeId'
>;

const storedRecentSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  sub: z.string().optional(),
  href: z.string(),
  iconText: z.string().optional(),
  iconTone: z.string().optional(),
  typeId: z.number().optional(),
});

const ITEM_KINDS = new Set(['blueprint']);
function rendersIcon(r: StoredRecent): boolean {
  return !ITEM_KINDS.has(r.kind) || r.typeId != null;
}

export function pushRecent(result: SearchResult): void {
  if (result.kind === 'recent') return;
  if (result.disabled) return;
  const current = readStored();
  const without = current.filter((r) => r.id !== result.id);
  const next: StoredRecent[] = [{ kind: result.kind, id: result.id, label: result.label, href: result.href, typeId: result.typeId }, ...without].slice(0, MAX_RECENTS);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}

function readStored(): StoredRecent[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isStoredRecent).filter(rendersIcon);
}

function isStoredRecent(value: unknown): value is StoredRecent {
  return storedRecentSchema.safeParse(value).success;
}
```
<!-- uth:code-excerpts:end -->

## Admin & Telemetry

Admin and telemetry started as a reporting problem, but they turned into a boundary problem.

I wanted visibility into LGI.tools without turning the site into a third-party analytics surface. The project needed enough data to answer practical questions — are people finding the site, are prices refreshing, are crons running, did an admin role change happen — without storing IP addresses, user agents, or a behavioral profile in someone else’s dashboard. That pushed the architecture toward first-party telemetry: small event rows in Neon, narrow metadata, explicit retention, and admin-only read surfaces.

[PR #14](https://github.com/StorminRH/lgi-tools/pull/14) created the first version of that layer. The `usage_logs` table stores one row per tracked action with a nullable character ID, plain-text action, and JSON metadata. Nullable character ID was deliberate. Anonymous visitors still matter for reach, but a logged-out page view should not require inventing an identity. The action column stayed `text` instead of a Postgres enum because telemetry vocabulary changes whenever a feature adds a new event. The code owns the allowed action list in TypeScript; the database stays flexible.<sup><a href="#code-admin-usage-schema">1</a></sup>

The next rule came later and was more important: not every action may come from the browser. Page views and terminal searches are client events. Cron outcomes, auth events, role changes, price-source degradation, token-refresh races, and account purges are server events. [PR #51](https://github.com/StorminRH/lgi-tools/pull/51) made that split explicit after the market-price pipeline had been failing too quietly. The public telemetry endpoint validates only the client action list, so a browser cannot forge a `cron_prices` row or fake an admin audit event. Server-only events go through `logUsageEvent` from route handlers and cron routes instead.<sup><a href="#code-admin-actions">2</a></sup><sup><a href="#code-admin-telemetry-contract">3</a></sup>

The page-view tracker is intentionally small. It mounts once in the root layout, watches the current URL, skips `/admin` and `/api`, and posts a `page_view` row through `sendBeacon` with fetch as a fallback. The metadata is useful but bounded: path, query string, external referrer host, UTM tags, a random visitor UUID stored in localStorage, and whether this was the first page view of the tab session. That visitor ID is not a fingerprint. It is a browser-local random ID so the admin dashboard can distinguish a first-time landing from another click in the same session.<sup><a href="#code-admin-layout">4</a></sup><sup><a href="#code-admin-reporter">5</a></sup><sup><a href="#code-admin-client-post">6</a></sup>

The public write route is also defensive. It validates JSON shape before any write, caps serialized metadata at 2 KB, rate-limits the caller, reads the signed-in character from the Better Auth session if there is one, and then writes fire-and-forget. Telemetry must never break a page view, login, search, or navigation. If a usage insert fails, that is a bug to log, not a reason to fail the user’s request.<sup><a href="#code-admin-public-route">7</a></sup>

The first admin report was practical: totals, daily activity, top pages, top searches, and role-change audit. It did the job, but the scope kept growing. [PR #27](https://github.com/StorminRH/lgi-tools/pull/27) added acquisition metadata from the same first-party page-view rows: referrers, UTM sources, and entry pages. [PR #51](https://github.com/StorminRH/lgi-tools/pull/51) added cron and price-degradation rows. [PR #69](https://github.com/StorminRH/lgi-tools/pull/69) turned those into a health dashboard. That was the point where telemetry stopped being just “how many visitors?” and became operational memory for the site.

The repo now treats those read paths as raw counts first and derived interpretation second. SQL queries pull counts, sums, latest runs, source splits, and JSON metadata fields. The TypeScript derivation layer turns those into ratios, buckets, status labels, and one-line summaries. That separation is there because empty windows, real zeroes, and 100-percent cases are easy to lie about accidentally. A dashboard should say “no price refreshes recorded,” not display a fake 0-percent success rate with no denominator.<sup><a href="#code-admin-telemetry-queries">8</a></sup><sup><a href="#code-admin-health-math">9</a></sup>

Google Search Console was a separate decision. [PR #73](https://github.com/StorminRH/lgi-tools/pull/73) added Search Console data to the admin SEO view, but not by adding Google Analytics. There is no Google tracking script, no Google cookie, and no visitor behavior going to a new frontend service. The app runs a backend cron with a service-account credential, pulls data Google already has about the public site’s search visibility, and stores the snapshot in its own `gsc_*` tables. Those tables are intentionally separate from `usage_logs`: Search Console is external, periodically synced data, not first-party telemetry.<sup><a href="#code-admin-gsc-schema">10</a></sup>

The GSC sync follows the same operational pattern as the price and SDE jobs. The cron is bearer-authenticated, guarded by a session advisory lock, writes a structured outcome to `usage_logs`, and degrades to the last stored snapshot when one surface fails. Search analytics, sitemap data, and URL inspection are isolated from each other; a partial failure records `partial` instead of wiping the dashboard. The same daily cron also prunes `usage_logs` after 180 days, which keeps the event table bounded without a separate scheduled job.<sup><a href="#code-admin-gsc-cron">11</a></sup><sup><a href="#code-admin-gsc-ingest">12</a></sup><sup><a href="#code-admin-retention">13</a></sup>

[PR #84](https://github.com/StorminRH/lgi-tools/pull/84) corrected the admin surface itself. The intermediate dashboard had tabs and repeated metrics. That made the page feel more organized, but it also made the mental model worse: the same underlying data appeared in more than one place. The current `/admin` page is one consolidated dashboard: headline KPIs, system health, traffic and SEO, and user engagement. Role management moved to `/admin/access`, because changing who can administer the site is a different task than watching whether the system is healthy.<sup><a href="#code-admin-dashboard">14</a></sup>

The system-health strip is the clearest expression of the current design. It reduces the price cron, SDE cron, GSC sync, and ESI price source to status rows that are anchored on “now,” not just the selected chart range. The details inside each row still respect the selected range, but the status dot answers the operational question: is this subsystem healthy right now? Section loading is guarded independently, too. If one admin data query fails, the page should show that section as unavailable instead of taking down the whole dashboard.<sup><a href="#code-admin-status-strip">15</a></sup><sup><a href="#code-admin-load-section">16</a></sup>

Admin role management has its own boundary. The access page is server-gated, builds the admin list, searches linked characters, includes the environment superadmin even when they are not marked `ADMIN` in the database, and shows the role-change audit. The form itself is plain HTML, but the route is the real defense. It checks the Better Auth admin flag server-side, refuses self-toggle, validates the target user, updates the role, and writes a `role_change` event. The UI can disable a button; the route has to enforce the rule.<sup><a href="#code-admin-access-page">17</a></sup><sup><a href="#code-admin-role-route">18</a></sup>

The lesson here is that “admin data” is not one thing. Usage telemetry, operational health, Search Console snapshots, performance telemetry, and authorization audit all answer different questions and deserve different boundaries. `usage_logs` is first-party event memory with retention. `gsc_*` tables are backend-synced external search visibility. Vercel Speed Insights is disclosed as performance telemetry and only loaded in production. Role changes are server-only audit events. Cron outcomes are operational signals. The dashboard composes those views, but the data sources do not collapse into one vague analytics bucket.

That matters for an AI-built codebase because dashboards are especially prone to shortcutting. It is easy to add “just one more metric” by reaching across layers, accepting a client-forged event, or blending external and first-party data until the privacy story is no longer true. The repo’s rule is stricter now: decide what kind of signal it is, decide who is allowed to write it, decide how long it is retained, and only then put it on the admin surface.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-admin-usage-schema" file="src/data/telemetry/schema.ts" lines="6-31" lang="ts" -->
```ts
export const usageLogs = pgTable(
  'usage_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    characterId: bigint('character_id', { mode: 'number' }).references(
      () => characters.characterId,
      { onDelete: 'set null' },
    ),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [
    index('usage_logs_timestamp_idx').on(t.timestamp.desc()),
    index('usage_logs_action_timestamp_idx').on(t.action, t.timestamp.desc()),
    index('usage_logs_character_timestamp_idx').on(t.characterId, t.timestamp.desc()),
  ],
);
```

<!-- uth:code id="code-admin-actions" file="src/data/telemetry/types.ts" lines="3-41" lang="ts" -->
```ts
export const CLIENT_USAGE_ACTIONS = ['page_view', 'terminal_search'] as const;

export const SERVER_USAGE_ACTIONS = [
  'auth_login',
  'auth_logout',
  'role_change',
  'character_switch',
  'character_unlink',
  'admin_character_unlink',
  'admin_force_logout',
  'admin_character_reassign',
  'feedback_submitted',
  'price_source_degraded',
  'cron_prices',
  'cron_industry_indices',
  'cron_sde',
  'cron_gsc',
  'cron_sync_sweeper',
  'cron_affiliations',
  'eve_token_refresh_race',
  'account_purge',
] as const;

export const USAGE_ACTIONS = [
  ...CLIENT_USAGE_ACTIONS,
  ...SERVER_USAGE_ACTIONS,
] as const;

export type UsageAction = (typeof USAGE_ACTIONS)[number];
```

<!-- uth:code id="code-admin-telemetry-contract" file="src/data/telemetry/api-contract.ts" lines="8-23" lang="ts" -->
```ts
// Validates against CLIENT_USAGE_ACTIONS, not the full set: server-only
// actions (cron health signals, auth/admin audit) must not be forgeable by a
// client POST, or the health/audit rows they write could be polluted.
export const telemetryRequestSchema = z.object({
  action: z.enum(CLIENT_USAGE_ACTIONS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const telemetryEndpoint: ApiEndpoint<z.input<typeof telemetryRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/telemetry',
  request: telemetryRequestSchema,
  response: null,
};
```

<!-- uth:code id="code-admin-layout" file="src/app/layout.tsx" lines="125-132" lang="tsx" -->
```tsx
<Suspense fallback={null}>
  <TelemetryReporter />
</Suspense>
{/* Only on Vercel (prod/preview), where the script is served same-origin. */}
{process.env.NODE_ENV === "production" && <SpeedInsights />}
```

<!-- uth:code id="code-admin-reporter" file="src/components/telemetry/TelemetryReporter.tsx" lines="9-18,54-83,86-114" lang="tsx" -->
```tsx
const SKIP_PREFIXES = ['/admin', '/api/'];
const VISITOR_KEY = 'lgi:visitor_id';
const SESSION_FLAG_KEY = 'lgi:session_started';

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function getOrCreateVisitorId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

function takeIsEntry(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const flagged = window.sessionStorage.getItem(SESSION_FLAG_KEY);
    if (flagged) return false;
    window.sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function TelemetryReporter(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || shouldSkip(pathname)) return;
    const metadata: Record<string, unknown> = { path: pathname, search };
    const referrer = readReferrerHost();
    if (referrer) metadata.referrer = referrer;
    const utm = readUtmTags(searchParams);
    if (utm) metadata.utm = utm;
    const visitorId = getOrCreateVisitorId();
    if (visitorId) metadata.visitor_id = visitorId;
    metadata.is_entry = takeIsEntry();
    postTelemetry({ action: 'page_view', metadata });
  }, [pathname, search, searchParams]);

  return null;
}
```

<!-- uth:code id="code-admin-client-post" file="src/components/telemetry/client.ts" lines="3-25" lang="ts" -->
```ts
export function postTelemetry({ action, metadata }: PostInput): void {
  const payload = { action, metadata: metadata ?? {} };

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const ok = navigator.sendBeacon(telemetryEndpoint.path, blob);
    if (ok) return;
  }

  void apiFetch(telemetryEndpoint, { body: payload, keepalive: true }).catch(() => {});
}
```

<!-- uth:code id="code-admin-public-route" file="src/app/api/telemetry/route.ts" lines="10-22,32-53,64-79" lang="ts" -->
```ts
const MAX_METADATA_BYTES = 2048;

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = telemetryRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const safeMetadata = parsed.data.metadata ?? {};
  if (parsed.data.metadata !== undefined) {
    const serialised = JSON.stringify(safeMetadata);
    if (new TextEncoder().encode(serialised).length > MAX_METADATA_BYTES) {
      return new Response('metadata too large', { status: 400 });
    }
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'telemetry',
    perMinute: TELEMETRY_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return Response.json({ error: 'rate_limited', retryAfter: limit.retryAfter }, { status: 429 });

  void getSessionCharacterId()
    .then((characterId) =>
      logUsageEvent({ action: parsed.data.action, characterId, metadata: safeMetadata }),
    )
    .catch((err) => console.error('[telemetry] failed to record usage event', err));

  return new Response(null, { status: 204 });
}
```

<!-- uth:code id="code-admin-telemetry-queries" file="src/data/telemetry/queries.ts" lines="42-60,89-164,221-255,77-97" lang="ts" -->
```ts
export async function logUsageEvent(input: LogEventInput): Promise<void> {
  await db.insert(usageLogs).values({
    action: input.action,
    characterId: input.characterId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function pruneUsageLogs(retentionDays: number, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(usageLogs).where(lt(usageLogs.timestamp, cutoff));
}

function topByMetadataKeyQuery(metaKey: string, action: UsageAction, range: DateRange, limit: number) {
  const col = sql<string>`${usageLogs.metadata} ->> ${metaKey}`;
  return db
    .select({ value: col, count: count() })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, action), isNotNull(col)))
    .groupBy(sql`1`)
    .orderBy(desc(count()))
    .limit(limit);
}

export async function getFallbackRate(range: DateRange): Promise<FallbackRateData> {
  const esi = sql<number>`coalesce(sum(${jsonInt('esiCount')}), 0)`.mapWith(Number);
  const fallback = sql<number>`coalesce(sum(${jsonInt('fuzzworkFallbackCount')}), 0)`.mapWith(Number);
  // returns totals plus per-day split for the dashboard trend
}

export async function getLastCronRuns(): Promise<CronLastRun[]> {
  const outcome = sql<string | null>`${usageLogs.metadata} ->> 'outcome'`;
  const rows = await db
    .selectDistinctOn([usageLogs.action], { action: usageLogs.action, timestamp: usageLogs.timestamp, outcome })
    .from(usageLogs)
    .where(inArray(usageLogs.action, ['cron_prices', 'cron_sde', 'cron_gsc']))
    .orderBy(usageLogs.action, desc(usageLogs.timestamp));
  return rows.map((r) => ({ action: r.action as UsageAction, timestamp: r.timestamp, outcome: r.outcome }));
}
```

<!-- uth:code id="code-admin-health-math" file="src/data/telemetry/health-metrics.ts" lines="49-88,90-183,196-248" lang="ts" -->
```ts
export function ratio(num: number, denom: number): number | null {
  return denom === 0 ? null : num / denom;
}

export function fallbackSummary({ esi, fallback }: FallbackRateData): string {
  const denom = esi + fallback;
  if (denom === 0) return 'No price refreshes recorded this period.';
  if (fallback === 0) return 'ESI served every priced item this period.';
  const pct = Math.round((fallback / denom) * 100);
  return `Fuzzwork covered ${pct}% of priced items when ESI was unavailable.`;
}

export function deriveCronStatus(input: CronStatusInput): SubsystemStatus {
  const { lastRun, outcomes, expectedEveryHours, now } = input;
  if (!lastRun) return { level: 'red', headline: 'never ran' };
  const ageHours = (now.getTime() - lastRun.timestamp.getTime()) / 3_600_000;
  const lastKind = classifyOutcome(lastRun.outcome, input);
  if (lastKind === 'unhealthy') return { level: 'red', headline: `failing · ${lastRun.outcome ?? 'unknown outcome'}` };
  if (ageHours > expectedEveryHours * STALE_RED_FACTOR) return { level: 'red', headline: 'stale' };
  if (lastKind === 'degraded') return { level: 'amber', headline: `degraded · ${lastRun.outcome}` };
  if (ageHours > expectedEveryHours * STALE_AMBER_FACTOR) return { level: 'amber', headline: 'late' };
  const failures = outcomes.filter((o) => classifyOutcome(o.outcome, input) === 'unhealthy').reduce((s, o) => s + o.count, 0);
  if (failures > 0) return { level: 'amber', headline: `recovered · ${failures} failed runs this period` };
  return { level: 'green', headline: 'healthy' };
}

export function deriveEsiSourceStatus({ fallback, budgetExhaustions }: EsiSourceStatusInput): SubsystemStatus {
  const denom = fallback.esi + fallback.fallback;
  if (denom === 0) return { level: 'neutral', headline: 'no price refreshes this period' };
  const rate = fallback.fallback / denom;
  if (rate > FALLBACK_RED_RATE) return { level: 'red', headline: 'degraded' };
  if (fallback.fallback > 0 || budgetExhaustions > 0) return { level: 'amber', headline: 'partial' };
  return { level: 'green', headline: 'ESI served every priced item this period' };
}
```

<!-- uth:code id="code-admin-gsc-schema" file="src/data/gsc/schema.ts" lines="16-29,30-45,47-78" lang="ts" -->
```ts
export const gscSearchAnalytics = pgTable(
  'gsc_search_analytics',
  {
    date: date('date').notNull(),
    dimension: text('dimension').notNull(),
    key: text('key').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    position: doublePrecision('position').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.dimension, t.key] }),
    index('gsc_search_analytics_dimension_date_idx').on(t.dimension, t.date),
  ],
);

export const gscSitemaps = pgTable('gsc_sitemaps', {
  path: text('path').primaryKey(),
  warnings: bigint('warnings', { mode: 'number' }).notNull().default(0),
  errors: bigint('errors', { mode: 'number' }).notNull().default(0),
  submitted: bigint('submitted', { mode: 'number' }).notNull().default(0),
  indexed: bigint('indexed', { mode: 'number' }).notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});

export const gscUrlInspection = pgTable('gsc_url_inspection', {
  url: text('url').primaryKey(),
  verdict: text('verdict'),
  coverageState: text('coverage_state'),
  robotsTxtState: text('robots_txt_state'),
  indexingState: text('indexing_state'),
  pageFetchState: text('page_fetch_state'),
  lastCrawlTime: timestamp('last_crawl_time', { withTimezone: true }),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});
```

<!-- uth:code id="code-admin-gsc-cron" file="src/app/api/cron/refresh-gsc/route.ts" lines="16-27,32-64,66-101,104-116" lang="ts" -->
```ts
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();
  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      await swallow('[cron:gsc] telemetry write failed', logUsageEvent({ action: 'cron_gsc', metadata: { outcome: 'skipped', reason: 'busy' } }));
      return Response.json({ status: 'skipped', reason: 'busy', durationMs: Date.now() - start });
    }
    lockHeld = true;

    const summary = await syncGsc(directClient);
    await swallow('[cron:gsc] usage_logs prune failed', pruneUsageLogs(USAGE_LOG_RETENTION_DAYS));
    await swallow('[cron:gsc] telemetry write failed', logUsageEvent({
      action: 'cron_gsc',
      metadata: { outcome: summary.status, reason: summary.reason, errorCount: summary.errors.length, durationMs: summary.durationMs },
    }));
    return Response.json(summary);
  } finally {
    try {
      if (lockHeld) await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    } finally {
      reserved.release();
    }
  }
}
```

<!-- uth:code id="code-admin-gsc-ingest" file="src/data/gsc/ingest.ts" lines="165-190,221-255,258-305" lang="ts" -->
```ts
async function syncSearchAnalytics(db: AnyPgDb, startDate: string, endDate: string, syncedAt: Date): Promise<SurfaceResult> {
  try {
    const perPull = await Promise.all(
      SEARCH_PULLS.map(async (pull) =>
        searchRowsToRecords(
          await querySearchAnalytics({ startDate, endDate, dimensions: pull.apiDimensions }),
          pull.storage,
          syncedAt,
        ),
      ),
    );
    const records = perPull.flat();
    await upsertSearchAnalytics(db, records);
    return { count: records.length, error: null };
  } catch (err) {
    return { count: 0, error: `search-analytics: ${errText(err)}` };
  }
}

async function syncUrlInspections(db: AnyPgDb, syncedAt: Date): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];
  for (const url of inspectionUrls()) {
    try {
      const status = await inspectUrl(url);
      if (!status) continue;
      await db.insert(gscUrlInspection).values(indexStatusToRecord(url, status, syncedAt)).onConflictDoUpdate({ target: gscUrlInspection.url, set: { syncedAt: excluded('synced_at') } });
      count++;
    } catch (err) {
      errors.push(`url-inspection ${url}: ${errText(err)}`);
    }
  }
  return { count, errors };
}

export async function syncGsc(client: Sql): Promise<GscSyncSummary> {
  if (!isGscConfigured()) return { status: 'skipped', reason: 'not_configured', searchRows: 0, sitemaps: 0, urlsInspected: 0, errors: [], durationMs: 0 };
  const search = await syncSearchAnalytics(db, startDate, endDate, syncedAt);
  const sitemap = await syncSitemaps(db, syncedAt);
  const urls = await syncUrlInspections(db, syncedAt);
  const errors = [search.error, sitemap.error, ...urls.errors].filter((e): e is string => e !== null);
  const anyLanded = search.count + sitemap.count + urls.count > 0;
  const status = errors.length === 0 ? 'synced' : anyLanded ? 'partial' : 'failed';
  return { status, reason: status === 'failed' ? errors[0] : undefined, searchRows: search.count, sitemaps: sitemap.count, urlsInspected: urls.count, errors, durationMs: Date.now() - start };
}
```

<!-- uth:code id="code-admin-retention" file="src/data/telemetry/constants.ts" lines="10-15" lang="ts" -->
```ts
export const USAGE_LOG_RETENTION_DAYS = 180;
```

<!-- uth:code id="code-admin-dashboard" file="src/app/admin/page.tsx" lines="18-22,64-76,83-124,137-153" lang="tsx" -->
```tsx
async function AdminContent({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  const raw = await searchParams;
  const rangeKey = parseRange(raw.range);
  const range = rangeFor(rangeKey);

  return (
    <>
      <PageHead
        crumb="admin"
        title="Admin"
        subtitle={`${formatDate(range.from)} → ${formatDate(range.to)}`}
        meta={<><RangeSelector range={rangeKey} /><Link href="/admin/access">Access →</Link><PrintButton /></>}
      />
      <Suspense fallback={<SectionFallback />}><KpiRow rangeKey={rangeKey} range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><StatusStrip range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><TrafficSection range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><UsersSection range={range} /></Suspense>
    </>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  return <PageShell><Suspense fallback={<AdminLoading />}><AdminContent searchParams={searchParams} /></Suspense></PageShell>;
}
```

<!-- uth:code id="code-admin-status-strip" file="src/app/admin/StatusStrip.tsx" lines="81-148,156-178,201-252" lang="tsx" -->
```tsx
export async function StatusStrip({ range }: { range: DateRange }) {
  const gscConfigured = isGscConfigured();
  const fetched = await loadSection('system-health', () =>
    Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      getFallbackRate(range),
      getBudgetExhaustionCount(range),
      getDegradationByCaller(range),
      getRefreshVolume(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="System health" />;

  const priceStatus = deriveCronStatus({ lastRun: lastFor('cron_prices'), outcomes: priceOutcomes, healthy: PRICES_HEALTHY_OUTCOMES, expectedEveryHours: 24, now });
  const sdeStatus = deriveCronStatus({ lastRun: lastFor('cron_sde'), outcomes: sdeOutcomes, healthy: SDE_HEALTHY_OUTCOMES, neutral: SDE_NEUTRAL_OUTCOMES, expectedEveryHours: 24, now });
  const gscStatus = deriveGscStatus({ configured: gscConfigured, lastRun: lastFor('cron_gsc'), outcomes: gscOutcomes, lastSyncedAt, now });
  const esiStatus = deriveEsiSourceStatus({ fallback, budgetExhaustions });

  return (
    <Card>
      <StatusRow name="Price cron" status={priceStatus}>{/* details */}</StatusRow>
      <StatusRow name="SDE cron" status={sdeStatus}>{/* details */}</StatusRow>
      <StatusRow name="GSC sync" status={gscStatus}>{/* details */}</StatusRow>
      <StatusRow name="ESI source" status={esiStatus}>{/* details */}</StatusRow>
    </Card>
  );
}
```

<!-- uth:code id="code-admin-load-section" file="src/app/admin/load-section.ts" lines="5-34" lang="ts" -->
```ts
export const SECTION_LOAD_FAILED = Symbol('admin.section-load-failed');

export async function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<T | typeof SECTION_LOAD_FAILED> {
  try {
    return await load();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[admin] ${label} section unavailable`, err);
    return SECTION_LOAD_FAILED;
  }
}
```

<!-- uth:code id="code-admin-access-page" file="src/app/admin/access/page.tsx" lines="48-69,192-213,223-260" lang="tsx" -->
```tsx
async function buildAdminList(): Promise<Array<{ user: AdminUser; isSuperadmin: boolean }>> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const superUser = Number.isFinite(superId) && superId > 0 ? await getUserByCharacterId(superId) : null;
  const superUserId = superUser?.userId ?? null;
  const rows = dbAdmins.map(u => ({ user: u, isSuperadmin: u.userId === superUserId }));
  if (superUser && !dbAdmins.some(a => a.userId === superUserId)) {
    rows.unshift({ user: superUser, isSuperadmin: true });
  }
  return rows;
}

async function AccessContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) redirect('/?auth_error=admin_required');
  const viewerUserId = session.user.id;
  const raw = await searchParams;
  const query = sanitiseQuery(raw.q);
  const [adminRows, searchResults, audit] = await Promise.all([
    buildAdminList(),
    query ? searchUsersByLinkedCharacterName(query) : Promise.resolve([] as AdminUser[]),
    getRoleChangeAudit(lastNDaysRange(AUDIT_WINDOW_DAYS), 50),
  ]);
  return <PageHead crumb="access" title="Access" />;
}
```

<!-- uth:code id="code-admin-role-route" file="src/app/api/admin/role/route.ts" lines="26-82" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) return new Response('Forbidden', { status: 403 });
  const viewerUserId = session.user.id;
  const actorCharacterId = session.characterId;

  const form = await request.formData();
  const parsed = adminRoleFormSchema.safeParse({
    userId: form.get('userId'),
    nextRole: form.get('nextRole'),
    q: form.get('q') ?? undefined,
  });
  if (!parsed.success) return new Response('Invalid form', { status: 400 });

  const { userId, nextRole } = parsed.data;
  if (userId === viewerUserId) return new Response('Cannot toggle your own role', { status: 400 });
  const target = await getUserById(userId);
  if (!target) return new Response('User not found', { status: 404 });

  const previousRole = target.role;
  await setUserRole(userId, nextRole);
  void logUsageEvent({
    action: 'role_change',
    characterId: actorCharacterId,
    metadata: { actorUserId: viewerUserId, targetUserId: userId, targetCharacterId: target.characterId, from: previousRole, to: nextRole },
  }).catch((err) => console.error('[admin/role] telemetry write failed', err));

  return Response.redirect(buildRedirect(request, sanitiseQuery(parsed.data.q)), 303);
}
```
<!-- uth:code-excerpts:end -->

# Rails

## Route Assertions

Route assertions are where the repo turns “the page still works” into the wrong standard.

Before the rules, there is the reason for the rules. A route’s rendering mode is one of the biggest hidden user-experience decisions in a Next.js app. A static page is already built before the visitor asks for it. A partial, or hybrid, page can send the stable shell immediately and stream the user-specific or data-specific parts after that. A fully dynamic page waits on the request before it can answer. The browser may end up showing the same pixels in all three cases, but the path to those pixels is not the same.

For LGI.tools, the priority order is speed and feel first, then crawlability and SEO. The wormhole-site catalogue, planner shells, changelog, legal pages, and search-index JSON should feel instant because most of their structure is known ahead of time. Pages that need live prices, account state, or admin data should not force the whole route to become slow; the static shell should still carry the page while the dynamic hole does the request-time work. SEO matters too, especially for public reference pages, but it follows the same technical discipline: keep crawlable content static where possible, and isolate private or volatile reads so they do not drag the whole page into request-time rendering.

That is why route assertions exist. A Next.js route can look identical in the browser while changing its cost model completely. It can move from a fully static page to a partially prerendered shell, or from a static shell to a request-time render. It can start reading cookies in the wrong place, pull session state into the shell, touch a database during build, or stop being crawlable. None of that necessarily shows up in a screenshot. It shows up later as slower pages, higher serverless work, broken deploys, worse search surfaces, or a feature that can no longer scale the way the architecture assumed.

That risk became real during the static-reclaim work. [PR #42](https://github.com/StorminRH/lgi-tools/pull/42) moved the app toward static-by-default pages with request-time work isolated into Suspense holes. The payoff was not just speed. It created a contract: if a route is supposed to be static, partial, or dynamic, the repo should be able to prove that after a build. The Vercel build now runs the normal database prep, builds Next, and then runs the route-classification assertion before deploy can finish.<sup><a href="#code-route-build-script">1</a></sup>

The expected map lives in `scripts/route-classification.json`. I like that it is not just a list of routes and labels. The `_reasons` block explains why the important routes are classified the way they are: which parts are static, which parts stream, which reads are per-user, which API routes are deploy-static JSON, and which route handlers are dynamic by design. That makes the file more than a test fixture. It is a routing decision log.<sup><a href="#code-route-map">2</a></sup>

The full assertion reads build artifacts instead of scraping console output. That matters because terminal output is for humans; build manifests are the evidence. The script reads `.next/prerender-manifest.json` and `.next/app-path-routes-manifest.json`, classifies every public route, then uses the `.meta` file to distinguish fully static from partial prerender. If the actual build mode differs from the committed expectation, the build fails. If a new route appears without a map entry, the build fails. If a stale entry remains for a deleted route, the build fails.<sup><a href="#code-route-mode-assert">3</a></sup>

That rail caught a real process gap later. [PR #135](https://github.com/StorminRH/lgi-tools/pull/135) was not a runtime code change; it added a missing `/api/preferences` classification after production deploy hit the post-build assertion. The mistake was useful because it showed that the assertion worked, but it also exposed that the feedback was too late. The route map was only being fully checked after `next build`, and CI did not run that build path.

[PR #148](https://github.com/StorminRH/lgi-tools/pull/148) added the lighter presence check to close that gap. `assert-routes-present` does not need a build. It walks `src/app`, derives route keys from `page`, `route`, `sitemap`, and `robots` files, and compares that discovered set against `route-classification.json`. It cannot prove render mode, but it can prove coverage. That means a new route without a classification entry fails in CI instead of waiting for the Vercel deploy step.<sup><a href="#code-route-presence-assert">4</a></sup><sup><a href="#code-route-ci">5</a></sup>

The two checks serve different jobs. The CI presence check is cheap and early: “did every route get a declared classification?” The post-build check is slower and authoritative: “did Next actually build each route the way the repo says it should?” I need both because the failure modes are different. Missing bookkeeping is a CI problem. Render-mode drift is a build-artifact problem.

There is a second route assertion that protects a different boundary: API authorization class. [PR #50](https://github.com/StorminRH/lgi-tools/pull/50) required every route handler under `src/app/api` to declare one `// authz:` marker: `public`, `auth`, `admin`, `cron`, or `service`. The test does not pretend to prove the handler’s logic. It only proves that the route has been forced to name its access class next to the code that enforces it. That is enough to stop the easiest AI mistake: adding a new endpoint and forgetting to ask who is allowed to call it.<sup><a href="#code-route-authz-marker-test">6</a></sup>

That distinction is important. A central route table is useful for render mode because render mode is discovered from the build as a whole. Authorization class belongs next to the handler because the person or AI agent editing the route is already there. The repo uses both patterns because the ownership is different.

Route assertions are not there to ban dynamic work. A per-user dashboard should be partial. A mutation endpoint should be dynamic. A cron endpoint should be dynamic and bearer-gated. A deploy-static search index can be an API route and still prerender to a static JSON asset. The rail does not say “static good, dynamic bad.” It says the route must be classified intentionally, with the reason and the artifact in agreement.

This is one of the best examples of the repo adapting to AI. AI can change routing accidentally by moving one read, adding one helper call, or creating one route file. The output may still look fine. The route assertion changes the review question from “does the page render?” to “did the route keep the architecture it was supposed to have?”

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-route-build-script" file="package.json" lines="21-27" lang="json" -->
```json
{
  "build": "next build",
  "vercel-build": "pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "assert:routes": "node scripts/assert-route-classification.mjs",
  "assert:routes-present": "node scripts/assert-routes-present.mjs"
}
```

<!-- uth:code id="code-route-map" file="scripts/route-classification.json" lines="3-35,35-110" lang="json" -->
```json
{
  "_comment": "Expected `next build` render mode for every route, asserted by scripts/assert-route-classification.mjs after a build. Guards the conversion-track payoff (3.0.4.8+3.0.4.9): a route must not silently regress to a more dynamic mode. Modes: 'static' = ○ (fully prerendered), 'partial' = ◐ (partial prerender — static shell + request-time <Suspense> holes), 'dynamic' = ƒ (server-rendered per request). New routes must be added here or the check fails. If a change is intentional, update this file in the same commit.",
  "_reasons": {
    "/sites": "Client-state class/type filters (not searchParams) plus a searchParams-driven sort; the live-price overlay streams from a dynamic hole.",
    "/admin": "Per-user: the session-gated single-page dashboard (KPIs, status strip, traffic, users) is a request-time dynamic hole; visx charts are client-only islands inside it.",
    "/api/industry/blueprints": "Blueprint search index is deploy-static SDE data (cached 'max', SDE-tag revalidated), so the handler prerenders to a static JSON asset — no per-request input.",
    "dynamic /api/*": "Route handlers — per-request by nature (auth, mutations, DB queries, crons, external calls). Justified dynamic."
  },
  "routes": {
    "/": "partial",
    "/admin": "partial",
    "/changelog": "static",
    "/industry/[id]": "partial",
    "/api/industry/blueprints": "static",
    "/api/account/skills": "dynamic",
    "/api/cron/refresh-gsc": "dynamic",
    "/api/telemetry": "dynamic"
  }
}
```

<!-- uth:code id="code-route-mode-assert" file="scripts/assert-route-classification.mjs" lines="33-90" lang="js" -->
```js
const expected = readJson(join(HERE, 'route-classification.json')).routes;
const appRoutes = readJson(appRoutesManifestPath); // { "<file>/page": "/route", ... }
const prerender = readJson(prerenderManifestPath);
const prerendered = new Set([
  ...Object.keys(prerender.routes ?? {}),
  ...Object.keys(prerender.dynamicRoutes ?? {}),
]);

function metaPathFor(route) {
  const base = route === '/' ? 'index' : route.replace(/^\//, '');
  return join(APP_DIR, `${base}.meta`);
}

function classify(route) {
  if (!prerendered.has(route)) return 'dynamic';
  const metaPath = metaPathFor(route);
  if (!existsSync(metaPath)) return 'partial';
  return 'postponed' in readJson(metaPath) ? 'partial' : 'static';
}

const routes = [...new Set(Object.values(appRoutes))]
  .filter((r) => !r.startsWith('/_') && r !== '/favicon.ico')
  .sort();

const errors = [];
for (const route of routes) {
  const actual = classify(route);
  const want = expected[route];
  if (!want) {
    errors.push(`unclassified route "${route}" (built as ${actual}) — add it to scripts/route-classification.json`);
  } else if (actual !== want) {
    errors.push(`"${route}": expected ${want} but built as ${actual}`);
  }
}
for (const route of Object.keys(expected)) {
  if (!routes.includes(route)) {
    errors.push(`stale entry "${route}" in scripts/route-classification.json — route no longer exists`);
  }
}

if (errors.length > 0) {
  console.error('\n✗ Route render-mode classification check failed:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nIf the change is intentional, update scripts/route-classification.json in the same commit.\n');
  process.exit(1);
}
```

<!-- uth:code id="code-route-presence-assert" file="scripts/assert-routes-present.mjs" lines="3-9,16-19,29-67" lang="js" -->
```js
// CI presence check (no build required): every route-defining file under
// src/app has a classification entry in scripts/route-classification.json, and
// every classification entry still has a file. The full render-MODE assert
// (assert-route-classification.mjs) needs a `next build` and runs at deploy;
// this lighter check catches an added/removed route that forgot the JSON in
// plain CI, where the build doesn't run.
const ROUTE_FILE = /^(page|route)\.(tsx?|jsx?)$/;
const SITEMAP_FILE = /^sitemap\.(tsx?|jsx?)$/;
const ROBOTS_FILE = /^robots\.(tsx?|jsx?)$/;

function routeKey(relPosix) {
  const parts = relPosix.split('/');
  const base = parts.pop();
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  if (SITEMAP_FILE.test(base)) return `${prefix}/sitemap.xml`;
  if (ROBOTS_FILE.test(base)) return `${prefix}/robots.txt`;
  return prefix === '' ? '/' : prefix;
}

const routeFiles = walk(APP_DIR).filter((f) => {
  const base = path.basename(f);
  return ROUTE_FILE.test(base) || SITEMAP_FILE.test(base) || ROBOTS_FILE.test(base);
});

const discovered = new Set(
  routeFiles.map((f) => routeKey(path.relative(APP_DIR, f).split(path.sep).join('/'))),
);

const classification = JSON.parse(readFileSync(CLASSIFICATION_PATH, 'utf8'));
const classified = new Set(Object.keys(classification.routes ?? {}));

const missing = [...discovered].filter((k) => !classified.has(k)).sort();
const stale = [...classified].filter((k) => !discovered.has(k)).sort();

if (missing.length || stale.length) {
  if (missing.length) {
    console.error(`✗ ${missing.length} route(s) under ${APP_DIR} missing from ${CLASSIFICATION_PATH}:`);
    for (const k of missing) console.error(`    ${k}`);
  }
  if (stale.length) {
    console.error(`✗ ${stale.length} entry(ies) in ${CLASSIFICATION_PATH} with no route file:`);
    for (const k of stale) console.error(`    ${k}`);
  }
  process.exit(1);
}
```

<!-- uth:code id="code-route-ci" file=".github/workflows/test.yml" lines="32-41" lang="yaml" -->
```yaml
- run: pnpm typecheck

- run: pnpm lint

# Lightweight presence gate (no build): every src/app route is classified
# in route-classification.json and vice-versa. The full render-MODE assert
# (assert:routes) needs `next build` and runs at deploy, so this catches a
# route added or removed without its classification entry here in plain CI.
- run: pnpm assert:routes-present
```

<!-- uth:code id="code-route-authz-marker-test" file="src/app/api/authz-markers.test.ts" lines="8-26,47-77" lang="ts" -->
```ts
// Mechanical authorization-classification guard. Every route handler under
// src/app/api must self-declare its authorization class on its own comment line:
//
//   // authz: public | auth | admin | cron | service
//
// This asserts ONLY that the marker is present, unique, and well-formed — it does
// NOT verify the route's actual auth logic, and there is deliberately no central
// route→class table (the class lives next to the code that enforces it). A new
// route with no marker fails this test, so an unclassified handler can't ship
// silently — the same spirit as scripts/assert-route-classification.mjs.
const MARKER_RE = /^[ \t]*\/\/[ \t]*authz:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_CLASSES = new Set(['public', 'auth', 'admin', 'cron', 'service']);

describe('authz classification markers', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s declares exactly one valid authz class', (file) => {
    const src = readFileSync(file, 'utf8');
    const matches = [...src.matchAll(MARKER_RE)];

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(2);

    const cls = matches[0][1];
    expect(VALID_CLASSES.has(cls)).toBe(true);
  });
});
```
<!-- uth:code-excerpts:end -->

## TypeScript

TypeScript is one of the places where the “built with AI” part of this project becomes very practical.

AI can produce code that looks right. It can also produce code where two sides of the same boundary quietly disagree: a route returns `staleAfter`, a client expects `stale_after`; a database query returns a `bigint`, a JSON response tries to send it raw; an env var can be empty but the call site treats empty as missing; an external API returns a shape that looks close enough until one field is not there. Those are not dramatic architecture failures. They are the small mismatches that turn into weird bugs later.

So TypeScript’s job in LGI.tools is not just “make the editor nicer.” It is a rail that makes boundary drift expensive. If a value crosses a wire, leaves the process, enters from a user, comes back from EVE, or gets shared between a route and a client, I want as much of that shape as possible declared once and checked where it is used.

The baseline is strict TypeScript with `noEmit`. The compiler is not the thing that produces the app bundle; it is a verification step. That distinction matters. `pnpm typecheck` is there to fail the branch when the repo’s declared shapes no longer agree, not to generate output. In an AI workflow, that gives me a fast answer to a question I cannot answer by reading every diff line: did this change break the contracts the rest of the repo depends on?<sup><a href="#code-typescript-tsconfig">1</a></sup>

The biggest TypeScript rail landed in [PR #89](https://github.com/StorminRH/lgi-tools/pull/89). Before that, API routes and API clients could drift more easily than I liked. A route could validate one shape, return another shape, and a browser caller could paper over the gap with a hand-written `as` cast. That is the kind of thing AI is very comfortable doing. It satisfies the local code path and hides the mismatch from the compiler.

The new rule is that JSON-speaking API routes have an owning `api-contract.ts`. The request schema and response type live there, near the feature or data slice that owns the route. The route imports the schema and still performs the runtime validation. The response payload is pinned with `satisfies`. The client imports the endpoint object and calls `apiFetch`, which returns the contract’s response type. A renamed field now breaks both sides at typecheck time instead of becoming a silent client bug.<sup><a href="#code-typescript-api-contract">2</a></sup><sup><a href="#code-typescript-route-satisfies">3</a></sup><sup><a href="#code-typescript-api-client">4</a></sup>

The market-price refresh route is a good example. The wire contract knows that database `bigint` volumes become strings, timestamps become ISO strings, and price sources must stay inside the allowed enum. The route maps the database rows into that wire shape and uses `satisfies RefreshPricesResponse` on the JSON payload. The client reads the same endpoint through `apiFetch`, then deserializes the wire strings and timestamps into the local shape it needs for the UI. That is the right split: TypeScript pins the wire, and the client owns the conversion after the wire has been proven.<sup><a href="#code-typescript-api-contract">2</a></sup><sup><a href="#code-typescript-route-satisfies">3</a></sup><sup><a href="#code-typescript-api-client">4</a></sup>

There is also a convention test because TypeScript only helps if the code actually participates in the contract system. A new route that never imports an `api-contract` module can still compile. So the repo has a mechanical test that walks `src/app/api/**/route.*` and fails if a route does not import from an owning `api-contract` module, with a small allowlist for library-owned routes. This is the same philosophy as the authz marker and route-rendering checks: do not rely on me noticing the missing contract during review if the repo can notice it first.<sup><a href="#code-typescript-contract-test">5</a></sup>

The lint rail then protects the client side of the same system. Raw `fetch('/api/...')` calls are banned because they bypass the shared endpoint object. That is technically an ESLint rule, but it exists to preserve the TypeScript contract. The compiler cannot type a route response if the caller has escaped into raw string fetches. The lint rule keeps the path through `apiFetch` obvious, and the contract test keeps route authors from forgetting the other half.<sup><a href="#code-typescript-api-fetch-lint">6</a></sup>

Environment variables got the same treatment. `process.env` looks like a simple global, but it is one of the easiest places to create hidden behavior differences. Some variables treat an empty string as missing. Others need to preserve an empty string because the call site uses nullish checks or exact comparisons. [PR #89](https://github.com/StorminRH/lgi-tools/pull/89) moved server-side env reads into a typed registry with `readEnv` and `requireEnv`. The registry is lazy, so importing a module does not suddenly validate the whole deployment environment, and the type split prevents `requireEnv` from being used on variables where an empty string is meaningful.<sup><a href="#code-typescript-env">7</a></sup>

That “equivalence-preserving” part is important. I did not want the env rail to secretly change runtime behavior while pretending to be a cleanup. The registry records the behavior the app already had, then makes it harder for future code to read around it. `NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads because bundlers and Next’s client-env inlining need those literal accesses. Everything else server-side goes through the registry, and ESLint backs that up by banning unsanctioned `process.env` reads.<sup><a href="#code-typescript-env">7</a></sup><sup><a href="#code-typescript-api-fetch-lint">6</a></sup>

The outbound-call rail started earlier in [PR #48](https://github.com/StorminRH/lgi-tools/pull/48). The issue there was not just typing the app’s own routes. It was typing and bounding what comes back from outside services. ESI, Fuzzwork, EVE SSO, Discord, email, and SDE downloads all sit beyond my codebase. A slow upstream can pin a serverless function until the platform kills it. A malformed response can drift downstream as `undefined`, `NaN`, or a missing access token. The fix was to make outbound boundaries fail fast and reject malformed bodies at the edge.<sup><a href="#code-typescript-fetch-timeout">8</a></sup>

That is where Zod and TypeScript work together. Zod validates the runtime value that came back from the network. TypeScript carries the narrowed shape after validation. The Fuzzwork and ESI price paths are examples: the code does not just declare what the response should be and trust it. It parses the body against the boundary schema, then either proceeds with the inferred type or routes to the existing failure behavior. The type is only useful because the boundary check earned it.

This also changed how I think about database queries. Validation belongs at the route or external boundary. Once a value is parsed, narrowed, and typed, the query layer should accept the typed value and do its job. That keeps the data layer from becoming a second, inconsistent validation system. Drizzle gives the repo typed table and query surfaces; the route contracts decide what untrusted input is allowed to become before it reaches those queries.

The pattern is the same across the rail: do not let unknown shapes wander through the app. User input is parsed at the route. API responses are pinned to contracts. Browser callers use typed endpoint objects. Env reads go through a typed registry. External responses are validated before they become application values. Queries receive already-typed inputs.

TypeScript does not make the code correct by itself. It cannot tell me whether a feature is useful, whether a cache policy is wise, or whether an EVE endpoint is the right source of truth. But it is excellent at one thing I need constantly in an AI-built repo: making disagreement visible. If two parts of the system think a value has a different shape, I want the branch to fail before that disagreement becomes a production behavior.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-typescript-tsconfig" file="tsconfig.json" lines="3-35" lang="json" -->
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

<!-- uth:code id="code-typescript-api-contract" file="src/data/market-prices/api-contract.ts" lines="14-64" lang="ts" -->
```ts
export const refreshPricesRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_REFRESH_MAX_TYPE_IDS),
});

export const wirePriceSchema = z.object({
  typeId: z.number(),
  bestBuy: z.number().nullable(),
  bestSell: z.number().nullable(),
  pct5Buy: z.number().nullable(),
  pct5Sell: z.number().nullable(),
  buyVolume: z.string().nullable(),
  sellVolume: z.string().nullable(),
  buyDepth: z.array(wireDepthBandSchema).nullable(),
  sellDepth: z.array(wireDepthBandSchema).nullable(),
  updatedAt: z.string(),
  staleAfter: z.string(),
  source: z.enum(['esi', 'fuzzwork-fallback', 'fuzzwork']) satisfies z.ZodType<PriceSource>,
});

export const refreshPricesResponseSchema = z.object({ prices: z.array(wirePriceSchema) });
export type RefreshPricesResponse = z.infer<typeof refreshPricesResponseSchema>;

export const refreshPricesEndpoint: ApiEndpoint<
  z.input<typeof refreshPricesRequestSchema>,
  RefreshPricesResponse
> = {
  method: 'POST',
  path: '/api/market-prices/refresh',
  request: refreshPricesRequestSchema,
  response: refreshPricesResponseSchema,
};
```

<!-- uth:code id="code-typescript-route-satisfies" file="src/app/api/market-prices/refresh/route.ts" lines="36-108" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" } satisfies RefreshPricesBadRequest, {
      status: 400,
    });
  }

  const parsed = refreshPricesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues } satisfies RefreshPricesBadRequest,
      { status: 400 },
    );
  }

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const { prices } = await getLivePrices(typeIds);

  return Response.json({
    prices: typeIds
      .map((typeId) => prices.get(typeId))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) => ({
        typeId: row.typeId,
        bestBuy: row.bestBuy,
        bestSell: row.bestSell,
        pct5Buy: row.pct5Buy,
        pct5Sell: row.pct5Sell,
        buyVolume: row.buyVolume?.toString() ?? null,
        sellVolume: row.sellVolume?.toString() ?? null,
        buyDepth: row.buyDepth,
        sellDepth: row.sellDepth,
        updatedAt: row.updatedAt.toISOString(),
        staleAfter: row.staleAfter.toISOString(),
        source: row.source,
      })),
  } satisfies RefreshPricesResponse);
}
```

<!-- uth:code id="code-typescript-api-client" file="src/lib/api-client.ts" lines="3-71" lang="ts" -->
```ts
export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  request: z.ZodType<unknown, TIn> | null;
  response: z.ZodType<TData> | null;
}

export async function apiFetch<TData>(
  endpoint: ApiEndpoint<null, TData>,
  init?: CallInit,
): Promise<ApiResult<TData>>;
export async function apiFetch<TIn, TData>(
  endpoint: ApiEndpoint<TIn, TData>,
  init: CallInit & { body: TIn },
): Promise<ApiResult<TData>>;
export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown>,
  init: CallInit & { body?: unknown } = {},
): Promise<ApiResult<unknown>> {
  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-typescript-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-63" lang="ts" -->
```ts
// Mechanical API-contract guard (3.4.T) — the sibling of authz-markers.test.ts.
// Every route handler under src/app/api must import from its owning slice's
// api-contract module, where its request schema and response types live, so the
// route and its clients share one wire shape.

const CONTRACT_IMPORT_RE = /from\s+['"][^'"]*api-contract['"]/;
const LIBRARY_OWNED = new Set(['auth/[...all]/route.ts']);

const ROUTE_FILES = findRouteFiles(API_DIR).filter(
  (file) => !LIBRARY_OWNED.has(relative(API_DIR, file)),
);

describe('api contract imports', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s imports from its slice's api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-typescript-api-fetch-lint" file="eslint.config.mjs" lines="55-63,78-93" lang="js" -->
```js
const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
];

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads.",
  },
];
```

<!-- uth:code id="code-typescript-env" file="src/lib/env.ts" lines="3-87" lang="ts" -->
```ts
// Typed, lazily-read server env (3.4.T). One registry of every server-side
// variable; a read validates on access — never at import, never cached.

const REQUIRED_ENV = {
  DATABASE_URL: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  CRON_SECRET: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

const VERBATIM_ENV = {
  DATABASE_URL_UNPOOLED: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
} as const;

export type RequiredEnvName = keyof typeof REQUIRED_ENV;
export type ServerEnvName = RequiredEnvName | keyof typeof VERBATIM_ENV;

export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
```

<!-- uth:code id="code-typescript-fetch-timeout" file="src/lib/fetch-with-timeout.ts" lines="3-51" lang="ts" -->
```ts
// Shared fail-fast timeout for outbound `fetch`. A slow or hung upstream
// would otherwise stall a serverless function until the 300s platform limit.

export const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;
export const SDE_DOWNLOAD_TIMEOUT_MS = 60_000;

export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs: number = OUTBOUND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
  }, timeoutMs);
  const callerSignal = init?.signal;
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal != null) {
    if (callerSignal.aborted) forwardAbort();
    else callerSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  });
}
```
<!-- uth:code-excerpts:end -->

## ESLint

ESLint is the fastest rail in the repo.

TypeScript tells me whether the code still type-checks. Tests tell me whether known behavior still holds. Fallow, now, handles the broader static-analysis pass. ESLint has a narrower job: catch the risky source shapes while the file is still open. It is the keyboard-level guard for patterns that are easy for an AI agent to produce and easy for a human to miss in review.

The first version of this rail came from [PR #36](https://github.com/StorminRH/lgi-tools/pull/36). At the time, a lot of architecture rules lived as prose: features do not import other features, data slices do not import features, UI primitives stay domain-agnostic, and inline styles were dangerous under the then-current CSP. Turning the mechanically-checkable pieces into lint errors was the right move. It made the repo stop relying on memory.

But that first shape also taught a boundary about the tooling itself. ESLint can inspect syntax quickly. It is less ideal as the long-term owner for whole-repo graph analysis, unused-code accounting, complexity, and duplication. When [PR #116](https://github.com/StorminRH/lgi-tools/pull/116) adopted Fallow as the static-analysis gate, those architecture-boundary rules moved there. That left ESLint with the things it is best at in this codebase: hooks and framework lint, restricted syntax, typed-call nudges, and source-level safety rails. The next section covers Fallow as the broader gate.

The current ESLint config starts with the Next.js recommended rule sets, then layers project-specific bans on top. One small but important override is unused variables. The repo allows a leading underscore to mean “this framework parameter or destructured field is intentionally unused.” That keeps the rule useful without fighting common Next and Drizzle shapes. A handler can accept `_request`, or a mapper can strip `{ waveId: _waveId, ...rest }`, without creating noise.<sup><a href="#code-eslint-unused-vars">1</a></sup>

The CSP rail is the oldest one still in the file, but its reason changed over time. Early on, inline `style={{ ... }}` was blocked because the production CSP dropped style attributes. Later CSP changes made inline styles technically possible, but the repo kept the ban as house style: static values belong in Tailwind classes, and runtime values should go through a CSS custom property set from an effect. The more important security part remains the raw-HTML ban. With inline scripts allowed by the current script policy, `dangerouslySetInnerHTML` and direct `innerHTML` or `outerHTML` writes are not casual escape hatches; they are XSS-shaped risks. ESLint catches those patterns syntactically.<sup><a href="#code-eslint-csp-selectors">2</a></sup>

[PR #78](https://github.com/StorminRH/lgi-tools/pull/78) added the color-token rail after a different kind of drift. The app had hardcoded hex colors spread through component class strings, SVG fills, borders, focus rings, and repeated tone values. That was not only a design problem. It was an AI problem. Once raw colors existed everywhere, future generated code had no obvious reason to use the token layer. The fix was two-part: route existing call-site colors into named `--color-*` tokens or the sanctioned `tones.ts` table, then ban new raw hex at call sites. The selector catches hex inside Tailwind arbitrary values and standalone hex constants.<sup><a href="#code-eslint-color-selectors">3</a></sup>

That change also exposed an ESLint flat-config gotcha. Rule options do not merge across matching config blocks; they replace. If I exempt `tones.ts` from the raw-hex ban, I cannot just “remove the color selector.” I have to restate every other restricted-syntax selector that should still apply there. The config now keeps selector groups in arrays so exemptions can deliberately re-list the bans they keep. That is less elegant than a magical merge, but it is honest. The exception is narrow, and the rest of the rails stay live.<sup><a href="#code-eslint-exemptions">4</a></sup>

[PR #89](https://github.com/StorminRH/lgi-tools/pull/89) added two more source-shape rails: typed API calls and typed environment reads. A literal `fetch('/api/...')` in client code bypasses the shared endpoint contracts, so ESLint rejects that shape and points the caller to `apiFetch`. The helper takes an endpoint object from the owning slice’s `api-contract.ts`, sends the same wire bytes the old call would have sent, and returns the contract’s response type. The lint rule is intentionally syntactic. It catches the common bad path, not every possible way to hide an API URL in a variable. The route-side contract test and TypeScript do the deeper drift work.<sup><a href="#code-eslint-api-fetch-selectors">5</a></sup><sup><a href="#code-eslint-api-client">6</a></sup>

The environment rule has the same shape. Server code reads environment variables through `readEnv` or `requireEnv`, not raw `process.env`, because the registry documents every server variable and validates lazily on access. Laziness is the important part. Importing a module should not explode because an environment variable is missing in a context that never calls the code path. `NODE_ENV` and `NEXT_PUBLIC_*` are intentionally exempt because bundlers and Next.js need those literal reads. Tests are exempt because they stub process env directly.<sup><a href="#code-eslint-env-selectors">7</a></sup><sup><a href="#code-eslint-env-registry">8</a></sup>

The ESI host ban came from the same lesson as the ESI gate. After [PR #91](https://github.com/StorminRH/lgi-tools/pull/91) moved ESI access out of the market-prices slice and into shared infrastructure, it was not enough to ask future code to use the gate. A single hand-written `esi.evetech.net` URL would bypass the shared User-Agent posture, compatibility date, timeout, conditional headers, and budget scoreboard. ESLint now rejects that host literal outside the gate itself and test files. The rule is scoped to ESI’s API host, not the EVE image server, because portraits and item icons are a different service.<sup><a href="#code-eslint-esi-selectors">9</a></sup>

The exceptions are deliberately visible. `src/lib/esi` is the only sanctioned home for the ESI API host literal. `tones.ts` is the sanctioned home for raw color literals. Dev and preview sandboxes may try off-palette colors, but they still keep the CSP, API, env, and ESI bans. Tests can stub env and mock ESI URLs. Those exceptions are not loopholes hidden in review culture; they are encoded in the config, and each one keeps the other rails active.<sup><a href="#code-eslint-exemptions">4</a></sup>

The API-contract convention test is the sibling to the raw-fetch ban. ESLint catches client code that reaches around `apiFetch`; the test catches route files that forget to import their owning contract at all. It only checks presence. The actual safety comes from route payloads using `satisfies`, clients using `apiFetch`, and `pnpm typecheck` seeing both sides. This is the pattern I like: one small mechanical assertion forces the right shape, and the type system does the precise work after that.<sup><a href="#code-eslint-api-contract-test">10</a></sup>

The rail only matters because it runs everywhere. `pnpm lint` is part of the local `verify` command and the GitHub Actions test workflow. That makes ESLint part of the same definition of done as typecheck, tests, route presence, and Fallow. If an AI agent adds a raw API fetch, a direct server env read, a hardcoded ESI URL, a raw HTML sink, or a new call-site hex color, the failure shows up before merge.<sup><a href="#code-eslint-package-ci">11</a></sup><sup><a href="#code-eslint-workflow">12</a></sup>

The lesson here is restraint. ESLint is not the place to encode every preference or every architectural judgment. Overusing it would make the repo harder to work in and teach agents to fight the tooling. The rules that stay here are the ones that are syntactic, explainable, cheap, and tied to a real mistake: no raw HTML sinks, no inline-style escape hatch, no call-site hex colors, no raw own-API fetches, no direct server env reads, and no ESI host outside the shared gate.

That is the standard I want for rails in an AI-built codebase. Do not make a rule because it sounds strict. Make a rule because the repo already learned what happens without it.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-eslint-unused-vars" file="eslint.config.mjs" lines="119-144" lang="js" -->
```js
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Recognize the leading-underscore convention as "intentionally unused".
  // Lets handlers declare framework-required parameters they don't read
  // (e.g. NextRequest in a GET that only redirects) and lets destructuring
  // peel fields off with `{ waveId: _waveId, ...rest }` without warnings.
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
```

<!-- uth:code id="code-eslint-csp-selectors" file="eslint.config.mjs" lines="7-29" lang="js" -->
```js
const cspSelectors = [
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      "No inline `style` attributes — house style. Prefer Tailwind classes for static values, or a CSS custom property set via ref.style.setProperty in an effect for runtime-dynamic ones (inline styles are CSP-permitted but not the default). See CONTRIBUTING.md (Security & CSP).",
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
      "No `dangerouslySetInnerHTML` — the production CSP allows `'unsafe-inline'` scripts, so an unescaped HTML sink becomes an XSS vector. Render text through JSX (auto-escaped) instead. See CONTRIBUTING.md (Security & CSP).",
  },
  {
    selector:
      "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]",
    message:
      "No raw `innerHTML`/`outerHTML` writes — same XSS risk as dangerouslySetInnerHTML under the `'unsafe-inline'` CSP. Use safe DOM APIs (textContent, createElement) instead. See CONTRIBUTING.md (Security & CSP).",
  },
];
```

<!-- uth:code id="code-eslint-color-selectors" file="eslint.config.mjs" lines="31-57" lang="js" -->
```js
const hexColorSelectors = [
  {
    selector: "Literal[value=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values — route the color through a token (a `--color-*` in globals.css `@theme`, surfaced as `bg-…`/`text-…`/`border-…`/`fill-…`) or tones.ts. See CONTRIBUTING.md (Color tokens).",
  },
  {
    selector: "TemplateElement[value.raw=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values (template literal) — route the color through a `--color-*` token (globals.css `@theme`) or tones.ts. See CONTRIBUTING.md (Color tokens).",
  },
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message:
      "No raw hex color constants — SVG fills/strokes read from tones.ts (toneHex) or a Tailwind `fill-…`/`stroke-…` utility backed by a `--color-*` token. See CONTRIBUTING.md (Color tokens).",
  },
];
```

<!-- uth:code id="code-eslint-exemptions" file="eslint.config.mjs" lines="187-232" lang="js" -->
```js
// The ESI gate slice is the sanctioned home for the ESI host literal — the
// whole point of the ban is to funnel consumers here. Re-state every other
// ban without the host selectors (replace semantics).
{
  files: ["src/lib/esi/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
    ],
  },
},
// tones.ts is the sanctioned home for raw color literals — `toneHex` is the
// JS source for SVG fills. Re-state every other ban without the hex selectors
// so only the color rule is lifted here (replace semantics).
{
  files: ["src/components/ui/tones.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
      ...esiHostSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-fetch-selectors" file="eslint.config.mjs" lines="59-78,145-167" lang="js" -->
```js
const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-client" file="src/lib/api-client.ts" lines="16-30,35-71" lang="ts" -->
```ts
export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  request: z.ZodType<unknown, TIn> | null;
  response: z.ZodType<TData> | null;
}

export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown>,
  init: CallInit & { body?: unknown } = {},
): Promise<ApiResult<unknown>> {
  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-eslint-env-selectors" file="eslint.config.mjs" lines="102-117,168-186" lang="js" -->
```js
const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["src/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}", "src/lib/env.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
      ...esiHostSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-env-registry" file="src/lib/env.ts" lines="29-41,43-63,70-87" lang="ts" -->
```ts
const REQUIRED_ENV = {
  DATABASE_URL: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  CRON_SECRET: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

const VERBATIM_ENV = {
  DATABASE_URL_UNPOOLED: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
} as const;

export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
```

<!-- uth:code id="code-eslint-esi-selectors" file="eslint.config.mjs" lines="80-100,187-202" lang="js" -->
```js
const esiHostSelectors = [
  {
    selector: String.raw`Literal[value=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs (template literal) — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["src/lib/esi/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-14,48-62" lang="ts" -->
```ts
// Mechanical API-contract guard (3.4.T) — the sibling of authz-markers.test.ts.
// Every route handler under src/app/api must import from its owning slice's
// api-contract module, where its request schema and response types live, so the
// route and its clients share one wire shape.

describe('api contract imports', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s imports from its slice\'s api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module.`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-eslint-package-ci" file="package.json" lines="21-28,43-48" lang="json" -->
```json
{
  "build": "next build",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "assert:routes": "node scripts/assert-route-classification.mjs",
  "assert:routes-present": "node scripts/assert-routes-present.mjs",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```

<!-- uth:code id="code-eslint-workflow" file=".github/workflows/test.yml" lines="32-41,51-67" lang="yaml" -->
```yaml
- run: pnpm typecheck

- run: pnpm lint

# Lightweight presence gate (no build): every src/app route is classified
# in route-classification.json and vice-versa.
- run: pnpm assert:routes-present

- run: pnpm test:coverage

# fallow audit is the static gate of record (dead code, duplication,
# complexity, architecture boundaries), scoped to the PR diff with
# new-only attribution.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```
<!-- uth:code-excerpts:end -->

## Fallow

ESLint catches sharp edges while I am working. TypeScript catches type mistakes. Tests catch behavior I remembered to pin down.

Fallow sits in a different category. It is not about one line of code being invalid. It is about whether the repo is quietly getting harder to reason about: unused files, dead exports, duplicated helpers, dependency drift, cross-slice imports, and functions that grow complex enough that future changes become risky. Those are the kinds of problems that do not always break the app today. They break the next session.

That matters more in an AI-built codebase than I expected. AI is very good at adding code. It is less naturally good at removing the right code, noticing when an export is no longer used, or understanding that a convenient import crossed an architectural boundary. A human can feel that a repo is getting heavier. An agent usually needs a measurable signal. Fallow gives the project that signal.

The easiest way to think about it is this: Fallow is the repo-scale reviewer that asks, “Did this change leave the codebase in a shape that the next change can safely build on?” It is not judging product behavior. It is judging structural health.

The first version of this idea was less clean. Earlier in the project, I had boundary rules living in ESLint and dead-code checks living elsewhere. That split worked for simple cases, but it was not the right long-term division of labor. ESLint is best when the rule can be enforced at the syntax level: do not use raw colors, do not call `fetch('/api/...')` directly, do not bypass the ESI gate, do not read `process.env` outside the env registry. Fallow is better for graph-shaped questions: what imports what, what is unused, what duplicated, what got more complex, and what changed compared with the base branch.

[PR #116](https://github.com/StorminRH/lgi-tools/pull/116) made that split explicit. The old dead-code-only gate was replaced with `fallow audit`, and the broader architecture-boundary lint plugin stopped being the place for repo-graph policy. That was not just a tool swap. It was a correction in how I wanted rails to work. Fast syntax checks stay in ESLint. Repo structure belongs in the tool that can see the repo as a graph.<sup><a href="#code-fallow-package">1</a></sup>

Fallow now runs as part of `pnpm verify`, and CI runs it after coverage. That order matters. Coverage data gives Fallow more context about what code was actually exercised, while `FALLOW_AUDIT_BASE` pins the comparison to the merge base so the audit can focus on what the current branch introduced. I do not want every branch blocked by every old wart in the repo. I want new work to stop making the repo worse.<sup><a href="#code-fallow-package">1</a></sup><sup><a href="#code-fallow-ci">2</a></sup>

The configuration starts with entries and ignores. That sounds dull, but it is one of the places these tools can lie if they are not tuned. Generated files, build output, framework artifacts, documentation, and screenshots should not be treated like app source. The entry list tells Fallow what the real graph is supposed to be: app routes, scripts, tests, Convex functions, and the code paths that actually ship. Without that, an audit can become noisy enough that people stop respecting it.<sup><a href="#code-fallow-entry-rules">3</a></sup>

The rule levels are intentionally uneven. Some findings fail the build: unused files, unused exports, unused dependencies, unlisted dependencies, and boundary violations. Those are concrete enough that I want the branch stopped. Other findings are warnings: circular dependencies, unresolved imports, duplicate exports, and a few lower-confidence signals. That restraint is important. A rail that blocks too much becomes a wall people look for ways around. A rail that blocks the right things becomes part of the workflow.<sup><a href="#code-fallow-entry-rules">3</a></sup>

Complexity is where I had to be careful. It is easy to say “no complex functions” and create a rule that looks virtuous but fights the shape of real UI and route code. The repo sets cyclomatic, cognitive, and CRAP thresholds, but it also records narrow overrides where coverage is the wrong signal for a surface. Those overrides are not meant to be loopholes. They are notes to future-me and future agents: this is an acknowledged edge case, not an accidental blind spot.<sup><a href="#code-fallow-health-overrides">4</a></sup>

Duplication gets the same treatment. Some duplication is a mistake. Some is a deliberate seam. The audit blocks new duplicate code aggressively, but it carries a baseline ledger for existing sanctioned clones. That lets the tool distinguish “this was already accepted” from “this branch copied another helper instead of extracting the right boundary.” In an AI workflow, that distinction matters because copied code is one of the easiest ways for an agent to appear productive while making the repo harder to maintain.<sup><a href="#code-fallow-duplicates">5</a></sup><sup><a href="#code-fallow-dup-baseline">6</a></sup>

The architecture boundaries are the part that most directly protects the shape of LGI.tools. The repo is split into zones: auth surface, UI, features, data, lib, and shared code. Fallow encodes which directions are allowed. Feature code can depend on its own slice and sanctioned shared layers. Data slices should not reach back into feature UI. Shared code should stay boring. The few exceptions are written down, like the NPC stats dependency on the EVE data slice. That is the standard I want: if the exception is real, name it; do not let it appear as an accidental import.<sup><a href="#code-fallow-boundaries">7</a></sup>

Fallow is doing for the codebase what the ESI gate does for outbound API calls. The ESI gate protects a shared external budget. Fallow protects a shared internal budget: review attention, maintainability, architectural clarity, and future change capacity. Neither one makes the app more exciting on its own. Both keep the app from quietly spending something important.

The lesson from adding Fallow was not “more tools are better.” The lesson was that each rail needs the right job. TypeScript handles types. ESLint handles local syntax-level bans. Tests handle behavior. Route assertions handle rendering mode. Greptile reviews the diff after the fact. Fallow watches the repo’s structure so AI-generated code cannot keep adding weight without leaving evidence.

That is the part I care about most: evidence. I do not need a model to guess whether the branch made the repo messier. I need a repeatable audit that can say what changed, what became unused, what crossed a boundary, what duplicated, and what got more complex. Once that evidence exists, I can direct the AI with much better instructions. Without it, I am just asking the same kind of system that created the mess to notice the mess by feel.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-fallow-package" file="package.json" lines="43-48" lang="json" -->
```json
{
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "fallow:health": "fallow health --coverage coverage/coverage-final.json",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```

<!-- uth:code id="code-fallow-ci" file=".github/workflows/test.yml" lines="42-69" lang="yaml" -->
```yaml
# Run the suite WITH coverage so the fallow audit below reads real
# per-function coverage (coverage/coverage-final.json, which fallow
# auto-detects). Without it the audit falls back to a static estimate
# whose new-only attribution can misflag PRE-EXISTING complexity and
# cross-file duplication as "introduced" the moment a PR pulls an already-
# complex/duplicated file into its diff — which a cross-cutting refactor
# inevitably does. Real coverage makes the inherited-vs-introduced call
# accurate, matching what `pnpm test:coverage && pnpm fallow` does locally.
- run: pnpm test:coverage

# fallow audit is the static gate of record (dead code, duplication,
# complexity, architecture boundaries), scoped to the PR diff with
# new-only attribution. FALLOW_AUDIT_BASE pins the base so detection is
# robust on the merge-commit checkout; a main push falls back to the
# commit before the push. fallow is a static analyzer (no DB needed); it
# consumes the coverage emitted by the step above.
#
# The `pnpm fallow` script carries `--fail-on-issues`, so the gate now
# fails on ANY finding the changeset INTRODUCES — duplication included
# (previously warn-only) alongside the warn-level rules (circular deps,
# unresolved imports, etc.). Inherited findings stay excluded by the
# new-only attribution, so a PR is only blocked by problems it adds, not
# by pre-existing ones it happens to touch. Sanctioned existing clones live
# in fallow-baselines/dupes.json.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```

<!-- uth:code id="code-fallow-entry-rules" file=".fallowrc.json" lines="8-52" lang="json" -->
```json
{
  "ignoreExportsUsedInFile": true,
  "entry": [
    "src/db/migrate.ts",
    "src/db/backfill-users-if-empty.ts",
    "src/db/ingest-sde-if-empty.ts",
    "src/db/ingest-sde.ts",
    "src/db/refresh-prices.ts",
    "src/db/refresh-sde.ts",
    "scripts/validate-resolver-output.ts",
    "scripts/assert-route-classification.mjs",
    "scripts/ux-capture.mjs",
    "drizzle.config.ts"
  ],
  "ignorePatterns": [
    "convex/_generated/**",
    ".next/**",
    "out/**",
    "build/**",
    "**/*.d.ts",
    "next-env.d.ts",
    "**/*.generated.ts",
    "drizzle/**",
    "docs/**",
    "convex/**/*.test.ts"
  ],
  "rules": {
    "unused-files": "error",
    "unused-exports": "error",
    "unused-types": "off",
    "unused-dependencies": "error",
    "unlisted-dependencies": "error",
    "unused-enum-members": "warn",
    "unused-class-members": "warn",
    "unresolved-imports": "warn",
    "duplicate-exports": "warn",
    "circular-dependencies": "warn",
    "re-export-cycle": "warn",
    "boundary-violation": "error",
    "coverage-gaps": "off",
    "stale-suppressions": "warn",
    "feature-flags": "off"
  }
}
```

<!-- uth:code id="code-fallow-health-overrides" file=".fallowrc.json" lines="54-116" lang="json" -->
```json
{
  "health": {
    "maxCyclomatic": 20,
    "maxCognitive": 15,
    "maxCrap": 30.0,
    "thresholdOverrides": [
      {
        "files": ["src/**/*.tsx"],
        "maxCrap": 9999,
        "reason": "intentional-policy: presentational components are covered by visual/preview review, not unit tests. CRAP's coverage weighting flags every untested component — a coverage expectation the repo has declined for this surface. Cyclomatic + cognitive stay universal, so a genuinely tangled component still fails."
      },
      {
        "files": ["src/db/**", "scripts/**"],
        "maxCrap": 9999,
        "maxCognitive": 20,
        "reason": "intentional-policy: deploy/CLI entry scripts (the `entry` set in this config). They run at build/deploy, gated by assert:routes, the migrations, and the SDE-pipeline tests — not unit coverage."
      },
      {
        "files": ["src/app/**/route.ts", "src/proxy.ts"],
        "maxCrap": 9999,
        "maxCognitive": 18,
        "reason": "framework-convention: Next.js route handlers + middleware are a sequence of boundary guard clauses (parse -> Zod -> auth -> rate-limit -> dispatch); validation-at-the-boundary is an architecture invariant."
      },
      {
        "files": ["src/**/queries.ts"],
        "maxCrap": 9999,
        "reason": "intentional-policy: DB-bound data accessors. They build/run SQL against already-typed inputs and are verified via the consuming routes/pages and integration, not unit coverage."
      }
    ]
  }
}
```

<!-- uth:code id="code-fallow-duplicates" file=".fallowrc.json" lines="118-164" lang="json" -->
```json
{
  "duplicates": {
    "mode": "mild",
    "minTokens": 50,
    "minLines": 5,
    "minOccurrences": 2,
    "threshold": 0,
    "ignoreDefaults": true,
    "ignore": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "convex/_generated/**",
      "drizzle/**"
    ]
  },
  "audit": {
    "gate": "new-only",
    "dupesBaseline": "fallow-baselines/dupes.json"
  }
}
```

<!-- uth:code id="code-fallow-dup-baseline" file="fallow-baselines/dupes.json" lines="3-39" lang="json" -->
```json
{
  "clone_groups": [
    "src/app/api/cron/refresh-gsc/route.ts:27-57|src/app/api/cron/refresh-industry-indices/route.ts:33-53",
    "src/app/api/market-history/refresh/route.ts:53-65|src/app/api/market-prices/refresh/route.ts:52-67",
    "src/components/ui/bar-chart.tsx:98-128|src/components/ui/trend-chart.tsx:121-151",
    "src/data/market-prices/use-refresh-on-view.ts:116-125|src/features/industry-planner/queries.ts:181-190",
    "src/db/backfill-users-if-empty.ts:115-132|src/db/ingest-sde-if-empty.ts:152-169|src/db/refresh-sde.ts:67-82",
    "src/db/industry-jobs-sync.ts:71-79|src/db/skills-sync.ts:73-81",
    "src/features/owned-assets/refresh.ts:33-37|src/features/owned-blueprints/refresh.ts:35-39"
  ]
}
```

<!-- uth:code id="code-fallow-boundaries" file=".fallowrc.json" lines="133-158" lang="json" -->
```json
{
  "boundaries": {
    "zones": [
      {
        "// note": "First-match-wins: auth-surface is listed BEFORE the features autoDiscover zone so these 3 files classify here, not into features/auth.",
        "name": "auth-surface",
        "patterns": [
          "src/features/auth/types.ts",
          "src/features/auth/schema.ts",
          "src/features/auth/api-contract.ts"
        ]
      },
      { "name": "ui", "patterns": ["src/components/ui/**"] },
      { "name": "features", "autoDiscover": ["src/features"] },
      { "name": "data", "autoDiscover": ["src/data"] },
      { "name": "lib", "patterns": ["src/lib/**"] },
      { "name": "shared", "patterns": ["src/components/*.tsx", "src/components/telemetry/**"] }
    ],
    "rules": [
      { "from": "auth-surface", "allow": ["auth-surface", "lib"] },
      { "from": "features", "allow": ["ui", "data", "lib", "shared", "auth-surface"] },
      { "from": "data", "allow": ["lib", "auth-surface"] },
      { "from": "data/npc-stats", "allow": ["lib", "auth-surface", "data/eve-data"] },
      { "from": "lib", "allow": ["lib"] },
      { "from": "ui", "allow": ["lib"] },
      { "from": "shared", "allow": ["ui", "lib", "data", "features", "auth-surface"] }
    ]
  }
}
```
<!-- uth:code-excerpts:end -->

## Greptile

Greptile is the rail that made me most uncomfortable at first.

That is probably the right place to start, because “AI reviewing AI-written code” can sound like I am just asking one model to bless another model’s work. If that were the whole process, I would not trust it. A second AI opinion is not a substitute for architecture, tests, type checks, lint rules, route assertions, or my own review.

The reason Greptile became useful is that it sits at a different point in the workflow.

By the time a pull request reaches Greptile, the repo has already run the deterministic checks: TypeScript, ESLint, tests, route assertions, coverage, and Fallow. Those rails answer questions the repo can state clearly. Does the code typecheck? Did a route drift rendering mode? Did a file cross an import boundary? Did the branch add dead code? Did a test fail?

Greptile answers a different kind of question: “Looking at this pull request as a reviewer, what did the implementation miss?”

That matters in an AI-built repo because the implementation agent is usually very focused on satisfying the prompt. It can follow instructions, make broad changes, and keep the local tests green. But it can also inherit blind spots from the prompt. If I forgot to mention a race condition, a stale data path, or an implicit security assumption, the implementation agent may never go looking for it. Greptile gives the branch another reader after the work is done.

I do not treat that reader as authority. I treat it as pressure.

That distinction is the whole point of the rail. A Greptile comment can send a branch back into code. A clean review can increase confidence. But it does not replace `pnpm verify`, CI, build assertions, route classification, or my own decision about whether the architecture still makes sense. Greptile is the last AI rail, not the final judge.

The best reviews it has given me were not broad style comments. They were specific places where the diff looked correct at first glance but had a hidden assumption.

[PR #169](https://github.com/StorminRH/lgi-tools/pull/169) is a good example. That work stopped re-sending full character data through the live layer on every refresh. The direction was right. The review caught a stale-data bug in the corporation jobs path: a state marked as needing a role could still carry old cold payload data, which meant the UI could keep rendering jobs for a corporation user who no longer had access. The fix was not philosophical. It was concrete: do not let a denied or role-missing state keep old data attached.<sup><a href="#code-greptile-pr169">1</a></sup>

[PR #178](https://github.com/StorminRH/lgi-tools/pull/178) had a different shape. The feature brought corporation structures into the Industry Planner, behind a consent gate. The review found that the corp-structure rig route was missing the same server-side rig-type validation the custom-structure route already had. Without that, a bad rig could be saved and silently produce no bonus. That is exactly the kind of bug that can hide in a large feature: one path has the right rule, the sibling path almost matches it, and the mismatch is easy to miss because the UI looks fine.<sup><a href="#code-greptile-pr178">2</a></sup>

[PR #180](https://github.com/StorminRH/lgi-tools/pull/180) was more serious. The account-deletion work had to remove user data across several stores. The review called out a time-of-check/time-of-use gap: a user could link a new character while the account purge was already running. If the purge only used the initial character snapshot, the later account deletion could remove the account row while leaving newly linked per-character cached data behind. The fix was to re-enumerate characters in a loop before deleting the user, so the purge catches characters that appear during the deletion window.<sup><a href="#code-greptile-pr180-toctou">3</a></sup>

That same PR also exposed an implicit precondition. One helper assumed `runPurge` had already deleted the credential-tier account row before reconciliation ran. That was true in the current call path, but it was not obvious from the helper itself. Greptile’s value there was not that it discovered a catastrophic bug. It made the assumption visible enough to encode and explain, which matters because future AI sessions may reuse helpers without remembering the original call order.<sup><a href="#code-greptile-pr180-precondition">4</a></sup>

[PR #179](https://github.com/StorminRH/lgi-tools/pull/179) shows the smaller version of the same benefit. That PR made every player-data store declare how it gets purged. The review pointed out an unnecessary `.returning()` result and a misleading import/header comment in the purge contributor registry. Those are small issues, but in this repo small context errors matter. A stale comment or slightly misleading registry surface becomes training data for the next coding session. Cleaning that up is not busywork when the next agent will read the same code for direction.<sup><a href="#code-greptile-pr179-small">5</a></sup>

That is the pattern I care about. Greptile is most useful when it finds one of four things: a security or authorization gap, a stale-data path, an unspoken precondition, or a context mismatch that could mislead future work. Those are the review categories that complement the deterministic rails. TypeScript can tell me two shapes disagree. Fallow can tell me an import crossed a boundary. Greptile can sometimes tell me, “This branch satisfied the stated task, but it left a dangerous interpretation behind.”

There is still a judgment problem. Not every AI review comment is right. Some comments are too cautious, some are shallow, and some misunderstand project-specific intent. I do not want to obey them automatically. The workflow I want is closer to how I treat a human reviewer: read the comment, decide whether it is grounded in the code, fix it if it is real, and leave the branch alone if it is not.<sup><a href="#code-greptile-check-pr-doc">6</a></sup>

That is also why Greptile belongs at the end instead of the beginning. If I used it before the repo-owned rails, it would become noise. The model would be reviewing code that might not typecheck, might not pass tests, and might not respect known boundaries. By running it after the deterministic checks, I make its job narrower: look for what the rules did not already catch.<sup><a href="#code-greptile-loop-doc">7</a></sup>

The bigger lesson is that AI review is only useful when the repo already knows a lot about itself. Without TypeScript, ESLint, tests, route assertions, Fallow, and code-owned architecture boundaries, Greptile would have to judge everything. I do not want that. I want it looking for the leftover human-shaped questions: what assumption did the prompt miss, what path did the implementation forget, what stale state can survive, what security check exists in one sibling route but not another?

So Greptile is not where I outsource trust. It is where I add one more kind of friction before merge. In a project built with AI, that friction is valuable. The goal is not to make every PR feel clean faster. The goal is to make the branch argue its way through enough different kinds of review that the remaining mistakes are harder to hide.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-greptile-check-pr-doc" file="greptileai/skills/check-pr/SKILL.md" lines="75-85,145-156" lang="md" -->
```md
## Fetch PR/MR/CL details

GitHub:
- gh pr view <PR_NUMBER> --json title,body,state,reviews,comments,headRefName,statusCheckRollup
- gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments
- gh api --paginate "repos/{owner}/{repo}/issues/<PR_NUMBER>/comments?per_page=100"

GitHub PRs are also issues, so general PR comments live on the issue comments endpoint. Greptile may edit a single general PR comment on each review cycle instead of creating a new review or comment. Always inspect the latest Greptile-authored general comment by updated_at.

Review comments:
- Inline code review comments that need addressing
- Bot review comments, for example greptile-apps[bot]
- Human reviewer comments

General comments:
- For GitHub, check the issue comments endpoint and use updated_at to catch bot comments edited in place.
```

<!-- uth:code id="code-greptile-loop-doc" file="greptileai/skills/greploop/SKILL.md" lines="78-90,103-147,204-220,77-91" lang="md" -->
```md
## Loop

Repeat the following cycle. Max 5 iterations to avoid runaway loops.

A. Trigger Greptile review
- Push the latest changes.
- If Greptile is not already running, request a fresh review with: @greptile review.
- Poll for the Greptile check run to complete.

B. Fetch Greptile review results
Greptile may surface its score in several places. Check all relevant sources:
- PR description
- General PR comments
- PR reviews

Filter for Greptile-authored comments and use the body from the most recently updated comment, not the most recently created comment.

Exit conditions:
- Confidence score is 5/5 and there are zero unresolved comments
- Max iterations reached

For each unresolved Greptile comment:
- Read the file and understand the comment in context.
- Determine if it is actionable or informational.
- If actionable, make the fix.
- If informational or a false positive, note it but still resolve the thread.
```

<!-- uth:code id="code-greptile-pr169" file="GitHub PR #169 review thread" lines="convex/corpIndustryJobs.ts:238" lang="md" -->
```md
P1 security — Needs-Role Keeps Stale Payload

When a corp has synced successfully before and a later run returns `needs_role`, `result.jobs` is `null`, so this branch leaves the existing `corpIndustryJobsSyncData` row in place. The hot row now says access failed, but the cold `forViewer` query still returns the old board and the client merge shows stale corp jobs for a corp the user can no longer read.
```

<!-- uth:code id="code-greptile-pr178" file="GitHub PR #178 review thread" lines="src/app/api/account/corp-structures/rigs/route.ts:30-33" lang="md" -->
```md
P2 — Missing server-side rig-type validation

The `rigTypeIds` sent to this endpoint are written directly to the DB without verifying that they are real industry rigs that fit the corp structure's type. The custom-structures route calls `validateCustomStructureSelection`, but the corp equivalent performs no such check. Supplying an unknown or wrong-slot rig ID produces an empty dogma entry at read time, silently contributing zero bonus instead of the expected one.
```

<!-- uth:code id="code-greptile-pr180-toctou" file="GitHub PR #180 review thread" lines="src/features/auth/queries.ts:750-759" lang="md" -->
```md
P2 — TOCTOU gap: concurrently-linked character escapes the nuke

`nukeAccount` snapshots the linked-character list once at the top, then iterates. If a concurrent request links a new character after that query but before `db.delete(user)`, the new character's `account` row is cascade-deleted by the user-row drop, but per-character cached rows keyed on `characterId` can survive as unowned orphans.

A re-query of remaining linked characters immediately before deleting the user, combined with a per-character purge for any newcomers, closes the window.
```

<!-- uth:code id="code-greptile-pr180-precondition" file="GitHub PR #180 review thread" lines="src/features/auth/queries.ts:731-737" lang="md" -->
```md
P2 — `reconcileAfterCharacterRemoval` relies implicitly on `runPurge` having already deleted the account row

The function queries surviving linked accounts and expects the removed character's account row to be gone already. If a future caller invokes it before the credential purge, the character being removed can still appear in `remaining`, causing account cleanup to report the wrong state.

Worth a brief precondition note in the function's comment to keep this contract visible.
```

<!-- uth:code id="code-greptile-pr179-small" file="GitHub PR #179 review threads" lines="src/features/auth/purge.ts:44, src/purge/register-all.ts:8-10" lang="md" -->
```md
P2 — The `.returning({ id: account.id })` result is awaited but never captured or checked. The semantic is not needed here, so the clause can be dropped to avoid the unnecessary round-trip of deleted row IDs from the database.

P2 — The file header says contributors are listed in tier order, but the imports open with a durable contributor followed by a credential contributor. The `PURGE_CONTRIBUTORS` array is correctly ordered; the comment is misleading relative to the import order.
```
<!-- uth:code-excerpts:end -->

# Lessons

## The Scaling Audit

The scaling audit changed how I think about the whole project.

Before that audit, I had a simple mental model: if one user consumes some percentage of a free tier, more users consume that percentage multiplied by user count. That sounds reasonable. It is also not how this app actually scales.

The better model is axes: fixed work, per-request work, per-visible-tab work, per-character work, per-corporation work, per-ESI-call work, and per-reactive-write fan-out. A feature can be cheap on one axis and expensive on another. A page can look static while waking the database. A background job can be harmless when it succeeds and dangerous when its cleanup path leaks a lock. A live subscription can be fine for a tiny boolean and wrong for a large board.

The first scaling decision was regional, not algorithmic. In [PR #65](https://github.com/StorminRH/lgi-tools/pull/65), I measured the live-price path and decided not to move it to the edge. The price path talks to Neon, the shared cache, ESI, and sometimes Fuzzwork. Running compute close to the user would shorten only one hop while lengthening the internal hops back to the database and splitting the per-region cache. The repo now pins Vercel compute to `iad1`, where the database lives, instead of letting that stay accidental.<sup><a href="#code-scaling-vercel-region">1</a></sup>

That is a pattern I kept coming back to: measure the actual bottleneck before moving the architecture. “Edge” sounded faster. For this app, the database-adjacent regional function was the safer default.

The next lesson came from deploys. Neon scaling to zero is a cost win, but it introduced a build-time failure mode. Static prerender can be the first thing to read from the database after the compute has gone idle, and a failed prerender is not retried by the platform. In [PR #99](https://github.com/StorminRH/lgi-tools/pull/99), I added a retry wrapper around only the prerender-reachable cached reads. It retries connection-class cold-start errors, not SQL errors, and it rethrows on exhaustion instead of returning an empty result that could be cached into a long-lived static page.<sup><a href="#code-scaling-cold-start">2</a></sup>

That distinction matters. A scaling fix that hides real data errors is worse than the intermittent failure it replaces. The rail became: recover from infrastructure wake-up, but never turn “could not read” into “empty data.”

The same audit put explicit ceilings on long-running routes. A route that normally finishes in seconds but inherits a 300-second platform default can hang too long before failing. The live market-price refresh now carries a `maxDuration` sized from observed worst cases: up to 50 type IDs, per-type ESI concurrency, 10-second outbound timeouts, and fallback. This is not about making the route faster. It is about making failure bounded.<sup><a href="#code-scaling-route-runtime">3</a></sup>

Convex required a different kind of correction. The early live trackers made me think in terms of function calls. The scaling audit made me think in terms of reactive reads and write fan-out. A heartbeat, a run-state update, or an ETag stamp can be small as a write but expensive if it causes every subscribed client to re-read a heavy payload. That is why the Convex engine notes now spell out the fixed idle floor, per-visible-tab heartbeat cost, Workpool overhead, and the fact that skills/jobs/corp jobs moved out of the live watcher cost model entirely.<sup><a href="#code-scaling-convex-cost-model">4</a></sup>

The correction was not “Convex is bad.” The correction was “Convex is sharp.” Online status is a good live Convex consumer because it is tiny and genuinely live. Skills and job boards are not, because their user-visible movement is mostly timestamp-derived and their upstream data is cached. The live trackers section covers the migration; the scaling lesson is broader: a live backend should not be the default home for every animated UI.

PR #170 added another Convex rail: cap the amount of live-sync work any one scan or sweep can read. The scan is oldest-due-first and drains backlog over later runs. That means a large backlog becomes latency, not a per-mutation read-limit incident. The code calls out the Convex index-read ceiling directly and sets the batch to 1024, far above normal load but below the danger zone.<sup><a href="#code-scaling-bounded-scan">5</a></sup>

The idle-cost audit also caught a quieter problem. The sync sweeper ran every 15 minutes and wrote a telemetry row every time, even when it had nothing to do. On an idle deployment, that one insert was enough to wake Neon and keep it from suspending. [PR #159](https://github.com/StorminRH/lgi-tools/pull/159) changed the rule: always log to runtime logs so I can tell the cron fired, but write durable telemetry only when the sweep is noteworthy — a failure or a re-arm.<sup><a href="#code-scaling-idle-sweeper">6</a></sup>

That was a humbling lesson. Observability is not free just because the row is small. A write has a wake-up cost in a scale-to-zero architecture.

The ESI gate had its own scaling correction. In [PR #102](https://github.com/StorminRH/lgi-tools/pull/102), a body-cache optimization became a response-consumption bug. The gate was trying to decide whether a response was small enough to cache by cloning and reading it. On streamed responses without `Content-Length`, that could interfere with the caller reading the body. The fix was to cache only fixed-length responses under the cap and never read an unknown-size body in the gate. Later verification showed the cache still helps for small per-type responses, but the rule is explicit now: if the gate cannot size the body without reading it, it leaves the body alone.<sup><a href="#code-scaling-esi-body-cache">7</a></sup>

That is the same scaling theme again: the shared layer has to be conservative because every feature inherits its mistake.

The last scaling lesson was not about volume at all. It was cleanup ordering. The daily cron jobs use session advisory locks. If unlocking throws and the reserved connection is not released in an outer `finally`, the connection can stay abandoned with the lock held on its session. Later jobs see “busy” forever until the pool recycles that connection. [PR #150](https://github.com/StorminRH/lgi-tools/pull/150) fixed that by making connection release the outermost cleanup.<sup><a href="#code-scaling-cron-lock-release">8</a></sup>

That bug is a good reminder that scale failures are not always high-traffic failures. Sometimes they are one transient error in a cleanup path.

The audit changed the questions I ask before directing another AI coding session. I no longer ask only whether the feature works. I ask what it wakes up, what it writes, who is subscribed to that write, what gets re-read, what is fixed cost, what is per-visible-tab cost, what is per-character cost, and what happens when cleanup fails.

Scaling is not one big later problem. It is a set of placement decisions made early, often in code that looks too small to matter.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-scaling-vercel-region" file="vercel.json" lines="3-39" lang="json" -->
```json id="2ve9rm"
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
    { "path": "/api/cron/refresh-prices", "schedule": "30 11 * * *" },
    { "path": "/api/cron/refresh-industry-indices", "schedule": "40 11 * * *" },
    { "path": "/api/cron/refresh-sde", "schedule": "50 11 * * *" },
    { "path": "/api/cron/sync-sweeper", "schedule": "*/15 * * * *" }
  ]
}
```

<!-- uth:code id="code-scaling-cold-start" file="src/lib/neon-cold-start-retry.ts" lines="3-20,38-76" lang="ts" -->
```ts id="va9qmb"
// Retry wrapper for the prerender-reachable `'use cache'` DB reads. During
// `next build`, static prerender can hit a Neon compute that scaled to zero,
// and Vercel never retries a failed prerender: one connection-class error kills
// the whole deploy.
//
// Design constraints:
// - NEVER catch-and-return-empty — an empty result would be cached into the
//   long-lived `use cache` entries.
// - Retry ONLY the connection-class error signature of a cold start; SQL and
//   logic errors rethrow immediately.
export function isNeonColdStartError(err: unknown): boolean {
  let node: unknown = err;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && node instanceof Error; depth++) {
    if (node.name === 'NeonDbError') {
      const code = (node as { code?: unknown }).code;
      if (
        node.message.startsWith('Error connecting to database') ||
        /^Server error \(HTTP status 5\d\d\)/.test(node.message) ||
        (typeof code === 'string' && (code.startsWith('08') || code === '57P03'))
      ) return true;
    }
    node = (node as { cause?: unknown }).cause ?? (node as { sourceError?: unknown }).sourceError;
  }
  return false;
}

export async function withColdStartRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isNeonColdStartError(err)) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[neon-cold-start-retry] attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

<!-- uth:code id="code-scaling-route-runtime" file="src/app/api/market-prices/refresh/route.ts" lines="6-15" lang="ts" -->
```ts id="h1ha7y"
// Rate-limited per client IP. The threshold lives in
// src/data/market-prices/constants.ts so post-ship tuning is one config
// change, not a code edit.
// authz: public

// Worst honest case: 50 typeIds at per-type ESI concurrency 10 → up to 5
// sequential rounds of 10s-timeout fetches plus the Fuzzwork fallback
// (observed peak 38.8s). 60 covers that while bounding a hang at well under
// the 300s platform default.
export const maxDuration = 60;
```

<!-- uth:code id="code-scaling-convex-cost-model" file="convex/engine.ts" lines="26-52" lang="ts" -->
```ts id="bvx2sc"
// Cost model (Convex billing; every function execution bills as one call,
// component internals and reactive re-runs included.
// Idle floor ≈ 94k calls/mo with zero traffic: this 30s scan (86.4k), the
// 15-min Vercel sweep chain (HTTP action + sweep mutation, 5.8k), and the
// Workpool's own 30-min healthcheck cron (1.4k).
// Per visible tab: 3 heartbeats/min ≈ 180 calls/hr. Since 3.5.e1 each beat
// writes only the syncPresence row, so interval beats no longer re-run
// forViewer and no longer re-read the heavy tracker payload.
// Watched-hour ≈ 2.9k calls online status (60-run floor) — the SOLE live watcher now;
// skills/jobs/corp all moved to Neon stale-gated on-view reads in MIGRATE.B.
```

<!-- uth:code id="code-scaling-bounded-scan" file="convex/engine.ts" lines="32-62" lang="ts" -->
```ts id="7v2azw"
// The overdue/hot-set dispatch passes read at most this many subjects per run,
// oldest-first, so a large due or hot set can't approach Convex's ~4,096
// index-range-read per-mutation ceiling. A backlog drains over subsequent runs.
export const SCAN_DISPATCH_BATCH = 1024;

function dueSubjects(ctx: MutationCtx, now: number): Promise<Doc<'syncSubjects'>[]> {
  return ctx.db
    .query('syncSubjects')
    .withIndex('by_next_due', (q) => q.gt('nextDueAt', 0).lte('nextDueAt', now))
    .take(SCAN_DISPATCH_BATCH);
}
```

<!-- uth:code id="code-scaling-idle-sweeper" file="src/app/api/cron/sync-sweeper/noteworthy.ts" lines="5-18" lang="ts" -->
```ts id="ok63sz"
// The sweeper runs every 15 minutes as the sync engine's external watchdog. A
// healthy run is a no-op, and its only durable side effect used to be a telemetry
// INSERT — the sole thing waking Neon's compute on an idle system.
//
// Record a durable row only when the run is noteworthy: it had to re-arm an
// overdue subject or it failed outright. The healthy case still emits a runtime
// log line, so "did the cron fire" stays answerable without poking Neon.
export function isNoteworthySweep(summary: CronSyncSweeperResponse): boolean {
  return summary.status === 'failed' || (summary.dispatched ?? 0) > 0;
}
```

<!-- uth:code id="code-scaling-esi-body-cache" file="src/lib/esi/dispatch.ts" lines="9-45" lang="ts" -->
```ts id="v8ucsh"
// Capture the body for the shared ETag cache when it's worth storing — but only
// for a response that arrives with a fixed Content-Length at or under the cap.
//
// A no-Content-Length body can't be size-bounded without reading it, and reading
// it here via res.clone() is exactly what intermittently consumes the CALLER's
// body; not reading it leaves the caller's body untouched.
async function captureBodyForCache(res: Response): Promise<string | null> {
  const contentLength = parseIntHeader(res.headers, 'Content-Length');
  if (contentLength === null || contentLength > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  const text = await res.clone().text();
  if (new TextEncoder().encode(text).length > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  return text;
}
```

<!-- uth:code id="code-scaling-cron-lock-release" file="src/app/api/cron/refresh-sde/route.ts" lines="30-41" lang="ts" -->
```ts id="c1g2ti"
} finally {
  // Nest the unlock so reserved.release() is the OUTERMOST cleanup and always
  // runs — if the unlock query itself threw, skipping release() would leak the
  // connection AND leave the session-advisory lock held, wedging later runs.
  try {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
  } finally {
    reserved.release();
  }
}
```
<!-- uth:code-excerpts:end -->

## The Mapper

The mapper is the feature the architecture has been circling around, but it is not finished in this repo yet.

That distinction is important. LGI.tools has the foundation for a mapper: the full persistent universe in the SDE tables, wormhole class tags, static known-space jump graph, Convex live-sync lessons, a renderer spike, and route/lint/CSP rails. It does not yet have the production mapper data model, production collaborative routes, or a real shared wormhole-chain store.

That is the right state for it to be in. The mapper is not just another page.

Wormhole mapping is shared working state. Connections are discovered, named, rescanned, rolled, and deleted by people who are online together. A useful mapper has to represent topology, signatures, notes, connection state, mass/life hints, system attributes, and who is actively looking at the chain. Some of that data is EVE-derived. Some is user-authored. Some is corporation-private. Some is live collaboration. Treating all of it as “map data” would be the first mistake.

The first foundation landed in [PR #157](https://github.com/StorminRH/lgi-tools/pull/157): the SDE universe widened from known space into every persistent solar system, including J-space. The schema now stores wormhole class IDs on systems and a static stargate jump graph for known-space/Pochven routing. It explicitly does not try to store Anoik-style statics, effects, or richer wormhole attributes in that first table. Those belong in a later related layer, not mixed into the first-party CCP data.<sup><a href="#code-mapper-sde-foundation">1</a></sup>

That split matters because the mapper will combine different authorities. CCP’s SDE can say which solar systems exist and which known-space systems have gates. Other data can enrich wormhole systems with statics and effects. The user can add scanned connections. The corporation or group can add notes. The architecture needs to preserve those sources instead of flattening them into one blob.

The second foundation was not data. It was renderer evaluation. [PR #166](https://github.com/StorminRH/lgi-tools/pull/166) added `/dev/sandbox/mapper` as a throwaway spike using React Flow for a node graph and dnd-kit for signature reordering. The route is deliberately static, unlinked, hardcoded, and hidden from real product surfaces. That was not a small implementation detail; it was the whole point. I wanted to answer “does this renderer feel right and fit the CSP/style rules?” without also designing persistence, permissions, live sync, and map storage in the same session.<sup><a href="#code-mapper-route-static">2</a></sup><sup><a href="#code-mapper-sandbox-page">3</a></sup>

The React Flow half proved the graph interaction: draggable systems, handles, drawn connections, pan/zoom, controls, and minimap. The nodes are class-only and shaped to the site’s terminal aesthetic. The spike also records a React Flow-specific rule: keep `nodeTypes` module-level so nodes do not remount every render.<sup><a href="#code-mapper-react-flow-spike">4</a></sup>

The dnd-kit half tested the signature-list interaction. The common dnd-kit example uses inline styles for transforms; this repo avoids JSX `style` attributes. The spike writes transform values into CSS custom properties through CSSOM instead, then lets a class consume them. It also gives `DndContext` a stable ID to avoid server/client hydration mismatch in generated accessibility IDs.<sup><a href="#code-mapper-dnd-spike">5</a></sup>

That is exactly the kind of pre-work I want before giving an AI agent the real mapper. The renderer choice was tested in isolation. The CSP path was tested in isolation. The hydration gotcha was found in isolation. None of that required a production map schema.

The harder question is where the mapper state lives. The Convex chapter already established the default rule: Convex is a live whiteboard, not the source of record, unless the mapper becomes the explicit exception. The live tracker migration reinforced that rule. Slow, cached, per-owner ESI mirrors belong in Neon. Small genuinely live signals can live in Convex. The mapper may need both. A user-authored map is not regenerable from ESI, but it is also exactly the kind of collaborative state Convex is good at.

The current live engine already leaves a seam for that future. The active dataset registry only serves `onlineStatus` today, but the engine comments reserve the pattern for a future consumer such as the mapper. Presence, cold rows, scan cadence, Workpool dispatch, generation guards, and bounded backlogs are already learned patterns. The mapper should reuse the lessons, not reuse the exact online-status shape blindly.<sup><a href="#code-mapper-live-engine-seam">6</a></sup>

The fan-out rule is the biggest design constraint. A mapper cannot be one giant reactive document. If one scout renames a signature and every watcher re-reads the whole chain, the first version may feel fine with two pilots and fall apart later. The data model has to split by change rate and watcher set: topology edges, system nodes, signatures, notes, active viewers, and perhaps layout positions are different streams. Some need immediate collaboration. Some can be stale-gated. Some should be local-only until saved.

The auth model is just as important. A public wormhole site page can be static. A mapper is not public. It is group state. That means the same lessons from corporation access apply: membership is not role, scope is not consent, and a body-supplied map ID is never authority by itself. The production mapper will need a clear answer for who owns a map, who can see it, who can edit it, what gets purged, what gets retained, and what happens when a character leaves or transfers.

So the architecture direction is not “build a map.” It is:

First, keep first-party universe facts in Neon with the SDE pipeline. Second, enrich wormhole-specific reference data through a separate layer. Third, treat scanned topology and notes as user- or group-authored state with explicit ownership and deletion rules. Fourth, use Convex only where the collaboration benefit is real and the subscription scope is narrow. Fifth, keep the renderer a client island and prove route mode, CSP, and hydration behavior before mixing in live data.

The mapper is the feature most likely to reward all the earlier mistakes. The project already learned what happens when live data is placed too broadly, when subscriptions re-read too much, when route mode drifts silently, when styling escapes the rails, and when cleanup coverage is added after the fact. The mapper should be the first major feature built after those lessons, not before them.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-mapper-sde-foundation" file="src/data/eve-data/schema.ts" lines="155-221,13-35" lang="ts" -->
```ts id="g7z6xv"
// Universe (map + NPC station) data. Sourced from CCP's `map*` / `npcStations`
// / `stationOperations` / `stationServices` JSONL files. Covers every PERSISTENT
// New Eden system — K-space + Pochven + J-space (wormhole) — plus the static
// stargate jump graph. Instanced abyssal deadspace and special/non-standard
// regions stay excluded.
//
// The richer mapper attribute layer (per-WH statics + environmental effects,
// sourced from anoik.is) is NOT here — it attaches later via a related table.
export const eveSolarSystems = pgTable('eve_solar_systems', {
  id: integer('id').primaryKey(),
  constellationId: integer('constellation_id').notNull().references(() => eveConstellations.id),
  regionId: integer('region_id').notNull().references(() => eveRegions.id),
  name: text('name').notNull(),
  securityStatus: doublePrecision('security_status'),
  wormholeClassId: integer('wormhole_class_id'),
});

// Static stargate topology as a derived system↔system jump graph. Only the
// adjacency is stored — gate ids/positions aren't kept, because route adjacency
// for the mapper needs neighbours, not gate geometry.
export const eveSystemJumps = pgTable('eve_system_jumps', {
  fromSystemId: integer('from_system_id').notNull().references(() => eveSolarSystems.id),
  toSystemId: integer('to_system_id').notNull().references(() => eveSolarSystems.id),
}, (t) => ({ pk: primaryKey({ columns: [t.fromSystemId, t.toSystemId] }) }));
```

<!-- uth:code id="code-mapper-route-static" file="scripts/route-classification.json" lines="7-35" lang="json" -->
```json id="9cdxh2"
{
  "_reasons": {
    "/dev/sandbox/mapper": "Unlinked dev mapper renderer spike (OOB.4.1) — static shell over hardcoded sample data; the React Flow node graph + dnd-kit reorder list are a client island. No PageShell, no DB/live reads."
  },
  "routes": {
    "/dev/sandbox/mapper": "static"
  }
}
```

<!-- uth:code id="code-mapper-sandbox-page" file="src/app/dev/sandbox/mapper/page.tsx" lines="3-19" lang="tsx" -->
```tsx id="ty1ptx"
import { SandboxHeader } from '../_shared/sandbox-ui';
import { MapperDemo } from './MapperDemo';

// Renderer/interaction spike for the future wormhole mapper. No DB read and no
// request-time input; the graph + list data are hardcoded, so this leaf
// prerenders fully static. Like the other sandbox leaves it carries no auth gate.
export default function MapperSpikePage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Wormhole Mapper — Renderer Spike"
        subtitle="React Flow graph + dnd-kit reorder · throwaway evaluation"
      />
      <MapperDemo />
    </div>
  );
}
```

<!-- uth:code id="code-mapper-react-flow-spike" file="src/app/dev/sandbox/mapper/MapperDemo.tsx" lines="5-12,52-83,102-124" lang="tsx" -->
```tsx id="33cajw"
// Throwaway renderer/interaction spike. Two demos prove the v4.0 mapper feel:
// a React Flow node graph and a dnd-kit drag-to-reorder list. This is renderer /
// interaction ONLY: the mapper's data-cost / subscription fan-out is separate.

type SystemData = { label: string; wclass: string; statics: string; home?: boolean };
type WormholeNode = Node<SystemData, 'wormholeSystem'>;

function WormholeSystemNode({ data }: NodeProps<WormholeNode>) {
  return (
    <div className={data.home ? 'min-w-[132px] border border-isk bg-section' : 'min-w-[132px] border border-border bg-section'}>
      <Handle type="target" position={Position.Top} />
      <div>{data.wclass}</div>
      <div>{data.label}</div>
      <div>{data.statics}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { wormholeSystem: WormholeSystemNode } satisfies NodeTypes;

function MapperGraph() {
  const [nodes, , onNodesChange] = useNodesState<WormholeNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  return <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView />;
}
```

<!-- uth:code id="code-mapper-dnd-spike" file="src/app/dev/sandbox/mapper/MapperDemo.tsx" lines="141-158,189-205" lang="tsx" -->
```tsx id="6x9e19"
// dnd-kit applies the per-item transform via an inline style in its docs; here
// it is written to CSS vars through the house CSSOM pattern, so there is no JSX
// `style` attribute and no eslint exemption.
function SortableSig({ sig }: { sig: Sig }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sig.id });
  const ref = useRef<HTMLLIElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--sbx-tf', CSS.Transform.toString(transform) || 'none');
    el.style.setProperty('--sbx-tr', transition ?? 'none');
  }, [transform, transition]);
}

<DndContext id="mapper-signatures" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
  <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
    {/* rows */}
  </SortableContext>
</DndContext>
```

<!-- uth:code id="code-mapper-live-engine-seam" file="convex/engine.ts" lines="8-23,10-17" lang="ts" -->
```ts id="twd4n4"
// Trigger classes: 'while-watched', 'on-view', and 'on-schedule'. The on-schedule
// class has no live consumer since the jobs trackers moved to Neon; it is reserved
// for a future consumer such as the v4.0 mapper.
//
// The engine's stored dataset literal is a single live consumer today
// (onlineStatus). The union is designed to hold a superset of the active registry
// while a dataset is being retired. The v4.0 mapper re-instantiates the pattern
// against its own dataset lifecycle.
const syncDatasetValidator = v.literal('onlineStatus');
const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;
```
<!-- uth:code-excerpts:end -->

## Closing Notes

The strange thing about this project is that it is both more and less than I expected when I started.

It is more because a personal spreadsheet replacement turned into a real web application: authentication, EVE data ingestion, market prices, an industry planner, live account surfaces, corporation data gates, admin tooling, telemetry, and now the groundwork for a mapper. That is far beyond what I could have built in the conventional way.

It is less because the important lesson was not “AI can build anything.” That framing is too simple and too flattering to the tool. AI can generate an enormous amount of code quickly. The hard part is deciding what shape the system should have, recognizing when a shortcut is unsafe, and turning every mistake into a rail that future AI sessions have to respect.

A lot of this dev log is really a record of changed rules.

I started with a borrowed Sheet and learned that a source can be useful without remaining authoritative. I started with ESI fetches and learned that “call the API” is not a real instruction until identity, compatibility date, timeout, cache window, budget, and failure mode are all defined. I started with live trackers and learned that live-looking UI does not always need live infrastructure. I started with account login and learned that EVE identity is not one user flag; it is user, character, active character, owner hash, scope health, token custody, unlink, purge, and transfer safety.

I also learned that the app can be wrong without looking wrong. A route can render while its build mode silently changed. A cron can be healthy while waking a database for no reason. A cached body optimization can corrupt a caller’s response. A permission loss can leave stale data on screen. A comment can be technically harmless and still mislead the next AI agent.

That is why the repo has so many rails now. TypeScript, Zod, Drizzle, route assertions, ESLint, Fallow, coverage, CI, Vercel build checks, Greptile, and the repeated code-level comments are not process for its own sake. They are how the project remembers what it learned.<sup><a href="#code-closing-verify">1</a></sup>

The best parts of LGI.tools are the places where the architecture became explicit enough that an AI agent has a narrow safe path to follow. The weakest parts have usually been the places where I gave the agent a broad instruction and then had to come back later with a clearer boundary.

That is the main thing I would tell someone reading this as an AI-built software project: the code can be AI-generated, but the responsibility cannot be. My job is not to type every line. My job is to decide what should be true, direct the agents toward that shape, inspect the result, add the missing rails, and keep the repo from forgetting.

LGI.tools is still not finished. The mapper will probably force another round of architectural corrections. New EVE features will expose new permission edges. Scaling will keep finding fixed costs hiding in places that look small. Some of the rules in this log will be refined or replaced.

That is fine. The goal is not to pretend the architecture was obvious from the start. The goal is to keep learning in public, keep the code honest, and keep turning mistakes into structure.

This is the snapshot for now.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-closing-verify" file="package.json" lines="43-48" lang="json" -->
```json id="u9sh84"
{
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "fallow:health": "fallow health --coverage coverage/coverage-final.json",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```
<!-- uth:code-excerpts:end -->
