# docs/ux-check — UX verification workspace

Route checks, operator visual pause, and remote log-probe procedure live in
the `ux-check` skill. This directory owns durable probe definitions, the
Playwright Test integration, and generated capture artifacts.

The durable probe harness, probe definitions, and this guide are tracked project
tooling. Generated reports and failure artifacts under `captures/` remain
ignored local evidence and can be deleted at any time.

## Layout

| Path | What | Lifecycle |
| --- | --- | --- |
| `e2e/probes.spec.ts` and `e2e/fixtures.ts` | Playwright Test runner and fixtures for durable interaction probes | Tracked; browser lifecycle, diagnostics, failure evidence, reports, exit gating |
| `e2e/probe-registry.json` | Journey selection and historical probe dispositions | Tracked |
| `probes/*.mjs` | Small durable probe definitions | Tracked; one module per recurring feature check |
| `captures/sanitized-failures/` | Sanitized failure JSON | Ignored; uploadable failure evidence |
| `captures/` | `e2e-report.json` from the Playwright reporter | Ignored; auth storage stays out of artifacts |
| `docs/contributing/end-to-end-testing.md` | Tiny Playwright smoke suite policy (`pnpm test:e2e`) | Tracked |

## Run durable probes

For local Cursor or Codex, complete the README's local-development setup.
The production lanes need a build and start their own server; the development
lane starts `pnpm dev`. See [Local prerequisites](#local-prerequisites) below.

In a Cursor Cloud Agent VM, use the `development` terminal from
`.cursor/environment.json` for development work; read `.cursor/cloud-agent.md`
for its prerequisites. The local `dev:all` command requires Docker. Stop the
development server before a Playwright lane starts its own server.

List available definitions, run the mandatory suite, or select journey names:

```bash
pnpm test:e2e --list
E2E_LANE=local-mutation pnpm test:e2e --list
pnpm test:e2e
E2E_SCENARIOS=planner-materials,sites-details pnpm test:e2e:local
```

Authenticated probes use run-owned fixture sessions:

```bash
E2E_SCENARIOS=atlas-windows pnpm test:e2e:local
```

The one-shot automatic-jump gate needs a dedicated empty editable map. The
fixture creates that map and supplies its identity to the probe:

```bash
E2E_SCENARIOS=atlas-automatic-jump pnpm test:e2e:local
```

The fixture removes authored jumps and maps during teardown and verifies their
absence. Do not reuse another run's UUID or supply an operator-owned map.

Use a different origin when needed, with matching app/auth port configuration:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 BETTER_AUTH_URL=http://localhost:3001 \
  E2E_SCENARIOS=planner-materials pnpm test:e2e:local
```

With no selection, the mandatory production lane runs its smoke cases. Optional
lanes require journey IDs from `e2e/probe-registry.json`. Each journey runs in
an isolated browser context for its declared viewports; related definitions
share that journey's setup and cleanup. A failure is recorded without aborting
the remaining cases. The runner never waits for `networkidle`; the Convex
websocket keeps live pages busy indefinitely.

Every viewport run automatically records:

- authored checks;
- CSP violations;
- console errors and uncaught page errors;
- failed requests and HTTP 4xx/5xx responses;
- sanitized failure diagnostics only when the run fails.

The command exits non-zero when an authored check, a definition, cleanup or a
default gate fails. Unexpected first-party network failures now fail acceptance;
expected failures must name an exact endpoint, method and status within the
scenario. Read the combined result at `captures/e2e-report.json`. Raw screenshots,
traces and video are disabled; see [Results and evidence](#results-and-evidence).

| Lane | Command | Contract |
| --- | --- | --- |
| Mandatory production | `pnpm test:e2e` | Local `pnpm start`; eight independent public/authenticated route cases |
| Local mutation | `E2E_SCENARIOS=atlas-access pnpm test:e2e:local` | Explicit journeys, disposable local PostgreSQL/Convex fixtures |
| Deployed read-only | `pnpm test:e2e:deployed` | Supplied remote session and expected principal; no local server or seed |
| Development only | `E2E_SCENARIOS=dev-navigation-sites pnpm test:e2e:dev` | Local `pnpm dev`; Next instant navigation and eventual useful content |
| Benchmark | `E2E_SCENARIOS=fog-benchmark pnpm test:e2e:benchmark` | Optional observations; never a paid-compute or production release gate |

`E2E_SCENARIOS` is a comma-separated list of journey IDs. List discovery without
starting a server or creating fixtures with `pnpm test:e2e --list` or
`E2E_LANE=local-mutation pnpm test:e2e --list`. Every optional run requires a
selection. Empty, unknown, and wrong-lane selections fail. `--no-deps` and
`--pass-with-no-tests` cannot be used as acceptance gates. There are no whole-test
retries. Assertions may poll for observable completion.

The old `ux-capture` route sweep and `run-probes` browser runner have been removed.
`pnpm ux-check` invokes the same Playwright owner and accepts Playwright flags.
Use `--grep` to narrow mandatory routes, or `E2E_LANE` and `E2E_SCENARIOS` for
interactions. Arbitrary URLs are not a pass contract. Add a route-specific
ready-content assertion when a new route needs browser coverage.

## Definition format

A definition imports nothing. Register it in `e2e/probe-registry.json`;
`e2e/probes.spec.ts` loads the selected journey and injects the complete probe
context, keeping capture paths, Playwright lifecycle, and diagnostic policy out of
feature checks:

```js
export default {
  name: 'feedback-dialog',
  route: '/',
  viewports: ['desktop', 'mobile'],  // optional; defaults to both
  reducedMotion: true,               // optional; emulates prefers-reduced-motion
  async setup({ page, baseUrl }) {
    // Optional pre-navigation route mocks, permissions, or init scripts.
  },
  async run({ page, viewport, baseUrl, check }) {
    const dialog = page.getByRole('dialog');
    check('dialog opens', await dialog.isVisible());
  },
};
```

Authentication and journey viewports are declared in the registry. Definitions
may narrow their supported viewports. Wait for useful UI outcomes instead of a
fixed `settle` delay; blanket `allowConsole` filters are not part of the fixture
contract. The fixture supplies `check`, which asserts through Playwright Test.

Prefer role/label locators and behavioral checks. Do not add probes whose only
job is a screenshot.

Use `createPage()` for another tab in the primary authenticated browser context,
including cross-tab BroadcastChannel tests. The runner attaches diagnostics and
CSP collection and closes that tab with the context. `createContext()` instead
creates an isolated client, optionally in another browser engine. Playwright's
clock is shared by pages in a context; install and advance it once per context.

## Instant navigations (`instant`)

The runner injects Next.js 16.3's `@next/playwright` `instant(fn, options?)`
helper on the probe context. Inside the callback, navigations render only the
App Shell / prefetched UI; dynamic streams wait until the callback returns.

```js
async run({ page, baseUrl, check, instant }) {
  await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await instant(async () => {
    await page.locator('a[href="/sites"]').first().click();
    await page.waitForURL('**/sites');
    check('sites shell is instant', await page.getByRole('heading', { name: /wormhole/i }).isVisible());
  });
}
```

Prefer soft `<Link>` navigations. Pass `{ baseURL: baseUrl }` only when overriding
the runner default (it already scopes cookies to `baseUrl`). Run in the development-only lane, for example
`E2E_SCENARIOS=dev-navigation-sites pnpm test:e2e:dev` — it owns `pnpm dev`,
where the testing API is enabled automatically; do not rely on a local
production build. Warm-cache is assumed: cold `'use cache'`
misses can still wait once.

## Local prerequisites

Build first with `pnpm build`. The production lanes start their own `pnpm start`
and reject an existing server, so they cannot accidentally test a development
server. `PLAYWRIGHT_BASE_URL` defaults to `http://localhost:3000`; use the same
origin in `BETTER_AUTH_URL` and configure the application port when changing it.

Authenticated fixtures require current local PostgreSQL migrations,
`LOCAL_DB_DRIVER=postgres-js`, a loopback `LGI_DATABASE_URL` or `DATABASE_URL`,
and a matching local `BETTER_AUTH_SECRET` or `SESSION_SECRET`. Local Convex must
be running with a `local:` or `anonymous:` `CONVEX_DEPLOYMENT`, a loopback
`NEXT_PUBLIC_CONVEX_URL`, and matching `CONVEX_SERVICE_SECRET`. Remove
`CONVEX_DEPLOY_KEY`. Missing required backends fail as `BLOCKED`; refusal is
never console noise to ignore. A production build must use those same local
service settings.

Each authenticated test creates distinct owner, editor, viewer and unauthorized
principals. Atlas journeys create maps owned by that test. Do not supply
`UX_MAP_ID` or reuse another run's maps. Setup owns map aliases and cleanup.
Cleanup deletes owned durable and live records and checks that no owned rows
remain, including after setup or assertion failure. A failed census fails the
run. Auth storage stays in memory and is never an attachment. The old standalone
seed command is retired.

## Deployed reads

Set `PLAYWRIGHT_BASE_URL` to the deployment origin, `E2E_STORAGE_STATE` to an
operator-supplied storage file, and `E2E_EXPECTED_USER_ID`,
`E2E_EXPECTED_CHARACTER_ID`, and `E2E_EXPECTED_NAME` to its intended principal.
`E2E_DEPLOYMENT_ID` identifies the deployment in reports. The deployed package
command sets `E2E_SKIP_SEED=1`; the original remote seed guard remains in force.
Optional protection bypass headers are installed only on that exact origin.
Session checks fetch in the browser context, using its cookies and routing.

The deployed lane performs no synthetic seeding, fixture mutations, or local
server startup. Browser HTTP writes and Convex Mutation/Action frames are
prevented and fail acceptance; service workers are blocked. An authenticated
route that starts heartbeat writes will therefore block this lane. Select the
public cases with `--grep 'home-public|atlas-guest'` for deployed smoke without
authenticated background behavior. Browser interception cannot establish that
the deployed server has no side effects while handling GET requests. Keep
storage files and cookie jars outside uploaded artifacts.

## Results and evidence

`docs/ux-check/captures/e2e-report.json` records revision and dirty state,
deployment, time, lane, browser/device, auth role, fixture identity, cleanup,
selected/skipped/blocked scenarios, attempts, and diagnostic disposition.
The 64 historical probe dispositions live in `e2e/probe-registry.json` and are
included in the report. A filtered scenario is recorded as unselected; a
selected scenario that cannot execute is blocked and cannot make the run green.

Unexpected first-party HTTP failures, failed requests, JavaScript errors, CSP
violations and console errors fail the selected journey. Required Convex
traffic counts as first-party. Expected HTTP failures are declared inside the
scenario for an exact endpoint, method and status; another route or status
still fails. Third-party network findings are separately classified.

Only failed cases attach a bounded sanitized diagnostic timeline. Fixtures write
that JSON under `docs/ux-check/captures/sanitized-failures/` and attach the file
path. The reporter copies a body-only attachment into the same directory so the
report always records an uploadable path. Raw console messages, response bodies,
headers, query values, cookies and auth state are excluded. Native traces,
screenshots and video are disabled because they can capture credentials or
account content; there is no verified sanitizer for those formats. Upload only
the report and those sanitized-failure JSON files.

`READY_FOR_REVIEW` means selected assertions and cleanup passed. Operator visual
acceptance is still pending. No local-suite result or discovery listing proves
a browser journey ran. Record the actual browser command and report when the
parent executes representative journeys.
