# LGI-114 local integration packet

Implementation starts at `cd789fced6729158e221b89138458248020b0cd7` in the isolated
Playwright worktree. The commit delivering this packet contains only local
implementation. No application source, hosted data, workflow, UX skill adapter,
push or merge is part of this change. The historical unchanged-suite Actions
cost baseline remains historical evidence; this is the later authorized redesign.

## Verified local results

The native `test-runner` completed all six required checks with exit 0:
`pnpm typecheck`, `pnpm lint`, both Fallow dead-code modes, Fallow dupes, and
`pnpm fallow:health:local`. The focused suite passed all 53 tests in nine files:

```sh
pnpm exec vitest run e2e/falsifiers.test.ts e2e/route-contracts.test.ts e2e/harness.test.ts e2e/reporter.test.ts e2e/probe-inventory.test.ts e2e/fixture-data-local.test.ts e2e/fixture-data-cleanup.test.ts scripts/run-e2e-guard.test.mjs scripts/ux-remote-auth.test.mjs
```

Discovery exited 0 for mandatory production with eight cases, selected
`atlas-access` with one case, and the complete local-mutation inventory with
33 cases. Selecting `atlas-access` in `dev-only` exited 1 as required. Discovery
started no browser, server or fixture. Every retained stage was imported by the
inventory test; the reporter and shared registry also passed native discovery.

## Coverage and ownership

[The coverage table](./coverage.md) maps every historical probe to its current
journey, lower-level replacement or removal. The executable registry contains
32 explicitly selected journeys. Mandatory production runs eight cases across
six routes, including exact-route navigation and return from the home catalogue.
Atlas collaboration is proved only by running the selected interaction journeys.

Playwright fixtures own all clients, diagnostics, run-owned principals/maps and
cleanup. The old `ux-capture`, argument parser and `run-probes` runner are retired.
The scenario modules retain behavioral stages under native Playwright steps.
No-op screenshot helpers and obsolete standalone seed storage are removed.

Four distinct fixture principals carry owner/admin, editor, viewer and no map
access. Access tests verify their sessions, stored grants, visible capabilities,
real revocation, and a denied post-revocation request. Map creation during a test
is included in teardown by ownership. Cleanup checks durable projections, auth,
maps and Convex records after scoped deletion. No cleanup result means no pass.

The pure falsifiers use the same route, principal, role, movement and diagnostics
validators used by acceptance. They reject wrong routes, 200 error shells,
missing useful content, unexpected HTTP 500, missing/refused required Convex,
wrong principals/roles, inert drag and deliberately wrong expected outcomes.
Reporter tests reject selected cases that skip, never execute, retry, or expect
failure. Guard tests cover local-only fixture targets, foreign cleanup rows,
partial purge failure, and deployed HTTP/WebSocket write prevention.

## Parent UX skill contract changes

Both harness adapters should invoke the single Playwright command. Replace
`ux-capture` route sweeps and `node docs/ux-check/run-probes.mjs` with explicit
lane and journey selection from [the command reference](./README.md).

Consume `docs/ux-check/captures/e2e-report.json`. `READY_FOR_REVIEW` proves selected
assertions, diagnostic disposition and teardown only. Keep operator visual
acceptance separate. Missing backends, fixtures, selected cases or evidence are
`BLOCKED`. Do not bypass errors with skips, allow-empty selection or retries.
Raw screenshots/traces are not uploadable because their credential sanitization
has not been established. Attach only sanitized-failure JSON and the report.

## Cloud runtime commands and prerequisites

Prepare a local production build and local PostgreSQL/Convex using the cloud
setup contract. Do not run this against hosted data. Required environment is in
[Local prerequisites](./README.md#local-prerequisites). Synthetic auth now requires
local Convex even for mandatory authenticated routes, because view/heartbeat
activity can create live records that teardown must remove.

```sh
pnpm build
pnpm test:e2e
E2E_SCENARIOS=atlas-access,atlas-authoring,atlas-ambiguous-jump,atlas-signatures,atlas-map-lifecycle,atlas-heartbeat-logout,atlas-subscriptions pnpm test:e2e:local
E2E_SCENARIOS=atlas-motion pnpm test:e2e:local
E2E_SCENARIOS=dev-navigation-sites pnpm test:e2e:dev
```

Use `E2E_LANE=local-mutation pnpm test:e2e --list` to inspect exact journey IDs.
To include `atlas-automatic-jump`, first supply independently verified
`E2E_JUMP_EXPECTED_SHIP_MASS_KG` for the local type-28606 fixture and
`E2E_JUMP_EXPECTED_REMAINING_MASS_LABEL` for one C247 transit. The full text
must start with `Remaining mass `. Copy neither expectation from the actual
run. Then use `E2E_SCENARIOS=atlas-automatic-jump pnpm test:e2e:local`.
The development lane must not reuse a running production server. Production
lanes reject an already running server so they cannot test a development build
by accident. Preserve the production `.next` build before running dev-only tests.

For deployed public smoke, set the remote URL and supplied operator storage
required by the preserved guard, then run:

```sh
pnpm test:e2e:deployed --grep 'home-public|atlas-guest'
```

Authenticated deployed cases additionally require exact expected user ID,
character ID and display name. Browser writes are blocked, including application
heartbeat mutations; such a route blocks this lane rather than modifying the
deployment. GET requests may have server-side effects that browser interception
cannot inspect.

Benchmarks are opt-in and require an explicit calibration profile and positive
p50/p95 thresholds. They do not gate the production suite or justify paid CPU.
Never run the entire portfolio to satisfy a small requested UX check.

## Runtime limitations

No browser, local backend fixture, hosted command, UI or clipboard was run in
this implementation session. Discovery is not browser acceptance. The parent
must collect actual browser reports for representative journeys, including a
successful cleanup census and a failed-assertion cleanup run.

Convex sync-row cleanup uses the official dashboard system mutation at installed
Convex 1.45.0, with exact IDs from a fresh run-owned census. It is an internal
version-specific API, so another installed version blocks until its contract is
reverified. Live operability is not established by the pure cleanup tests.

Retained scenarios still include bounded settling waits. The cloud runs must
resolve stale selectors, readiness differences and fixture assumptions without
weakening the expected outcomes. No performance pass or collaborative browser
pass is claimed from the local suite.
