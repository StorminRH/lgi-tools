# Wave 11 review: ESI request plumbing and character search (P192, P191, P194, P193, P150)

Scope: `git diff origin/claude/primitives-wave-10...origin/claude/primitives-wave-11`, commits d2ce55dc (P192), a9ad6a94 (P193), d4cc94f9 (P150), 9c0bc061 (P191), c80f70a6 (P194), 55d0e25b (P150 tests). OLD = wave-10, NEW = wave-11. Everything was read through git refs; nothing was run.

## Findings

### 1. (Low, borderline: inside the declared P150 scope) The abort skip also drops failures from requests the client abandoned on a timer, which the user did see

- **Where:** `src/app/api/capability-route.ts:31` (NEW), reached from `src/app/api/mutation-route.ts:87` for every `runMutationRoute` route.
- **Scenario:** two clients abort on a timer, not because a newer search replaced them:
  - `src/mapper/jump-client.ts:15` uses `AbortSignal.timeout(15_000)` against `maps.resolve-jump`.
  - `src/mapper/signatures/signature-elimination-client.ts:84` does the same against `maps.eliminate-signatures`.

  Both routes are on `runMutationRoute`. Under a DB slowdown, `resolveJumpRequest` / `resolveSignatureElimination` make several sequential neon-http calls, each with a 10 s timeout, so they can run past 15 s and then throw. The client has already shown the user a failure (`outcome.ok === false` gives null). Then `signal.aborted` is true and `result.outcome` is `unexpected`, so nothing is recorded. OLD recorded `unexpected` with its duration. `getCapabilityOutcomeStats` (`src/data/telemetry/sli-breakdown.ts:45-53`) feeds the admin success rates, failure breakdown and latency from every `capability_outcome` row. So during exactly the slowdown that makes users fail, those routes' slow failures disappear from the dashboard. Fast failures and late successes are still recorded, so the rate looks healthier than what users saw.
- **Evidence:**
  - OLD `runCapabilityRoute` recorded unconditionally in both the try and the catch.
  - NEW: `const record = (result) => { if (signal?.aborted === true && result.outcome !== 'succeeded') return; recordCapabilityOutcome(...) }`.
  - The comment at lines 18-21 justifies this as "the client hung up and never saw it". That is false for a timer abort.
- **Why borderline:** the PR body says the skip "applies to every route on `runMutationRoute` and `capabilityRoute`", so it is declared. The impact is narrower than it first looks:
  - jump-resolver Convex failures come back as a 200 `{status:'retry'}`, which is still recorded as succeeded.
  - So only thrown errors (DB, bugs) past 15 s are lost.
  - The thrown error is still rethrown and logged by Next. Only the capability metric is lost.

  Drop this if the owner accepts timer aborts as part of the declared scope.
- **Minimal fix:** make the skip opt-in for the two superseded-typeahead capabilities. One way is a `skipAbortedFailures` flag on the mutation options, passed only by `maps/search-characters` and `account/custom-structures/search`. The other is to record a distinct `cancelled` outcome that the success rate excludes but the breakdown still shows, as the P150 guide's step 5 suggested.

No other defects found in this lens.

## Leads checked and refuted

**P192 header parsers (`src/platform/esi/headers.ts`)**
- **`parseIntOrNull`.** It is byte-identical to OLD `dispatch.parseIntHeader`, `authed-read.intHeader` and `scoreboard/keys.parseStoredInt`: null gives null, then `Number.parseInt(v, 10)`, then the `isFinite` check. These inputs all give the same result as before:
  - missing header, `''`, non-numeric and negative values;
  - floats (`'2.5'` gives 2) and huge numbers;
  - an Upstash auto-deserialized number (`parseInt(5)` gives 5).

  Every call site was swapped one-for-one:
  - `buildReport`'s error-limit, reset and Retry-After;
  - Content-Length in `captureBodyForCache`;
  - `noteLocalAnswer`'s remain and Retry-After;
  - 429 Remaining and Retry-After in `throwIfErrorStatus`;
  - `captureRl`'s three fields;
  - all four uses in `redis.ts`.
- **`httpDateMs`.** It matches the old parsers:
  - `Date.parse` returns either NaN or a finite number, so OLD dispatch's `isNaN` check and OLD authed-read's `isFinite` check agree.
  - market-history's OLD `new Date(str)` uses the same string parser as `Date.parse`.
  - `staleAfterFromExpires` keeps its fallback: `??` binds looser than `+`, so the fallback is `now + DAY_MS`, and `DAY_MS` = 86,400,000.
- **`esiPageCount`.**
  - authed-read OLD computed `intHeader ?? 1` and applied `Math.max(1, ...)` only to page 1's page count. NEW takes the max inside the parser.
  - That only changes the stored `responseHeaders.xPages` when X-Pages is `'0'` or negative, which ESI never sends. Absent, empty and garbage values give 1 both ways.
  - market-prices moves from `Number()` to `esiPageCount`, which is declared. In OLD, NaN or 0 skipped pages 2..N; NEW gives 1, so the result is the same.
- **`safeCachedBody`.** It is equivalent at both sites, including `liveSb === null` giving null.

**P191 request inits (`src/platform/esi/request-init.ts`)**
- `esiAuthInit` sets `Authorization: Bearer`. It sets If-None-Match whenever the etag is neither undefined nor null, so `''` still gets sent, as OLD's `!== null` did. It adds `signal` only when it is truthy. Headers stay a plain object, which the `structure-search.test` `tokenOf` helper and the route tests need.
- `esiJsonPostInit` covers four sites, each keeping the same method, `JSON.stringify` body and Authorization:
  - `readEsiAuthedPost`;
  - affiliation, where `Content-Type` becomes `content-type`, which `Headers` treats the same;
  - universe-names;
  - exact-name search.
- User-Agent and `X-Compatibility-Date` are still added by `dispatch.buildHeaders`.
- ETag eligibility (GET with no Authorization) is unchanged at every site.

**P194 paths (`src/platform/esi/paths.ts`)**
- These call sites produce byte-identical paths:
  - sheet location, ship and online, which already had the slash;
  - all three `/universe/structures/{id}/` sites;
  - corp assets. `ownedResourcePath('assets', corp)` is `/corporations/{id}/assets/`, the same as OLD's literal. The writer (`owned.ts` `source.endpoint`, then `owned-assets-source-save.ts:30-31`) and the reader (`queries.ts:62`) now share it.
- Only Convex `/online`, `/location`, `/ship` and `/roles` changed, which is declared. Checks on those four:
  - They match the registry specPaths, and the sheet already called the same trailing-slash spellings in production.
  - `normalizeEsiPath` (`scoreboard/keys.ts:10-11`) strips trailing slashes, so local and Redis rate-limit blocks and budget `resource` labels are unchanged.
  - The ETag meta and body keys do include the full path, but `isEtagEligible` is false with Authorization, so these reads never use them.
  - Convex keeps no path-keyed state. Its held etags only go out as If-None-Match, so the worst case is one 200 instead of a 304.
  - Nothing at runtime reads `specPaths`.
- `headers.ts`, `request-init.ts` and `paths.ts` have no import statements. Convex imports only `paths` and `authed-read`, and their new dependencies are those import-free files.
- `owned-assets/queries` now imports `./refresh`, with no cycle.
- `readCorpAssetSnapshots` has one caller.

**P193 scoped search (`composition/esi-character-search.ts`)**
- It uses the same `listLinkedCharacters(userId)` source and order and the same `deriveScopeHealth` filter, so it cannot reach another user's characters. Tokens are vended only for listed characters.
- The loop:
  - skips a non-ok token and 401/403 only;
  - rethrows 5xx, `EsiBudgetExhaustedError`, invalid body and abort errors;
  - returns on the first hit;
  - runs `throwIfAborted` before and after the vend.
- An abort while the fetch is in flight throws Next's `ResponseAborted`, forwarded by `fetchWithTimeout`. It is not mistaken for a refusal.
- The rest is unchanged:
  - structure search's fan-out and budget rethrow;
  - map search's exact-name fallback, which runs only when no character is scoped;
  - names resolution, which stays outside the try.
- Only the invalid-body text changed, and the route maps every throw to a 503 with a fixed detail.
- `esi-character-search.test.ts` and the new route tests are not vacuous.

**P150 routes**
- **Structure search on `runMutationRoute`.**
  - Stage order is auth (401), then origin (403), then parse (400), then handle.
  - `apiFailure` gives the same statuses and codes as before. 403 `cross_origin` is now declared.
  - The real client (`structure-search-client.ts`, through `apiFetch`) sends a relative same-origin POST, so Origin matches. A missing Origin or Referer passes. `maps/search-characters` already uses the same gate.
- **`request.signal`.**
  - On Next 16.3.4 the signal aborts only when the response closes before `writableFinished` (`next-request.js:45-55`). A normal completion does not abort it.
  - `signal` is not in the dynamic-access proxy lists in `app-route/module.js`, so reading it raises no Cache Components issue.
  - No cron routes use these wrappers.
- **Telemetry.**
  - For requests that were not aborted, the order is unchanged: the response's result is computed first, then `durationMs`.
  - A server-side ESI timeout uses its own controller, so it still records, and the scoreboard still gets a no-response report (`dispatch.ts:151` excludes only caller aborts).
  - `sync-leave` beacons are keepalive requests the browser completes, so it does not close them early.
  - esiFetch does not coalesce requests, so one caller's abort cannot fail another's.
