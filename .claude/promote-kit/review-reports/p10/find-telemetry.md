# Wave 10 review: after-response telemetry, price-source health, CLI scripts, board valuation (P159, P162, P174, P321)

Diff reviewed: origin/claude/primitives-wave-09...origin/claude/primitives-wave-10. Commits: 01e0edf2 (P159), 3157b184 (P162), 6ad34700 (P174), e19ec28e (P321).

## Findings

None. I could not tie any change in these four items to a concrete failure from a real caller or input.

## Leads checked and refuted

### P159: after() wrappers and usage-event emitter

1. **Does any of the 16 converted `emitUsageEvent` sites run outside a request scope, where it would now be dropped instead of written?** No. I checked every caller on the new ref:
   - **11 route handlers** call it inside their `POST` handler (through `runMutationRoute` or directly): account/active-character, account/characters/unlink, account/delete, account/purge-character, admin/characters/{reassign,unlink}, admin/esi-jobs/retry, admin/role, admin/sessions/revoke, feedback, telemetry.
   - **`same-origin.ts` `requireSameOrigin`** has one caller, `src/app/api/mutation-route.ts:65`, so it runs in a route handler.
   - **`auth.ts` `getUserInfo`** runs inside the Better Auth OAuth callback route. The same function already calls bare `after()` on the line before (`after(() => refreshCharacterAffiliations(...))`). Outside a scope, login would already throw there.
   - **`account-merge.ts` `mergeUsers`** has one non-test caller, `owner-transfer.ts:51` (`proveCharacter`, reached from `getUserInfo`). That caller also calls bare `after()` right after the merge.
   - **`eve-token-service.ts`** (2 sites) is reached from:
     - the `api/internal/eve-token` route;
     - map-character-search and structure-search (routes);
     - the owner-sync-port consumers (sync routes, the drain cron route, Server Components);
     - `checkUserCharacterAuthorizations`, which runs inside `after()` from `getFullSession` and from the auth route. Next allows nested `after()`.
   - **Same path already lossy before the wave:** `emitDomainEvent` was already `after()`-only (drop-and-log) on the same eve-token code path in wave 09.
   - **Convex does not reach these modules.** Its src imports are contracts, lib and platform/esi; none of them imports telemetry, after-response or domain events.
   - **Scripts do not reach these modules.** project-map-access and map-replay go through map-access-projection, which has no token-refresh path. refresh-prices and the SDE scripts reach only `emitCostMetric` and `emitDomainEvent`, which were already `after()`-only.
   - **e2e seed and proxy:** the e2e seed does not reach them, and `src/proxy.ts` has no telemetry.
2. **Is any gate or dashboard row lost or double-written?**
   - **Cron gate:** `cron-gate` still awaits the write immediately (`recordUsageEvent`, the same `[scope] telemetry write failed` label as the deleted `recordUsage`).
   - **Neon cold start:** `recordCostMetric` (instrumentation's Neon cold-start sink) still writes immediately.
   - **Unchanged copies:** `emitCostMetric` and `emitDomainEvent` keep identical scheduling, write-failure and scheduling-failure labels (`[cost-metrics] telemetry …`, `[domain-events] ledger …`).
   - **Other sites:** each of the 16 sites schedules exactly one write.
3. **deferAfterResponse (does work that must complete get dropped?)** No. `scheduleAfter(task).ok` returns false when `after()` throws, so `deferWork` awaits the task inline, exactly like the old inline deferrer in `instrumentation.node.ts`. `instrumentation.test.ts` still covers the defer, inline and register paths.
4. **Domain-event ordering and read-back:** `emitDomainEvent` was already deferred with `after()` in wave 09. P159 only moved its try/catch into `runAfterResponse`, and the labels match. No new deferral.
5. **Telemetry route lazy input:** `getSessionCharacterId` (`headers()` plus a nested `after()` in `getFullSession`) now runs inside `after()`. Next permits request APIs inside `after()` when the root `after()` was spawned in a Route Handler. In `node_modules/next/dist/server/request/utils.js`, the check is `rootTaskSpawnPhase === 'action'`. Nested `after()` is also permitted (`after-context.js` queues it, and `onIdle` covers it through waitUntil). Better Auth has no `nextCookies` plugin, so nothing tries to set a cookie after the response.
6. **Read-your-write on the role audit:** `admin/role` sends a 303 to `/admin/users`, which reads `getRoleChangeAudit` uncached. Moving the insert from "dispatched before return" to "after the response closes" widens the race by only a few ms. The browser round-trip plus the admin layout's DB reads come first, so the race is not practically observable. Dropped.
7. **Deferred writes capturing mutable objects:** no caller mutates the metadata after emitting. `movedCharacterIds` in account-merge is not mutated by `settleConvexAfterMerge`, and the telemetry route's `safeMetadata` is not touched again.
8. **Purged-character leak from late writes:** the purge-character and delete events carry no `characterId`. Unlink events carry the actor's `characterId`, as before.
9. **Tests:**
   - The route tests now assert `emitUsageEvent(scope, payload)` exactly.
   - The telemetry route test drives the `after()` callback explicitly.
   - owner-transfer.db runs the audit `after()` callback, then reads the row.
   - The mocks removed from industry-profiles, saved-plans, maps and problem-matrix were for routes that never logged usage.
   - None of these tests is vacuous.

### P162: price-source health

10. **Predicate:** `fuzzworkFallbackCount > 0 || budgetExhausted` matches both old copies (cron `declaration.ts`, on-demand `market-prices/refresh/route.ts`) for every input. The types are non-null numbers and booleans.
11. **Payload:**
    - The `price_source_degraded` record and cost metric, the Discord alert, the `price_refresh_finished` domain event and the cron telemetry carry the same key sets as before; only the key order changed, and jsonb ignores it.
    - `counts` is a fresh copy taken at emit time, so later changes to `degraded` in `getLivePrices` cannot leak in, the same as the old field-by-field literals.

### P174: script bootstrap

12. **Env load order:**
    - package.json has no `"type": "module"`, so tsx compiles `src/scripts/*.ts` to CJS. `import './load-env'` becomes the first `require`, and esbuild keeps side-effect imports in source order.
    - Under ESM it would also evaluate first, because `load-env` has no top-level await.
    - `load-env`'s own dependencies (dotenv, `@/lib/env`, zod) read no env at import.
    - `src/db/index.ts` resolves env lazily.
    - All 11 entries have `import './load-env'` as line 1.
13. **Clients:**
    - The seven hand-built clients keep their URL choice and pool size (1, 1, 1, 1, 1, 5, 2) with `connect_timeout` through `createScriptClient`.
    - `requireSoftFailLockClient` keeps `max: 2` and its soft-fail exits.
    - warm-neon and project-map-access take no client, and `runScript`'s `client?.end()` is a no-op there. Exit codes are unchanged; project-map-access now prints the full error, which is declared.
    - project-map-access now imports script-runtime (postgres, `@/db`). Its composition graph already imported `@/db`, and it runs with `--conditions=react-server`, so nothing breaks.
14. **Missing pieces from the guide:** `backfill-users-if-empty` and `publicTableExists` do not exist on wave 09 either, so "11 entries" is correct.

### P321: board valuation

15. **Type IDs:** `collectValuationTypeIds(raws)` equals the old `collectNameIds(raws).valuationTypeIds`: the same `valuationTypeIdsOf` per raw, `sortedUniqueIds`, unconditional for every raw.
16. **Who reads the valuation:**
    - `pilotWorthOf` is called only from `netWorthSnapshot`, and only it ever read `names.prices` and `names.typeCategories`.
    - `recordNetWorthSnapshot`, reached from net-worth-link and the nightly revalue, passes the same `ValuationBook`.
    - The demo board passes the same `DEMO_PRICES` and `DEMO_CATEGORIES`.
    - The live board view used to pass `valuationTypeIds: []`, so the dropped `resolveValuationBook([])` returned empty maps with no side effects (`getPrices([])` short-circuits).
    - Net-worth values are unchanged for every caller.
