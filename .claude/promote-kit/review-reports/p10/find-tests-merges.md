# PR #677 (wave 10) review: tests, stacking, deletions, kit/docs commits

OLD = origin/claude/primitives-wave-09 (b5102b80), NEW = origin/claude/primitives-wave-10 (01e0edf2). I only read refs. Nothing was checked out or run.

## Findings

### F1 (low): the cron telemetry lint rail now names an export that no longer exists
- **Where:** `eslint.config.mjs:860-865` on NEW. It sits in the `files: ["src/app/api/cron/**"]` block that starts at line 835.
- **What the rail says:** cron routes may not import `logUsageEvent` from `@/data/telemetry/queries`. Its message is "Cron outcome telemetry belongs to defineCronRoute or CronWorkContext.record".
- **What P159 changed:**
  - It deleted that re-export (`data/telemetry/queries.ts`: `- logUsageEvent,` in the `export { … } from './log'` block).
  - It added two new direct emitters, `emitUsageEvent` and `recordUsageEvent`, in `@/data/telemetry/usage-events`.
  - `eslint.config.mjs` is unchanged in this PR, so the rail still names the old path.
- **Result:** the rule can no longer match anything.
- **Scenario:** a cron route (`src/app/api/cron/<x>/route.ts`) imports `recordUsageEvent` or `emitUsageEvent` from `@/data/telemetry/usage-events`, or `logUsageEvent` from `@/data/telemetry/log`. It writes outcome telemetry outside `defineCronRoute`/`ctx.record`, and lint passes. The `@/data/telemetry/log` path was already a bypass on OLD, but OLD did block the path that every cron route and test used then.
- **Not covered elsewhere:** no rail test pins this restriction. Nothing in `scripts/*.test.mjs` mentions it.
- **Minimal fix:** point the entry at the new owners: `{ name: "@/data/telemetry/usage-events", importNames: ["emitUsageEvent", "recordUsageEvent"], message }` and `{ name: "@/data/telemetry/log", importNames: ["logUsageEvent"], message }`. This is retargeting a rule, not adding a suppression.

### F2 (low): no test pins P165's database-clock rotation
- **Where:** `src/composition/account-lifecycle/tracking-merge-retry.db.test.ts:55-67` on NEW.
- **What was added:** the case was renamed to "…retains a failed delivery durably **behind newer work**…". It now sets `queuedAt = 2026-01-01` and asserts `retained[0]!.queuedAt.getTime() > old.getTime()`.
- **Why it cannot catch a revert:** the declared change (P165) moves rotation from `queuedAt: new Date()` (OLD) to ``sql`clock_timestamp()` `` (NEW), in `tracking-merge-retry.ts:64` and `platform/auth/deletion-jobs.ts:98`. On OLD, `new Date()` is also later than 2026-01-01, so the new assertion passes against the old code. The same holds for the existing `account-purge.db.test.ts:704`. `account-purge.test.ts` only checks that `rotateDeletionJob` was called.
- **Net effect:** reverting either `clock_timestamp()` back to `new Date()` keeps every test green. The assertion does pin that rotation happens, which is useful but was already true before.
- **Minimal fix:** in the DB test, put the JS clock well behind the database clock around the failing reconcile, for example `vi.useFakeTimers({ now: new Date('2000-01-01'), toFake: ['Date'] })`. Then assert the rotated `queuedAt` is later than a database-clock baseline. Do the same for `retryRequestedDeletions` in `account-purge.db.test.ts`.

No other defects found in this lens.

## 1. Stacking
- **Wave 9 unchanged:** `git merge-base --is-ancestor` shows wave 9 is in wave 10's history. The first wave-10 commit, 33216093, has parent b5102b80. development (3a8e28c3) is in wave 9's history.
- **Commit list:** `git log OLD..NEW` is a linear chain of 18 commits with no merges (`--merges` count is 0):
  - the two docs commits, 33216093 and 9c1a91ab;
  - 15 item commits: P162, P164, P322, P165, P166, P240, P321, P174, P316, P282, P158, P299, P314, P315, P159;
  - cf7e14c0, "Mark P281 as already done".
- **Nothing undone:** 46 non-docs files changed in both wave 9 and wave 10. I diffed each one:
  - Lines that wave 9 removed and wave 10 adds back: only bare `});` and `);`. Nothing is reverted.
  - Lines that wave 9 added and wave 10 removes: only the intended P159 rewrites (`void logUsageEvent(...).catch(...)` becoming `emitUsageEvent(...)`, and the matching test mocks) and the cost-metrics try/catch.
  - development's tip commit 3a8e28c3 (chart-frame, use-system-search, systems-search) shares no files with wave 10.
- **Files the promote-9 fix will touch:**
  - `src/platform/auth/character-unlink.ts`, `character-unlink.test.ts` and `admin-users.db.test.ts` are **not changed** by wave 10.
  - Their imports are unchanged by wave 10, except `deletion-jobs.ts`. There, wave 10 only changes the body of `rotateDeletionJob`. `PendingDeletionError`, which `admin-users.db.test` imports, is untouched.
  - None of the three files mocks a symbol that wave 10 renamed (`purgeMapChain`, `@/data/telemetry/queries`.logUsageEvent, `processed`/`retried` result shapes). **No textual or semantic conflict.**
  - The nearest wave-10 hunks are only the telemetry lines of the callers: `app/api/account/characters/unlink/route.ts:67-71` and `app/api/admin/characters/unlink/route.ts:43-51`. A fix that edits the `unlinkCharacter` call sites in those routes could touch adjacent context.

## 2. Deletions: remaining importers, and where each deleted test now lives
Searched NEW across src, convex, e2e, scripts, vercel.json, package.json, eslint.config.mjs and .fallowrc.json:

| Removed | Importers left |
|---|---|
| `purgeMapChain` (src/composition/map-purge) | Now private (`map-purge.ts:24`). Remaining hits are unrelated: Convex's own `purgeMapChain` HTTP action (`convex/httpMapAccess.ts`, `convex/http.ts`) and `account-purge.db.test`'s local `mapPurge.purgeMapChain` mock behind the Convex door. |
| `purgeOwnedMapChainsThenDeleteMaps`, `insertDomainEvent`, cron-gate `recordUsage`, `requireCurrentProjection`, `ProjectionResult`, `purgeTransferredCharacter`, `loadTrafficActivity`, `USERS_HREF` | None. |
| `logUsageEvent` re-export, `lastNDaysRange` (data/telemetry/queries) | No import. Every `vi.mock('@/data/telemetry/queries')` factory dropped them. The only leftover is the eslint string (F1). |
| `projectionPending` in the purge-maps cron response | None. The declaration spreads `purgeEligibleMaps()`'s result, which no longer has the field. The hits in `map-lifecycle.ts` are a different, live field. |
| `composition/admin-period` | None outside docs/kit JSON. All importers are under `app/(site)/admin`. |
| vercel.json crons | Unchanged; they point at route paths, which all exist. |

Each deleted test or case, and where its behaviour is asserted now:
- **`data/telemetry/queries.test.ts`** (lastNDaysRange 7/1/30 days): `app/(site)/admin/period.test.ts`, "reads the last N days up to the given instant, without rounding it". Same windows, and it also checks that milliseconds are kept.
- **Stale checks removed from six callers.** At the source: `map-access-projection.test.ts`
  - "project and staged project reject a delivery that a newer projection already overrode";
  - teardown stale rejecting, plus `expectTypeOf…extract<'stale'>().toBeNever()`, in "posts computed claims, refuses door/env/stale/purge failures…";
  - "creation retries a staged projection a newer one overrode…";
  - the character-scoped test, where a stale result now rejects.
- **Per caller:**
  - `map-access-update.test` and `map-affiliation-access.test` (`it.each(['throw','stale'])`) and `map-purge.test` ("does not tombstone when the empty-claim fence is stale…") now inject `ProjectionUnavailableError`.
  - `map-lifecycle.test`, "marks projection pending when stale": covered by "keeps the captured change pending and logs when projection is unavailable".
  - `map-creation.test`, teardown-stale case: covered by the first case of "leaves staged recovery queued…" (teardown rejects) together with the source-level teardown test.
  - `tracking-merge-retry`: it never had a stale test (its `requireCurrentProjection` was a bare `vi.fn()`). Failures are still covered.
- **`requireCurrentProjection` test:** replaced by the source tests above.
- **`purgeMapChain` describe:** now `purgeOwnedMapChains` in `map-purge.test`. The first-failure stop formerly checked in the identity test is asserted as `purgedMapIds == ['map-a']`. The resolved `{deleted:17}` value from the old "returns only a validated clean terminal response" is covered by `lib/convex-http-door.test` ("returns the parsed contract") plus the schema-rejection cases.
- **`purgeTransferredCharacter` describe:** now the `finishCharacterTransfer` describe, `owner-transfer.db.test` via `transferCharacter`, and the proveCharacter transfer path ("…purges when the stored hash disagrees").
- **TrafficCards "builds the activity chart…":** `load-activity.test.ts`.
- **AccessCards "reads 90 days…":** rewritten with real dates.
- **telemetry route tests:** rewritten and strengthened.
- **eve-token "rejected telemetry write never fails a vend"** and **same-origin "swallows telemetry failures"** are covered by:
  - `lib/after-response.test.ts`: the rejection is logged under its scope and not rethrown, and work is dropped when `after()` throws;
  - `usage-events.test.ts`;
  - `emitUsageEvent` being synchronous `void`.
- **corporations `membershipHint`:** the field was deleted (P314) and was never rendered.

## 3. New tests
- **They can fail on OLD:**
  - map-access-projection stale tests: OLD resolved stale, and creation published after one fetch.
  - telemetry route: OLD read the session before responding.
  - owner-transfer.db: OLD made one `after` call, NEW makes two.
  - traffic/page.test: OLD's referrers link was `/admin/search`.
  - AudienceCard links, admin-console `section`, `parseRange(['90d','7d'])`, `searchPeriods.days`.
  - The new helpers (`runUntilDeadline`, `firstSearchParam`, `adminHref`, `countJobs`, contributors, `readPriceSourceHealth`, `createScriptClient`, client-optional `runScript`).
  - The one exception is F2.
- **DB gating:** every changed `.db.test.ts` case stays inside `describe.skipIf(!harness.reachable)`.
  - `account-merge.db.test` adds a module-level `after: task => task()`, and its `merge()` helper waits for the audit row before the next fixture truncates, so there is no floating write.
  - owner-transfer.db runs `after.mock.calls[0]` explicitly.
- **after() mocks:**
  - `after-response.test` makes `after` throw "called outside a request scope" and asserts drop-and-log without running the task.
  - `instrumentation.test` asserts `deferAfterResponse` falls back to running inline.
  - `domain-events/queries.test` keeps its scheduling-failure case.
  - Route tests mock `emitUsageEvent` itself.
  - Every `emitUsageEvent` caller (route handlers, the Better Auth callback, `mutation-route`'s same-origin check, `/api/internal/eve-token`, the cron ESI worker, nested `after` callbacks) runs in a request scope. Crons use the immediate `recordUsageEvent`.
- **Order and shared bodies:**
  - No added test reuses one `Response` across reads: the stale tests use `mockImplementation(async () => Response.json(…))` or two separate `mockResolvedValueOnce` values.
  - Mocks are reset in `beforeEach`/`afterEach`, fake timers are restored in `finally`, and env stubs are unstubbed.
  - The 11 removed `vi.mock('@/data/telemetry/queries', { logUsageEvent })` factories in maps, problem-matrix, preferences and similar tests were dead: those tests send no cross-origin request and assert no telemetry.

## 4. Rails and config
- **No suppressions or skips:** added lines contain no eslint-disable, `@ts-ignore`/`@ts-expect-error`, `.skip`/`.only`/`.todo`, new `skipIf`, Fallow or istanbul ignores, or `as any`.
- **No config changes:** `.fallowrc.json`, `eslint.config.mjs`, `vercel.json`, `package.json`, `vitest.config.ts`, `tsconfig`, `.github` and `scripts/` are all unchanged.
- **Rails still name the right owners:**
  - `vendor-resilience.test` `PRODUCTION_POSTGRES_SITES` narrowed correctly to `db/index.ts` and `scripts/script-runtime.ts`. It still scans all sources.
  - The purge registry gets the same contributor names and claims, built from table lists.
  - The data-ownership census does not scan writers.
  - The syntax-exemption and corp-access rails name no moved file.
  - The only stale owner is F1.

## 5. Kit/docs commits
- **33216093:** adds one line to the wave-9 guide linking #676.
- **9c1a91ab:**
  - `wave-10.json` cautions and dependency statuses are updated.
  - The `implement-wave.js` FIXR `commitBody` description gains "no trailers (the workflow adds them)". That only steers fix agents, since the workflow still appends the attribution.
  - Nothing is destructive or breaks a rule. The kit still says agents never commit, push, reset or rebase, that `pnpm check` runs before each commit, and that suppressions and threshold raises are forbidden.
  - One wording nit: "waves 8 and 9, which have landed" is ahead of fact, since #676 is still waiting to merge.

## Leads checked and refuted
- Wave 10 reverting wave 9 or development lines: none.
- `getOwnedMapIds` versus the old raw query in the synthetic reset: identical query, `maps.userId = X`.
- `purgeMapChain`'s parsed `deleted` value no longer asserted: covered by the generic convex-http-door test plus the schema rejection cases.
- `owner-transfer.test`'s `transferCharacter` mock now requires `accountRowId`: `proveCharacter` passes `row.id`, and the transfer path is still covered.
- `emitUsageEvent` called outside a request scope: none found. `getFreshAccessTokenForCharacter`, `mergeUsers`, `requireSameOrigin` and `auth.ts` all run in request or after-callback scope.
- Routes, cost metrics or domain events newly dropped in scripts: same drop semantics as OLD (`after` was already wrapped in try/catch).
- Removed `next/server`-less mocks causing failures: `scheduleAfter`'s try/catch absorbs a missing mock export.
- AudienceCard `toHaveBeenCalledTimes(1)` becoming `toHaveBeenCalled()`: in production the reads dedupe through `sharedPeriodRead`, which keys on ISO strings.
- Contributors equivalence: same tables, delete order and keys. `userRowsContributor` resolves the `user_id` column at load, and all four tables have one.
- Purge-maps response: the `projectionPending` removal is pinned by `map-purge.test`'s exact `toEqual`.
- Admin statics losing its range control: the real page never passed `rangeBasePath`; only the old test fixture did.
- The P166 "all chains, then fences" ordering cannot be seen with the single-map fixture, but it is a consequence of the refactor rather than a fix, so it is harmless.
