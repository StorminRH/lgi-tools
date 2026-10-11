# Wave 9 review: read routes, owned-data telemetry, read identity (P143, P160, P153, P149, P068)

OLD = origin/development (3a8e28c3), NEW = origin/claude/primitives-wave-09. Read through the item commits
0b72d91f (P143), 9b0e8336 (P160), 9baf9dcb (P153), 76fa17af (P149), 7abf1e8b (P068). I also checked that no later
wave-9 commit or the development merge touches these files again; the three-dot diff for them matches the item commits.

## Findings

None. I found no defect in this lens that I could tie to a concrete failure.

## Leads checked and refuted

### P143: owned-data reads keyed by endpoint contract, corp-structures measured
- **Metric label continuity.** Each of the eight existing routes now passes its contract, and `endpoint.path` matches
  the old literal exactly: `boardEndpoint` '/api/account/board', `industryJobsEndpoint`, `corpIndustryJobsEndpoint`,
  `industrySlotsEndpoint`, `ownedBlueprintsEndpoint`, `ownedAssetsEndpoint`, `skillLevelsEndpoint` and
  `teamSkillLevelsEndpoint`. None of these paths has a `[param]` template, so no label turns into a template string.
  `getTopCostlyEndpoints` (queries.ts:442) groups by `metadata->>'endpoint'`, so dashboard history carries on.
- **corp-structures.** The response is unchanged: the same `result` goes through `apiResponse(corpStructuresEndpoint, 200, …)`
  and the anonymous branch is untouched. `getCorpStructuresForUserOnView` is `async`, so it cannot throw synchronously.
  The new route test pins the metric payload and the body.
- **Source-scan guard (owned-data-coverage.test.ts).** It is not vacuous:
  - `filesMatching` uses `String.search`, so the `/g` flag's `lastIndex` does not leak between files.
  - It finds all nine OnView route files.
  - An empty list would leave the file with no tests, and that fails the run.
  - The regex requires `read: () => xOnView(` inside the `measureOwnedDataRead({` call, and the count must match the
    number of OnView calls.
  - Dropping corp-structures from handler-coverage.test.ts is fine, because the route now has its own test.

### P160: measureOwnedDataRead on observeCostPromise
- **Duration unit.** The only reader of `owned_data_read` durations is `getTopCostlyEndpoints`. It reads them through
  `jsonNumber`, which is `::double precision` (sql.ts:13), and returns `Math.round(avg)`. Nothing casts durationMs with
  `::int`: `jsonInt`/`summedInt` are only used for other keys. `usage_logs.metadata` is jsonb, and no zod schema,
  gate script or e2e test reads `owned_data_read` (I searched the whole repo, docs excluded).
- **Field names.** The metric keeps the same name and keys: endpoint, requested?, returned, outcome, durationMs on
  success; endpoint, requested?, outcome, durationMs on failure. The hook's fields are spread before
  `outcome`/`durationMs`, so the hook cannot override them.
- **No double-record.** Each settle emits once. `describeResult` and `emitCostMetric` both catch, so the success
  callback cannot throw, and a throw there could not reach the rejection handler anyway.
- **after() ordering and scope.** `observeCostPromise` registers its `.then` before the route awaits the same promise,
  so `emitCostMetric` → `after()` still runs inside the request, before the handler returns. The failure path behaves
  the same way.
- **Accepted edge cases.** The wave guide (P160 Notes b/c) records two differences, and neither can be hit today:
  - A synchronous throw in `read()` used to be recorded. All nine reads are arrows over `async` functions, so this
    cannot happen.
  - A throwing `returned` callback used to fail the request; now it only drops the field. Every callback is a total
    `.length` or null check, and the route uses the same value right after.
- **Other caller.** `industry/[id]/page.tsx` does not pass a fifth argument, so its behaviour is unchanged.

### P153: versionedAssetRoute
- **Valid input is unchanged.**
  - Same `apiResponse(endpoint, 200, asset)` with the same endpoint objects.
  - Same `withCacheControl(…, UNIVERSE_ASSET_CACHE_CONTROL)` ('public, max-age=31536000, immutable').
  - Content type still comes from `Response.json`.
  - No ETag was ever set.
  - Same 404 problem (`notFoundFailure('asset_version_not_found')`) on a version mismatch, still without Cache-Control.
  - The `apiResponse` change in this PR only extracts `declaredProblem`, and its body is unchanged.
- **Same schema.** `endpoint.params` for systems, adjacency and wormholes is the same `universeAssetVersionParamsSchema`
  (`z.string().min(1).max(64)`). The statics route uses `systemStaticsEndpoint.params`, which is the same
  `systemStaticsParamsSchema`, and an invalid id still gets 200 `{statics: []}`. The two schemas that are no longer
  exported have no other importers.
- **Malformed version.** It returns 404 before the loader runs. This is the declared change. The only other
  difference is that a loader failure on a malformed version is now 404 instead of 500, which is part of the same
  declared change.
- **Cache Components.** No request API moved and no `'use cache'` scope changed. The loaders in universe-assets.ts are
  untouched. The `[version]` routes have no `generateStaticParams`, so skipping `load()` on the malformed branch
  changes no prerender.
- **Manifest route.** `no-store` is applied once to both the 503 and the 200 response, the same headers as before.

### P149: readOr / loadSection
- **Messages and fallbacks.** Every log message is byte-identical, and so is every fallback:
  - `SECTION_LOAD_FAILED`.
  - `[]` at the end of the scanner cascade, with null as the step that triggers the cascade.
  - `UNAVAILABLE_CHROME`: the same shape as before. Its inner `EMPTY_MAP_CHROME` was already a shared module object,
    and nothing mutates either.
  - `null` for the gate.
  - `{jobIds: [], corpIds: []}`.
- **Control-flow signals and degrade scope.** `unstable_rethrow` still runs before the log. Each section still
  degrades on its own, and none became a whole-page failure.
- **Scanner cascade.** The lightweight index is tried only after the scanner index fails. A scanner result of `[]`
  still short-circuits, because the code uses `??` rather than `||`.
- **Loader calls.** `checkSession`, `getScannerSiteIndex` and `getSiteSearchIndex` take no arguments, so passing them
  by reference is equivalent.
- **Synchronous throws.** `loadSection` no longer being `async` cannot add a synchronous throw.
- **Untouched.** The conditional rethrow in `industryCharacters` is unchanged.

### P068: isCurrentReadIdentity / sameReadIdentity
All 13 replaced expressions are equivalent:
- **publishReadIdentity:** the null/null, null/obj and value-equal cases give the same result.
- **StructuresManager `matches`:** `owner` is a non-null `ReadIdentity` and the same userId and characterId are
  compared. Its `onSaved` and `onCorpSaved` guards were already written in the `identity === null ||` form.
- **remembered-read `get` and `set`:** these already had a null check.
- **use-live-dataset and use-slots-live:** the old guard had no null check, but both effects return early when
  `identity === null`, so a null identity never reaches `load`. Fresh results are never dropped.
- **use-industry-profiles:** `isCurrent` and the first checks in add and remove already had null checks. The
  post-await checks run on an identity already narrowed to non-null.

Currency is still decided by reference, so a request started before a return to an earlier account stays stale.
`PreferencesProvider`'s `currentReadIdentity() !== null` is not a staleness guard and was correctly left alone.
