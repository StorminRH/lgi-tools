# Selected browser acceptance

Playwright Test owns route checks and retained interaction journeys. `pnpm test:e2e`
runs the small production-build suite. It does not run the interaction portfolio.
This redesign follows the unchanged-suite LGI-112 cost baseline; it does not
change or reinterpret that historical measurement.

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

Only failed cases attach a bounded sanitized diagnostic timeline. Raw console
messages, response bodies, headers, query values, cookies and auth state are
excluded. Native traces, screenshots and video are disabled because they can
capture credentials or account content; there is no verified sanitizer for
those formats. Upload only the report and Playwright's sanitized-failure JSON.

`READY_FOR_REVIEW` means selected assertions and cleanup passed. Operator visual
acceptance is still pending. No local-suite result or discovery listing proves
a browser journey ran. Record the actual browser command and report when the
parent executes representative journeys.
