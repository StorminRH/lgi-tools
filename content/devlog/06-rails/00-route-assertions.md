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

