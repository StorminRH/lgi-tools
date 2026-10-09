# Wave 11: ESI reads, owner-sync and owner-dataset persistence

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 10: Server pipelines, purge, telemetry and the admin console](wave-10-server-pipelines-purge-telemetry-and-the-admin.md) · [Index](README.md#roadmap) · [Wave 12: Market data, search and client data reads](wave-12-market-data-search-and-client-data-reads.md) →

Share the ESI header parsers and the scoped search loop. The search routes are aligned, then request-init and path builders land. Owner-sync gets shared port bases, EnumeratedOwner fixtures, ownerSyncDataset, single-flight token vending, a per-phase sheet memo and reuse of fresh corp roles. Persistence follows: one skill-row read, then batched sync-state reads, then tx-only writers, then replaceOwnerSnapshot, then expireNow. Last come purge cache tags and the rig-slot helpers.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P192](#p192) | Share one nullable-int and HTTP-date header parser inside platform/esi | esi-sync | S | low | low | — |
| ☐ | [P193](#p193) | Share the scoped-linked-character ESI search loop and its id parse in composition/esi-character-search | esi-sync | S | low | medium | — |
| ☐ | [P150](#p150) | Share the scoped-character ESI search loop between map character search and structure search, and align the two routes' same-origin and abort handling | api-route | M | medium | medium | [P193](#p193) |
| ☐ | [P191](#p191) | Add platform/esi request-init builders and use one X-Pages parser; keep each public reader's status handling local | esi-sync | S | low | low | [P192](#p192), [P193](#p193) |
| ☐ | [P194](#p194) | Build ESI paths shared across modules once, and tie the snapshot endpoint's writer and reader to one builder | esi-sync | M | low | medium | — |
| ☐ | [P190](#p190) | Make platform/owner-sync the single home for owner-sync port bases and read-result types | esi-sync | M | low | medium | — |
| ☐ | [P345](#p345) | Use EnumeratedOwner instead of three local copies, and share the owner fixture and owned-dataset port fake | testing | S | low | medium | [P190](#p190) |
| ☐ | [P188](#p188) | Define each deferred-queue dataset once with ownerSyncDataset(dataset, makePort, refresh) and one target-filtered priority picker | esi-sync | S | low | low | [P190](#p190) |
| ☐ | [P189](#p189) | Single-flight owner-sync token vending in vendTokenFor via a shared lib/single-flight primitive | esi-sync | S | low | medium | [P188](#p188) |
| ☐ | [P292](#p292) | Read each character's sheet row once per direct-section phase by promoting memoizePerRun to src/lib | efficiency | S | low | high | [P188](#p188) |
| ☐ | [P297](#p297) | Reuse fresh stored corp roles when the sync passes pick a corp credential | efficiency | S | medium | medium | [P186](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p186), [P189](#p189) |
| ☐ | [P286](#p286) | Read the character_skills row once per character for the board | efficiency | S | low | low | — |
| ☐ | [P178](#p178) | Batch the per-character sync-state reads behind board and jobs views with inArray list readers | server-pipeline | S | low | medium | [P327](wave-05-persistence-primitives-and-data-layer-sql.md#p327), [P286](#p286) |
| ☐ | [P336](#p336) | Invalidate only in the commit owner: drop the rig-save revalidate and replace the `database === db` mode switch with tx-only writers | simplification | S | low | low | [P220](wave-05-persistence-primitives-and-data-layer-sql.md#p220) |
| ☐ | [P239](#p239) | Replace owner snapshots in one direct-client transaction that takes the sync-row lock first | persistence | M | medium | medium | [P220](wave-05-persistence-primitives-and-data-layer-sql.md#p220), [P336](#p336) |
| ☐ | [P184](#p184) | Expire owner-dataset cache tags immediately after sync writes (keep the snapshot's uncached reads) | server-pipeline | M | low | medium | [P327](wave-05-persistence-primitives-and-data-layer-sql.md#p327) |
| ☐ | [P241](#p241) | Expire a purged character's 'use cache' tags from runPurge through a PurgeContributor.cacheTags hook | persistence | S | low | medium | [P240](wave-10-server-pipelines-purge-telemetry-and-the-admin.md#p240), [P184](#p184) |
| ☐ | [P273](#p273) | Put Upwell rig-slot helpers (UPWELL_RIG_SLOTS, rigSlotsFrom, fittedRigIds, fittingRigs) in data/eve-data/structures and return the stored row from upsertCorpStructureRigs | feature-skeleton | S | low | low | [P336](#p336) |

<a id="p192"></a>

## P192: Share one nullable-int and HTTP-date header parser inside platform/esi

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +15 lines
- **Depends on:** —
- **Existing primitive:** `src/lib/sync-engine.ts:minCacheWindow; src/platform/auth/eve-sso.ts:readRetryAfter (logic to promote)`

**Problem.** The same `string | null` to `int | null` parse is written three times in platform/esi: two header helpers and one Redis-value helper. HTTP-date parsing for Expires is written three times (authed-read, dispatch, market-history). dispatch wraps getCachedBody in the same swallow-errors try/catch twice. All copies behave the same today, so this is clean-up that keeps the next ESI header read from adding a fourth variant.

**Verifier revision.** What survives: three byte-identical nullable-int parsers inside platform/esi (dispatch parseIntHeader 63-68, authed-read intHeader 194-199, scoreboard parseStoredInt 60-64). Expires is also parsed separately by authed-read parseExpires (178-183), dispatch isWithinExpiresWindow (141-146) and market-history staleAfterFromExpires (38-44), and dispatch repeats a swallow-errors getCachedBody try/catch (163-168 and 253-260).

What is rejected:
- The lib home: the only cross-zone consumers are eve-sso (an SSO token endpoint whose helper is already correct) and market-history. data may import platform/esi, so the shared code can stay ESI-local.
- The Retry-After 'drift': ESI sends Retry-After in seconds, so an HTTP-date never arrives in practice. If one did, scoreboard resolveRetryAfter (keys.ts 29-31) would default to 60s and clamp. Accepting an HTTP-date is optional hardening, not a fix.
- A shared readRateLimit: buildReport (92-95) and captureRl (185-192) write different field names, and captureRl only writes when the group header is present, so a shared reader saves nothing.
- earliestExpiry: minCacheWindow (strict: any null gives null; convex characterLocationApply:130), resolveExpiresAt (fallback TTL) and finalizeFresh (min of the present windows, else null) are three deliberate policies over a two-line fold. A helper would add indirection for no gain.

**Sites (7).**

- [`src/platform/esi/dispatch.ts:63-68`](../../src/platform/esi/dispatch.ts#L63-L68) — parseIntHeader
- [`src/platform/esi/dispatch.ts:82-99, 110-114, 297-308`](../../src/platform/esi/dispatch.ts#L82-L99) — parseIntHeader callers: buildReport, captureBodyForCache Content-Length, throwIfErrorStatus 429 Remaining and Retry-After
- [`src/platform/esi/dispatch.ts:141-146`](../../src/platform/esi/dispatch.ts#L141-L146) — isWithinExpiresWindow: Date.parse with an isNaN check on the stored Expires string
- [`src/platform/esi/dispatch.ts:163-168, 253-260`](../../src/platform/esi/dispatch.ts#L163-L168) — getCachedBody try/catch-to-null, twice
- [`src/platform/esi/authed-read.ts:178-183, 194-199`](../../src/platform/esi/authed-read.ts#L178-L183) — parseExpires (Date.parse with isFinite) and intHeader (same body as parseIntHeader)
- [`src/platform/esi/scoreboard/keys.ts:60-64`](../../src/platform/esi/scoreboard/keys.ts#L60-L64) — parseStoredInt, same body on a Redis string; consumed at scoreboard/redis.ts 41-42 and 72
- [`src/data/market-history/source.ts:38-44`](../../src/data/market-history/source.ts#L38-L44) — staleAfterFromExpires: new Date(x) with an isNaN check and a 24h fallback (third HTTP-date parse)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/eve-sso.ts:133-137`](../../src/platform/auth/eve-sso.ts#L133-L137) — readRetryAfter is for the SSO token endpoint, returns ms with a 0 default, and is already correct. Leave it.
- [`src/lib/sync-engine.ts:70-73`](../../src/lib/sync-engine.ts#L70-L73) — minCacheWindow is deliberately strict (any null gives null); used by convex/characterLocationApply.ts:130
- [`convex/lib/characterSync.ts:75-82`](../../convex/lib/characterSync.ts#L75-L82) — resolveExpiresAt is a fallback-TTL policy; a two-line fold, so leave it
- [`src/platform/esi/authed-read.ts:152-176`](../../src/platform/esi/authed-read.ts#L152-L176) — finalizeFresh's min of the present windows, else null, is a third policy; leave it
- [`src/platform/esi/authed-read.ts:185-192`](../../src/platform/esi/authed-read.ts#L185-L192) — captureRl and buildReport 92-95 read the same rate-limit headers into differently named fields, and captureRl has a group guard; no saving
- [`src/platform/esi/scoreboard/keys.ts:29-31`](../../src/platform/esi/scoreboard/keys.ts#L29-L31) — resolveRetryAfter defaults to 60s and clamps, so an HTTP-date Retry-After would be harmless

</details>

**Home.** `src/platform/esi/headers.ts (new, no imports)`

**Boundary check.** Home zone: platform/esi.
- dispatch, authed-read and scoreboard/keys: internal.
- data/market-history and data/market-prices (P191): the `data` rule allows platform/esi.

The module imports nothing, which satisfies the `platform/esi` rule ['lib','config']. Use the deep import '@/platform/esi/headers'. The market-history and market-prices tests mock the barrel with importActual spreads, but a deep import avoids depending on that.

**API sketch.**

```ts
export function parseIntOrNull(value: string | null): number | null; // Number.parseInt(v, 10), finite or null
export function intHeader(headers: Headers, name: string): number | null;
export function httpDateMs(value: string | null): number | null; // Date.parse, finite or null
export function esiPageCount(headers: Headers): number; // Math.max(1, intHeader(headers, 'X-Pages') ?? 1)
```

**Migration steps.**

1. Create src/platform/esi/headers.ts and headers.test.ts.
2. dispatch.ts: delete parseIntHeader. buildReport (90-96), captureBodyForCache (111) and throwIfErrorStatus (303, 305) use intHeader(res.headers, ...). isWithinExpiresWindow uses httpDateMs. Add a private `safeCachedBody(sb, url)` and use it at 163-168 and 253-260.
3. authed-read.ts: delete intHeader and parseExpires. Use intHeader(res.headers, ...) and httpDateMs(res.headers.get('Expires')). fetchPage's xPages becomes esiPageCount(res.headers), and the Math.max at line 135 is dropped.
4. scoreboard/keys.ts: replace parseStoredInt's body with parseIntOrNull, or point redis.ts 41-42 and 72 at parseIntOrNull and delete parseStoredInt.
5. market-history/source.ts staleAfterFromExpires becomes `new Date(httpDateMs(expires) ?? now.getTime() + DAY_MS)`, keeping its exported signature and tests.
6. Optional: dispatch's Retry-After reads at 96 and 305 accept delta-seconds or an HTTP-date through a parseRetryAfterSeconds helper here. Label it hardening, not a bug fix.

**Tests.** New headers.test.ts covering:
- parseIntOrNull for null, '12', '12abc' (gives 12, matching today) and 'x'.
- httpDateMs for a valid date, garbage and null.
- esiPageCount for missing, '0', 'abc' and '3'.

Existing tests that guard the change:
- platform/esi/index.test.ts (dispatch: reporting, 429 Retry-After, expires-window serve, revalidation)
- platform/esi/authed-read.test.ts (X-Pages, expiresAt)
- platform/esi/scoreboard.test.ts
- data/market-history/source.test.ts (staleAfterFromExpires)

**Notes.** All copies have identical semantics today: parseInt prefix-parses, and Date.parse is equivalent to new Date().getTime(). This is consolidation, not a bug fix. Keep the strict null policy of minCacheWindow, the fallback TTL of resolveExpiresAt and the null result of finalizeFresh. P191's market-prices X-Pages fix uses esiPageCount from here.

<sub>Reported by: area:platform, concern:esi-sync.</sub>

<a id="p193"></a>

## P193: Share the scoped-linked-character ESI search loop and its id parse in composition/esi-character-search

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -35 / +25 lines
- **Depends on:** —
- **Existing primitive:** `src/composition/esi-character-search.ts:fetchCharacterSearch; src/composition/sync/owner-sync-port.ts:vendTokenFor`

**Problem.** searchMapCharacters and searchUpwellStructures each implement the scoped-character filter, the token-vend loop, the per-category id schema and the no-usable-token error. The copies have drifted. structure-search moves on to the next character after a 401/403 search refusal and honors an AbortSignal. map-character-search lets one stale grant fail the whole typeahead, and it takes no signal.

**Sites (9).**

- [`src/composition/map-character-search.ts:14-16`](../../src/composition/map-character-search.ts#L14-L16) — esiCharacterSearchSchema
- [`src/composition/map-character-search.ts:33-41`](../../src/composition/map-character-search.ts#L33-L41) — fetchCharacterSearch, then safeParse; throws 'invalid body'
- [`src/composition/map-character-search.ts:74-92`](../../src/composition/map-character-search.ts#L74-L92) — scoped filter; the token loop returns on the first ok token, so a 401/403 escapes
- [`src/composition/structure-search.ts:13-15`](../../src/composition/structure-search.ts#L13-L15) — esiStructureSearchSchema, the same shape
- [`src/composition/structure-search.ts:44-86`](../../src/composition/structure-search.ts#L44-L86) — structureIdsSeenBy, searchWithCharacter and firstValidSearch, with the 401/403 skip and abort checks (correct copy)
- [`src/composition/structure-search.ts:103-114`](../../src/composition/structure-search.ts#L103-L114) — scoped filter with STRUCTURE_SEARCH_SCOPES
- [`src/composition/esi-character-search.ts:1-27`](../../src/composition/esi-character-search.ts#L1-L27) — EsiCharacterSearchError; fetchCharacterSearch returns unknown
- [`src/composition/structure-search.test.ts:110-121, 176-195`](../../src/composition/structure-search.test.ts#L110-L121) — guards the message texts ('usable ESI access token', '(502)', 'invalid body'), stop-before-fanout on 400/502, and the 401/403 next-character rule
- [`src/app/api/maps/search-characters/route.test.ts:189-223`](../../src/app/api/maps/search-characters/route.test.ts#L189-L223) — guards the 503 on a scoped failure, with no exact-name fallback, and fail-closed when no token vends

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/structure-search.ts:88-96, 116-135`](../../src/composition/structure-search.ts#L88-L96) — fan-out over the remaining characters and the readWithAny ACL merge are structure-only, because each character's ACL differs
- [`src/composition/map-character-search.ts:55-72`](../../src/composition/map-character-search.ts#L55-L72) — the public exact-name fallback is map-only and runs only when no character is scoped
- [`src/composition/sync/owner-sync-port.ts:31-34`](../../src/composition/sync/owner-sync-port.ts#L31-L34) — using vendTokenFor is legal (same zone) but optional. It couples the search to the sync-port module (affiliation-source, corp-roles-store), so the two-line `token.kind === 'ok'` check can stay in the helper.

</details>

**Home.** `src/composition/esi-character-search.ts`

**Boundary check.** Home zone: composition. Consumers: composition (map-character-search, structure-search).

The home already imports platform/esi. It will add platform/auth/linked-characters, eve-token-service and scope-health, and zod. The `composition` rule allows platform/auth, platform/esi and features. The external dependency is zod. No route or feature imports the helper.

**API sketch.**

```ts
export type SearchCategory = 'character' | 'structure';
export async function fetchCharacterSearch(characterId: number, accessToken: string, category: SearchCategory, search: string, signal?: AbortSignal): Promise<number[]>; // throws EsiCharacterSearchError(category, status) on !ok; Error(`ESI ${category} search returned an invalid body`)
export async function scopedLinkedCharacters(userId: string, scopes: readonly string[]): Promise<LinkedCharacter[]>;
export interface CharacterSearchHit { characterId: number; accessToken: string; ids: number[] }
export async function searchAsCharacter(character: LinkedCharacter, category: SearchCategory, search: string, signal?: AbortSignal): Promise<CharacterSearchHit | null>; // null when no ok token; throwIfAborted before and after vend
export async function firstUsableSearch(characters: readonly LinkedCharacter[], category: SearchCategory, search: string, signal?: AbortSignal): Promise<{ first: CharacterSearchHit; remaining: readonly LinkedCharacter[] }>; // skips null and 401/403; rethrows others; throws 'No scoped linked character has a usable ESI access token'
```

**Migration steps.**

1. In esi-character-search.ts, give fetchCharacterSearch per-category zod schemas so it returns number[]. Move the scoped filter in as scopedLinkedCharacters, and move searchWithCharacter and firstValidSearch from structure-search.ts 57-86 as searchAsCharacter and firstUsableSearch, keeping structure-search semantics.
2. structure-search.ts: delete esiStructureSearchSchema, structureIdsSeenBy, searchWithCharacter, firstValidSearch and the inline filter. Use scopedLinkedCharacters(userId, STRUCTURE_SEARCH_SCOPES), firstUsableSearch(scoped, 'structure', ...), and searchAsCharacter for the allSettled fan-out. Rename structureIds to ids in the seenBy merge.
3. map-character-search.ts: delete esiCharacterSearchSchema and the token loop. Keep `if (scoped.length === 0) return searchExactName(search)`. Then call `const { first } = await firstUsableSearch(scoped, 'character', search)` and keep the uniqueIds, resolveEntityNamesStrict and portrait mapping. Optionally thread request.signal from the route.
4. Keep the error texts that tests assert: '(status)', 'invalid body' and 'usable ESI access token'.

**Tests.** Existing tests that guard the change:
- composition/structure-search.test.ts (the whole suite)
- app/api/maps/search-characters/route.test.ts

Add to the route test, for the intended fix:
- With two scoped characters, the first search returns 401 and the second succeeds. Expect 200 with results and two searches.
- With every scoped search returning 403, expect 503.

Optionally add esi-character-search.test.ts:
- token-fail skip
- 401/403 skip
- 4xx other than 401/403 rethrows
- malformed body throws
- abort before vend

**Notes.** Intended behavior change: map-character-search now tries the next scoped character after a 401/403, matching structure-search.

Preserve these behaviors:
- The exact-name fallback runs only when no character is scoped. With scoped characters that all fail, the search still throws, giving the route's 503 (route.test.ts 214-223).
- Any other search status (400, or a 503 seen through a mocked esiFetch) still aborts immediately.
- Search headers stay a plain object (structure-search.test.ts tokenOf). If P191 lands first, fetchCharacterSearch uses esiAuthInit.

<sub>Reported by: area:composition, concern:esi-sync.</sub>

<a id="p150"></a>

## P150: Share the scoped-character ESI search loop between map character search and structure search, and align the two routes' same-origin and abort handling

- **Status:** [ ] not started
- **Category:** api-route · **Kind:** efficiency · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** About -30/+35 for the loop, routes and contract, plus tests; the abort-recording step adds about 15
- **Depends on:** [P193](#p193)
- **Existing primitive:** `src/composition/esi-character-search.ts:fetchCharacterSearch`

**Problem.** searchMapCharacters and searchUpwellStructures each list linked characters, filter them by scope health, and loop through vending fresh tokens until one search succeeds. The copies have drifted. Only structure search skips a character whose search is refused with 401 or 403, and only structure search takes an AbortSignal and calls throwIfAborted. The route wrappers have drifted too. Character search goes through runMutationRoute and enforces same-origin; structure search uses capabilityRoute plus checkUserId, is exempt from same-origin, and forwards request.signal. Neither route treats a client abort differently from an ESI outage, so aborts would be recorded as 503 dependency_unavailable and would lower the read SLI.

**Verifier revision.** The two endpoints are the same kind: authenticated, read-only (both are 'read' capabilities in CAPABILITIES), searching ESI with a linked character's token, and returning 503 on any failure. The fallow semantic-duplicate group pairs map-character-search.ts:75-80 with structure-search.ts:105-110. The strongest finding was not cited: the token loops have drifted in behaviour. structure-search's firstValidSearch skips a character whose ESI search returns 401 or 403 and tries the next one; this is tested at structure-search.test.ts:190. searchMapCharacters lets that EsiCharacterSearchError escape, so one revoked or refused token fails the whole typeahead with a 503 even when another scoped character would work. Both loops throw the same 'No scoped linked character has a usable ESI access token' message. The same-origin drift is also real: search-characters is in PIPELINE_MUTATIONS and its contract declares 403 cross_origin, while custom-structures/search is in EXEMPT_MUTATIONS with no 403. The efficiency claim is weaker than stated. The client debounces, and an abandoned character search costs roughly one token vend, one ESI search and one names lookup. Forwarding request.signal as-is would also make telemetry worse: the read SLI (queries.ts:436-438) counts every non-succeeded outcome, and an aborted search would be recorded as a 503 dependency_unavailable. Structure search already has that problem today. Signal threading should therefore land only together with abort-aware outcome recording.

**Sites (13).**

- [`src/composition/map-character-search.ts:74-92`](../../src/composition/map-character-search.ts#L74-L92) — scope filter plus token loop; a 401/403 from fetchCharacterSearch escapes and becomes a 503; no signal
- [`src/composition/structure-search.ts:57-86`](../../src/composition/structure-search.ts#L57-L86) — searchWithCharacter and firstValidSearch: throwIfAborted, skip on token not ok, skip on EsiCharacterSearchError 401/403, same exhaustion message
- [`src/composition/structure-search.ts:103-114`](../../src/composition/structure-search.ts#L103-L114) — the parallel scope filter and the call into firstValidSearch, which needs the `remaining` characters
- [`src/composition/esi-character-search.ts:1-27`](../../src/composition/esi-character-search.ts#L1-L27) — EsiCharacterSearchError and fetchCharacterSearch (already takes a signal). This is the shared module both searches import.
- [`src/app/api/maps/search-characters/route.ts:12-34`](../../src/app/api/maps/search-characters/route.ts#L12-L34) — runMutationRoute (same-origin enforced); does not pass request.signal; any throw becomes a 503
- [`src/app/api/account/custom-structures/search/route.ts:13-36`](../../src/app/api/account/custom-structures/search/route.ts#L13-L36) — capabilityRoute plus checkUserId; passes request.signal; an abort also becomes a 503 dependency_unavailable
- [`src/app/api/same-origin-coverage.test.ts:34, 91-94`](../../src/app/api/same-origin-coverage.test.ts#L34) — search-characters classified as a pipeline mutation, structure search as exempt
- [`src/data/maps/api-contract.ts:100-111`](../../src/data/maps/api-contract.ts#L100-L111) — declares 403 cross_origin
- [`src/features/custom-structures/api-contract.ts:138-148`](../../src/features/custom-structures/api-contract.ts#L138-L148) — declares no 403
- [`src/features/maps/CharacterSearchControl.tsx:88-113`](../../src/features/maps/CharacterSearchControl.tsx#L88-L113) — the client aborts superseded debounced searches
- [`src/data/telemetry/queries.ts:436-438`](../../src/data/telemetry/queries.ts#L436-L438) — the read SLI counts every outcome that is not succeeded
- [`src/composition/structure-search.test.ts:190`](../../src/composition/structure-search.test.ts#L190) — guards the 401/403 next-character fallback that map search lacks
- [`src/app/api/maps/search-characters/route.test.ts:189-223`](../../src/app/api/maps/search-characters/route.test.ts#L189-L223) — guards 503 on ESI 5xx, on a names failure and on no usable token; these must not change

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/structure-search.ts:116-126`](../../src/composition/structure-search.ts#L116-L126) — The parallel search over the remaining characters (allSettled; only budget errors rethrown) is specific to structure search. Keep it local.
- [`src/composition/map-character-search.ts:55-72, 83`](../../src/composition/map-character-search.ts#L55-L72) — The exact-name public fallback when no character has the scope is specific to character search. Structure search returns [] instead; keep both.

</details>

**Home.** `src/composition/esi-character-search.ts (existing shared module of both searches)`

**Boundary check.** The home is in the composition zone. The composition rule allows platform/auth (listLinkedCharacters, deriveScopeHealth, getFreshAccessTokenForCharacter, LinkedCharacter) and platform/esi (esiFetch), which esi-character-search.ts already imports. Both consumers, map-character-search.ts and structure-search.ts, are in composition, which is the same zone. The routes are in the api zone and import composition, which the api rule allows. The same-origin change uses src/app/api/mutation-route.ts (api zone) and @/platform/auth/same-origin; the api rule allows platform/auth.

**API sketch.**

```ts
export async function scopedLinkedCharacters(userId: string, scopes: readonly string[]): Promise<LinkedCharacter[]>;
export async function firstScopedSearch<T>(characters: readonly LinkedCharacter[], run: (characterId: number, accessToken: string) => Promise<T>, signal?: AbortSignal): Promise<{ value: T; remaining: readonly LinkedCharacter[] }>; // per character: throwIfAborted, vend a token (skip unless 'ok'), throwIfAborted, run; skip on EsiCharacterSearchError 401/403; throw 'No scoped linked character has a usable ESI access token' when none work
export async function searchMapCharacters(userId: string, search: string, signal?: AbortSignal): Promise<SearchCharactersResponse>;
```

**Migration steps.**

1. In esi-character-search.ts, add scopedLinkedCharacters and firstScopedSearch, lifting the loop and the 401/403 skip from structure-search.ts:57-86.
2. Rebuild structure-search on them: firstValidSearch becomes firstScopedSearch(scoped, (id, token) => structureIdsSeenBy(id, token, search, signal).then((structureIds) => ({ accessToken: token, structureIds })), signal). Keep searchWithCharacter for the remaining characters searched in parallel. structure-search.test.ts must pass unchanged.
3. Rebuild searchMapCharacters on scopedLinkedCharacters and firstScopedSearch, and add an optional `signal` threaded into fetchCharacterSearch. This fixes the missing 401/403 skip.
4. Align the same-origin policy by moving custom-structures/search onto runMutationRoute({ capability: 'structures.search-structures', authorize: checkUserId, parse: (r) => readJsonBody(r, searchStructuresRequestSchema), handle }), as search-characters does. Add 403: problem('cross_origin') to searchStructuresEndpoint and move the route from EXEMPT_MUTATIONS to PIPELINE_MUTATIONS in same-origin-coverage.test.ts.
5. Before passing request.signal from search-characters, make aborts stop counting as failures. For example, give runCapabilityRoute an optional signal (passed by capabilityRoute and runMutationRoute from request.signal) and skip recording, or record a 'cancelled' outcome excluded from the read SLI, when the signal is aborted and the work threw or returned ≥ 400. Then pass request.signal into searchMapCharacters. This also stops structure search's existing aborts from showing up as dependency_unavailable.

**Tests.** Add src/composition/esi-character-search.test.ts for firstScopedSearch: skips a character whose token is not ok; skips 401 and 403 and returns `remaining`; rethrows other statuses (503 must not fall through to the next character, matching route.test.ts:189); throws the exhaustion error; stops with an AbortError when the signal is already aborted. Extend src/app/api/maps/search-characters/route.test.ts with 'tries the next scoped character when the first is refused with 401/403'. Keep structure-search.test.ts green, including line 190. Update same-origin-coverage.test.ts, and add a cross-origin 403 case to custom-structures/search/route.test.ts. If the abort-recording change lands, add capability-route tests for an aborted request with a failing handler.

**Notes.** Behaviour that must be kept: map search still falls back to exact-name search only when no character has the scope (route.test.ts:118), still returns 503 for an ESI 5xx, an incomplete names resolution, or no usable token, and must never fall through to the next character on a 5xx. Structure search keeps returning [] when no character has the scope, keeps its parallel search over the remaining characters and its EsiBudgetExhaustedError rethrow. The new behaviour (map search tries the next character on 401/403) is the fix; structure search's behaviour is the correct copy. getFreshAccessTokenForCharacter takes no signal, so the abort checks surround it as structure search does today. Do not forward request.signal before outcome recording is abort-aware, because doing so would lower the read SLI for maps.search-characters. Forwarding the signal saves little on its own, so if the telemetry change is rejected, do the loop and same-origin steps and drop the signal step.

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p191"></a>

## P191: Add platform/esi request-init builders and use one X-Pages parser; keep each public reader's status handling local

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +25 lines including the new test
- **Depends on:** [P192](#p192), [P193](#p193)
- **Existing primitive:** `src/platform/esi/index.ts:esiFetch,esiUrl; src/platform/esi/authed-read.ts:readEsiAuthed,readEsiPagedAuthed; src/platform/esi/errors.ts:EsiContractError`

**Problem.** Request init is built by hand at 9 sites:
- Bearer and If-None-Match at 5 sites. This header decides ETag eligibility in dispatch isEtagEligible.
- JSON POST at 4 sites.

market-prices also parses X-Pages differently from the authed paginator. A malformed or empty header makes the region dump silently stop after page 1 instead of defaulting to 1 and continuing safely.

**Verifier revision.** What survives:
- Request building is hand-copied. The Bearer/If-None-Match header build appears in authed-read 32-33, 45 and 100-101, and again in esi-character-search 23 and structure-search 30-31, the last two because the authed readers take no AbortSignal. The JSON-POST init is hand-built in authed-read 43-47, affiliation-source 55-59, universe-names 14-18 and map-character-search 56-60.
- market-prices 185 parses X-Pages with Number(), so a malformed or empty header becomes NaN or 0 and pages 2..N are silently skipped. authed-read uses parseInt ?? 1 plus Math.max(1).

What is rejected:
- readEsi<T> with a status union: every caller keeps a different status contract (affiliation 404 bisection, eve-status 503, market-history silent skip, structure null, universe-names {ok:false,status}), and the union would save about one line per site.
- forEachEsiPage: the two paginators differ on purpose. authed-read short-circuits page 1 on an etag 304, flattens all pages and keeps per-page headers. market-prices streams the roughly 300-page Forge dump through a bounded pool with cancel-on-error and a per-page type pre-filter to cap memory.
- Reclassifying 4xx: dispatch.ts 309-311 already throws EsiServerError for 5xx, so these sites only ever see 4xx. market-prices falls back to Fuzzwork either way, and industry-indices only records err.constructor.name in its summary (ingest.ts 87-102), so the misnaming is cosmetic.
- Generic Error vs EsiContractError: both search routes map any throw to 503, and the universe-names callers treat every throw alike.

**Sites (11).**

- [`src/platform/esi/authed-read.ts:26-49`](../../src/platform/esi/authed-read.ts#L26-L49) — readEsiAuthed builds Bearer and If-None-Match; readEsiAuthedPost builds Bearer plus a JSON POST
- [`src/platform/esi/authed-read.ts:93-105, 133-135`](../../src/platform/esi/authed-read.ts#L93-L105) — fetchPage builds the same headers again; X-Pages read via intHeader ?? 1, then Math.max(1)
- [`src/composition/esi-character-search.ts:13-27`](../../src/composition/esi-character-search.ts#L13-L27) — hand-built Bearer plus signal over raw esiFetch
- [`src/composition/structure-search.ts:24-42`](../../src/composition/structure-search.ts#L24-L42) — readStructure hand-builds Bearer plus signal
- [`src/platform/auth/affiliation-source.ts:52-59`](../../src/platform/auth/affiliation-source.ts#L52-L59) — hand-built JSON POST ('Content-Type')
- [`src/composition/map-character-search.ts:55-60`](../../src/composition/map-character-search.ts#L55-L60) — hand-built JSON POST ('content-type')
- [`src/data/eve-data/universe-names.ts:9-18`](../../src/data/eve-data/universe-names.ts#L9-L18) — hand-built JSON POST
- [`src/data/market-prices/source.ts:183-198`](../../src/data/market-prices/source.ts#L183-L198) — Number(X-Pages ?? '1'): NaN or 0 skips pages 2..N silently
- [`src/platform/esi/dispatch.ts:58-61, 297-312`](../../src/platform/esi/dispatch.ts#L58-L61) — ETag eligibility keys off the Authorization header; 5xx already throws EsiServerError, so callers' `!res.ok` branches only see non-5xx statuses
- [`src/data/industry-indices/source.ts:56-66`](../../src/data/industry-indices/source.ts#L56-L66) — `new EsiServerError(res.status)` only ever carries a 4xx: cosmetic misnaming
- [`src/data/industry-indices/ingest.ts:87-102`](../../src/data/industry-indices/ingest.ts#L87-L102) — the only effect of that misnaming is err.constructor.name in the summary

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-history/source.ts:76-90`](../../src/data/market-history/source.ts#L76-L90) — plain GET with no init; the silent skip on !ok is its contract
- [`src/data/eve-status/queries.ts:16-28`](../../src/data/eve-status/queries.ts#L16-L28) — plain GET; the 503=offline mapping is local. The branch at line 19 cannot run with the real esiFetch (dispatch throws for 503), so only the catch at 23-25 fires.
- [`src/data/market-prices/source.ts:177-201`](../../src/data/market-prices/source.ts#L177-L201) — paginator is not merged with readEsiPagedAuthed (authed-read.ts 127-150); its semantics differ, see reason
- [`src/platform/auth/affiliation-source.ts:66-105`](../../src/platform/auth/affiliation-source.ts#L66-L105) — 404 bisection, transient mapping and contract-drift logging stay local

</details>

**Home.** `src/platform/esi/request-init.ts (new, no imports), imported by deep path. The page-count helper lives in src/platform/esi/headers.ts (from P192).`

**Boundary check.** Home zone: platform/esi.
- authed-read: internal to platform/esi.
- composition (esi-character-search, structure-search, map-character-search): the `composition` rule allows platform/esi.
- platform/auth (affiliation-source): the `platform/auth` rule allows platform/esi.
- data (universe-names, market-prices): the `data` rule allows platform/esi.

The new module imports nothing, so the `platform/esi` rule ['lib','config'] is satisfied. Use a deep import such as '@/platform/esi/request-init', following the precedent of '@/platform/esi/authed-read'. Barrel mocks with closed factories (universe-names.test.ts 5, maps search-characters route.test.ts 22) would otherwise hide a re-export.

**API sketch.**

```ts
// src/platform/esi/request-init.ts
export function esiAuthInit(accessToken: string, opts?: { etag?: string | null; signal?: AbortSignal }): RequestInit;
// -> { headers: { Authorization: `Bearer ${accessToken}`, ...(etag ? { 'If-None-Match': etag } : {}) }, ...(signal ? { signal } : {}) }
export function esiJsonPostInit(body: unknown, accessToken?: string): RequestInit;
// -> { method: 'POST', headers: { 'content-type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(body) }
// src/platform/esi/headers.ts (P192)
export function esiPageCount(headers: Headers): number; // Math.max(1, intHeader(headers, 'X-Pages') ?? 1)
```

**Migration steps.**

1. Create src/platform/esi/request-init.ts with a unit test. Headers must stay a plain object, because structure-search.test.ts tokenOf reads init.headers.Authorization.
2. authed-read.ts: readEsiAuthed (32-34), readEsiAuthedPost (43-47) and fetchPage (100-102) use esiAuthInit / esiJsonPostInit. authed-read.test.ts and platform/esi/index.test.ts guard this.
3. composition/esi-character-search.ts 21-24 and structure-search.ts readStructure 29-32 become esiFetch(url, esiAuthInit(accessToken, { signal })).
4. JSON POST: affiliation-source 55-59, universe-names 14-18 and map-character-search searchExactName 56-60 use esiJsonPostInit(ids). Header casing does not matter to Headers. affiliation-source.test stubs global fetch, and universe-names.test asserts objectContaining({method, body}).
5. After P192 lands esiPageCount: authed-read fetchPage line 105 uses it, the Math.max at line 135 is dropped, and market-prices line 185 uses `esiPageCount(firstRes.headers)`.
6. Optional, only if it reads better: parseEsiBody(schema, body), which throws EsiContractError, for market-prices 45-49, industry-indices 29-31/46-48, market-history 25-27 and eve-status/parse.ts 14.

**Tests.** Add request-init.test.ts covering:
- Bearer is always present.
- If-None-Match only when etag is non-null.
- The signal is passed through.
- POST shape.

Add market-prices source.test.ts cases:
- X-Pages 'abc' or missing reads one page with no throw.
- X-Pages '3' fetches pages 2 and 3. The existing test at line 511 covers '2'.

Existing tests that guard the change:
- platform/esi/authed-read.test.ts
- composition/structure-search.test.ts (header token extraction, signal pass-through at the 'passes cancellation' case)
- app/api/maps/search-characters/route.test.ts
- platform/auth/affiliation-source.test.ts
- data/eve-data/universe-names.test.ts

**Notes.** Keep every caller's status and failure contract unchanged; only init building and the page count move.

Leads found while verifying, not acted on here:
(1) readEsiPagedAuthed fetches pages 2..N with unbounded Promise.all (authed-read.ts 146-148), while market-prices bounds its pages with PAGE_CONCURRENCY. A large corp's assets could burst dozens of concurrent ESI calls. Not measured.
(2) A bounded worker-pool helper is hand-rolled three times with different cancel semantics: market-prices/source.ts 65-90 (cancel on error), market-history/source.ts 50-66 (no cancel) and eve-data/entity-names.ts 25-40. It is a candidate for a src/lib primitive.
(3) structure-search readStructure returns null on 4xx, but a 5xx throws from dispatch and fails the whole search through Promise.all at 132-134.

<sub>Reported by: area:platform, concern:esi-sync.</sub>

<a id="p194"></a>

## P194: Build ESI paths shared across modules once, and tie the snapshot endpoint's writer and reader to one builder

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -15/+40 (new ~10-line paths.ts and ~20-line conformance test; one-line swaps at 9 sites)
- **Depends on:** —
- **Existing primitive:** `src/data/location-tracking/esi-projection.ts:parseLocationBody (already shared by convex and character-sheet); src/composition/sync/character-sheet-sync.ts:STRUCTURE_ESI_PATH`

**Problem.** The corporation assets snapshot endpoint is written in one place and filtered on in another. platform/owner-sync basePathFor writes `/corporations/{id}/assets/` into source.endpoint, and composition persists it to esi_snapshots.endpoint. data/esi-snapshots/readCorpAssetSnapshots hard-codes the same string to filter. Any change to one spelling makes corp asset evidence disappear without an error. Separately, /universe/structures/{id}/ is templated in 3 composition modules, and the character location, ship and online paths are templated in both the sheet sync and Convex location sync, with or without a trailing slash. Only the sheet copies go through the registry-conformance test, so the Convex, roles, corp-context and structure-search paths are never checked against ESI_DATASET_ENTRIES specPaths.

**Verifier revision.** Only part of this holds up. (1) The snapshot-endpoint coupling is real and is the most valuable piece. owned.ts builds the endpoint string. owned-assets-source-save.ts writes it to esi_snapshots.endpoint. readCorpAssetSnapshots re-types the same string to filter on. If the two spellings ever differ, getCorpAssetEvidence (features/owned-assets/queries.ts:73-77) quietly returns null. The db tests do not catch this because each one writes its own literal. (2) The /universe/structures/{id}/ path is built in 3 composition sites, and the location/ship/online paths are built in both the sheet and convex. Only the sheet paths are checked against the ESI dataset registry (character-sheet-sync.test.ts:74-85). The convex, roles, corp-context and structure-search paths are never checked. One builder module plus one registry-conformance test closes that gap. The trailing-slash drift does nothing at runtime. normalizeEsiPath (scoreboard/keys.ts:9-15) strips trailing slashes. Authed reads are never ETag-cached server-side, because isEtagEligible (dispatch.ts:58-61) returns false whenever an Authorization header is present. So the only cost of the drift is that those paths escape the registry gate. (3) Rejected: shared body schemas. The structure, ship and online schemas are each consumer's own projection of the response, which is how every feature's esi-projection.ts is written. The two name-only copies are a single line each. A shared data/eve-data schema would add a cross-zone import to save one z.object, and the proposal's "looser pick" would add complexity on top. (4) Rejected: /roles as duplication. It has a single call site. It only gets fixed as a side effect of the conformance test.

**Sites (13).**

- [`src/platform/owner-sync/owned.ts:41-45, 69, 78`](../../src/platform/owner-sync/owned.ts#L41-L45) — basePathFor builds the endpoint and is called twice in fetchAndPlan: once for the read and once for source.endpoint
- [`src/composition/sync/owned-assets-source-save.ts:27-31`](../../src/composition/sync/owned-assets-source-save.ts#L27-L31) — persists source.endpoint into esi_snapshots.endpoint and the request hash
- [`src/data/esi-snapshots/queries.ts:17-28`](../../src/data/esi-snapshots/queries.ts#L17-L28) — readCorpAssetSnapshots filters eq(endpoint, `/corporations/${corporationId}/assets/`), a re-typed copy
- [`src/features/owned-assets/refresh.ts:17-26`](../../src/features/owned-assets/refresh.ts#L17-L26) — resource: 'assets', the other half of the coupled string
- [`src/features/owned-assets/queries.ts:52-77`](../../src/features/owned-assets/queries.ts#L52-L77) — sole reader; a mismatch makes snapshots empty, so getCorpAssetEvidence returns null silently
- [`src/composition/sync/character-sheet-sync.ts:8-21, 39-42`](../../src/composition/sync/character-sheet-sync.ts#L8-L21) — SHEET_ESI_PATHS (location/ship/online with trailing slash) and STRUCTURE_ESI_PATH
- [`src/composition/sync/corp-context-sync.ts:33-34`](../../src/composition/sync/corp-context-sync.ts#L33-L34) — inline /universe/structures/${id}/ path
- [`src/composition/structure-search.ts:24-32`](../../src/composition/structure-search.ts#L24-L32) — third inline structure path (esiFetch(esiUrl(...)))
- [`convex/characterLocationSync.ts:272, 297-302, 365-370`](../../convex/characterLocationSync.ts#L272) — /online, /location, /ship without a trailing slash; registry spells them with one
- [`src/composition/sync/owner-sync-port.ts:57`](../../src/composition/sync/owner-sync-port.ts#L57) — /characters/${id}/roles without a slash; registry entry is /roles/
- [`src/lib/esi-datasets/entries.ts:120-125, 141, 297-304, 323, 353-356`](../../src/lib/esi-datasets/entries.ts#L120-L125) — registry specPaths that the builders must match
- [`src/composition/sync/character-sheet-sync.test.ts:74-85`](../../src/composition/sync/character-sheet-sync.test.ts#L74-L85) — existing registry-conformance test; covers only the sheet paths
- [`src/data/location-tracking/esi-projection.ts:34-37`](../../src/data/location-tracking/esi-projection.ts#L34-L37) — parseOnlineBody builds z.object per call, unlike its module-scope siblings at 3-11

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/character-sheet/esi-projection.ts:17-27, 73-75, 95-113, 165-168`](../../src/features/character-sheet/esi-projection.ts#L17-L27) — The sheet's own projections (ship item/name, login times, StructureName). These are per-consumer projections and should stay.
- [`src/data/corp-holdings/context-projection.ts:21, 56-59`](../../src/data/corp-holdings/context-projection.ts#L21) — Name-only structure projection returning a string. The shared name parseStructureBody is a cosmetic collision across zones.
- [`src/composition/structure-search.ts:17-21, 34-41`](../../src/composition/structure-search.ts#L17-L21) — Stricter schema (name.min(1), solar_system_id) because search results need a system. Correct for its use.
- [`src/data/location-tracking/esi-projection.ts:9-11, 29-32`](../../src/data/location-tracking/esi-projection.ts#L9-L11) — Narrow ship projection that convex needs; widening it to the sheet's required fields would change what convex rejects
- [`src/features/character-sheet/sections.ts:1, 49-51`](../../src/features/character-sheet/sections.ts#L1) — already reuses parseLocationBody; nothing to change
- [`src/composition/sync/skills-sync.ts:22-24`](../../src/composition/sync/skills-sync.ts#L22-L24) — single-use paths, like corp-industry-jobs-sync.ts:25 and corp-structures-sync.ts:31; no second consumer

</details>

**Home.** `src/platform/esi/paths.ts for the per-endpoint builders. ownedResourcePath stays in src/platform/owner-sync/owned.ts and is re-exported from src/platform/owner-sync/index.ts.`

**Boundary check.** src/platform/esi/paths.ts is in zone platform/esi, whose rule allows [lib, config]. The file imports nothing. Consumers: composition (character-sheet-sync, corp-context-sync, structure-search, owner-sync-port), whose rule includes platform/esi; and convex/characterLocationSync.ts, under the convex rule allow [platform/esi, platform/auth, data, lib]. The test src/platform/esi/paths.test.ts imports src/lib/esi-datasets/entries.ts, which is legal because platform/esi allows lib. ownedResourcePath is in zone platform/owner-sync, which allows platform/esi (owned.ts already imports ../esi/response-metadata). Its consumers are features/owned-assets/refresh.ts and queries.ts, and features may import platform/owner-sync. It is deliberately not in platform/esi, because features may not import platform/esi. data/esi-snapshots gains no import: it receives the endpoint as a string parameter.

**API sketch.**

```ts
// src/platform/esi/paths.ts
export const characterLocationPath = (characterId: number) => `/characters/${characterId}/location/`;
export const characterShipPath = (characterId: number) => `/characters/${characterId}/ship/`;
export const characterOnlinePath = (characterId: number) => `/characters/${characterId}/online/`;
export const characterRolesPath = (characterId: number) => `/characters/${characterId}/roles/`;
export const universeStructurePath = (structureId: number) => `/universe/structures/${structureId}/`;

// src/platform/owner-sync/owned.ts (renamed from basePathFor, exported)
export function ownedResourcePath(resource: string, owner: OwnerKey): string;

// src/data/esi-snapshots/queries.ts
export function readCorpAssetSnapshots(corporationId: number, endpoint: string, ids: number[]): Promise<{ id: number; bodyCiphertext: ... }[]>;

// src/features/owned-assets/refresh.ts
export const OWNED_ASSETS_RESOURCE = 'assets';
```

**Migration steps.**

1. In src/platform/owner-sync/owned.ts, rename basePathFor to exported ownedResourcePath(resource, owner). In fetchAndPlan, compute it once into a const and use it for both port.read (line 69) and source.endpoint (line 78). Re-export it from src/platform/owner-sync/index.ts.
2. In src/features/owned-assets/refresh.ts, export OWNED_ASSETS_RESOURCE = 'assets' and use it in assetsSpec.
3. Change src/data/esi-snapshots/queries.ts readCorpAssetSnapshots to take `endpoint: string` and filter on eq(esiSnapshots.endpoint, endpoint). Delete the template literal.
4. In src/features/owned-assets/queries.ts getCorpAssetSnapshot (line 60), pass ownedResourcePath(OWNED_ASSETS_RESOURCE, { ownerType: 'corporation', ownerId: corporationId }).
5. Switch the db-test fixtures that hand-write `/corporations/${CORP}/assets/` to ownedResourcePath(OWNED_ASSETS_RESOURCE, owner): src/features/owned-assets/corp-snapshot.db.test.ts:37, src/composition/sync/blueprint-snapshot.db.test.ts:38 and src/composition/pipelines/esi-snapshot-retention.db.test.ts:22. The write path and the read path then go through one builder.
6. Add src/platform/esi/paths.ts with the five builders, all with trailing slashes to match the registry.
7. In src/composition/sync/character-sheet-sync.ts, point SHEET_ESI_PATHS.location/ship/online at the builders, delete STRUCTURE_ESI_PATH and use universeStructurePath in readStructure. Update character-sheet-sync.test.ts:37,79 to import universeStructurePath.
8. Replace the inline structure templates in src/composition/sync/corp-context-sync.ts:34 and src/composition/structure-search.ts:29 with universeStructurePath.
9. Replace the inline paths in convex/characterLocationSync.ts at 272, 298 and 366 with characterOnlinePath, characterLocationPath and characterShipPath.
10. Replace the path in src/composition/sync/owner-sync-port.ts:57 with characterRolesPath.
11. Add src/platform/esi/paths.test.ts asserting that each builder's template (id replaced by its {placeholder}) appears in some ESI_DATASET_ENTRIES upstream.specPaths. Keep the sheet-tier count assertion in character-sheet-sync.test.ts.
12. Hoist the inline z.object({ online: z.boolean() }) in src/data/location-tracking/esi-projection.ts:35 to a module-scope onlineBodySchema, matching lines 3-11. Do not widen it, and do not merge it with the sheet's schema.

**Tests.** New: src/platform/esi/paths.test.ts, a registry-conformance check over every builder's template (it subsumes the slash drift). Also add an owned-assets test asserting that the source.endpoint the corp descriptor emits equals the endpoint getCorpAssetSnapshot filters with. Existing guards: src/composition/sync/character-sheet-sync.test.ts:74-85 and :123 (exact structure URL, unchanged); src/features/owned-assets/refresh.test.ts:82,100,160,210-211 (exact owned-resource paths, unchanged by the rename); src/features/owned-assets/corp-snapshot.db.test.ts (endpoint filter; switch its fixture to the builder); convex/characterLocationSync.test.ts (matches by url.includes('/online' | '/location' | '/ship'), so adding the trailing slash is safe); src/data/location-tracking/esi-projection.test.ts (parseOnlineBody).

**Notes.** Behavior to preserve: every structure, sheet and owned-resource URL already carries a trailing slash, so those exact URLs do not change. Only the convex /online, /location, /ship and the /roles path gain a slash. Rate-limit keys do not change (normalizeEsiPath strips trailing slashes), and authed reads are never ETag-cached, so the change has no runtime effect. Keep each consumer's own body projection. Small drift found: data/corp-holdings/context-projection.ts drops empty names for asset names (line 53) but accepts an empty structure name (lines 21, 56-59), while structure-search requires name.min(1). If anyone touches it, add .min(1) to the corp-holdings structureSchema so it matches its own asset-name rule. This is optional and outside the extraction.

<sub>Reported by: concern:contracts-types, concern:esi-sync, dupes-triage-1.</sub>

<a id="p190"></a>

## P190: Make platform/owner-sync the single home for owner-sync port bases and read-result types

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -90 / +20 lines (5 union copies, 3 owner copies, 1 state copy, about 15 base-member lines and about 30 wrapper lines removed)
- **Depends on:** —
- **Existing primitive:** `src/platform/owner-sync/character.ts:CharacterSyncBase; src/platform/owner-sync/corp.ts:CorpSyncBase; src/platform/owner-sync/types.ts:EnumeratedOwner,PagedOwnerSyncState; src/platform/owner-sync/owned.ts:PagedOwnerReadResult; src/platform/esi/authed-read.ts:EsiAuthedRead,EsiPagedRead`

**Problem.** Each owner-sync feature port hand-copies the platform port bases and the ESI read-result unions:
- JobsPort and SkillsPort re-declare now, listCharacters, vendToken, readSyncState and stampFresh, which equal CharacterSyncBase<TState>.
- CorpJobsPort, CorpStructuresPort and CorpContextPort re-declare now, listMembers, vendToken and readRoles, which equal CorpSyncBase.
- `{fresh body etag} | {unchanged} | {error code}` is declared as JobsEsiRead, SkillsEsiRead, SheetEsiRead, AuthedSingleRead and CorpContextRead (without etag).
- The paged union is declared as PagedOwnerReadResult, AuthedPagedRead and CorpStructuresReadResult (without responseHeaders).
- RefreshCorpMember (twice) and LinkedCharacterHealth duplicate EnumeratedOwner, and CorpStructuresSyncState duplicates PagedOwnerSyncState.

On the producer side, readSingleEndpoint, postSingleEndpoint and readPagedEndpoint each repeat the same try/catch and copy fields only to drop expiresAt.

**Verifier revision.** The duplication is real. Five feature or data ports re-declare the members of CharacterSyncBase or CorpSyncBase, because index.ts does not export the bases. The `fresh | unchanged | error` single-read union is declared 5 times: AuthedSingleRead, JobsEsiRead, SkillsEsiRead, SheetEsiRead and CorpContextRead (which has no etag). The paged union is declared 3 times. RefreshCorpMember (twice) and LinkedCharacterHealth are each identical to EnumeratedOwner. The three owner-sync-port wrappers copy fields only to drop expiresAt.

Three parts of the proposal change:
(1) The primary design, deriving the owner-sync types from platform/esi EsiAuthedRead / EsiPagedRead, is wrong. Those unions already include the error branch and require expiresAt on fresh and unchanged, so every feature test fixture would need expiresAt. The owner-sync types should stay narrow, and the platform/esi results are already structurally assignable to them. This is the P302 alternative.
(2) No Omit<> is needed. CorpSyncBase has no readSyncState or stampFresh, so CorpJobsPort can extend it directly.
(3) The reported drift is not a bug. CorpStructuresReadResult has no responseHeaders because corp structures save only etags. CorpContextRead has no etag because every corp-context read is unconditional (heldEtag null) and parsed() ignores etag.

**Sites (20).**

- [`src/platform/owner-sync/types.ts:1-18`](../../src/platform/owner-sync/types.ts#L1-L18) — EnumeratedOwner, CharacterOwner, PagedOwnerSyncState (canonical)
- [`src/platform/owner-sync/plan.ts:3-6`](../../src/platform/owner-sync/plan.ts#L3-L6) — ReadResult, the minimal constraint planRead accepts; keep it
- [`src/platform/owner-sync/owned.ts:5-8`](../../src/platform/owner-sync/owned.ts#L5-L8) — PagedOwnerReadResult (canonical paged type, already exported)
- [`src/platform/owner-sync/character.ts:3-9`](../../src/platform/owner-sync/character.ts#L3-L9) — CharacterSyncBase<TState>, not exported from index
- [`src/platform/owner-sync/corp.ts:3-8`](../../src/platform/owner-sync/corp.ts#L3-L8) — CorpSyncBase, not exported from index
- [`src/platform/owner-sync/index.ts:1-18`](../../src/platform/owner-sync/index.ts#L1-L18) — exports neither base
- [`src/composition/sync/owner-sync-port.ts:11-29`](../../src/composition/sync/owner-sync-port.ts#L11-L29) — LinkedCharacterHealth equals EnumeratedOwner; listCharactersWithHealth returns it
- [`src/composition/sync/owner-sync-port.ts:86-147`](../../src/composition/sync/owner-sync-port.ts#L86-L147) — AuthedSingleRead/AuthedPagedRead plus 3 try/catch wrappers that copy fields to drop expiresAt
- [`src/features/industry-jobs/types.ts:13-33`](../../src/features/industry-jobs/types.ts#L13-L33) — JobsEsiRead; JobsPort re-declares CharacterSyncBase<CharacterJobsSyncState>; RefreshCorpMember
- [`src/features/industry-jobs/types.ts:47-57`](../../src/features/industry-jobs/types.ts#L47-L57) — CorpJobsPort re-declares CorpSyncBase members; its own readSyncState/stampFresh(userId, corporationId) do not collide with the base
- [`src/features/skill-queue/types.ts:16-19, 31-40`](../../src/features/skill-queue/types.ts#L16-L19) — SkillsEsiRead; SkillsPort re-declares CharacterSyncBase<CharacterSkillSyncState>
- [`src/features/skill-queue/refresh.ts:20-23`](../../src/features/skill-queue/refresh.ts#L20-L23) — planSkillsPersist typed on SkillsEsiRead
- [`src/features/character-sheet/types.ts:175-178, 185-203`](../../src/features/character-sheet/types.ts#L175-L178) — SheetEsiRead; SheetPort shares only now/listCharacters/vendToken
- [`src/features/character-sheet/plan.ts:44, 160, 184, 203`](../../src/features/character-sheet/plan.ts#L44) — SheetEsiRead consumers
- [`src/features/owned-structures/types.ts:32-67`](../../src/features/owned-structures/types.ts#L32-L67) — RefreshCorpMember, CorpStructuresSyncState (equals PagedOwnerSyncState), CorpStructuresReadResult, CorpStructuresPort re-declares CorpSyncBase
- [`src/features/owned-structures/queries.ts:8, 41`](../../src/features/owned-structures/queries.ts#L8) — readCorpStructureSyncState returns CorpStructuresSyncState
- [`src/data/corp-holdings/context-sync.ts:44-68`](../../src/data/corp-holdings/context-sync.ts#L44-L68) — CorpContextRead (no etag); CorpContextPort re-declares CorpSyncBase members
- [`src/data/corp-holdings/context-sync.ts:86-91`](../../src/data/corp-holdings/context-sync.ts#L86-L91) — parsed() never reads etag, so adding etag:null is harmless
- [`src/composition/corp-viewer.ts:20, 41, 53`](../../src/composition/corp-viewer.ts#L20) — only consumer of LinkedCharacterHealth
- [`src/composition/sync/industry-jobs-sync.ts:15-26`](../../src/composition/sync/industry-jobs-sync.ts#L15-L26) — adapter wires readSingleEndpoint into JobsPort; skills-sync.ts 16-29, corp-industry-jobs-sync.ts 18-31, corp-structures-sync.ts 24-36, corp-context-sync.ts 19-41 and character-sheet-sync.ts 34-47 do the same

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/esi/authed-read.ts:11-14, 66-75`](../../src/platform/esi/authed-read.ts#L11-L14) — EsiAuthedRead/EsiPagedRead are producer types. They carry expiresAt, which convex/characterLocationSync.ts uses, and features may not import platform/esi. Do not alias the owner-sync types to them.
- [`src/platform/owner-sync/owned.ts:10-24`](../../src/platform/owner-sync/owned.ts#L10-L24) — OwnedDatasetPort is the platform's own port: listCharacters returns EnumeratedOwner and it adds readRoles. Leave it.
- [`src/platform/owner-sync/credential.ts:6-9`](../../src/platform/owner-sync/credential.ts#L6-L9) — CorpCredentialProbe is a deliberately narrow two-method probe
- [`src/features/character-sheet/types.ts:185-203`](../../src/features/character-sheet/types.ts#L185-L203) — SheetPort cannot extend CharacterSyncBase: readSheet/stampSection replace readSyncState/stampFresh, and refresh.ts 66-73 adapts the members by hand. Only its read type changes.

</details>

**Home.** `src/platform/owner-sync/types.ts (new SingleOwnerRead) and src/platform/owner-sync/index.ts (export CharacterSyncBase, CorpSyncBase, SingleOwnerRead)`

**Boundary check.** Home zone: platform/owner-sync. Consumers:
- features (industry-jobs, skill-queue, character-sheet, owned-structures): the `features` rule allows platform/owner-sync.
- data/corp-holdings: the `data` rule allows platform/owner-sync.
- composition (owner-sync-port, corp-viewer): the `composition` rule allows platform/owner-sync and platform/esi.

The new types import nothing. owned.ts keeps its existing import of platform/esi/response-metadata, which the `platform/owner-sync` rule ['platform/esi'] allows.

**API sketch.**

```ts
// src/platform/owner-sync/types.ts
export type SingleOwnerRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };
// index.ts
export type { CharacterSyncBase } from './character';
export type { CorpSyncBase } from './corp';
export type { SingleOwnerRead, ... } from './types';
// features
interface JobsPort extends CharacterSyncBase<CharacterJobsSyncState> {
  readJobs(characterId: number, accessToken: string, heldEtag: string | null): Promise<SingleOwnerRead>;
  saveJobs(characterId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
}
interface CorpStructuresPort extends CorpSyncBase {
  readStructures(corporationId: number, accessToken: string, heldEtags: string[]): Promise<PagedOwnerReadResult>;
  readSyncState(corporationId: number): Promise<PagedOwnerSyncState | null>; ...
}
// composition/sync/owner-sync-port.ts
async function softRead<T>(read: () => Promise<T>): Promise<T | { kind: 'error'; code: string }> {
  try { return await read(); } catch (error) { return esiThrowToError(error); }
}
export const readSingleEndpoint = (path: string, accessToken: string, heldEtag: string | null) =>
  softRead(() => readEsiAuthed(path, accessToken, heldEtag));
export const postSingleEndpoint = (path: string, accessToken: string, body: unknown) => softRead(() => readEsiAuthedPost(path, accessToken, body));
export const readPagedEndpoint = (basePath: string, accessToken: string, heldEtags: string[]) => softRead(() => readEsiPagedAuthed(basePath, accessToken, heldEtags));
export function listCharactersWithHealth(userId: string): Promise<EnumeratedOwner[]>
```

**Migration steps.**

1. platform/owner-sync: add SingleOwnerRead to types.ts. Export CharacterSyncBase, CorpSyncBase and SingleOwnerRead as types from index.ts. Leave plan.ts ReadResult as planRead's minimal constraint.
2. industry-jobs/types.ts: delete JobsEsiRead and RefreshCorpMember. Change to `JobsPort extends CharacterSyncBase<CharacterJobsSyncState>` and `CorpJobsPort extends CorpSyncBase`; no Omit is needed. Reword the doc comment at lines 42-46. Update refresh.test.ts (JobsEsiRead becomes SingleOwnerRead) and corp-refresh.test.ts (RefreshCorpMember becomes EnumeratedOwner from '@/platform/owner-sync').
3. skill-queue/types.ts: delete SkillsEsiRead and make `SkillsPort extends CharacterSyncBase<CharacterSkillSyncState>`. In refresh.ts lines 11 and 21-22, use SingleOwnerRead. Update refresh.test.ts.
4. character-sheet: replace SheetEsiRead with SingleOwnerRead in types.ts SheetPort, plan.ts (44, 160, 184, 203), refresh.ts (24, 52, 60), plan.test.ts and refresh.test.ts. Keep SheetPort's own members.
5. owned-structures: delete RefreshCorpMember, CorpStructuresSyncState and CorpStructuresReadResult. Make `CorpStructuresPort extends CorpSyncBase`, with readStructures returning PagedOwnerReadResult and readSyncState returning PagedOwnerSyncState. Update queries.ts (8, 41) and refresh.ts (5, 15). In refresh.test.ts, add `responseHeaders: []` to the fresh fixtures and use EnumeratedOwner for member().
6. data/corp-holdings/context-sync.ts: make `CorpContextPort extends CorpSyncBase` and replace CorpContextRead with SingleOwnerRead. In context-sync.test.ts, the `fresh` helper adds `etag: null` and imports SingleOwnerRead.
7. composition/sync/owner-sync-port.ts: delete LinkedCharacterHealth, with listCharactersWithHealth returning EnumeratedOwner[] and corp-viewer.ts lines 20/41/53 importing EnumeratedOwner from '@/platform/owner-sync'. Delete AuthedSingleRead and AuthedPagedRead. Collapse the three wrappers onto softRead and keep the three exported names, so the 7 sync adapters and their vi.mock factories do not change.
8. Delete every old alias in the same change, then run `pnpm check` through test-runner. Fallow must report no unused types or private-type leaks.

**Tests.** Existing tests that guard the behavior:
- features/industry-jobs/refresh.test.ts and corp-refresh.test.ts
- features/skill-queue/refresh.test.ts
- features/character-sheet/plan.test.ts and refresh.test.ts
- features/owned-structures/refresh.test.ts
- data/corp-holdings/context-sync.test.ts
- composition/sync/*-sync.test.ts (these mock readSingleEndpoint/readPagedEndpoint by name)
- composition/corp-viewer.test.ts

No test covers the three wrappers directly today. Add to composition/sync/owner-sync-port.test.ts:
- EsiServerError maps to {kind:'error', code:'esi_server_error'}.
- EsiBudgetExhaustedError is rethrown.
- fresh and unchanged pass through. Use toMatchObject, because expiresAt is now present.

**Notes.** Behavior change: read results now carry expiresAt into the feature ports. Nothing spreads or persists a read object. The checked uses are:
- owned.ts 68-84 reads items, etags and responseHeaders.
- planRead spreads the onFresh payload, not the read.
- character-sheet plan keeps body and etag only.
- context-sync parsed() keeps body only.
The 'drift' in CorpStructuresReadResult (no responseHeaders) and CorpContextRead (no etag) is narrowing, not a bug, so either the merged or the narrow type is correct; merging costs a few fixture edits.

Adjacent lead, not part of this change: canSyncIndustryJobs (features/industry-jobs/sync-eligibility.ts 3-9), canSyncCorpIndustryJobs (corp-sync-eligibility.ts 8-14), canSyncCorpStructures (owned-structures/corp-sync-eligibility.ts 15-21), canSyncSkillQueue (skill-queue/sync-eligibility.ts 6-12) and canSyncCorpContext (data/corp-holdings/context-sync.ts 39-42) all repeat `hasRefreshToken && !SCOPES.some(missing)`. That is a candidate for a platform/owner-sync `hasAllScopes(owner, scopes)` helper.

<sub>Reported by: area:features-owned, area:platform, concern:esi-sync, concern:feature-skeleton, dupes-triage-1, dupes-triage-2.</sub>

<a id="p345"></a>

## P345: Use EnumeratedOwner instead of three local copies, and share the owner fixture and owned-dataset port fake

- **Status:** [ ] not started
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -18 production lines (three interfaces), -70 test lines (10 builders) and -20 (one duplicate port fake), +35 for the fixture module: net about -70
- **Depends on:** [P190](#p190)

**Problem.** platform/owner-sync/types.ts:1-6 defines EnumeratedOwner (CharacterOwner is its Omit). Production code declares structurally identical copies: RefreshCorpMember twice (owned-structures, industry-jobs) and LinkedCharacterHealth once (composition/sync/owner-sync-port.ts, the producer feeding those ports). Tests rebuild the owner in about 10 places with drifting defaults: corporationId null, 5000, 2000 or CORP; positional id or overrides-only. owned-assets/refresh.test.ts and owned-blueprints/refresh.test.ts carry the same 20-line OwnedDatasetPort fake.

**Verifier revision.** The test builders are real but small. Ten test sites rebuild the same `{ characterId, corporationId, hasRefreshToken: true, missingScopes: [] }` owner, and owned-assets and owned-blueprints share a byte-identical OwnedDatasetPort fake that differs only in the generic row type and NOW. Grepping turned up a stronger production finding the finders missed. The EnumeratedOwner shape is redeclared 3 more times in production types: RefreshCorpMember in features/owned-structures/types.ts and features/industry-jobs/types.ts, and LinkedCharacterHealth in composition/sync/owner-sync-port.ts, which is the function that feeds every port's listCharacters/listMembers. All three files can import platform/owner-sync, and industry-jobs/types.ts already imports CharacterOwner from it. I dropped pagedSyncState: it is a one-line literal, and the jobs and skills fresh() states use different sync-state types. I also dropped the jobs, skills, structures and sheet port fakes because they implement different port interfaces.

**Sites (16).**

- [`src/platform/owner-sync/types.ts:1-8`](../../src/platform/owner-sync/types.ts#L1-L8) — Canonical EnumeratedOwner and CharacterOwner (Omit corporationId)
- [`src/platform/owner-sync/owned.ts:10-24`](../../src/platform/owner-sync/owned.ts#L10-L24) — Canonical generic OwnedDatasetPort<TRow> both duplicate fakes implement
- [`src/features/owned-structures/types.ts:32-37, 56`](../../src/features/owned-structures/types.ts#L32-L37) — Missed by the finders: production RefreshCorpMember is identical to EnumeratedOwner; used by listMembers
- [`src/features/industry-jobs/types.ts:1, 28-33, 49`](../../src/features/industry-jobs/types.ts#L1) — Missed by the finders: second identical RefreshCorpMember, in a file that already imports CharacterOwner from owner-sync
- [`src/composition/sync/owner-sync-port.ts:11-16, 18-29`](../../src/composition/sync/owner-sync-port.ts#L11-L16) — Missed by the finders: LinkedCharacterHealth is identical to EnumeratedOwner and is returned by listCharactersWithHealth, which backs the ports' listCharacters
- [`src/features/owned-assets/refresh.test.ts:21-40, 42-48, 50`](../../src/features/owned-assets/refresh.test.ts#L21-L40) — makePort(OwnedAssetsPort), character builder (corporationId null), fresh
- [`src/features/owned-blueprints/refresh.test.ts:22-41, 43-49, 51`](../../src/features/owned-blueprints/refresh.test.ts#L22-L41) — Identical makePort (OwnedBlueprintsPort = OwnedDatasetPort<OwnedBlueprint>), identical character, fresh
- [`src/features/industry-jobs/refresh.test.ts:36-41`](../../src/features/industry-jobs/refresh.test.ts#L36-L41) — CharacterOwner builder
- [`src/features/skill-queue/refresh.test.ts:41-46`](../../src/features/skill-queue/refresh.test.ts#L41-L46) — CharacterOwner builder
- [`src/features/character-sheet/refresh.test.ts:35-40`](../../src/features/character-sheet/refresh.test.ts#L35-L40) — CharacterOwner builder
- [`src/features/owned-structures/refresh.test.ts:3, 36-42`](../../src/features/owned-structures/refresh.test.ts#L3) — RefreshCorpMember builder, corporationId 5000
- [`src/features/industry-jobs/corp-refresh.test.ts:4, 9-17`](../../src/features/industry-jobs/corp-refresh.test.ts#L4) — Missed by the finders: member(overrides) builder with default characterId 1 and corporationId 2000
- [`src/platform/owner-sync/engine.test.ts:11-17`](../../src/platform/owner-sync/engine.test.ts#L11-L17) — owner builder in the owning zone
- [`src/data/corp-holdings/context-sync.test.ts:75-81`](../../src/data/corp-holdings/context-sync.test.ts#L75-L81) — member builder with corporationId CORP
- [`src/composition/sync/character-sheet-sync.test.ts:90-91, 135-136`](../../src/composition/sync/character-sheet-sync.test.ts#L90-L91) — Missed by the finders: inline EnumeratedOwner literals
- [`src/composition/corp-viewer.test.ts:90-95`](../../src/composition/corp-viewer.test.ts#L90-L95) — Missed by the finders: health(characterId, missingScopes) builder of the LinkedCharacterHealth shape, corporationId CORP

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-jobs/refresh.test.ts:21-34, 43-46`](../../src/features/industry-jobs/refresh.test.ts#L21-L34) — JobsPort fake and CharacterJobsSyncState (jobsEtag) are different interfaces from OwnedDatasetPort
- [`src/features/skill-queue/refresh.test.ts:19-39, 48-52`](../../src/features/skill-queue/refresh.test.ts#L19-L39) — SkillsPort fake and CharacterSkillSyncState (queueEtag/skillsEtag) are different interfaces
- [`src/features/owned-structures/refresh.test.ts:20-34, 44`](../../src/features/owned-structures/refresh.test.ts#L20-L34) — CorpStructuresPort fake has different methods (listMembers, readStructures, saveStructures). freshState is a one-line literal
- [`convex/lib/characterSync.test.ts:109-115`](../../convex/lib/characterSync.test.ts#L109-L115) — Wire-format character that includes name. The convex zone may import only platform/esi, platform/auth, data and lib, not platform/owner-sync
- [`src/composition/structure-search.test.ts:24`](../../src/composition/structure-search.test.ts#L24) — pilot(characterId, scope, corporationId) is a linked-character shape with scope, not an owner

</details>

**Home.** `src/platform/owner-sync/__tests__/owner-fixtures.ts (new). The production types fold into the existing src/platform/owner-sync/types.ts EnumeratedOwner.`

**Boundary check.** The home is in zone platform/owner-sync (src/platform/owner-sync/**), and each consumer zone may import it: features (owned-assets, owned-blueprints, industry-jobs, skill-queue, character-sheet, owned-structures) via rule `features` allow ['platform/owner-sync', ...]; data (corp-holdings) via rule `data` allow ['platform/owner-sync', ...]; composition (sync tests, corp-viewer.test) via rule `composition` allow ['platform/owner-sync', ...]; engine.test.ts is the same zone. The fixture imports only ../types, ../owned (same zone) and vitest, which db/__tests__/support/reserved-connection-mock.ts already does. The production type changes are equally legal: features/* types and composition/sync/owner-sync-port.ts may import platform/owner-sync under the same rules.

**API sketch.**

```ts
// src/platform/owner-sync/__tests__/owner-fixtures.ts
export function ownerFixture(characterId: number, extra?: Partial<EnumeratedOwner>): EnumeratedOwner; // corporationId null, hasRefreshToken true, missingScopes []
export function ownedDatasetPortFake<TRow>(now: Date, overrides?: Partial<OwnedDatasetPort<TRow>>): OwnedDatasetPort<TRow>; // listCharacters -> [], vendToken -> 'token', readRoles -> [], read -> fresh empty page, readSyncState -> null, save/stampFresh no-ops
// Production: delete RefreshCorpMember and LinkedCharacterHealth and use EnumeratedOwner (or `export type X = EnumeratedOwner` only if renaming churns too much).
```

**Migration steps.**

1. Production first. In src/features/owned-structures/types.ts and src/features/industry-jobs/types.ts, delete RefreshCorpMember and type listMembers as Promise<EnumeratedOwner[]>, importing the type from '@/platform/owner-sync'. Update the two test imports (owned-structures/refresh.test.ts:3, industry-jobs/corp-refresh.test.ts:4).
2. In src/composition/sync/owner-sync-port.ts, replace LinkedCharacterHealth with EnumeratedOwner and update the type import in composition/corp-viewer.ts:20,41,53. Run tsc to confirm no consumer depended on the nominal name.
3. Add src/platform/owner-sync/__tests__/owner-fixtures.ts with ownerFixture and ownedDatasetPortFake.
4. Replace the owner builders in engine.test.ts, owned-assets, owned-blueprints, industry-jobs, skill-queue and character-sheet tests with ownerFixture. Keep each file's local name, e.g. `const character = ownerFixture`, if that reduces diff noise. EnumeratedOwner[] is assignable where CharacterOwner[] is expected, and these builders only feed listCharacters, so no toEqual changes.
5. Replace the corp-member builders (owned-structures 36-42, corp-refresh 9-17, context-sync 75-81, corp-viewer 90-95) with thin local wrappers over ownerFixture that keep each file's corporationId default (5000, 2000, CORP). For corp-refresh, keep `member(overrides)` with characterId default 1.
6. Replace makePort in owned-assets/refresh.test.ts and owned-blueprints/refresh.test.ts with ownedDatasetPortFake<OwnedAsset>(NOW, overrides) and ownedDatasetPortFake<OwnedBlueprint>(NOW, overrides). Keep the per-file NOW and fresh().
7. Optionally swap the inline literals in composition/sync/character-sheet-sync.test.ts 90-91 and 135-136. Run `pnpm check` through test-runner.

**Tests.** Existing guards: all refresh tests in owned-assets, owned-blueprints, industry-jobs (refresh and corp-refresh), skill-queue, character-sheet and owned-structures; platform/owner-sync/engine.test.ts; data/corp-holdings/context-sync.test.ts; composition/corp-viewer.test.ts and composition/sync/*.test.ts. Optional new test: src/platform/owner-sync/owned.test.ts driving makeOwnedDescriptor through ownedDatasetPortFake. owned.ts currently has no direct test, so this would give the fake an owning-zone consumer.

**Notes.** Default drift that the migration must keep per file: the character paths use corporationId null, while corp members use 5000 (owned-structures), 2000 (corp-refresh, which also defaults characterId to 1) or the file's CORP (context-sync, corp-viewer). Keep the fixture defaults neutral: token present, no missing scopes, corporationId null. Each test must still state the field it is exercising. The fresh() states differ in date (2026-06-28T11:30Z vs 2026-06-27T11:30Z, each 30 min before its own NOW), so they stay local. If a nominal type name is wanted for readability, alias it (`type RefreshCorpMember = EnumeratedOwner`) instead of redeclaring the fields. That way a future EnumeratedOwner field cannot drift from the three copies.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p188"></a>

## P188: Define each deferred-queue dataset once with ownerSyncDataset(dataset, makePort, refresh) and one target-filtered priority picker

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45/+30. About 7 lines saved per dataset across 7 modules, and the sheet picker plus imports go; the helper and its test add about 30.
- **Depends on:** [P190](#p190)
- **Existing primitive:** `src/composition/sync/esi-refresh-owner-sync.ts:enqueueBudgetDeferral,targetedOwnerResult; src/composition/sync/owner-sync-port.ts:listCharactersWithHealth,vendTokenFor`

**Problem.** Each of the 7 deferred-queue datasets hand-writes the same two wrappers:
- an on-view refresh: `refreshXForUser(makeXPort(), userId, enqueueBudgetDeferral('<dataset>', userId))`, inlined inside after() for owned assets and blueprints and inside getLiveDatasetOnView for corp jobs;
- a job runner: `targetedOwnerResult(target, await refreshXForUser(makeXPort(), userId, { target }))`.
The dataset key passed to enqueueBudgetDeferral and the refresh the worker runs for that key are tied together only by convention, across the module and esi-refresh-worker's RUNNERS. The character sheet carries a private copy of the result picker with priority ordering, while the shared targetedOwnerResult takes the first match.

**Verifier revision.** The repeated onView and runJob wrappers are real: 7 datasets, and fallow groups the 6 non-sheet runners (dupes-grouped lines 497-525). Three parts of the proposal do not survive.
- The drift claim is refuted. targetedOwnerResult's first match cannot hide a deferred section for the other datasets: each runs one descriptor, the engine filters to options.target, and character and corp identities never collide, so at most one result matches. The sheet needs its priority picker only because it runs 9 descriptors that share one target.
- The 'memoization drift' is likewise a reason, not drift: memoizing pays off only where one run has several descriptors. The cross-dataset race belongs to P189.
- The port-base factories are dropped. They save 2-3 one-liners per port. The ports use different key names (listCharacters vs listMembers), and the owned ports need both listCharacters and readRoles. Spreading a base into feature port literals bypasses excess-property checks.

corp-structures is excluded because its no-deferral refresh is declared in the dataset registry. What remains is a small definition helper plus one result picker.

**Sites (12).**

- [`src/composition/sync/skills-sync.ts:31-33, 70-76`](../../src/composition/sync/skills-sync.ts#L31-L33) — on-view refresh plus runner
- [`src/composition/sync/industry-jobs-sync.ts:28-34, 57-63`](../../src/composition/sync/industry-jobs-sync.ts#L28-L34) — on-view refresh plus runner
- [`src/composition/sync/corp-industry-jobs-sync.ts:65-70, 82-88`](../../src/composition/sync/corp-industry-jobs-sync.ts#L65-L70) — on-view refresh inlined in getLiveDatasetOnView, plus runner
- [`src/composition/sync/corp-context-sync.ts:43-50`](../../src/composition/sync/corp-context-sync.ts#L43-L50) — on-view refresh plus runner
- [`src/composition/sync/owned-assets-sync.ts:41-47, 54-60, 62-68`](../../src/composition/sync/owned-assets-sync.ts#L41-L47) — full refresh inlined in after(); a character-only on-view variant under the same 'owned_assets' key; runner
- [`src/composition/sync/owned-blueprints-sync.ts:42-48, 54-62`](../../src/composition/sync/owned-blueprints-sync.ts#L42-L48) — refresh inlined in after(), plus runner
- [`src/composition/sync/character-sheet-sync.ts:49-64`](../../src/composition/sync/character-sheet-sync.ts#L49-L64) — on-view refresh plus runner with a private deferred > retryable > permanent picker; correct and needed because 9 descriptors share one target
- [`src/composition/sync/esi-refresh-owner-sync.ts:9-29`](../../src/composition/sync/esi-refresh-owner-sync.ts#L9-L29) — existing enqueueBudgetDeferral and first-match targetedOwnerResult
- [`src/composition/sync/esi-refresh-worker.ts:33-39, 62-70`](../../src/composition/sync/esi-refresh-worker.ts#L33-L39) — RUNNERS is an exhaustive Record<EsiRefreshDataset, RefreshJobRunner>, so key exhaustiveness is already type-checked
- [`src/features/character-sheet/refresh.ts:138-165`](../../src/features/character-sheet/refresh.ts#L138-L165) — why the sheet yields several results per target
- [`src/platform/owner-sync/engine.ts:38-43, 51-63, 82-97`](../../src/platform/owner-sync/engine.ts#L38-L43) — the target filter means single-descriptor datasets return at most one result per target
- [`src/data/corp-holdings/context-sync.ts:179-183`](../../src/data/corp-holdings/context-sync.ts#L179-L183) — same (port, userId, options?) => Promise<OwnerSyncResult[]> signature as the 6 feature refreshers (verified in each refresh.ts)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/sync/corp-structures-sync.ts:24-36, 48-50`](../../src/composition/sync/corp-structures-sync.ts#L24-L36) — No budget deferral and no runner by design: src/lib/esi-datasets/entries.ts declares owned_structures with refreshOwner {kind: 'entry-point', name: 'refreshCorpStructuresForUser'}, and its refresh returns void.
- [`src/composition/sync/skills-sync.ts:16-29`](../../src/composition/sync/skills-sync.ts#L16-L29) — Port construction (now, listCharacters, vendToken) is not extracted. Each port has 2-3 shared one-liners, the port types use different key names, and spreading a base into typed port literals bypasses excess-property checks.
- [`src/composition/sync/character-sheet-sync.ts:23-32`](../../src/composition/sync/character-sheet-sync.ts#L23-L32) — memoizePerRun stays private. It is needed only where one run has several descriptors; the cross-dataset concern is P189.
- [`src/composition/sync/live-dataset-view.ts:40-54`](../../src/composition/sync/live-dataset-view.ts#L40-L54) — getLiveDatasetOnView is already a shared primitive. Corp jobs just passes `refresh: corpJobs.onView`.

</details>

**Home.** `src/composition/sync/esi-refresh-owner-sync.ts (existing module, which already holds enqueueBudgetDeferral and targetedOwnerResult)`

**Boundary check.** Composition zone. The module already imports data/esi-refresh-jobs ({from: composition} allows data) and platform/owner-sync types ({from: composition} allows platform/owner-sync). All consumers are composition/sync/* modules in the same zone, and esi-refresh-worker is also composition. No new edges.

**API sketch.**

```ts
type OwnerSyncRefresh<P> = (port: P, userId: string, options?: OwnerSyncRunOptions) => Promise<OwnerSyncResult[]>;
export interface OwnerSyncDataset {
  onView(userId: string): Promise<OwnerSyncResult[]>;
  runJob(userId: string, target: OwnerSyncTarget): Promise<OwnerSyncResult>;
}
export function ownerSyncDataset<P>(dataset: EsiRefreshDataset, makePort: () => P, refresh: OwnerSyncRefresh<P>): OwnerSyncDataset;
/** Filter to target, then deferred_for_budget > failed_retryable > failed_permanent > first; owner_unavailable when none. */
export function targetedOwnerResult(target: OwnerSyncTarget, results: OwnerSyncResult[]): OwnerSyncResult;
```

**Migration steps.**

1. In esi-refresh-owner-sync.ts, make targetedOwnerResult filter by target, then apply the sheet's priority order (deferred > retryable > permanent > first > owner_unavailable). This is behavior-identical for single-descriptor datasets. Add ownerSyncDataset, which uses enqueueBudgetDeferral for onView and targetedOwnerResult for runJob.
2. In character-sheet-sync.ts, define `const sheet = ownerSyncDataset('character_sheet', makeSheetPort, refreshCharacterSheetForUser)`. Export `refreshCharacterSheetsOnView = sheet.onView` and `runCharacterSheetRefreshJob = sheet.runJob`, and delete the private picker (59-63).
3. Do the same for skills-sync, industry-jobs-sync and corp-context-sync, keeping the exported names as aliases. board-view, corp-viewer, the worker and the tests (esi-refresh-worker.test.ts mocks these module exports by name) import them.
4. corp-industry-jobs-sync: define corpJobs, pass `refresh: corpJobs.onView` to getLiveDatasetOnView, and export runCorporationIndustryJobsRefreshJob = corpJobs.runJob.
5. owned-assets-sync: define `assets = ownerSyncDataset('owned_assets', makeOwnedAssetsPort, refreshOwnedAssetsForUser)` and use `after(() => assets.onView(userId))` at 41-47 and runJob for the runner. Keep refreshCharacterAssetsOnView with the character-only refresh, either as a second ownerSyncDataset(...).onView or as its existing 3 lines. Its deferred jobs are still served correctly by the full runner, because the target is a character.
6. owned-blueprints-sync: same; after(() => blueprints.onView(userId)) and an alias for the runner.
7. Leave RUNNERS as the exhaustive Record and point its values at the aliases. Do not build it from an array, which would lose the compile-time exhaustiveness.

**Tests.** Add src/composition/sync/esi-refresh-owner-sync.test.ts:
- onView passes an onBudgetDeferred that enqueues with the given dataset.
- runJob passes { target } and picks by priority among results for that target, ignoring other targets.
- empty results give failed_permanent owner_unavailable.

Existing guards:
- character-sheet-sync.test.ts ('keeps the queued job deferred...' and 'keeps a retryable section ahead...').
- esi-refresh-worker.test.ts.
- corp-industry-jobs-sync.test.ts.
- owned-assets-sync.test.ts.
- live-dataset-view.test.ts.
- board-view.db.test.ts.
- corp-viewer.test.ts.

**Notes.** Refuted from the input:
- 'targetedOwnerResult could hide a deferred section' is not a live bug. Only the sheet produces several results per target, and it already uses a priority picker. The unified picker is a robustness and simplicity change.
- 'Memoization drift' is not drift (see P189).
- RUNNERS cannot 'disagree on keys': it is already an exhaustive Record<EsiRefreshDataset, ...>. What the helper actually adds is binding the deferral key and its runner refresh in one expression.

The port-base factories and the `session` hook are dropped. P189 no longer needs them, so this opportunity is independent.

Keep every exported function name. Routes, board-view, corp-viewer, the worker and the vi.mock factories in tests depend on them.

<sub>Reported by: area:composition, area:platform, concern:esi-sync, concern:feature-skeleton.</sub>

<a id="p189"></a>

## P189: Single-flight owner-sync token vending in vendTokenFor via a shared lib/single-flight primitive

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About +15 for lib and about +35 for tests; about -12 in wh-statics/client.ts; owner-sync-port changes by about 3 lines.
- **Depends on:** [P188](#p188)
- **Existing primitive:** `src/composition/sync/character-sheet-sync.ts:memoizePerRun (private); src/data/wh-statics/client.ts in-flight map pattern`

**Problem.** One board view's after() starts 4 owner-sync refreshers concurrently (skills, jobs, sheet, assets). Each vends an access token for every stale eligible character on its own, so each character can get 4 concurrent getFreshAccessTokenForCharacter calls. That is 4 account-row reads and decrypts, plus 4 SSO refreshes when the access token has expired.

Race losers waste the round-trip, emit invalid_grant failure telemetry, and can transiently mark the token suspect and skip their dataset for that view. The sheet port already prevents this between its own sections with a private memo; nothing prevents it across datasets. corp-viewer's role fetch and corp-role-gates vend through the same function.

**Verifier revision.** The token-vend half is real and has consequences beyond waste.
- refreshBoardDatasets runs 4 refreshers concurrently in one after(). Each runOwnerSync vends a token in parallel for every stale eligible character, and only the sheet's memoizePerRun dedupes within its own run.
- The repo already names this hazard: the sheet test is titled 'vends once per character per run so concurrent sections never race the refresh-token rotation'. The concurrency db test models CCP returning invalid_grant for a consumed refresh token.
- A cross-dataset loser therefore does an extra loadAccountRow and SSO call. It logs an invalid_grant failure before the CAS (eve-token-service.ts:234). Depending on ordering, it either reflects the winner or briefly marks the row suspect and returns upstream_error, which leaves that dataset unrefreshed for the view.

Three changes to the design:
- singleFlight must not go inside getFreshAccessTokenForCharacter. eve-token-service.concurrency.db.test.ts deliberately races two in-process calls to exercise the cross-instance CAS paths. Coalescing there would hide those paths, and 'repairs a confirmed-dead row' would hang, because its fetch mock waits for a second entry. The coalescing belongs in composition's vendTokenFor, which every owner-sync port, corp-role-gates and fetchAndStoreCorpRoles share.
- The per-board session and listCharacters dedupe are dropped. They save 4 single-query roster reads per view at the cost of plumbing a session through every on-view entry point.
- memoizePerRun stays private, because it has one consumer. singleFlight goes to lib because data/wh-statics/client.ts already hand-rolls the identical primitive.

**Sites (14).**

- [`src/composition/board/board-view.ts:93-100, 106-109`](../../src/composition/board/board-view.ts#L93-L100) — 4 refreshers started with Promise.allSettled inside after()
- [`src/platform/owner-sync/engine.ts:51-63, 112-117, 153-161`](../../src/platform/owner-sync/engine.ts#L51-L63) — per-owner Promise.all; vendToken is called after the stale check, so stale datasets vend concurrently
- [`src/composition/sync/character-sheet-sync.ts:23-38`](../../src/composition/sync/character-sheet-sync.ts#L23-L38) — private memoizePerRun; the only port that dedupes vends, and only within its own run
- [`src/composition/sync/character-sheet-sync.test.ts:88-102`](../../src/composition/sync/character-sheet-sync.test.ts#L88-L102) — test title documents the rotation race this guards against
- [`src/composition/sync/skills-sync.ts:16-20`](../../src/composition/sync/skills-sync.ts#L16-L20) — vendToken: vendTokenFor, not deduped
- [`src/composition/sync/industry-jobs-sync.ts:15-19`](../../src/composition/sync/industry-jobs-sync.ts#L15-L19) — same
- [`src/composition/sync/owned-assets-sync.ts:22-27`](../../src/composition/sync/owned-assets-sync.ts#L22-L27) — same
- [`src/composition/sync/owner-sync-port.ts:31-34, 81-84`](../../src/composition/sync/owner-sync-port.ts#L31-L34) — vendTokenFor is a plain pass-through; fetchAndStoreCorpRoles also vends through it
- [`src/composition/corp-role-gates.ts:21-28`](../../src/composition/corp-role-gates.ts#L21-L28) — vends through vendTokenFor via selectCorpCredential
- [`src/platform/auth/eve-token-service.ts:206-264`](../../src/platform/auth/eve-token-service.ts#L206-L264) — account row loaded on every call (210); SSO refresh (228-232); failure telemetry logged before any CAS (234); a lost success CAS falls back to reflectStoredToken (264)
- [`src/platform/auth/eve-token-service.ts:105-159`](../../src/platform/auth/eve-token-service.ts#L105-L159) — recordInvalidGrant: a loser that sees invalid_grant either loses the CAS (race telemetry, then reflect) or first-strikes the row to suspect and returns upstream_error
- [`src/platform/auth/eve-token-service.concurrency.db.test.ts:84-161`](../../src/platform/auth/eve-token-service.concurrency.db.test.ts#L84-L161) — races two in-process calls on purpose, and its mock returns invalid_grant for a consumed refresh token. Coalescing inside this function would invalidate these tests.
- [`src/data/wh-statics/client.ts:6-25`](../../src/data/wh-statics/client.ts#L6-L25) — existing hand-rolled single-flight (keyed in-flight map, deleted in finally): the second consumer
- [`src/data/wh-statics/client.test.ts:23-45`](../../src/data/wh-statics/client.test.ts#L23-L45) — already specifies single-flight semantics: one in-flight read, retry after a failure, refetch after completion

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/eve-token-service.ts:206-279`](../../src/platform/auth/eve-token-service.ts#L206-L279) — Do not coalesce inside getFreshAccessTokenForCharacter. Its CAS paths guard cross-instance races and are tested by racing two in-process calls, and forceRefresh callers (character-authorization.ts:44) must not join a cached vend.
- [`src/data/eve-data/names-client.ts:9-38`](../../src/data/eve-data/names-client.ts#L9-L38) — A per-id result cache with batching, not single-flight. Different semantics, so it is not a consumer.
- [`src/mapper/signatures/type-setter-follow-up.ts:11-29`](../../src/mapper/signatures/type-setter-follow-up.ts#L11-L29) — A retry/attempt tracker that keeps failed attempts. Different semantics.
- [`src/composition/sync/character-sheet-sync.ts:23-32`](../../src/composition/sync/character-sheet-sync.ts#L23-L32) — memoizePerRun caches after settle for a whole run, which the sheet's sequential structures pass relies on. It has one consumer, so it stays private.
- [`src/composition/board/board-view.ts:106-109`](../../src/composition/board/board-view.ts#L106-L109) — The 4 extra listLinkedCharacters roster reads per board view are each one indexed join. A shared session would need new parameters on every refresh*OnView, so that part is dropped.

</details>

**Home.** `src/lib/single-flight.ts (new), applied in src/composition/sync/owner-sync-port.ts (vendTokenFor) and src/data/wh-statics/client.ts (loadSystemStatics)`

**Boundary check.** lib zone. {from: lib, allow: [config]} is satisfied because the module imports nothing. It has no 'server-only' import, so the 'use client' wh-statics module can use it. Consumers:
- composition/sync/owner-sync-port.ts: {from: composition} allows lib.
- data/wh-statics/client.ts: {from: data} allows lib.
platform/auth is untouched.

**API sketch.**

```ts
// src/lib/single-flight.ts
/** Concurrent calls with the same key share one pending promise; the entry is removed when it settles, so nothing (result or rejection) is cached. */
export function singleFlight<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V>;

// owner-sync-port.ts
export const vendTokenFor: (characterId: number) => Promise<string | null> = singleFlight(async (characterId: number) => {
  const result = await getFreshAccessTokenForCharacter(characterId);
  return result.kind === 'ok' ? result.accessToken : null;
});

// wh-statics/client.ts
export const loadSystemStatics = singleFlight(fetchSystemStatics);
```

**Migration steps.**

1. Add src/lib/single-flight.ts. Use a Map<K, Promise<V>>: return the pending entry on a hit; otherwise call load(key), chain .finally(() => map.delete(key)), store it and return it. Add src/lib/single-flight.test.ts.
2. Migrate data/wh-statics/client.ts first. Replace pendingStaticsBySystem and the body of loadSystemStatics with `singleFlight(fetchSystemStatics)`. client.test.ts already specifies the behavior and must pass unchanged.
3. Wrap vendTokenFor in owner-sync-port.ts with singleFlight keyed by characterId. Keep the exported name and signature, because every sync port, corp-role-gates and fetchAndStoreCorpRoles import it.
4. Leave makeSheetPort's memoizePerRun(vendTokenFor) and memoizePerRun(listCharactersWithHealth) as they are. They still cache across the sheet's sequential structures pass and its roster read; their concurrent calls now also coalesce with the other datasets.
5. Do not change getFreshAccessTokenForCharacter or its forceRefresh path.

**Tests.** New: src/lib/single-flight.test.ts.
- Concurrent same-key calls invoke load once and return the same promise result.
- Different keys load independently.
- After settle, the next call loads again.
- A rejection is shared by concurrent callers but not cached.

Add to src/composition/sync/owner-sync-port.test.ts:
- Two concurrent vendTokenFor(7) calls call getFreshAccessTokenForCharacter once and both get 'vended'.
- A sequential call after settle vends again.
- A reauth_required result gives null to both concurrent callers.

Existing guards:
- src/data/wh-statics/client.test.ts.
- the owner-sync-port.test.ts vend cases (lines 168-202).
- character-sheet-sync.test.ts (mocks vendTokenFor, so unaffected).
- corp-role-gates.test.ts.
- eve-token-service.concurrency.db.test.ts (must stay untouched and green).

**Notes.** Risk bounds:
- The in-flight entry lives only for one vend (an account-row read plus at most one SSO round-trip) and is deleted on settle. No token outlives its call, so a revoked or unlinked grant cannot be served from a stale cache.
- Coalescing works only within one instance; cross-instance races stay protected by the existing CAS.
- Keying by characterId is safe, because a linked character is one account row owned by one user.
- vendTokenFor never forces a refresh, so forceRefresh semantics are untouched.

The outcome in which a race loser marks the token suspect depends on whether the loser's invalid_grant CAS lands before the winner's write (recordInvalidGrant vs. lines 243-262). That ordering was read from the code, not observed in production.

Dropped from the input:
- moving memoizePerRun to lib (one consumer);
- createOwnerSyncSession and port-base plumbing;
- singleFlight inside platform/auth.
The dependency on P188 is removed.

<sub>Reported by: concern:efficiency.</sub>

<a id="p292"></a>

## P292: Read each character's sheet row once per direct-section phase by promoting memoizePerRun to src/lib

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** high · **Size:** about -10 / +25 (helper, test, and phase wrapper)
- **Depends on:** [P188](#p188)
- **Existing primitive:** `src/composition/sync/character-sheet-sync.ts:memoizePerRun (private)`

**Problem.** Each of the 8 direct section descriptors calls port.readSheet(characterId) in readSyncState, and the owner-sync engine calls readState for every eligible character before checking staleness. Each board view and each sheet refresh job therefore makes 8 identical full JSONB row reads per character before the structures phase's legitimate 9th read. A per-run promise memo (memoizePerRun) already exists privately in composition/sync/character-sheet-sync.ts but cannot be used from the feature that owns the phase boundary.

**Sites (10).**

- [`src/features/character-sheet/refresh.ts:63-85`](../../src/features/character-sheet/refresh.ts#L63-L85) — sectionDescriptor: readSyncState → readSectionState(await port.readSheet(characterId), spec.key).
- [`src/features/character-sheet/refresh.ts:138-147`](../../src/features/character-sheet/refresh.ts#L138-L147) — refreshDirectSections: Promise.all over DIRECT_SECTION_KEYS (8 keys, sections.ts:25-35 minus structures), each with its own descriptor on the same port.
- [`src/features/character-sheet/refresh.ts:92-108,149-165`](../../src/features/character-sheet/refresh.ts#L92-L108) — Structures phase runs after the direct phase and must read the post-merge row (referencedStructureIds/unresolvedStructureIds). It stays on the raw port.
- [`src/composition/sync/character-sheet-sync.ts:23-47`](../../src/composition/sync/character-sheet-sync.ts#L23-L47) — Private memoizePerRun; listCharacters and vendToken are memoized per makeSheetPort(), readSheet is passed raw (readSheetRow).
- [`src/platform/owner-sync/engine.ts:100-115`](../../src/platform/owner-sync/engine.ts#L100-L115) — syncOwner: readState (112) before isStale (113).
- [`src/platform/owner-sync/character.ts:22-42`](../../src/platform/owner-sync/character.ts#L22-L42) — readState delegates to base.readSyncState.
- [`src/features/character-sheet/queries.ts:23-62`](../../src/features/character-sheet/queries.ts#L23-L62) — readSheetRow selects the whole sections JSONB. mergeSheetSection (32-50) and stampSheetSection (52-62) touch only their own key, which is why one snapshot per phase is exact.
- [`src/features/character-sheet/plan.ts:217-228`](../../src/features/character-sheet/plan.ts#L217-L228) — readSectionState reads sheet[key] only. The structures-only forceStale branch is irrelevant to direct sections.
- [`src/composition/board/board-view.ts:93-115`](../../src/composition/board/board-view.ts#L93-L115) — refreshBoardDatasets → refreshCharacterSheetsOnView, scheduled with after() on every board view.
- [`src/composition/sync/character-sheet-sync.ts:49-64`](../../src/composition/sync/character-sheet-sync.ts#L49-L64) — Both entry points (on-view and the esi-refresh worker job) build a fresh port per run, so both benefit.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/wh-statics/client.ts:6-25`](../../src/data/wh-statics/client.ts#L6-L25) — Client in-flight dedupe that deletes the entry on settle so later calls refetch. Different lifetime semantics, not a per-run memo.
- [`src/data/eve-data/names-client.ts:9-48`](../../src/data/eve-data/names-client.ts#L9-L48) — Batched per-id name cache with eviction on error. Different concept.
- [`src/mapper/signatures/type-setter-follow-up.ts:11-30`](../../src/mapper/signatures/type-setter-follow-up.ts#L11-L30) — Retry gate keyed on attempts. Not memoization.
- [`src/features/character-sheet/refresh.ts:100-107`](../../src/features/character-sheet/refresh.ts#L100-L107) — The structures readSyncState read is intentional and must not be memoized together with the direct phase.

</details>

**Home.** `src/lib/memoize.ts (new) exporting memoizeAsync; applied in src/features/character-sheet/refresh.ts and src/composition/sync/character-sheet-sync.ts.`

**Boundary check.** src/lib/memoize.ts is in zone lib (pattern src/lib/**). Rule `{from: lib, allow: [config]}`: the helper imports nothing. Consumer src/features/character-sheet/refresh.ts is in the features zone, whose rule allows lib. Consumer src/composition/sync/character-sheet-sync.ts is in the composition zone, whose rule allows lib. The helper is pure and runtime-neutral, so it does not touch the server-only roots that src/lib/server-only-boundary.test.ts checks.

**API sketch.**

```ts
// src/lib/memoize.ts
/** One call per argument for the life of the returned function; a rejection is shared too. */
export function memoizeAsync<A, R>(fn: (arg: A) => Promise<R>): (arg: A) => Promise<R>;

// refresh.ts
async function refreshDirectSections(port: SheetPort, userId: string, options?: OwnerSyncRunOptions) {
  // Direct sections read and write only their own key, so one row snapshot serves the phase.
  const phasePort: SheetPort = { ...port, readSheet: memoizeAsync(port.readSheet) };
  const results = await Promise.all(DIRECT_SECTION_KEYS.map((key) => runOwnerSync(sectionDescriptor(phasePort, SHEET_SECTIONS[key]), userId, options)));
  return results.flat();
}
```

**Migration steps.**

1. Create src/lib/memoize.ts with memoizeAsync, the body of memoizePerRun moved verbatim (Map<A, Promise<R>>, store the promise before it settles). Add src/lib/memoize.test.ts so coverage-gaps stays green.
2. src/composition/sync/character-sheet-sync.ts: delete memoizePerRun (lines 23-32), import { memoizeAsync } from '@/lib/memoize', and use it for listCharacters and vendToken. Keep readSheet raw on the port.
3. src/features/character-sheet/refresh.ts refreshDirectSections: build phasePort = { ...port, readSheet: memoizeAsync(port.readSheet) } once per call and pass it to every sectionDescriptor. Add a comment naming the own-key read/write invariant.
4. Leave refreshStructureNames/structuresDescriptor on the raw port so it reads after the direct merges.
5. Update tests as listed.

**Tests.** New src/lib/memoize.test.ts: concurrent and repeated calls with the same arg invoke fn once; distinct args each invoke fn; a rejection is returned to every caller for that arg (documents the shared-failure behavior). src/features/character-sheet/refresh.test.ts: add 'reads the sheet once for the direct phase and once for structures' (one character, never-synced: expect port.readSheet called 2 times with id 1; with two characters, 2 per id; with every section fresh, still 2 per id). Guards that already exist: 'resolves structures only after status and clones have saved their ids' (refresh.test.ts ~105) proves the structures phase still sees the merged row. src/composition/sync/character-sheet-sync.test.ts 'reads the roster once and vends once per character per run' and 'starts a fresh memo for every run' guard the moved helper.

**Notes.** Behavior to preserve: (a) the memo is per phase for readSheet and per run for listCharacters and vendToken. Never memoize readSheet in makeSheetPort, or the structures phase would see the pre-merge row and miss newly referenced structure ids. (b) A rejected readSheet is now shared by all 8 sections for that character. Today each would likely fail the same way, and runOwnerSync rethrows non-budget errors, so the Promise.all outcome is unchanged. (c) The memo key is a numeric characterId, so Map identity is safe. Optional follow-up, not required: a per-key JSONB projection (sections->key) would shrink the remaining reads further.

<sub>Reported by: area:features-owned.</sub>

<a id="p297"></a>

## P297: Reuse fresh stored corp roles when the sync passes pick a corp credential

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** medium · **Payoff:** medium · **Size:** about +25 / -10 in owner-sync-port.ts and corp-viewer.ts, 5 one-line rewires, test mock updates
- **Depends on:** [P186](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p186), [P189](#p189)
- **Existing primitive:** `src/composition/corp-viewer.ts:usableStoredRoles + src/platform/auth/corp-roles-store.ts:readCorpRoles + src/lib/esi-datasets/freshness.ts:freshnessGate('character_corp_roles')`

**Problem.** selectCorpCredential walks a corp's linked members and probes each one live until a member holds a required role. In the five corp-axis passes (owned assets, owned blueprints, corp industry jobs at a 300s TTL, corp structures, corp context), each probe runs readRoleCorporationId, two affiliation POSTs, an un-ETagged authed GET /roles and an upsert. It never checks the corp_member_roles row that the 3600s character_corp_roles gate would accept. resolveCorpViewer applies exactly that gate (usableStoredRoles), but privately. Several on-view handlers call resolveCorpViewer and then schedule a corp pass, so the same request validates the roles and then re-fetches them, often twice.

**Verifier revision.** The core is real and the evidence is stronger than the proposal states. All five corp ports pass readRoles: probeAndStoreRoles. Each probe does a DB read, two POST /characters/affiliation/ calls, an authed GET /characters/{id}/roles and an upsert. Authed GETs are never ETag-eligible (dispatch.ts:58-61), so every probe reaches ESI. Beyond that, the asset, blueprint and structure on-view paths call resolveCorpViewer first, which validates or refreshes stored roles against the 3600s gate, and then schedule the corp pass in after(), which probes the same members again in the same request. resolveCorpViewer also schedules the corp-context pass, which probes again. The proposed design needs changes. The CorpCredentialProbe.readRoles(characterId, accessToken) signature carries no corporation id, so moving usableStoredRoles is not enough. The reuse has to happen inside probeAndStoreRolesRecord after the existing readRoleCorporationId read, behind a sync-only export, while the mutation gates keep the live probe. Only corp jobs maps a 403 to needs_role.

**Sites (15).**

- [`src/composition/sync/owner-sync-port.ts:42-84`](../../src/composition/sync/owner-sync-port.ts#L42-L84) — probeAndStoreRolesRecord: readRoleCorporationId, live affiliation check, GET /roles, second affiliation check, upsertCorpRoles. Stored roles are never read
- [`src/platform/owner-sync/credential.ts:11-30`](../../src/platform/owner-sync/credential.ts#L11-L30) — selectCorpCredential vends a token, then calls readRoles for each member in turn
- [`src/platform/owner-sync/engine.ts:163-176`](../../src/platform/owner-sync/engine.ts#L163-L176) — resolveCorpToken wires axis.readRoles into selectCorpCredential on every stale corp owner
- [`src/platform/esi/dispatch.ts:58-61`](../../src/platform/esi/dispatch.ts#L58-L61) — isEtagEligible returns false whenever an Authorization header is present, so every /roles probe reaches ESI
- [`src/composition/corp-viewer.ts:33, 45-72`](../../src/composition/corp-viewer.ts#L33) — ROLES_FRESHNESS plus usableStoredRoles (same corp, within TTL), with a live fallback only when the stored row is unusable; module-private
- [`src/composition/corp-viewer.ts:111-134`](../../src/composition/corp-viewer.ts#L111-L134) — resolveCorpViewer reads stored roles and schedules after(refreshCorpContextOnView), whose pass probes again
- [`src/lib/esi-datasets/entries.ts:133-145`](../../src/lib/esi-datasets/entries.ts#L133-L145) — character_corp_roles entry: verifiedCacheSeconds 3600, refreshOwner resolveCorpViewer (the sync passes and gates also write the mirror table)
- [`src/lib/esi-datasets/entries.ts:46-60`](../../src/lib/esi-datasets/entries.ts#L46-L60) — corporation_industry_jobs: verifiedCacheSeconds 300
- [`src/composition/sync/corp-industry-jobs-sync.ts:18-31`](../../src/composition/sync/corp-industry-jobs-sync.ts#L18-L31) — readRoles: probeAndStoreRoles
- [`src/composition/sync/owned-assets-sync.ts:22-51`](../../src/composition/sync/owned-assets-sync.ts#L22-L51) — readRoles: probeAndStoreRoles (27). The on-view path calls resolveCorpViewer (39), then after(refreshOwnedAssetsForUser), which probes again
- [`src/composition/sync/owned-blueprints-sync.ts:19-52`](../../src/composition/sync/owned-blueprints-sync.ts#L19-L52) — readRoles: probeAndStoreRoles (24). resolveCorpViewer (36), then after(refresh) re-probes
- [`src/composition/sync/corp-structures-sync.ts:24-35, 48-66`](../../src/composition/sync/corp-structures-sync.ts#L24-L35) — readRoles: probeAndStoreRoles (29). loadCorpViewer calls resolveCorpViewer, then scheduleCorpStructuresRefresh re-probes
- [`src/composition/sync/corp-context-sync.ts:19-45`](../../src/composition/sync/corp-context-sync.ts#L19-L45) — readRoles: probeAndStoreRoles (24). Scheduled by every resolveCorpViewer call
- [`src/features/industry-jobs/corp-refresh.ts:40`](../../src/features/industry-jobs/corp-refresh.ts#L40) — Only corp dataset that maps esi_403 to needs_role
- [`src/platform/owner-sync/owned.ts:61-84`](../../src/platform/owner-sync/owned.ts#L61-L84) — Owned assets and blueprints call planRead with no mapError, so a corp 403 becomes failed_permanent 'esi_403' with no stamp, and the next view retries

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/corp-role-gates.ts:10-30`](../../src/composition/corp-role-gates.ts#L10-L30) — Mutation gates (Director, Station Manager) must keep the live probe bound to the corp with expectedCorporationId; tests at corp-role-gates.test.ts:97-105 guard that
- [`src/composition/corp-viewer.ts:57-64`](../../src/composition/corp-viewer.ts#L57-L64) — fetchAndStoreCorpRoles runs only when stored roles are unusable, so it is already the correct live fallback

</details>

**Home.** `src/composition/sync/owner-sync-port.ts (composition zone): move ROLES_FRESHNESS and usableStoredRoles there, and add readRolesForSync`

**Boundary check.** owner-sync-port.ts is in composition. It already imports platform/auth (corp-roles-store, affiliation-source) and platform/esi, and it would add lib (src/lib/esi-datasets/freshness). The composition rule allows 'platform/auth', 'platform/esi' and 'lib'. corp-viewer.ts and the five src/composition/sync/* ports already import './owner-sync-port' within the same zone. platform/owner-sync (credential.ts, engine.ts) is unchanged, still imports only platform/esi as its rule requires, and receives readRoles as an injected function.

**API sketch.**

```ts
// owner-sync-port.ts
const ROLES_FRESHNESS = freshnessGate('character_corp_roles');
export function usableStoredRoles(row: StoredCorpRoles | undefined, corporationId: number, now: Date): row is StoredCorpRoles;
async function probeAndStoreRolesRecord(characterId: number, accessToken: string, expectedCorporationId?: number, reuseFreshAt?: Date): Promise<StoredCorpRoles | null>;
/** Sync passes: fresh same-corp stored roles, else the live probe. */
export async function readRolesForSync(characterId: number, accessToken: string): Promise<string[] | null>;
export async function probeAndStoreRoles(characterId: number, accessToken: string, expectedCorporationId?: number): Promise<string[] | null>; // unchanged, always live
```

**Migration steps.**

1. Move ROLES_FRESHNESS (corp-viewer.ts:33) and usableStoredRoles (45-51) into owner-sync-port.ts, export usableStoredRoles, and import it in corp-viewer.ts from './sync/owner-sync-port'.
2. Give probeAndStoreRolesRecord an optional reuseFreshAt: Date. After the readRoleCorporationId and expected-corp check (lines 54-55), when it is set, read (await readCorpRoles([characterId])).get(characterId) and return that row if usableStoredRoles(row, corporationId, reuseFreshAt). Otherwise fall through to the existing live probe unchanged. Keep the softEsiFailure handling.
3. Export readRolesForSync(characterId, accessToken), which calls probeAndStoreRolesRecord(characterId, accessToken, undefined, new Date()) and maps a record to [...record.roles].
4. Wire readRoles: readRolesForSync in owned-assets-sync.ts:27, owned-blueprints-sync.ts:24, corp-industry-jobs-sync.ts:23, corp-structures-sync.ts:29 and corp-context-sync.ts:24. Leave corp-role-gates.ts:26 on probeAndStoreRoles.
5. Add readRolesForSync to the vi.mock('./owner-sync-port') factories in corp-industry-jobs-sync.test.ts:19, corp-structures-sync.test.ts:40, and any assets, blueprints or context tests that mock the port.
6. Update the character_corp_roles registry entry (entries.ts:133-145) or its notes so it names every writer of corp_member_roles: resolveCorpViewer, the sync passes through the probe fallback, and the mutation gates.
7. Optional follow-up: give CorpCredentialProbe a stored-roles lookup that runs before vendToken, so non-qualifying members skip token vends and possible SSO refreshes.

**Tests.** owner-sync-port.test.ts: add describe('readRolesForSync') with cases: fresh, same-corp stored roles are returned with no affiliation fetch and no readEsiAuthed call; a live probe runs when the stored row is older than the TTL, belongs to another corporation, or is missing; null is returned when readRoleCorporationId is null; EsiBudgetExhaustedError still propagates on the probe path. The existing probeAndStoreRoles tests (61-164) keep guarding the live path. corp-viewer.test.ts:121-157 keeps guarding usableStoredRoles after the move. corp-role-gates.test.ts:97-105 guards that the gates stay live.

**Notes.** Behavior differences the implementer must accept or handle: (1) The live probe checks live affiliation before and after the roles read, so it catches a transfer during the read. The stored path trusts characters.corporation_id equalling the stored row's corporation_id. resolveCorpViewer already places that same trust in stored roles for visibility grants, which is the more sensitive use, and ESI enforces corp authorization on the data read, so a stale grant yields a 403, never a data leak. (2) Staleness: a stored row can reflect roles up to about 2h old (ESI's own 3600s cache on /roles plus our 3600s window), against about 1h for the live probe, which also reads ESI's cached response. (3) Drift in 403 handling: only corp jobs maps esi_403 to needs_role (corp-refresh.ts:40). Owned assets and blueprints (owned.ts:68-84), corp structures and corp context surface failed_permanent 'esi_403' without stamping, so the next view retries. With reuse, a role revoked inside the window can cause repeated 403s, which consume the ESI error budget, until the stored row ages out. Either clear the stored row's fetchedAt when a corp read returns esi_403, or map esi_403 consistently. The live probe has a comparable window because of ESI's cache. (4) The 'denied' verdict and needs_role stamping are unchanged. A stored row that lacks the role yields needs_role exactly as a live read of ESI's cached roles would.

<sub>Reported by: concern:esi-sync.</sub>

<a id="p286"></a>

## P286: Read the character_skills row once per character for the board

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +12 (two readers, one cached getter and one batch helper become one each; board imports go from 4 to 1)
- **Depends on:** —

**Problem.** The board needs queue, totalSp, unallocatedSp and skillLevels for every linked character. These are all columns of one character_skills row. readRaws gets them through two cached getters, getSkillsForCharacters and getSkillLevelsForCharacters, or two uncached readers on the fresh net-worth path, so every board view does 2N cache lookups and every nightly or link snapshot does 2N primary-key queries where N would do. N is the number of linked characters.

**Verifier revision.** Partly holds. board-view readRaws (board-view.ts:29-30) reads the same character_skills row twice per character through two separate 'use cache' entries under one tag. readCharacterSkills, getCharacterSkills and getSkillsForCharacters have no consumer other than the board, so the merge removes code instead of adding a third reader. The levels-only getter must stay for skills-sync.ts:48-68 (slots readout and planner). The second half, a common getXForCharacters(ids, { fresh }) across four features, is dropped. The fresh path has one consumer, recordNetWorthSnapshot (board-view.ts:79-91). Moving the toggle into four feature query modules spreads the branch over four files rather than removing it, and after the merge the board has four one-line ternaries left.

**Sites (6).**

- [`src/features/skill-queue/queries.ts:12-40`](../../src/features/skill-queue/queries.ts#L12-L40) — getCharacterSkills (cached, skillsTag), readCharacterSkills and getSkillsForCharacters select queue, totalSp and unallocatedSp. The board is their only consumer.
- [`src/features/skill-queue/queries.ts:42-67`](../../src/features/skill-queue/queries.ts#L42-L67) — getCharacterSkillLevels (cached, same skillsTag), readCharacterSkillLevels and getSkillLevelsForCharacters select skillLevels from the same row.
- [`src/features/skill-queue/schema.ts:4-10`](../../src/features/skill-queue/schema.ts#L4-L10) — All five columns sit on one row keyed by character_id.
- [`src/composition/board/board-view.ts:25-38`](../../src/composition/board/board-view.ts#L25-L38) — readRaws calls both the skills and the levels variant for every id, cached or fresh.
- [`src/composition/board/board-view.ts:55-59`](../../src/composition/board/board-view.ts#L55-L59) — Consumes data and levels as a pair: BoardRaw.skills = { data, levels, refreshedAt }.
- [`src/composition/board/board-assemble.ts:62`](../../src/composition/board/board-assemble.ts#L62) — BoardRaw skills shape: data and levels can each be null independently.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/sync/skills-sync.ts:48-68`](../../src/composition/sync/skills-sync.ts#L48-L68) — The slots readout and per-character planner need levels only. They keep getCharacterSkillLevels and getSkillLevelsForCharacters so they do not pull the queue JSON.
- [`src/composition/board/board-view.ts:28,32,34-36`](../../src/composition/board/board-view.ts#L28) — The sheet, jobs and assets fresh/cached ternaries read different tables in different features. The only fresh consumer is recordNetWorthSnapshot, so a shared { fresh } signature in four features would move the branch around without removing it.

</details>

**Home.** `src/features/skill-queue/queries.ts, plus a CharacterSkillRow type in src/features/skill-queue/types.ts`

**Boundary check.** The home is in the features zone (autoDiscover src/features). Its only consumer, src/composition/board/board-view.ts, is in the composition zone, and the composition rule allows features. skills-sync.ts (composition) keeps importing the existing levels getters from the same module. queries.ts already imports @/db (features allows db) and @/lib/fan-out (features allows lib). No new edges.

**API sketch.**

```ts
// types.ts
export interface CharacterSkillRow { data: CharacterSkillData; levels: Record<string, number> | null }
// queries.ts
export async function readCharacterSkillRow(characterId: number): Promise<CharacterSkillRow | null>; // one select of queue,totalSp,unallocatedSp,skillLevels LIMIT 1
async function getCharacterSkillRow(characterId: number): Promise<CharacterSkillRow | null>; // 'use cache'; cacheLife('minutes'); cacheTag(skillsTag(id))
export function getSkillRowsForCharacters(ids: number[]): Promise<Map<number, CharacterSkillRow>>; // mapByIdDroppingNulls(ids, getCharacterSkillRow)
```

**Migration steps.**

1. Add CharacterSkillRow to src/features/skill-queue/types.ts next to CharacterSkillData, and import it into queries.ts. It must be importable because fallow's private-type-leaks rule rejects an exported function that returns a non-exported type.
2. In queries.ts, replace readCharacterSkills with readCharacterSkillRow. It selects queue, totalSp, unallocatedSp and skillLevels in one query, returns null when there is no row, sets data.unallocatedSp only when the column is non-null (as today), and sets levels to row.skillLevels ?? null.
3. Replace getCharacterSkills with getCharacterSkillRow, keeping the 'use cache', cacheLife('minutes') and cacheTag(skillsTag(id)) lines unchanged, and replace getSkillsForCharacters with getSkillRowsForCharacters, built on mapByIdDroppingNulls.
4. In board-view.ts readRaws, replace the two skills entries in the Promise.all with one: fresh ? mapByIdDroppingNulls(ids, readCharacterSkillRow) : getSkillRowsForCharacters(ids). Build skills as { data: row?.data ?? null, levels: row?.levels ?? null, refreshedAt }. Remove the four old skill imports.
5. Make readCharacterSkillLevels module-private, since getCharacterSkillLevels is now its only caller and ignoreExportsUsedInFile is false. Leave getCharacterSkillLevels and getSkillLevelsForCharacters in place for skills-sync.ts.
6. Run pnpm check through test-runner. Fallow must show no unused exports or types.

**Tests.** New tests:
- In src/features/skill-queue/queries.db.test.ts, cover readCharacterSkillRow: no row returns null; a row with skill_levels NULL returns data with levels null; unallocated_sp NULL leaves unallocatedSp absent; a full row round-trips queue, totalSp and levels.

Existing guards that must stay green unchanged:
- src/composition/board/board-view.db.test.ts:338-505 asserts the assembled skills section (aurel.skills toEqual at about line 411) and the net-worth recording path that uses fresh reads.
- src/composition/board/board-assemble.test.ts covers mapSkills with null levels.

**Notes.** Behavior to preserve:
- No row gives { data: null, levels: null }.
- A row with null skill_levels gives data but levels null.
- unallocatedSp is omitted, not set to null, when the column is NULL.
- mapByIdDroppingNulls drops characters with no row, and the board then reads them as null. That matches today: skills.get(id) ?? null and levels.get(id) ?? null.

Cache effect: board views no longer warm the levels cache entry that the slots readout uses. That is harmless, because both entries share skillsTag and revalidate together in saveCharacterSkills.

Related, not in scope: readRaws also makes 3N uncached sync-state point reads per board view (board-view.ts:31, 33, 37: readCharacterSyncState, readCharacterJobSyncState, readOwnerSyncState). The finding says to do this together with a batched sync-state change, which also edits readRaws. Land one before the other to avoid conflicts; there is no hard dependency.

<sub>Reported by: area:features-owned.</sub>

<a id="p178"></a>

## P178: Batch the per-character sync-state reads behind board and jobs views with inArray list readers

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About +45 (three list readers) / -8 (board-view and live-dataset-view lines); +20 more if the optional readCharacterSkillRows lands
- **Depends on:** [P327](wave-05-persistence-primitives-and-data-layer-sql.md#p327), [P286](#p286)
- **Existing primitive:** `src/features/owned-structures/queries.ts:listCorpStructureSyncStates`

**Problem.** On every board view and on the nightly net-worth snapshot, board-view readRaws runs three uncached `Promise.all(ids.map(singleRowReader))` fan-outs: readCharacterSyncState, readCharacterJobSyncState and readOwnerSyncState. readCharacterOwners does the same for the jobs view. Each reader is `SELECT … WHERE pk = ? LIMIT 1`. With the Neon HTTP driver, a K-pilot board therefore costs 3K HTTPS requests for freshness stamps alone. The fresh path also selects the same character_skills row twice, through readCharacterSkills and readCharacterSkillLevels. The batched inArray shape already exists for corp structures (listCorpStructureSyncStates).

**Verifier revision.** The core is confirmed. board-view.readRaws and live-dataset-view.readCharacterOwners run uncached single-row sync-state reads, one per character, on every board and jobs view, and src/db/index.ts:47-58 makes each one a separate Neon HTTP request. Five corrections. (a) The fan-outs run concurrently (Promise.all), so the gain is in request count and connection fan-out (3K requests drop to 3 per board view; linked rosters have no cap), not in serial latency. (b) listCorpJobSyncStates is a per-user query (WHERE userId), not an inArray batch; listCorpStructureSyncStates is the only real model. (c) The owner-sync engine's per-owner readState (engine.ts:112) is excluded: batching it needs a new OwnerSyncDescriptor member in platform/owner-sync and a prefetch in runCharacterPass and runCorpPass, which is a separate and larger change. (d) The cached data getters stay per-id because each carries a per-character cacheTag used for revalidation. (e) In the fresh path, only the duplicated character_skills select is worth merging. The other fresh data readers are nightly-only and optional.

**Sites (13).**

- [`src/composition/board/board-view.ts:25-38`](../../src/composition/board/board-view.ts#L25-L38) — readRaws: three per-id sync-state fan-outs (31, 33, 37); fresh-path per-id data readers (28-36)
- [`src/composition/board/board-view.ts:39-69`](../../src/composition/board/board-view.ts#L39-L69) — index-based state lookup (skillStates[i], jobStates[i], assetStates[i]); assets rows are null when there is no sync state
- [`src/composition/board/board-view.ts:79-91`](../../src/composition/board/board-view.ts#L79-L91) — recordNetWorthSnapshot calls readRaws(linked, true) on the nightly path
- [`src/composition/board/board-view.ts:106-115`](../../src/composition/board/board-view.ts#L106-L115) — getBoardForUserOnView calls readRaws on every view
- [`src/composition/sync/live-dataset-view.ts:18-31`](../../src/composition/sync/live-dataset-view.ts#L18-L31) — readCharacterOwners takes a per-id readState and fans it out
- [`src/composition/sync/industry-jobs-sync.ts:47-49`](../../src/composition/sync/industry-jobs-sync.ts#L47-L49) — the only caller of readCharacterOwners; passes readCharacterJobSyncState
- [`src/features/skill-queue/queries.ts:69-85`](../../src/features/skill-queue/queries.ts#L69-L85) — single-row readCharacterSyncState
- [`src/features/skill-queue/queries.ts:19-34, 51-58`](../../src/features/skill-queue/queries.ts#L19-L34) — readCharacterSkills and readCharacterSkillLevels select the same character_skills row separately
- [`src/features/industry-jobs/queries.ts:42-55`](../../src/features/industry-jobs/queries.ts#L42-L55) — single-row readCharacterJobSyncState
- [`src/features/owned-assets/queries.ts:103-114`](../../src/features/owned-assets/queries.ts#L103-L114) — single-row readOwnerSyncState keyed on (ownerType, ownerId)
- [`src/features/owned-structures/queries.ts:51-59`](../../src/features/owned-structures/queries.ts#L51-L59) — existing inArray batched reader with an empty-input guard: the model
- [`src/db/index.ts:47-58`](../../src/db/index.ts#L47-L58) — production db is drizzle neon-http; LOCAL_DB_DRIVER=postgres-js only locally
- [`src/lib/fan-out.ts:1-12`](../../src/lib/fan-out.ts#L1-L12) — mapByIdDroppingNulls: the per-id fan-out primitive the cached getters use, left as is

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-jobs/queries.ts:109-129`](../../src/features/industry-jobs/queries.ts#L109-L129) — listCorpJobSyncStates filters by userId, not inArray over ids; not a model for the character readers.
- [`src/platform/owner-sync/engine.ts:100-113`](../../src/platform/owner-sync/engine.ts#L100-L113) — syncOwner's per-owner readState also runs K times per dataset in after() refreshes, but batching it needs a descriptor-level readStates and prefetch in the engine. That is a separate follow-up in platform/owner-sync.
- [`src/features/owned-assets/queries.ts:96-101`](../../src/features/owned-assets/queries.ts#L96-L101) — listCharacterAssetRows fans out over the 'use cache' getOwnerAssetRows with per-owner tags. Cached; keep it.
- [`src/features/skill-queue/queries.ts:36-67`](../../src/features/skill-queue/queries.ts#L36-L67) — getSkillsForCharacters and getSkillLevelsForCharacters are per-id 'use cache' getters tagged skills:<id>. Keep them for invalidation.

</details>

**Home.** `Each owning feature's queries module: src/features/skill-queue/queries.ts, src/features/industry-jobs/queries.ts, src/features/owned-assets/queries.ts (beside the existing per-id readers)`

**Boundary check.** Readers live in zone features. {from: features} allows db and lib, the same imports the per-id readers already use. Consumers are src/composition/board/board-view.ts, src/composition/sync/live-dataset-view.ts and src/composition/sync/industry-jobs-sync.ts, all in zone composition, and {from: composition} allows features. platform/owner-sync is not touched.

**API sketch.**

```ts
// src/features/skill-queue/queries.ts
export function listCharacterSkillSyncStates(characterIds: number[]): Promise<Map<number, CharacterSkillSyncState>>;
// optional, fresh path only
export function readCharacterSkillRows(characterIds: number[]): Promise<Map<number, { data: CharacterSkillData; levels: Record<string, number> | null }>>;
// src/features/industry-jobs/queries.ts
export function listCharacterJobSyncStates(characterIds: number[]): Promise<Map<number, CharacterJobsSyncState>>;
// src/features/owned-assets/queries.ts  (owner_type = 'character' AND owner_id IN ids)
export function listCharacterAssetSyncStates(characterIds: number[]): Promise<Map<number, PagedOwnerSyncState>>;
// src/composition/sync/live-dataset-view.ts
export function readCharacterOwners<TData>(
  userId: string,
  readData: (ids: number[]) => Promise<Map<number, TData>>,
  readStates: (ids: number[]) => Promise<ReadonlyMap<number, { lastRefreshedAt: Date | null }>>,
): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }>;
```

**Migration steps.**

1. Add listCharacterSkillSyncStates beside readCharacterSyncState. Return new Map() for empty input (as listCorpStructureSyncStates:54 does), then run one select of characterId, lastRefreshedAt, queueEtag and skillsEtag with inArray(characterSkillSyncs.characterId, ids), keyed by characterId and returning the same state shape.
2. Add listCharacterJobSyncStates in industry-jobs/queries.ts with the same pattern (lastRefreshedAt, jobsEtag).
3. Add listCharacterAssetSyncStates in owned-assets/queries.ts with and(eq(ownedAssetSyncs.ownerType, 'character'), inArray(ownedAssetSyncs.ownerId, ids)). The ownerType filter is required because the PK is (ownerType, ownerId), and a corporation with the same numeric id must not collide.
4. In board-view.readRaws, replace lines 31, 33 and 37 with the three list readers. Replace the index lookups skillStates[i], jobStates[i] and assetStates[i] (41, 58, 62) with .get(id). This applies to both the view and fresh branches, since state reads are uncached in both.
5. Change readCharacterOwners' third parameter to readStates(ids) returning a Map, build owners with states.get(id)?.lastRefreshedAt ?? null, and update its only caller industry-jobs-sync.ts:49 to pass listCharacterJobSyncStates. Keep readData and readStates concurrent.
6. Keep the single-row readers. They back the owner-sync ports at skills-sync.ts:25, industry-jobs-sync.ts:22 and owned-assets-sync.ts:29.
7. Optional: add readCharacterSkillRows, which selects queue, totalSp, unallocatedSp and skillLevels in one inArray query, and use it in the fresh branch in place of board-view.ts:29-30. Leave the cached view branch alone.
8. Follow-up, not in this change: an optional OwnerSyncDescriptor.readStates for the engine's after() refresh passes.

**Tests.** src/features/skill-queue/queries.db.test.ts: add listCharacterSkillSyncStates cases (empty input returns an empty map, ids without a row are absent, several ids map correctly). src/features/owned-assets/queries.db.test.ts: listCharacterAssetSyncStates ignores a corporation row with the same ownerId. industry-jobs has no queries db test; add one for listCharacterJobSyncStates, or rely on src/composition/board/board-view.db.test.ts, which already seeds character_skill_syncs, character_industry_job_syncs and owned-asset syncs and guards the refreshedAt and asset-rows mapping. src/composition/sync/live-dataset-view.test.ts: rewrite the 'reads data + per-id state in parallel' case for batched readStates, still asserting concurrency with readData. Fallow coverage-gaps requires every new export to be exercised.

**Notes.** Behavior to preserve: (1) assets.rows is null when the character has no asset sync state, and [] when it has a state but no rows (board-view.ts:41, 65). The Map lookup must keep missing states as undefined, then null. (2) State reads stay uncached, because the nightly fresh path must read completed writes (board-view.ts:82 comment). (3) Ordering follows `linked`, never row order. (4) Guard empty id lists before inArray, as the existing model does. This interacts with F546 (the expire-now invalidation finding): if that removes board-view's fresh flag, the optional fresh-path skill-row merge becomes unnecessary, but the uncached state batching still applies. Correction to the finder: the corp-job 'batched reader' is per user, not per id list.

<sub>Reported by: area:composition, concern:efficiency, concern:persistence.</sub>

<a id="p336"></a>

## P336: Invalidate only in the commit owner: drop the rig-save revalidate and replace the `database === db` mode switch with tx-only writers

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +12 in production, plus about -28 lines of the obsolete standalone race test
- **Depends on:** [P220](wave-05-persistence-primitives-and-data-layer-sql.md#p220)

**Problem.** upsertCorpStructureRigs revalidates corpStructuresTag although no cached reader under that tag reads corp_structure_rigs. saveHoldingNodes and saveOwnedAssets each use `database === db` identity to decide two things at once: whether to swallow a unique violation and whether to invalidate. In production saveHoldingNodes only ever receives a tx, so its standalone branches are dead code kept alive by tests. saveOwnedAssets mixes the public character save with the inner write step of the corp transaction. Other writers (saveCorpOwnedAssets, saveOwnedBlueprints, saveCorpProfile) follow a clearer rule: the function that owns the commit invalidates once after it.

**Verifier revision.** The core holds. upsertCorpStructureRigs revalidates corp-structures:<id>, but the only reader under that tag (getCorpStructureRows) never reads rigs. Rigs are always read uncached, by every caller in corp-structures-sync (which runs under connection() with no outer 'use cache') and by the rigs route, and CorpRigEditor updates its local state from the POST response. So the revalidate protects nothing. The `database === db` switch in saveHoldingNodes is reachable only from tests: its only production caller passes a tx (owned-assets/queries.ts:189). saveOwnedAssets really has two modes: standalone for characters (owned-assets-source-save.ts:22) and inside a tx for corporations (:190). Four details changed from the proposal. (1) 'expireDataset' does not exist; use revalidateTag and invalidateHoldingNodes directly. (2) The swallow-in-standalone, rethrow-in-tx behavior is correct, because a unique violation aborts a Postgres transaction and the tx owner turns it into 'superseded'. The fix is to split the functions, not to add a swallow option. (3) The superseded handling in owned-assets-source-save is correct: both the corp superseded path and the error path discard the snapshot. (4) Impact is low: with the 'max' profile a revalidated entry is served stale and refreshed, so the cost is one extra query per edit, not a cold miss.

**Sites (12).**

- [`src/features/owned-structures/queries.ts:10-28`](../../src/features/owned-structures/queries.ts#L10-L28) — corpStructuresTag; getCorpStructureRows is the only 'use cache' reader under the tag and selects no rig columns
- [`src/features/owned-structures/queries.ts:126-139`](../../src/features/owned-structures/queries.ts#L126-L139) — getCorpStructureRigs is uncached
- [`src/features/owned-structures/queries.ts:148-163`](../../src/features/owned-structures/queries.ts#L148-L163) — upsertCorpStructureRigs calls revalidateTag(corpStructuresTag) at line 162 for nothing (the import is still needed by saveCorpStructures at line 111)
- [`src/composition/sync/corp-structures-sync.ts:52-55, 94-113, 129-153`](../../src/composition/sync/corp-structures-sync.ts#L52-L55) — Every rig consumer runs under connection() with no outer 'use cache' and joins the cached rows with uncached rigs, so no cache entry carries rig data under the tag
- [`src/app/api/account/corp-structures/rigs/route.ts:54-55`](../../src/app/api/account/corp-structures/rigs/route.ts#L54-L55) — Reads back through the uncached getCorpStructureRigs
- [`src/features/owned-structures/components/CorpRigEditor.tsx:39-51`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L39-L51) — Client applies res.data via onSaved; it does not depend on revalidation
- [`src/features/owned-assets/queries.ts:116-155`](../../src/features/owned-assets/queries.ts#L116-L155) — saveOwnedAssets: `database !== db` gates the swallow at 142 and `database === db` gates revalidateTag at 153
- [`src/features/owned-assets/queries.ts:164-199`](../../src/features/owned-assets/queries.ts#L164-L199) — saveCorpOwnedAssets owns the tx, rethrows into one catch at 192-195, invalidates both tags after commit at 196-197
- [`src/data/corp-holdings/queries.ts:57-82`](../../src/data/corp-holdings/queries.ts#L57-L82) — saveHoldingNodes has the same identity switch at 73 and 76; its only production caller passes tx
- [`src/data/corp-holdings/queries.ts:84-120`](../../src/data/corp-holdings/queries.ts#L84-L120) — saveCorpProfile follows the tx-owner pattern
- [`src/features/owned-blueprints/queries.ts:81-121`](../../src/features/owned-blueprints/queries.ts#L81-L121) — saveOwnedBlueprints follows the tx-owner pattern
- [`src/composition/sync/owned-assets-source-save.ts:15-59`](../../src/composition/sync/owned-assets-source-save.ts#L15-L59) — Sole caller of both savers. Character path at 21-24 is standalone; corp path at 38-48 goes through the tx and discards the snapshot on superseded and on error, which is correct

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/queries.ts:514-521`](../../src/data/maps/queries.ts#L514-L521) — `database === db ? drizzle(directClient) : database` chooses the writer connection. That is not an invalidation or swallow switch, so it is a different concept
- [`src/data/corp-holdings/queries.ts:91-95`](../../src/data/corp-holdings/queries.ts#L91-L95) — The resolve-direct-client-if-undefined preamble shared with owned-assets:173-177 and owned-blueprints:87-91 is a separate lead (a locking-writer helper), outside this finding

</details>

**Home.** `No new primitive. Edit src/features/owned-structures/queries.ts, src/features/owned-assets/queries.ts and src/data/corp-holdings/queries.ts in place.`

**Boundary check.** No new imports. features/owned-assets already imports data/corp-holdings (the features rule allows data), lib/db-types (features allows lib) and db/pg-errors (features allows db). data/corp-holdings keeps its existing imports of db and lib (the data rule allows db and lib).

**API sketch.**

```ts
// data/corp-holdings/queries.ts
export async function saveHoldingNodes(corporationId: number, index: HoldingIndex, refreshedAt: Date, tx: AnyPgDb): Promise<void> // no swallow, no invalidate

// features/owned-assets/queries.ts
async function writeOwnedAssets(database: AnyPgDb, owner: OwnerKey, rows: OwnedAsset[], etags: string[], snapshotId: number | null): Promise<void> // delete + insert + sync stamp; throws
export async function saveOwnedAssets(owner: OwnerKey, rows: OwnedAsset[], etags: string[]): Promise<'saved' | 'superseded'> // character path: try writeOwnedAssets(db,...); unique violation -> 'superseded'; else revalidateTag then 'saved'
// saveCorpOwnedAssets: inside tx call saveHoldingNodes(..., tx) then writeOwnedAssets(tx, owner, rows, etags, snapshotId); invalidation unchanged after commit
```

**Migration steps.**

1. owned-structures/queries.ts: delete line 162 (revalidateTag in upsertCorpStructureRigs). Keep the revalidateTag import, which saveCorpStructures uses.
2. corp-holdings/queries.ts: make saveHoldingNodes take a required `tx: AnyPgDb` and return void. Delete the try/catch at 70-75 and the conditional invalidate at 76. Remove the isUniqueViolation import, which has no other use in the file. Keep invalidateHoldingNodes exported for saveCorpOwnedAssets.
3. owned-assets/queries.ts: move lines 123-152 into a module-private writeOwnedAssets(database, owner, rows, etags, snapshotId) with no catch. Rewrite saveOwnedAssets(owner, rows, etags) to wrap writeOwnedAssets(db, ..., null) in try/catch(isUniqueViolation -> 'superseded') and call revalidateTag(ownedAssetsTag(owner)) only on success. In saveCorpOwnedAssets replace line 190 with writeOwnedAssets(tx, owner, rows, etags, snapshotId).
4. Keep the two ownedAssetSyncs writes inside the corp tx: the first upsert at 183-188 takes the row lock without stamping, and writeOwnedAssets stamps lastRefreshedAt afterward.
5. owned-assets-source-save.ts needs no change: line 22's call already passes three args.

**Tests.** Guards that must stay green unchanged: src/features/owned-assets/queries.db.test.ts:66-138 (character saved/superseded, nothing stamped on loss); src/features/owned-assets/corp-snapshot.db.test.ts:72 (rollback when the content insert fails) and :88 (simultaneous refreshes serialize). Rewrite src/data/corp-holdings/queries.db.test.ts:81-108 to call saveHoldingNodes inside harness.db.transaction((tx) => saveHoldingNodes(CORP, tree, NOW, tx)). Delete the standalone race test at 110-137, because that behavior is removed and corp-snapshot.db.test.ts:88 covers the production race. Add assertions on the existing next/cache mocks: in owned-structures/queries.db.test.ts, upsertCorpStructureRigs never calls revalidateTag while saveCorpStructures does; in owned-assets/queries.db.test.ts, saveOwnedAssets revalidates on 'saved' and not on 'superseded'. src/app/api/account/corp-structures/rigs/route.test.ts mocks the query and is unaffected.

**Notes.** Correct semantics to keep: a standalone (character) unique violation returns 'superseded' with no sync stamp and no revalidate. Inside a tx the error must propagate so the transaction rolls back and saveCorpOwnedAssets returns 'superseded'. No drift bug was found. The swallow and invalidate rules are already right in both modes; the change only moves the mode decision out of identity checks and into function boundaries. Removing the rig revalidate changes nothing a user can see. Optional follow-up lead: three writers repeat the `options.database ?? (resolveLockConnectionUrl(), drizzle(directClient))` preamble (owned-assets:173-177, owned-blueprints:87-91, corp-holdings:91-95).

<sub>Reported by: gap:next-cache-tags-and-invalidation.</sub>

<a id="p239"></a>

## P239: Replace owner snapshots in one direct-client transaction that takes the sync-row lock first

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** about -45 / +40 production (direct-database default removed in 6 places; supersede/try-catch removed in 3); +80 tests
- **Depends on:** [P220](wave-05-persistence-primitives-and-data-layer-sql.md#p220), [P336](#p336)
- **Existing primitive:** `src/db/pg-errors.ts:isUniqueViolation`

**Problem.** Owner-keyed ESI snapshot tables are replaced with the same steps: lock or write the sync row, delete the owner's rows, insert the new rows, revalidate. The steps are implemented with four different guarantees. owned-blueprints and corp owned-assets run them in a direct-client transaction with the sync-row upsert first, which is the reference form. Character owned-assets and saveHoldingNodes run without a transaction and map unique violations only when `database === db`. saveCorpStructures runs three independent statements with no supersede handling, so a concurrent refresh throws a PK violation inside after(). In both non-transactional forms, a failure after the delete leaves the owner empty with stale etags, which later refreshes stamp as unchanged. Separately, the 'resolveLockConnectionUrl(); drizzle(directClient)' default is copied across 6 modules.

**Verifier revision.** The core is real, and the bug is worse than stated. saveCorpStructures (owned-structures/queries.ts:84-112) and character saveOwnedAssets (owned-assets/queries.ts:116-155) delete first and write the sync row last, as separate Neon HTTP statements. If the insert fails after the delete commits, the owner keeps the OLD pageEtags. The next stale refresh sends those etags, ESI answers 304, planRead returns 'stamp' (owner-sync/plan.ts:13), and the owner stays empty until ESI content changes. The design needs three changes. (a) The proposed directDatabase() does not exist yet: a private copy sits in account-merge.ts:91-94 and the same two lines are inlined in 5 more places, so it becomes its own small primitive. (b) A single lock/replace pair suits the corp path better than separate clear/insert callbacks, because it replaces two tables (holding nodes and assets) under one lock. (c) saveHoldingNodes' standalone `database === db` mode has no production caller (its only caller passes tx at owned-assets/queries.ts:189), so those branches should be deleted rather than generalized. Lock-first ordering also changes concurrency: refreshes serialize instead of failing, so the existing 'superseded' race test must be rewritten.

**Sites (15).**

- [`src/features/owned-blueprints/queries.ts:81-121`](../../src/features/owned-blueprints/queries.ts#L81-L121) — reference form: transaction, sync upsert first, delete, insert; no unique key, so serialization comes only from the lock
- [`src/features/owned-assets/queries.ts:116-155`](../../src/features/owned-assets/queries.ts#L116-L155) — character path: delete, insert, then sync upsert; superseded only when database === db; revalidates only when database === db
- [`src/features/owned-assets/queries.ts:165-199`](../../src/features/owned-assets/queries.ts#L165-L199) — saveCorpOwnedAssets: transaction, lock upsert, saveHoldingNodes(tx), saveOwnedAssets(tx) (which upserts the sync row a second time), unique violation mapped to superseded
- [`src/data/corp-holdings/queries.ts:57-78`](../../src/data/corp-holdings/queries.ts#L57-L78) — saveHoldingNodes: delete then chunked insert (NODE_INSERT_BATCH 1000); standalone branches used only by tests
- [`src/data/corp-holdings/queries.ts:84-120`](../../src/data/corp-holdings/queries.ts#L84-L120) — saveCorpProfile: same lock-row-first transaction around a partial replace of member bases
- [`src/features/owned-structures/queries.ts:84-112`](../../src/features/owned-structures/queries.ts#L84-L112) — no transaction, no supersede, sync row written last
- [`src/platform/owner-sync/plan.ts:8-17`](../../src/platform/owner-sync/plan.ts#L8-L17) — an unchanged read becomes a stamp, which leaves an emptied owner stuck
- [`src/features/owned-structures/refresh.ts:20-29`](../../src/features/owned-structures/refresh.ts#L20-L29) — structures read with held pageEtags; save and stamp wiring
- [`src/platform/owner-sync/engine.ts:45-64, 136-144`](../../src/platform/owner-sync/engine.ts#L45-L64) — the character pass fans out with Promise.all, so every character save runs concurrently
- [`src/db/index.ts:88-95`](../../src/db/index.ts#L88-L95) — direct pool max 3
- [`src/db/pg-errors.ts:15-17`](../../src/db/pg-errors.ts#L15-L17) — isUniqueViolation
- [`src/db/locked-user.ts:7-18`](../../src/db/locked-user.ts#L7-L18) — existing db-zone precedent for a lock-first direct transaction (withLockedUsers)
- [`src/composition/account-lifecycle/account-merge.ts:91-94`](../../src/composition/account-lifecycle/account-merge.ts#L91-L94) — private directDatabase() that already exists
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:51-52`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L51-L52) — inline copy of the direct-database default
- [`src/composition/sync/owned-assets-source-save.ts:21-23, 38-48`](../../src/composition/sync/owned-assets-source-save.ts#L21-L23) — the character caller ignores the outcome; the corp caller discards the snapshot on superseded

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/queries.ts:521`](../../src/data/maps/queries.ts#L521) — `database === db ? drizzle(directClient) : database` is a map-grant row lock, not a snapshot replace. It may adopt directDatabase() later; it is not part of this primitive.
- [`src/composition/wh-statics-refresh.ts:89-109`](../../src/composition/wh-statics-refresh.ts#L89-L109) — Direct drizzle for an advisory-locked workflow. It could use directDatabase(), but it is not an owner snapshot.
- [`src/features/skill-queue/queries.ts:87-120`](../../src/features/skill-queue/queries.ts#L87-L120) — Per-owner JSON upserts with no delete-then-insert. A different shape.
- [`src/features/industry-jobs/queries.ts:57-75, 152-190`](../../src/features/industry-jobs/queries.ts#L57-L75) — Upsert-shaped blobs, not a row-set replace.

</details>

**Home.** `src/db/direct-database.ts (directDatabase) and src/db/snapshot-replace.ts (replaceOwnerSnapshot), beside the existing src/db/locked-user.ts and src/db/deletion-client.ts`

**Boundary check.** Zone db, which may import lib (PostgresJsDb and AnyPgDb from src/lib/db-types) and config. Consumers: features/owned-blueprints, features/owned-assets and features/owned-structures (from:features allows db); data/corp-holdings (from:data allows db); composition/account-lifecycle (from:composition allows db). The primitive takes callbacks and imports no feature schema, so db stays independent of features and data.

**API sketch.**

```ts
// src/db/direct-database.ts
export function directDatabase(): PostgresJsDb { resolveLockConnectionUrl(); return drizzle(directClient); }
// src/db/snapshot-replace.ts
export async function replaceOwnerSnapshot(
  steps: {
    /** Upsert the owner's sync/profile row; its row lock serializes refreshes, including the first publication. */
    readonly lock: (tx: AnyPgDb) => Promise<unknown>;
    /** Delete and re-insert the owner's rows in one or more tables. */
    readonly replace: (tx: AnyPgDb) => Promise<unknown>;
  },
  database: PostgresJsDb = directDatabase(),
): Promise<'saved' | 'superseded'>; // one transaction; isUniqueViolation -> 'superseded'; revalidation stays with the caller
```

**Migration steps.**

1. Add src/db/direct-database.ts with directDatabase() and replace the private copy in account-merge.ts:91-94. Then replace the inline defaults in owned-blueprints/queries.ts:87-91, owned-assets/queries.ts:173-177, corp-holdings/queries.ts:91-95, locked-user.ts:11-12 and tracking-merge-retry.ts:51-52.
2. Add src/db/snapshot-replace.ts with replaceOwnerSnapshot and its unit test.
3. Migrate saveCorpStructures first, because it is the unsafe site. Run deriveSecurityClasses before the transaction. lock = upsert corpStructureSyncs {lastRefreshedAt: now, pageEtags}. replace = delete the corp's corpStructures, then insert the rows. Call revalidateTag only on 'saved'. Keep the port signature Promise<void> by discarding the outcome. Accept an optional { database } like the blueprint form, for tests.
4. Migrate saveOwnedBlueprints to the primitive; behavior is unchanged.
5. Split owned-assets: add a transaction-scoped replaceOwnerAssetRows(tx, owner, rows, snapshotId) that only deletes and inserts. saveOwnedAssets becomes replaceOwnerSnapshot({ lock: sync upsert {lastRefreshedAt, pageEtags}, replace: replaceOwnerAssetRows }) with revalidation on 'saved'. Delete both `database === db` branches.
6. Turn saveHoldingNodes into a transaction-scoped replaceHoldingNodes(tx, corporationId, index, refreshedAt) that keeps the 1000-row chunking. Delete its superseded and invalidate branches.
7. Rewrite saveCorpOwnedAssets as replaceOwnerSnapshot({ lock: one sync upsert setting both lastRefreshedAt and pageEtags, replace: tx => replaceHoldingNodes(...) then replaceOwnerAssetRows(...) }). This removes the double sync upsert. Keep invalidateHoldingNodes and revalidateTag on 'saved', and keep the discard-on-superseded logic in owned-assets-source-save.ts.
8. Optional: express saveCorpProfile with the same primitive (lock = profile upsert, replace = member-base diff).

**Tests.** New src/db/snapshot-replace.test.ts with a mocked transaction: lock runs before replace; commit returns 'saved'; a unique violation returns 'superseded'; any other error propagates. New owned-structures/queries.db.test.ts cases: two concurrent saveCorpStructures calls both resolve and the final rows match the final sync etags; an insert failure (for example a forced FK or type error) rolls back, so the prior rows and etags survive. Rewrite owned-assets/queries.db.test.ts:107-140: with lock-first ordering the loser waits, then commits last; assert the final rows and sync etags come from the same save. Move the standalone saveHoldingNodes cases in corp-holdings/queries.db.test.ts:80-140 to go through a transaction or saveCorpOwnedAssets. Existing guards: owned-assets/corp-snapshot.db.test.ts, composition/sync/blueprint-snapshot.db.test.ts, corp-holdings/queries.db.test.ts:187-247 (profile rollback and serialization), and composition/sync/owned-assets-sync.test.ts and corp-structures-sync.test.ts.

**Notes.** Correct behavior is the blueprint and corp-assets form: one transaction with the sync-row upsert first. That ordering is what serializes even an owner's first publication (comment at owned-assets/queries.ts:181-182), and owned_blueprints has no natural unique key, so nothing else would catch a race there. Moving character assets onto the direct pool (max 3) matches what blueprints already do for every character in the Promise.all fan-out, so it adds the same load per sync run, not a new pattern. Revalidation must run after commit and only on 'saved'. Lead to verify while touching the insert helpers: owned_assets (8 params/row) and owned_blueprints (10 params/row) insert all rows in one statement, so more than about 8,191 or 6,553 rows would exceed the 65,534 bind-parameter limit. holding nodes and industry-indices already chunk at 1000 rows, so the replace helpers should chunk with chunk() from src/lib/array.

<sub>Reported by: concern:persistence.</sub>

<a id="p184"></a>

## P184: Expire owner-dataset cache tags immediately after sync writes (keep the snapshot's uncached reads)

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about +12 (helper + test) / -1 net across call sites; 13 call-site edits, 1 deletion
- **Depends on:** [P327](wave-05-persistence-primitives-and-data-layer-sql.md#p327)

**Problem.** Every owner-dataset write invalidates with revalidateTag(tag, 'max'), which is stale-while-revalidate. The first read after a sync therefore returns the pre-sync value. This breaks the live-dataset contract that one reconcile 4s after a cold load is enough (lib/live-dataset.ts RECONCILE_ONCE): jobs and corp jobs can stay empty until the user navigates again. The board shows skew instead: it reads sync state uncached, so it shows the new refreshedAt next to the old cached assets, skills, jobs and sheet rows. Separately, upsertCorpStructureRigs invalidates corp-structures rows although rigs are read uncached and the tagged entry does not contain them.

**Verifier revision.** The core is confirmed against the bundled Next 16.3.4 source. revalidateTag(tag, 'max') only marks the tag stale (default.js updateTags sets stale=now and expired=now+1y). On the next get, an entry with a stale tag returns revalidate=-1. The wrapper then serves the cached value and regenerates in the background (use-cache-wrapper.js 2427-2448). The revalidateTag.md docs say `{ expire: 0 }` makes the next request a blocking miss, for callers that cannot use updateTag. updateTag throws outside Server Actions and the repo has none. So after an on-view sync, a jobs reconcile that lands on the same instance gets the pre-sync null. RECONCILE_ONCE schedules exactly one reconcile, so the feed stays cold. The board survives only because it passes a 5-step schedule. Three parts are revised. (1) Removing board-view's fresh path and un-exporting the uncached twins is rejected. recordNetWorthSnapshot runs per account in the nightly cron and in after() of roster changes. Uncached reads there keep one-shot entries out of each instance's LRU, and they stay correct even where tag expiry has not reached the instance: with the bundled default handler the tagsManifest is process memory and refreshTags is a no-op. Those twins also stay needed elsewhere: readSheetRow by character-sheet-sync, and readCharacterJobs and the others by the snapshot. (2) The expireEventually twin is dropped. It would wrap revalidateTag(tag, 'max') one-for-one and add nothing. (3) No 'cache tag registry' exists in src/lib; tags are private helpers in each module. There are 13 owner write sites, not 12. One of them, upsertCorpStructureRigs (owned-structures 162), invalidates a cache that never holds rigs, so it should be deleted, not converted.

**Sites (17).**

- [`src/features/industry-jobs/queries.ts:74, 173, 188`](../../src/features/industry-jobs/queries.ts#L74) — saveCharacterJobs, saveCorpJobs, saveCorpNeedsRole: revalidateTag(..., 'max'); getters cacheLife('minutes') at 18-23, 88-100
- [`src/features/skill-queue/queries.ts:137`](../../src/features/skill-queue/queries.ts#L137) — saveCharacterSkills; two cached getters share skillsTag (12-17, 42-49)
- [`src/features/character-sheet/queries.ts:49, 61`](../../src/features/character-sheet/queries.ts#L49) — mergeSheetSection, stampSheetSection
- [`src/features/owned-assets/queries.ts:153, 197`](../../src/features/owned-assets/queries.ts#L153) — saveOwnedAssets (guarded by database === db) and saveCorpOwnedAssets after commit; getters cacheLife('hours') at 28-33, 52-56
- [`src/features/owned-blueprints/queries.ts:120`](../../src/features/owned-blueprints/queries.ts#L120) — blueprint save after the transaction
- [`src/features/owned-structures/queries.ts:111`](../../src/features/owned-structures/queries.ts#L111) — saveCorpStructures
- [`src/features/owned-structures/queries.ts:14-28, 126-139, 148-163`](../../src/features/owned-structures/queries.ts#L14-L28) — upsertCorpStructureRigs revalidates corpStructuresTag at 162, but only getCorpStructureRows (14-28) carries that tag and it selects no rig columns; getCorpStructureRigs is uncached. Dead invalidation.
- [`src/data/corp-holdings/queries.ts:80-82, 119`](../../src/data/corp-holdings/queries.ts#L80-L82) — invalidateHoldingNodes (also called from owned-assets 196) and saveCorpProfile
- [`src/composition/board/board-view.ts:25-38, 79-91`](../../src/composition/board/board-view.ts#L25-L38) — fresh flag reads the uncached twins for recordNetWorthSnapshot only; on view (108) reads the cached getters next to uncached sync states (31, 33, 37), which is the skew
- [`src/composition/sync/live-dataset-view.ts:18-31, 40-46`](../../src/composition/sync/live-dataset-view.ts#L18-L31) — cached data plus uncached state, then after() refresh
- [`src/lib/live-dataset.ts:13-29`](../../src/lib/live-dataset.ts#L13-L29) — RECONCILE_ONCE = [4_000]; reconcileDelay stops once the schedule is exhausted
- [`src/components/use-live-dataset.ts:44, 80-94`](../../src/components/use-live-dataset.ts#L44) — default RECONCILE_ONCE; one reconcile, then stop
- [`src/features/industry-jobs/use-jobs-live.ts:17`](../../src/features/industry-jobs/use-jobs-live.ts#L17) — uses the default schedule (use-corp-jobs-live.ts:16 too)
- [`src/components/composition/board/use-board-live.ts:9-12`](../../src/components/composition/board/use-board-live.ts#L9-L12) — board passes a 5-step schedule, which is why it eventually recovers
- [`src/composition/sync/industry-jobs-sync.ts:47-55`](../../src/composition/sync/industry-jobs-sync.ts#L47-L55) — jobs feed reads the cached getJobsForCharacters
- [`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md:Revalidation Behavior section`](../../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md) — 'max' serves stale while revalidating; { expire: 0 } is a blocking miss for callers that cannot use updateTag
- [`node_modules/next/dist/server/lib/cache-handlers/default.js:84-88, 168-192`](../../node_modules/next/dist/server/lib/cache-handlers/default.js#L84-L88) — a stale tag gives revalidate=-1 (served, then background regen); an expired tag gives a miss; tagsManifest is in-process and refreshTags is a no-op

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/cron/refresh-prices/declaration.ts:40`](../../src/app/api/cron/refresh-prices/declaration.ts#L40) — global reference data; 'max' is right
- [`src/app/api/cron/refresh-sde/declaration.ts:82`](../../src/app/api/cron/refresh-sde/declaration.ts#L82) — global SDE tag; 'max' is right
- [`src/data/wh-statics/queries.ts:348`](../../src/data/wh-statics/queries.ts#L348) — global reference; 'max' is right
- [`src/data/market-prices/refresh-on-view.ts:182-186`](../../src/data/market-prices/refresh-on-view.ts#L182-L186) — per-type price tags on public reference data; 'max' is right
- [`src/data/market-history/refresh-on-view.ts:104`](../../src/data/market-history/refresh-on-view.ts#L104) — per-type history tags; 'max' is right
- [`src/composition/board/board-view.ts:25-38, 79-91`](../../src/composition/board/board-view.ts#L25-L38) — keep the fresh path and the exported uncached twins; this verdict rejects removing them

</details>

**Home.** `src/lib/cache-expiry.ts (new, zone lib)`

**Boundary check.** lib may import only config ("from lib allow [config]"); the helper imports only the npm module next/cache. lib already contains a next/* importer (src/lib/service-auth.ts imports next/server), and server-only-boundary.test.ts has no vendor rule for next/cache. Consumers: features/* (features rule allows lib) and data/corp-holdings (data rule allows lib). No composition, api or app site needs it.

**API sketch.**

```ts
import { revalidateTag } from 'next/cache';
/** Owner data a viewer is waiting on: the next read must miss, never serve the pre-write copy. updateTag is unavailable (no Server Actions; writes run in route handlers, after() and crons). */
export function expireNow(tag: string): void { revalidateTag(tag, { expire: 0 }); }
```

**Migration steps.**

1. Before rolling out, confirm on staging that the deployed 'use cache' default handler behaves like the bundled one: after revalidateTag(tag, 'max'), the same instance serves the old value once; after { expire: 0 }, the next read misses. Use NEXT_PRIVATE_DEBUG_CACHE logging, or hit /api/industry/jobs twice around a sync.
2. Add src/lib/cache-expiry.ts with expireNow, and src/lib/cache-expiry.test.ts.
3. Replace revalidateTag(tag, 'max') with expireNow(tag) at industry-jobs/queries.ts 74, 173, 188; skill-queue/queries.ts 137; character-sheet/queries.ts 49, 61; owned-assets/queries.ts 153 (keep the `database === db` guard) and 197; owned-blueprints/queries.ts 120; owned-structures/queries.ts 111; corp-holdings/queries.ts 81 (inside invalidateHoldingNodes) and 119. Drop the now-unused revalidateTag imports.
4. Delete the revalidateTag call at owned-structures/queries.ts 162 (upsertCorpStructureRigs); the tagged entry holds no rigs.
5. Leave board-view.ts's fresh parameter, the exported uncached twins (readSheetRow, readCharacterSkills, readCharacterSkillLevels, readCharacterJobs, readOwnerAssetRows), and all global-reference 'max' sites unchanged.
6. Optional follow-up only if staging still shows cold jobs feeds (for example, a reconcile routed to a different instance): give use-jobs-live and use-corp-jobs-live a bounded schedule like BOARD_RECONCILE_SCHEDULE.

**Tests.** New src/lib/cache-expiry.test.ts: mock next/cache and assert revalidateTag(tag, { expire: 0 }). Update assertions that pin 'max': src/features/character-sheet/queries.db.test.ts 70-71 and 112, and src/features/skill-queue/queries.db.test.ts 101-102, 141 and 181, to expect { expire: 0 }. Add an assertion in src/features/owned-structures/queries.db.test.ts (it already mocks revalidateTag) that saveCorpStructures expires corp-structures:<id> with { expire: 0 } and that upsertCorpStructureRigs does not call it. src/features/owned-assets/queries.db.test.ts and corp-snapshot.db.test.ts mock revalidateTag; add one assertion each for the transactional path (no call with a passed database, one call after the corp commit). Existing guards: src/lib/live-dataset.test.ts, src/components/use-live-dataset.test.ts, src/composition/board/board-view.db.test.ts (snapshot reads stay uncached).

**Notes.** Preserve: the owned-assets and corp-holdings transactional paths skip invalidation when a caller passes its own database (owned-assets 153, corp-holdings 76) and invalidate once after commit (owned-assets 196-197). Keep that ordering so no read refills the cache from uncommitted state. In route handlers and after(), { expire: 0 } only sets workStore.pathWasRevalidated, which only action-handler.js reads, so there is no router-refresh side effect. Limit: with the bundled default handler, tag state is per process, so expireNow guarantees a miss only on the instance that ran the write. Another instance can still serve its entry until the profile's revalidate passes (60s for 'minutes', 1h for 'hours'). This is why the snapshot keeps its uncached reads. Because the fresh path stays, the separate fresh-path batching opportunity (F476) remains relevant. Lead: platform/purge never invalidates owner tags, so purged owner rows can stay cached for up to the profile's revalidate on instances that hold them.

<sub>Reported by: gap:next-cache-tags-and-invalidation.</sub>

<a id="p241"></a>

## P241: Expire a purged character's 'use cache' tags from runPurge through a PurgeContributor.cacheTags hook

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** +~15 production (1 type member, 5 one-line declarations, 3 `export` keywords, ~4 orchestrator lines), +~40 test lines; 0 removed
- **Depends on:** [P240](wave-10-server-pipelines-purge-telemetry-and-the-admin.md#p240), [P184](#p184)
- **Existing primitive:** `src/platform/purge/types.ts:PurgeContributor`

**Problem.** runPurge deletes character rows for skill-queue, character-sheet, industry-jobs, owned-assets and owned-blueprints, but no tag those rows are cached under is expired. PurgeContributor has no way to declare cache tags. The regular writers call revalidateTag(tag, 'max'), which is stale-while-revalidate, but purge calls nothing. Re-linking the same character within the cache window, through proveCharacter → finishPendingDeletion and then link, or signing up again after nukeAccount, re-serves the deleted data. The board shows it as 'ready' with refreshedAt 0. Planner reads (skill levels, owned asset map, owned blueprint map) serve it with no sync gate for up to an hour (the 'hours' revalidate window) plus one stale request. The deleted personal data also stays in the cache store until it expires.

**Verifier revision.** The core bug is real. Five cache-tier contributors delete character-keyed rows that 'use cache' getters serve. Those getters use cacheLife 'minutes' (revalidate 60s, expire 1h) or 'hours' (revalidate 1h, expire 1d). Nothing on the purge path expires their tags. After purge and re-link, or account deletion and re-sign-up with the same character, the board renders the deleted skills, sheet and jobs as 'ready'. datasetOf gets non-null cached data, and refreshedAt falls back to 0 because the uncached sync rows are gone. The planner's skill-level, owned-asset and owned-blueprint reads serve the deleted rows with no sync gate. Three parts of the proposal are dropped. Account-merge invalidation is unnecessary: follows-character tables keep their characterId keys, mergeCorpJobsPaired is survivor-wins, so the survivor's (userId, corp) cache keys stay valid, and the source user id is deleted. The user-level corp-jobs tag is unnecessary because user ids are never reused after a user purge. Only character subjects need tags. The cacheTags member and orchestrator design stand.

**Sites (19).**

- [`src/platform/purge/types.ts:37-45`](../../src/platform/purge/types.ts#L37-L45) — PurgeContributor has no cache-invalidation member
- [`src/composition/purge/orchestrator.ts:6-21`](../../src/composition/purge/orchestrator.ts#L6-L21) — runTier/runPurge await purgeCharacter/purgeUser and invalidate nothing
- [`src/features/skill-queue/purge.ts:14-17`](../../src/features/skill-queue/purge.ts#L14-L17) — deletes character_skills and character_skill_syncs
- [`src/features/skill-queue/queries.ts:8-17, 42-49, 137`](../../src/features/skill-queue/queries.ts#L8-L17) — getCharacterSkills and getCharacterSkillLevels are cached 'minutes' under exported skillsTag; the writer revalidates with 'max'
- [`src/features/character-sheet/purge.ts:11-13`](../../src/features/character-sheet/purge.ts#L11-L13) — deletes character_sheets
- [`src/features/character-sheet/queries.ts:8-17`](../../src/features/character-sheet/queries.ts#L8-L17) — getCharacterSheet cached under exported sheetTag
- [`src/features/industry-jobs/purge.ts:52-59`](../../src/features/industry-jobs/purge.ts#L52-L59) — purgeCharacter deletes character jobs and syncs
- [`src/features/industry-jobs/queries.ts:14-23`](../../src/features/industry-jobs/queries.ts#L14-L23) — getCharacterJobs cached under industryJobsTag, which is private
- [`src/features/owned-assets/purge.ts:14-23`](../../src/features/owned-assets/purge.ts#L14-L23) — deletes character-owned assets and syncs
- [`src/features/owned-assets/queries.ts:24-33, 87-101`](../../src/features/owned-assets/queries.ts#L24-L33) — getOwnerAssetRows cached 'hours' under private ownedAssetsTag; getOwnedAssetMap and listCharacterAssetRows read it
- [`src/features/owned-blueprints/purge.ts:14-28`](../../src/features/owned-blueprints/purge.ts#L14-L28) — deletes character-owned blueprints and syncs
- [`src/features/owned-blueprints/queries.ts:20-40, 57-66`](../../src/features/owned-blueprints/queries.ts#L20-L40) — getOwnerBlueprintRows cached 'hours' under private ownedBlueprintsTag; getOwnedBlueprintMap reads it
- [`src/composition/account-lifecycle/account-purge.ts:18-41`](../../src/composition/account-lifecycle/account-purge.ts#L18-L41) — purgeLink runs the full character purge; user deletion loops purgeLink then runs the user purge; nothing is invalidated
- [`src/composition/account-lifecycle/owner-transfer.ts:70-71`](../../src/composition/account-lifecycle/owner-transfer.ts#L70-L71) — re-link finishes the pending deletion, then the link proceeds
- [`src/composition/board/board-view.ts:25-38, 108`](../../src/composition/board/board-view.ts#L25-L38) — the view path (fresh=false) reads the cached sheet, skills, levels and jobs getters; sync states are read uncached
- [`src/composition/board/board-assemble.ts:196-205`](../../src/composition/board/board-assemble.ts#L196-L205) — datasetOf returns 'ready' for non-null data with refreshedAt ?? 0
- [`src/composition/sync/skills-sync.ts:48-68`](../../src/composition/sync/skills-sync.ts#L48-L68) — planner skill levels read cached getters with no sync gate (missed by the finders)
- [`src/composition/sync/owned-assets-sync.ts:35-51`](../../src/composition/sync/owned-assets-sync.ts#L35-L51) — getOwnedAssetMap is read before the after() refresh
- [`src/composition/sync/owned-blueprints-sync.ts:32-52`](../../src/composition/sync/owned-blueprints-sync.ts#L32-L52) — getOwnedBlueprintMap is read before the after() refresh

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/account-lifecycle/account-merge.ts:69-127`](../../src/composition/account-lifecycle/account-merge.ts#L69-L127) — Merge does not invalidate a served key. follows-character tables keep characterId keys. corp_industry_jobs is survivor-wins (industry-jobs/purge.ts 11-31): the survivor keeps its own (userId, corp) rows, and corps it gains were never cached for it because getCorpJobsForUserOnView only reads corps that have sync rows. The source user row is deleted.
- [`src/features/industry-jobs/purge.ts:60-63`](../../src/features/industry-jobs/purge.ts#L60-L63) — The user purge deletes corp jobs for a userId that is then deleted for good. Random ids are never reused, so no `corp-industry-jobs:user:*` tag is needed.
- [`src/data/corp-holdings/purge.ts:11-13`](../../src/data/corp-holdings/purge.ts#L11-L13) — corp_member_bases is not read under 'use cache'; readCorpHoldingRows (data/corp-holdings/queries.ts 22-50) reads nodes and profiles only
- [`src/composition/account-lifecycle/character-transfer.ts:19`](../../src/composition/account-lifecycle/character-transfer.ts#L19) — Transfer runs the credential tier only; cache rows stay with the character by design, so there is nothing to expire
- [`src/composition/board/board-view.ts:41, 65`](../../src/composition/board/board-view.ts#L41) — Board assets are already gated: rows are null when the uncached asset sync state is missing

</details>

**Home.** `src/platform/purge/types.ts (new optional member) + src/composition/purge/orchestrator.ts (the only invalidation call site)`

**Boundary check.** src/platform/purge (zone platform/purge, rule allow: []): the member is typed with plain strings and the existing PurgeCharacterSubject, so it needs no import. The five contributors are in the features zone, whose rule allows platform/purge. They import tag builders from their sibling ./queries in the same zone. The corp-holdings contributor, if it declares cacheTags: () => [] for the gate, is in the data zone, whose rule allows platform/purge. The orchestrator is in the composition zone, whose rule allows features and platform/purge. next/cache is an npm package, not a zone, and composition already imports it (src/composition/esi-health.ts:1, src/composition/sitemap.ts:2).

**API sketch.**

```ts
// platform/purge/types.ts
export interface PurgeContributor {
  ...
  /** Tags of 'use cache' entries built from rows purgeCharacter deletes. */
  cacheTags?(subject: PurgeCharacterSubject): readonly string[];
}
// e.g. features/skill-queue/purge.ts
cacheTags: ({ characterId }) => [skillsTag(characterId)],
// composition/purge/orchestrator.ts
import { revalidateTag } from 'next/cache';
if (subject.kind === 'character') {
  await contributor.purgeCharacter?.(subject);
  for (const tag of contributor.cacheTags?.(subject) ?? []) revalidateTag(tag, { expire: 0 });
} else await contributor.purgeUser?.(subject);
```

**Migration steps.**

1. Have docs-researcher confirm the Next 16.3.4 semantics. The local reference node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md says `{ expire: 0 }` means stale content is never served, and that revalidateTag works in Route Handlers. node_modules/next/dist/server/web/spec-extension/revalidate.js throws 'Invariant: static generation store missing' outside a request store.
2. Add the optional `cacheTags?(subject: PurgeCharacterSubject): readonly string[]` member to PurgeContributor in src/platform/purge/types.ts.
3. Export the private tag builders: industryJobsTag (features/industry-jobs/queries.ts:14), ownedAssetsTag (features/owned-assets/queries.ts:24) and ownedBlueprintsTag (features/owned-blueprints/queries.ts:20). skillsTag and sheetTag are already exported.
4. Declare cacheTags on the five contributors: skill-queue → [skillsTag(id)], character-sheet → [sheetTag(id)], industry-jobs → [industryJobsTag(id)], owned-assets → [ownedAssetsTag({ ownerType: 'character', ownerId: id })], owned-blueprints → [ownedBlueprintsTag({ ownerType: 'character', ownerId: id })].
5. In composition/purge/orchestrator.ts runTier, expire each contributor's tags right after its purgeCharacter resolves. This happens per contributor, not at the end, so a later failure still leaves earlier deletions expired. Use { expire: 0 }, not 'max'.
6. Add `vi.mock('next/cache', ...)` stubs to the tests that now reach a real revalidateTag outside a request: orchestrator.test.ts, account-lifecycle/account-purge.test.ts, account-purge.db.test.ts and owner-transfer.db.test.ts. Each stub provides revalidateTag, cacheLife and cacheTag, because importing ./queries pulls in the other two names.
7. Do not touch account-merge or industry-jobs purgeUser, and do not add a user-level corp-jobs tag.

**Tests.** orchestrator.test.ts: with next/cache mocked, a full character purge calls revalidateTag exactly with 'skills:42', 'character-sheet:42', 'industry-jobs:42', 'owned-assets:character:42' and 'owned-blueprints:character:42', each with { expire: 0 } and each after its table's delete in `recorded`. A credential-only purge (the transfer path) and a user purge expire nothing. registry.test.ts gate: every contributor named like a src/features or src/data directory whose queries.ts contains 'use cache' declares cacheTags. That makes corp-holdings declare `() => []`, with a comment that corp_member_bases is not cached, so a new cached reader cannot land silently. Existing guards: the orchestrator.test.ts ordering tests and the registry coverage gates.

**Notes.** Use { expire: 0 } for deletions. The writers' 'max' profile serves the deleted rows once more under stale-while-revalidate. Every runPurge caller runs inside a request store: the account/delete and purge-character routes, the Better Auth callback through proveCharacter, the cron housekeeping route and the dev synthetic-pilot route. Calling runPurge from a script would now throw after the deletes, which is safe because jobs retry and deletes are idempotent. Contributor deletes use autocommit `db`, not the deletionDatabase transaction, so expiring right after purgeCharacter cannot race an uncommitted delete. The tag strings must come from the queries builders, not be re-typed, or a format drift silently disables invalidation. If a purge-contributor factory lands from another batch, it should forward cacheTags. That is not a prerequisite.

<sub>Reported by: gap:next-cache-tags-and-invalidation.</sub>

<a id="p273"></a>

## P273: Put Upwell rig-slot helpers (UPWELL_RIG_SLOTS, rigSlotsFrom, fittedRigIds, fittingRigs) in data/eve-data/structures and return the stored row from upsertCorpStructureRigs

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 removed across 2 contracts, 2 slot helpers, 3 filters, the 2 validator loops and the route re-read; about +25 added in structures.ts and tests. Net about -5 to -10, with one DB round trip fewer per corp rig save.
- **Depends on:** [P336](#p336)
- **Existing primitive:** `src/data/eve-data/structures.ts:rigFitsStructure`

**Problem.** custom-structures and owned-structures both edit an Upwell hull's rigs and duplicate the domain pieces:
- MAX_CUSTOM_STRUCTURE_RIGS and MAX_CORP_STRUCTURE_RIGS (both 3) feed two zod schemas and two RigSupply maxSlots props.
- slotsFromRigs and slotsFrom pad or truncate to 3.
- Two save paths strip empty slots.
- `hull ? rigs.filter(r => rigFitsStructure(r, hull)) : []` appears in StructureComposer, StructuresManager and the corp validator.
- The two save validators loop over rig ids against the same fitting rule with differently worded results.

Separately, the corp rigs route re-queries every rig row for the corporation after the upsert only to echo back taxPct.

**Verifier revision.** Partly true. The sibling features custom-structures and owned-structures cannot import each other: the features rule omits 'features', and no cross-feature import exists. Both re-implement the Upwell rig-slot fact:
- two constants, both 3;
- identical pad and truncate helpers (slotsFromRigs and slotsFrom);
- an identical unpad (`slots.filter(x is number)` at structure-draft.ts:132 and CorpRigEditor.tsx:43);
- the same 'rigs fitting this hull' filter in three places;
- the same 'every rig is known and fits the hull' loop.

That logic belongs next to rigFitsStructure in data/eve-data/structures.ts, whose doc comment already claims to be the single fitting rule. Dropped: the StructureCompletionFields component, because the layouts differ and RigSupply and PercentInput are already the shared pieces. Also dropped: the eyebrow label wrapper, because src/components/ui/field.tsx already exists and two sites do not justify a micro-eyebrow variant. The route re-read is real but is a simplification more than an efficiency fix, since it is one small indexed query. Validators must keep their own reason strings, which tests assert. Payoff is low.

**Sites (13).**

- [`src/features/custom-structures/api-contract.ts:14, 38`](../../src/features/custom-structures/api-contract.ts#L14) — MAX_CUSTOM_STRUCTURE_RIGS = 3; .max() in the zod schema.
- [`src/features/owned-structures/api-contract.ts:37-43`](../../src/features/owned-structures/api-contract.ts#L37-L43) — MAX_CORP_STRUCTURE_RIGS = 3; .max() in the zod schema (also a local PG_INT4_MAX).
- [`src/features/custom-structures/structure-draft.ts:22-28, 132`](../../src/features/custom-structures/structure-draft.ts#L22-L28) — emptySlots and slotsFromRigs pad to 3; payloadFromDraft strips the nulls.
- [`src/features/owned-structures/components/CorpRigEditor.tsx:17-18, 34, 41-43, 58`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L17-L18) — slotsFrom pads to 3; strips nulls at 43; maxSlots={MAX_CORP_STRUCTURE_RIGS}; 'Tax must be 0–10%.'
- [`src/features/custom-structures/components/StructureComposer.tsx:58-65, 236, 266, 313, 379`](../../src/features/custom-structures/components/StructureComposer.tsx#L58-L65) — FIELD_ERROR.tax has the same copy; the validRigs filter; maxSlots={MAX_CUSTOM_STRUCTURE_RIGS}; slotsFromRigs([]) resets.
- [`src/components/composition/industry-workspace/StructuresManager.tsx:130-137`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L130-L137) — Third `hull ? rigs.filter(rigFitsStructure) : []`, feeding CorpRigEditor.
- [`src/components/RigSupply.tsx:5-18`](../../src/components/RigSupply.tsx#L5-L18) — Existing shared slot UI; requires maxSlots, and both callers pass 3.
- [`src/features/custom-structures/validation.ts:14-31`](../../src/features/custom-structures/validation.ts#L14-L31) — Hull lookup, then per-rig unknown/misfit checks with id-specific reasons.
- [`src/features/owned-structures/rig-validation.ts:10-28`](../../src/features/owned-structures/rig-validation.ts#L10-L28) — Corp row to hull lookup, then a fitting-id set with one combined reason.
- [`src/data/eve-data/structures.ts:63-76`](../../src/data/eve-data/structures.ts#L63-L76) — rigFitsStructure, documented as the single rule shared by picker and save boundary; the natural home.
- [`src/data/industry-math/fees.ts:19, 25-34`](../../src/data/industry-math/fees.ts#L19) — MAX_FACILITY_TAX_PCT = 10 is what both 'Tax must be 0–10%.' strings hard-code.
- [`src/app/api/account/corp-structures/rigs/route.ts:54-60`](../../src/app/api/account/corp-structures/rigs/route.ts#L54-L60) — Upsert, then getCorpStructureRigs([corporationId]) reads all of the corp's rows to echo taxPct.
- [`src/features/owned-structures/queries.ts:126-163`](../../src/features/owned-structures/queries.ts#L126-L163) — upsertCorpStructureRigs returns void; the tri-state taxPct is why the route needs the stored value.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/custom-structures/components/StructureComposer.tsx:84-91`](../../src/features/custom-structures/components/StructureComposer.tsx#L84-L91) — LabeledField: the ui Field primitive exists (src/components/ui/field.tsx:15, 56) with a different label style. An eyebrow wrapper for two sites with different layouts is not worth a primitive.
- [`src/features/owned-structures/components/CorpRigEditor.tsx:53-75`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L53-L75) — Layout (rigs, tax and buttons in one inset panel) differs from the composer's tabbed Bonuses/Rigs/Paste fit, so a StructureCompletionFields component would mostly wrap RigSupply and PercentInput, which are already shared.
- [`src/features/custom-structures/components/StructureComposer.tsx:63`](../../src/features/custom-structures/components/StructureComposer.tsx#L63) — 'Could not save. Try again.' is generic UI copy, not domain-bound; leave it.

</details>

**Home.** `src/data/eve-data/structures.ts (UPWELL_RIG_SLOTS, rigSlotsFrom, fittedRigIds, fittingRigs, optional findUnfitRig); src/features/owned-structures/queries.ts (upsert returning)`

**Boundary check.** src/data/eve-data/structures.ts is in the data zone (autoDiscover child data/eve-data). The consumers are allowed to import it:
- features/custom-structures and features/owned-structures (api-contract, structure-draft, validation, rig-validation, StructureComposer, CorpRigEditor): the features rule allows 'data'.
- src/components/composition/industry-workspace/StructuresManager.tsx (components-composition): its rule allows 'data'.
- src/components/RigSupply.tsx (components), for a default maxSlots: its rule allows 'data'.

structures.ts imports only ./constants and ./types and is already imported by the client StructureComposer, so it is client-safe. The upsert change stays inside features/owned-structures, and its route consumer is in the api zone, which allows 'features'.

**API sketch.**

```ts
// src/data/eve-data/structures.ts
/** Every Upwell structure has three rig slots. */
export const UPWELL_RIG_SLOTS = 3;
export function rigSlotsFrom(rigTypeIds: readonly number[]): (number | null)[]; // pad/truncate to UPWELL_RIG_SLOTS
export function fittedRigIds(slots: readonly (number | null)[]): number[];       // drop empty slots
export function fittingRigs<T extends { canFitGroups: number[]; rigSize: number | null }>(
  rigs: readonly T[], hull: { groupId: number; rigSize: number | null } | null | undefined): T[];
// optional
export function findUnfitRig(rigTypeIds: readonly number[], hull: { groupId: number; rigSize: number | null },
  rigs: readonly StructureRigOption[]): { rigTypeId: number; cause: 'unknown' | 'misfit' } | null;

// src/features/owned-structures/queries.ts
export async function upsertCorpStructureRigs(corporationId: number, structureId: number,
  rigTypeIds: number[], taxPct?: number | null): Promise<CorpStructureCompletion>; // .returning({ rigTypeIds, taxPct })
```

**Migration steps.**

1. Add UPWELL_RIG_SLOTS, rigSlotsFrom, fittedRigIds and fittingRigs (optionally findUnfitRig) to src/data/eve-data/structures.ts, with unit tests in its test file.
2. Replace .max(MAX_CUSTOM_STRUCTURE_RIGS) and .max(MAX_CORP_STRUCTURE_RIGS) with .max(UPWELL_RIG_SLOTS) in both api-contracts. Delete both constants, and update owned-structures/coverage.test.ts:54-60, which imports MAX_CORP_STRUCTURE_RIGS.
3. structure-draft.ts: delete emptySlots and slotsFromRigs and use rigSlotsFrom (also at StructureComposer.tsx:313 and 379, which reset with slotsFromRigs([])). Use fittedRigIds at line 132.
4. CorpRigEditor.tsx: delete slotsFrom and use rigSlotsFrom at 34 and fittedRigIds at 43.
5. RigSupply.tsx: make maxSlots optional, defaulting to UPWELL_RIG_SLOTS, or remove the prop. Drop maxSlots from StructureComposer.tsx:266 and CorpRigEditor.tsx:58.
6. Replace the three filters with fittingRigs: StructureComposer.tsx:236, StructuresManager.tsx:135 and rig-validation.ts:21-23.
7. Optional: rewrite both validators' rig loops on findUnfitRig, mapping the result to each validator's existing reason strings.
8. Make upsertCorpStructureRigs `.returning({ rigTypeIds: corpStructureRigs.rigTypeIds, taxPct: corpStructureRigs.taxPct })` and return the first row. In rigs/route.ts, use it for the response and delete the getCorpStructureRigs import and call at 55.
9. Optional: export a facility-tax error string derived from MAX_FACILITY_TAX_PCT next to parseFacilityTaxDraft and use it in FIELD_ERROR.tax and CorpRigEditor.tsx:41.

**Tests.** Add tests in src/data/eve-data for:
- rigSlotsFrom: [] gives [null,null,null], and 4 ids are truncated to 3;
- fittedRigIds;
- fittingRigs with a null hull;
- findUnfitRig: unknown versus misfit.

Existing guards that must stay green with unchanged reasons: src/features/custom-structures/validation.test.ts:52, src/features/owned-structures/rig-validation.test.ts:50-86, src/app/api/account/corp-structures/rigs/route.test.ts:97-111, structure-draft.test.ts, StructureComposer tests and StructuresManager.test.ts. Update the rigs route test: the upsert mock now resolves { rigTypeIds, taxPct } (line 65), and the getCorpStructureRigs mock (lines 7, 21, 62-64) is removed. In features/owned-structures/queries.db.test.ts:59-66, assert that the returned value is tri-state: a rig-only save returns the stored 2.5.

**Notes.** Behaviour to preserve:
- Validator reasons differ on purpose and are asserted. Custom uses 'unknown structure type', `unknown rig ${id}` and `rig ${id} does not fit this structure`. Corp uses 'Unknown structure for this corporation', 'Not an industry structure', and 'One or more rigs do not fit this structure' for both unknown and misfit rigs. Hull resolution also differs (custom from selection.structureTypeId; corp from the corp row's typeId) and stays in each wrapper.
- Slot padding is semantically identical. slotsFromRigs takes a readonly array and slotsFrom a mutable one; use readonly.
- taxPct is tri-state (undefined keeps the stored tax). With .returning(), the conflict-update row already carries the preserved tax, so the response stays correct. The extra query cost was small (one indexed read of a corp's rig rows), so treat this as a simplification.
- Adjacent lead outside this scope: PG_INT4_MAX (2_147_483_647) is redeclared in src/features/custom-structures/api-contract.ts:11, src/features/industry-planner/api-contract.ts:23, src/features/owned-structures/api-contract.ts:37, src/features/wormhole-sites/api-contract.ts:102 (as POSTGRES_SERIAL_MAX), src/data/market-history/api-contract.ts:6 and src/data/market-prices/api-contract.ts:6. A single positive-int4 zod helper in src/transport, which features and data may import, would cover all six.

<sub>Reported by: area:features-owned.</sub>

← [Wave 10: Server pipelines, purge, telemetry and the admin console](wave-10-server-pipelines-purge-telemetry-and-the-admin.md) · [Index](README.md#roadmap) · [Wave 12: Market data, search and client data reads](wave-12-market-data-search-and-client-data-reads.md) →
