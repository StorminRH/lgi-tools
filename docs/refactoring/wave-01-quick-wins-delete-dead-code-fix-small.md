# Wave 1: Quick wins: delete dead code, fix small correctness and perf bugs

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

[Index](README.md#roadmap) · [Wave 2: Tooling and test-harness foundations](wave-02-tooling-and-test-harness-foundations.md) →

Shrink the surface every later wave would otherwise migrate, and land the cheap but real fixes first:
- P296 stops deploys re-creating users for deleted characters.
- P268 fixes the empty-secret fallback.
- P185 fixes stale SDE caches.
- P042 keeps pg-core out of client bundles.
- P279 and P080 remove wasted renders and reads.

Every item is S/low and local. Deletions go first so later items (P186, P250, P237, P291, P340) do not edit code that is about to disappear.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P296](#p296) | Retire the per-deploy auth backfill: it re-creates users and accounts for deleted characters | efficiency | S | low | high | — |
| ☑ | [P303](#p303) | Delete the dead Convex character-enumeration client and its internal route | simplification | S | low | medium | — |
| ☑ | [P304](#p304) | Delete the test-only price-confidence aggregation code | simplification | S | low | medium | — |
| ☑ | [P324](#p324) | Retire the completed mapHallwayBackfill migration | simplification | S | low | low | — |
| ☑ | [P335](#p335) | Delete the dead refreshPricesOnDemand and drop the cache tags nothing invalidates | simplification | S | low | low | — |
| ☑ | [P042](#p042) | Move wormhole-site domain constants out of the Drizzle schema so client bundles stop pulling in pg-core | efficiency | S | low | medium | — |
| ☑ | [P277](#p277) | Delete the dead motion-variable write on the map shell; ChainSurface's scope is the only writer | efficiency | S | low | low | — |
| ☑ | [P312](#p312) | Delete test-only signature-model exports and move signatureIdentityKey next to SignatureWindowRow | simplification | S | low | low | — |
| ☑ | [P313](#p313) | Use atlasMapHref in handoffCreatedMap | simplification | S | low | low | — |
| ☑ | [P234](#p234) | Fold getAdjustedPrices and getAveragePrices into one column-parameterized reader | persistence | S | low | low | — |
| ☑ | [P278](#p278) | Name the settle spring once in motion-contract (SETTLE_SPRING) instead of three springFamily(0) calls | efficiency | S | low | low | — |
| ☑ | [P113](#p113) | Reuse tween-model's pruneBy for motion-host-model's pruneToLive | generic-utility | S | low | low | — |
| ☑ | [P114](#p114) | Share one djb2 string hash between wormhole seeding and fog brush rotation | generic-utility | S | low | low | — |
| ☑ | [P290](#p290) | Count active sessions with count() and read the two pending-deletion queues concurrently | efficiency | S | low | low | — |
| ☑ | [P135](#p135) | Route isGscConfigured through readEnv instead of a process.env parameter | generic-utility | S | low | low | — |
| ☑ | [P136](#p136) | Derive problem-type URIs, the outbound UA contact and same-origin's fallback from PRODUCTION_SITE_URL | generic-utility | S | low | low | — |
| ☑ | [P268](#p268) | Resolve the Better Auth secret once with empty-string fallback (readAuthSecret in lib/env) | contracts-validation | S | low | medium | — |
| ☑ | [P185](#p185) | Tag the wormhole-site detail caches with the SDE tag and rename it SDE_CACHE_TAG (no sdeCache helper) | server-pipeline | S | low | medium | — |
| ☑ | [P079](#p079) | Rebuild useClientCommitted on createClientStore | client-data | S | low | low | — |
| ☑ | [P061](#p061) | Read the user in PreferencesProvider from ReadIdentity, not a second useSession | react-hook | S | low | low | — |
| ☑ | [P279](#p279) | Make useChainFocusMenus depend on the stable menu callbacks so React Flow's memo chain holds | efficiency | S | low | medium | — |
| ☑ | [P080](#p080) | Read the board in the industry workspace only when a member sheet is open | client-data | S | low | medium | — |
| ☑ | [P155](#p155) | Render LoadFailed with useLiveDataset's retry in LiveBoard and delete BOARD_LOAD_FAILED | error-handling | S | low | medium | — |
| ☑ | [P097](#p097) | Render slot pools with one poolFigure encoding in the industry workspace | formatting | S | low | low | — |
| ☑ | [P171](#p171) | Count board used slots with countUsedSlots instead of a local filter | server-pipeline | S | low | low | — |
| ☑ | [P330](#p330) | Retire the stale tracking codemod, tokenize its three leftovers, and fix the IPv6 loopback checks in scripts/ | simplification | S | low | low | — |
| ☑ | [P197](#p197) | Collapse the three purge drain loops in httpMapAccess into one private helper | convex | S | low | low | — |
| ☑ | [P323](#p323) | Delete the always-true locationChanged guard and fold the repeated no-location, jump-evidence and scan-routing literals | simplification | S | low | low | — |
| ☑ | [P154](#p154) | Remove dead try/catch and .catch wrappers around apiFetch and convert the impossible-rejection test mocks to network outcomes | error-handling | S | low | low | — |
| ☑ | [P142](#p142) | Use rateLimitPreflight in account/active-character and sync-leave instead of inline copies | api-route | S | low | low | — |
| ☑ | [P287](#p287) | Reuse Better Auth's get-session result for the background authorization check | efficiency | S | low | low | — |
| ☐ | [P059](#p059) | Move AFK state into TrackingHeartbeat and narrow MapPresenceContext to the presence map | react-hook | S | low | low | — |

<a id="p296"></a>

## P296: Retire the per-deploy auth backfill: it re-creates users and accounts for deleted characters

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** high · **Size:** -80 lines (script) and one package.json line
- **Depends on:** —
- **Existing primitive:** `src/lib/eve-provider.ts:EVE_PROVIDER_ID`

**Problem.** build:vercel runs src/scripts/backfill-users-if-empty.ts on every deploy. Its only gate is that the "user" table exists. It then loads every characters row and, for each character with no EVE account row, inserts a Better Auth user and a tokenless account. Character and account deletion keep the characters profile row by design, so every deploy re-creates a user (name, portrait, synthetic email) and a link for each character a user deleted. A later SSO login with that character then lands in the re-created user. The loop also costs one round trip per character per deploy on a reserved lock connection, uses 'eve' instead of EVE_PROVIDER_ID, and takes lock key 8419273051, outside the 8273619xxx convention.

**Verifier revision.** The efficiency complaint is accurate: there is no 'if empty' gate, there is one SELECT per character on every deploy, 'eve' is hard-coded, and the lock key sits outside the project namespace. But the larger problem is correctness, and a set-based rewrite would only make it faster. Character and account deletion deliberately keep the characters profile row. No code deletes from characters: the auth purge contributor only nulls tokens, purgeLink deletes only the account row, and account-purge.db.test.ts:337-344 asserts the profile row survives. So on the next deploy the script finds each deleted character with no EVE account and inserts user 'eve-user-<id>' (name, portrait, synthetic email) plus account 'eve-acct-<id>', undoing the deletion. repairUserIdentity has already moved the user's email to the replacement character, so the synthetic-email insert does not collide. The proposal's 'advisory-lock registry' does not exist: keys are per-slice constants in the 8273619xxx namespace. The right fix is to retire the script, which is what the proposal's alternative suggests.

**Sites (10).**

- [`src/scripts/backfill-users-if-empty.ts:13, 23-59`](../../src/scripts/backfill-users-if-empty.ts#L13) — Magic lock key. Full scan of characters, then per row a SELECT on account and two INSERTs (user, account) with ON CONFLICT (id) DO NOTHING; 'eve' literals at 35 and 50
- [`src/scripts/backfill-users-if-empty.ts:61-78`](../../src/scripts/backfill-users-if-empty.ts#L61-L78) — The only gate checks that the user table exists; there is no emptiness check despite the name
- [`package.json:23`](../../package.json#L23) — build:vercel runs the script on every Vercel deploy
- [`src/lib/eve-provider.ts:2`](../../src/lib/eve-provider.ts#L2) — EVE_PROVIDER_ID = 'eve', which the script bypasses
- [`src/platform/auth/purge.ts:12-58`](../../src/platform/auth/purge.ts#L12-L58) — The auth contributor claims characters, but purgeCharacter only nulls tokens and there is no purgeUser, so characters rows are never deleted
- [`src/composition/account-lifecycle/account-purge.ts:18-40`](../../src/composition/account-lifecycle/account-purge.ts#L18-L40) — purgeLink deletes only the account row; finishUserDeletion then deletes the user, and the characters row stays
- [`src/composition/account-lifecycle/account-purge.db.test.ts:337-344`](../../src/composition/account-lifecycle/account-purge.db.test.ts#L337-L344) — Asserts the characters profile row survives a full character purge, so the orphan state the backfill acts on is intended
- [`src/platform/auth/account-purge.ts:20-35`](../../src/platform/auth/account-purge.ts#L20-L35) — repairUserIdentity rewrites the user's synthetic email to the remaining character, so the backfill's syntheticEmail(deletedChar) insert does not collide
- [`src/platform/auth/auth.ts:163-176`](../../src/platform/auth/auth.ts#L163-L176) — upsertCharacterLoginIdentity writes the characters row inside getUserInfo before Better Auth creates the account, so a failed login also leaves an orphan the backfill would adopt
- [`src/data/eve-data/constants.ts:66`](../../src/data/eve-data/constants.ts#L66) — Advisory-lock key convention (8273619013); other slices use 8273619014-019. There is no central registry

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/scripts/ingest-sde-if-empty.ts:15-24, 69`](../../src/scripts/ingest-sde-if-empty.ts#L15-L24) — A legitimate per-deploy if-empty step that shares requireSoftFailLockClient; unaffected and keeps that helper in use
- [`src/composition/synthetic-pilot-store.ts:120-145`](../../src/composition/synthetic-pilot-store.ts#L120-L145) — Writes its own characters and account rows with EVE_PROVIDER_ID; not a backfill consumer

</details>

**Home.** `None. Delete src/scripts/backfill-users-if-empty.ts and its build:vercel step.`

**Boundary check.** Removal only. The script is in the scripts zone and nothing imports it. After deletion, requireSoftFailLockClient (src/scripts/script-runtime.ts:5) is still used by ingest-sde-if-empty.ts, and syntheticEmail (src/platform/auth/synthetic-email.ts) is still used by platform/auth/auth.ts and account-purge.ts, so Fallow unused-exports stays clean. Removing the package.json reference without deleting the file would leave an unused file that Fallow flags.

**API sketch.**

```ts
None (removal). If a manual tool must survive for pre-migration databases, it must gate on SELECT NOT EXISTS (SELECT 1 FROM "user") and then run one INSERT ... SELECT FROM characters c WHERE NOT EXISTS (SELECT 1 FROM account a WHERE a.provider_id = ${EVE_PROVIDER_ID} AND a.account_id = c.character_id::text) ON CONFLICT DO NOTHING, under a lock key in the 8273619xxx series exported from a data-slice constants file. It must never run from build:vercel.
```

**Migration steps.**

1. Confirm with the owner that production and staging finished the Better Auth migration (their user tables are non-empty and logins create users by themselves).
2. Remove 'tsx src/scripts/backfill-users-if-empty.ts && ' from build:vercel in package.json.
3. Delete src/scripts/backfill-users-if-empty.ts.
4. Run pnpm check through the test-runner agent to confirm Fallow reports no unused file or export.
5. As a separate operator task, not code: audit production for users the script already re-created. Look for user ids like 'eve-user-%' whose only account is 'eve-acct-<id>' with a null refresh_token and no session, for characters with a past deletion, and remove them through the normal deletion flow.

**Tests.** No test covers the script today. Removing it needs no new test. If a gated manual variant is kept, add a db test on the account-purge.db.test.ts harness: a characters row left by a character purge is not re-linked while the user table is non-empty. Existing guard on the intended orphan state: account-purge.db.test.ts:293-362.

**Notes.** Why not a set-based rewrite: an anti-join cannot tell 'never linked' from 'deliberately deleted', because both appear as a characters row with no account. Batching the inserts would still resurrect every deleted character. The script's own name says the intent was to run only against an empty user table during the Better Auth migration. Other drift in the current code: the user INSERT handles only an id conflict, so a unique-email collision throws and soft-fails the remaining rows. The lock key sits outside the namespace documented in src/data/industry-indices/constants.ts:12-19.

<sub>Reported by: area:lib-infra.</sub>

<a id="p303"></a>

## P303: Delete the dead Convex character-enumeration client and its internal route

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -100 production lines (route 50, contract 28, client 16, plus registry entries) and about -110 test lines
- **Depends on:** —
- **Existing primitive:** `src/composition/sync/owner-sync-port.ts:listCharactersWithHealth`

**Problem.** fetchEnumeratedCharacters (convex/lib/characterSync.ts) and the bearer-secret route POST /api/internal/eve-characters stay alive only through tests and registry entries. The route is a second copy of the listCharactersWithHealth projection with an extra name field, plus an after() affiliation refresh that never runs because nothing calls the route. Five test/registry files list it, so it costs maintenance and widens the attack surface of an internal endpoint.

**Sites (13).**

- [`convex/lib/characterSync.ts:1-6, 29-44`](../../convex/lib/characterSync.ts#L1-L6) — fetchEnumeratedCharacters and its EveCharactersResponse/eveCharactersEndpoint imports; no production caller
- [`convex/characterLocationSync.ts:17-22, 119-129`](../../convex/characterLocationSync.ts#L17-L22) — Production path imports only requireSyncEnv/resolveExpiresAt/vendCharacterToken and gets trackedIds from syncInputs
- [`convex/characterLocationSync.test.ts:299, 673`](../../convex/characterLocationSync.test.ts#L299) — Asserts location sync never calls /eve-characters
- [`src/app/api/internal/eve-characters/route.ts:16-50`](../../src/app/api/internal/eve-characters/route.ts#L16-L50) — Service route; linked -> deriveCharacterHealth projection plus after() affiliation refresh
- [`src/composition/sync/owner-sync-port.ts:11-29`](../../src/composition/sync/owner-sync-port.ts#L11-L29) — listCharactersWithHealth: the same projection without name; the canonical primitive
- [`src/platform/auth/api-contract.ts:37-64`](../../src/platform/auth/api-contract.ts#L37-L64) — eveCharactersRequestSchema, entry/response schemas, EveCharactersResponse, eveCharactersEndpoint; used only by the route, the dead client and api-contract.test.ts
- [`convex/lib/characterSync.test.ts:109-163`](../../convex/lib/characterSync.test.ts#L109-L163) — describe('fetchEnumeratedCharacters'), the only caller
- [`src/platform/auth/api-contract.test.ts:3, 21-23`](../../src/platform/auth/api-contract.test.ts#L3) — Pins eveCharactersEndpoint statuses
- [`src/app/api/capability-coverage.test.ts:17-20, 88`](../../src/app/api/capability-coverage.test.ts#L17-L20) — Exclusion entry and pinned exclusion list
- [`src/app/api/same-origin-coverage.test.ts:55-58`](../../src/app/api/same-origin-coverage.test.ts#L55-L58) — EXEMPT_MUTATIONS entry
- [`src/composition/__tests__/idempotency-registry.ts:620-625, 693`](../../src/composition/__tests__/idempotency-registry.ts#L620-L625) — internalEveCharactersRoute registration
- [`scripts/route-classification.json:161`](../../scripts/route-classification.json#L161) — Route classification entry
- [`src/composition/corp-access.ts:8-23`](../../src/composition/corp-access.ts#L8-L23) — Stale-affiliation refresh path that stays after deletion

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/lib/characterSync.ts:9-27, 46-82`](../../convex/lib/characterSync.ts#L9-L27) — characterSyncResultFields, requireSyncEnv, vendCharacterToken and resolveExpiresAt are live (characterLocationSync.ts, characterLocationApply.ts); keep them
- [`src/app/api/internal/eve-token/route.ts`](../../src/app/api/internal/eve-token/route.ts) — The sibling internal route is live (vendCharacterToken calls it); keep it and its registry entries
- [`src/app/(site)/industry/industry-characters.ts:34`](../../src/app/%28site%29/industry/industry-characters.ts#L34) — Other deriveCharacterHealth projections serve their own UI shapes and are out of scope for this deletion

</details>

**Home.** `None (deletion). If a caller is ever needed again, the existing primitive is src/composition/sync/owner-sync-port.ts:listCharactersWithHealth`

**Boundary check.** Deletion only removes imports: convex -> platform/auth (allowed by {from:'convex', allow:['platform/esi','platform/auth','data','lib']}) and api -> composition/platform/auth/lib/transport. If a thin route were kept, src/app/api/** ('api' zone) may import src/composition/** under {from:'api', allow:['transport','composition',...]}, so delegating to listCharactersWithHealth would be legal.

**API sketch.**

```ts
No new API. Removed: fetchEnumeratedCharacters(env, userId), eveCharactersEndpoint, eveCharactersRequestSchema, EveCharactersResponse, POST /api/internal/eve-characters.
```

**Migration steps.**

1. Pre-check, because origin/main and origin/staging are not in this clone: fetch both and run git grep -n 'fetchEnumeratedCharacters(' origin/main origin/staging -- 'convex/*.ts' ':!*.test.ts'. Expect only the definition in convex/lib/characterSync.ts, which means no deployed Convex version calls the route. Optionally confirm in Vercel logs that the route got no POSTs in the last 30 days.
2. convex/lib/characterSync.ts: delete fetchEnumeratedCharacters (29-44) and the EveCharactersResponse and eveCharactersEndpoint imports (1, 4); keep eveTokenEndpoint and serviceFetch. Delete the describe block in convex/lib/characterSync.test.ts 109-163.
3. Delete src/app/api/internal/eve-characters/route.ts and route.test.ts.
4. src/platform/auth/api-contract.ts: delete 37-64 (request, entry and response schemas, the type, the endpoint). Update api-contract.test.ts to drop the eveCharactersEndpoint import and its status assertion (3, 21-23).
5. Remove registry entries: scripts/route-classification.json:161; capability-coverage.test.ts 17-20 and the pinned list entry at 88; same-origin-coverage.test.ts 55-58; idempotency-registry.ts 620-625 and the list entry at 693.
6. Optionally drop the now-vacuous '/eve-characters' not-called assertions in convex/characterLocationSync.test.ts 299 and 673.

**Tests.** Remove: convex/lib/characterSync.test.ts fetchEnumeratedCharacters block and src/app/api/internal/eve-characters/route.test.ts. Must stay green: characterLocationSync.test.ts (location sync never needed the route), capability-coverage.test.ts and same-origin-coverage.test.ts (both enumerate real route files, so the lists must shrink with the deletion), and the idempotency registry test that pins every mutation route. Affiliation freshness stays covered by the corp-access and auth link-hook tests.

**Notes.** Risk is low only if no older Convex deployment still calls the route; do the pre-check first. Convex and Vercel deploy per environment, so a staging/main Convex build that still calls the route would get a 404, and serviceFetch would surface that as an 'eve-characters response failed its contract' or status error. Removing the route's after(refreshAffiliationsAndReconcile) loses no live behavior: it never runs today, and stale affiliations are refreshed by resolveUserCorpAccess and on character link.

<sub>Reported by: concern:esi-sync.</sub>

<a id="p304"></a>

## P304: Delete the test-only price-confidence aggregation code

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -115 production lines (industry-styles ~95, build-pricing ~21) and about -150 test lines
- **Depends on:** —

**Problem.** About 115 production lines of price-confidence scoring and aggregation ship with no production consumer and are kept alive only by their own tests, which Fallow counts as consumers. This includes three private thresholds, three exported types, four functions and a pricing projection. classifyInput repeats priceConfidence's conditions, so the dead code is also internally duplicated, and the PriceSource/isBoundaryStaleMs imports in industry-styles.ts exist only for it.

**Sites (8).**

- [`src/features/industry-planner/industry-styles.ts:159-168`](../../src/features/industry-planner/industry-styles.ts#L159-L168) — THIN_LIQUIDITY_UNITS, HIGH_CONFIDENCE_SHARE, MEDIUM_CONFIDENCE_SHARE, ConfidenceInput: dead
- [`src/features/industry-planner/industry-styles.ts:175-196`](../../src/features/industry-planner/industry-styles.ts#L175-L196) — AggregateConfidence and priceConfidence: dead
- [`src/features/industry-planner/industry-styles.ts:235-293`](../../src/features/industry-planner/industry-styles.ts#L235-L293) — ConfidenceCounts, aggregateConfidenceFromCounts, RowCounts, classifyInput (repeats priceConfidence checks), aggregateConfidence: dead
- [`src/features/industry-planner/industry-styles.ts:6-7`](../../src/features/industry-planner/industry-styles.ts#L6-L7) — PriceSource and isBoundaryStaleMs imports are used only by the dead code (lines 164, 188, 271)
- [`src/features/industry-planner/build-pricing.ts:26, 101-120`](../../src/features/industry-planner/build-pricing.ts#L26) — ConfidenceInput import and buildConfidenceInputs: only build-pricing.test.ts calls them
- [`src/features/industry-planner/industry-styles.test.ts:2-130`](../../src/features/industry-planner/industry-styles.test.ts#L2-L130) — Imports and the priceConfidence/aggregateConfidence/aggregateConfidenceFromCounts describe blocks plus NOW/FRESH/STALE/liveRow fixtures, which only those blocks use
- [`src/features/industry-planner/build-pricing.test.ts:7, 558-586`](../../src/features/industry-planner/build-pricing.test.ts#L7) — buildConfidenceInputs import and describe block
- [`src/features/industry-planner/cockpit-kpis-view.ts:52-64`](../../src/features/industry-planner/cockpit-kpis-view.ts#L52-L64) — The live consumer: sellAnchorConfidence only

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/industry-styles.ts:170-173, 198-208`](../../src/features/industry-planner/industry-styles.ts#L170-L173) — RowConfidence and sellAnchorConfidence/THIN_SELL_ANCHOR_RATIO are live (cockpit KPI thin-anchor badge); keep them
- [`src/features/industry-planner/initial-price-map.ts:8-31`](../../src/features/industry-planner/initial-price-map.ts#L8-L31) — Reads row source/buyVolume/staleAfterMs, so those row fields stay after buildConfidenceInputs is removed
- [`src/components/ui/price-confidence.tsx:4-19`](../../src/components/ui/price-confidence.tsx#L4-L19) — ConfidenceLevel and the PriceConfidence badge are live (CockpitKpis, preview gallery)

</details>

**Home.** `None (deletion). RowConfidence and sellAnchorConfidence stay in src/features/industry-planner/industry-styles.ts`

**Boundary check.** Deletion inside the features/industry-planner zone. It removes industry-styles' imports of @/data/market-prices/types (data) and @/lib/esi-datasets/freshness (lib), both of which features may import. The ui import of ConfidenceLevel stays, allowed by {from:'features', allow:[..., 'ui', ...]}. No new imports.

**API sketch.**

```ts
No new API. Removed exports: priceConfidence, aggregateConfidence, aggregateConfidenceFromCounts, ConfidenceInput, AggregateConfidence, ConfidenceCounts (industry-styles.ts), buildConfidenceInputs (build-pricing.ts). Kept: RowConfidence, sellAnchorConfidence.
```

**Migration steps.**

1. industry-styles.ts: delete lines 159-168 (the three thresholds and ConfidenceInput), 175-196 (AggregateConfidence, priceConfidence) and 235-293 (ConfidenceCounts through aggregateConfidence). Keep RowConfidence (170-173), sellAnchorConfidence and regionalDiscountCallout.
2. industry-styles.ts: remove the now-unused imports of PriceSource (6) and isBoundaryStaleMs (7), and check that ConfidenceLevel (3) is still used by RowConfidence.
3. build-pricing.ts: delete buildConfidenceInputs (101-120) and the ConfidenceInput type import (26).
4. industry-styles.test.ts: remove aggregateConfidence, aggregateConfidenceFromCounts, priceConfidence and ConfidenceInput from the import list. Delete lines 12-130 (fixtures and the three describe blocks); keep deriveMarginFigures, sellAnchorConfidence and regionalDiscountCallout.
5. build-pricing.test.ts: drop the buildConfidenceInputs import (7) and the describe block at 558-586. If the row/intermediate source and buyVolume mapping is still wanted under test, move those two expectations onto assemblePricing's output (pricing.rows / pricing.intermediatePrices) in an existing assemblePricing test.
6. If a ledger confidence badge is planned, the owner should add it with a live consumer (for example CockpitRawLedger rows) in the same PR that reintroduces the code, not keep it orphaned.

**Tests.** Remove the dead tests listed above. Must stay green: industry-styles.test.ts sellAnchorConfidence (183-202), regionalDiscountCallout and deriveMarginFigures; build-pricing.test.ts assemblePricing suites; cockpit-kpis-view tests covering the thin-anchor badge. Optionally keep the one useful mapping assertion (an intermediate's fuzzwork-fallback source and buyVolume reaching pricing.intermediatePrices) as an assemblePricing test, since initial-price-map relies on those fields.

**Notes.** No behavior change: nothing outside tests calls the removed code. Do not delete RowConfidence; sellAnchorConfidence returns it and cockpit-kpis-view.ts types thinAnchor with ReturnType<typeof sellAnchorConfidence>. This removes one of the row-to-X pricing projections, buildConfidenceInputs (rows/intermediates to ConfidenceInput). The remaining ones are rowPriceFields (build-pricing.ts 72-82) and initial-price-map.ts, which the separate pricing-projection opportunity (F221) covers. Do this first so F221 has one fewer site.

<sub>Reported by: area:industry-planner.</sub>

<a id="p324"></a>

## P324: Retire the completed mapHallwayBackfill migration

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -275 / +0
- **Depends on:** —

**Problem.** convex/mapHallwayBackfill.ts rewrites flat legacy mapConnections rows into nested doors. The current schema makes such rows impossible on any deployment that runs it, and the batch could never progress past its first 32 rows anyway. The dead module, its 180-line test with a legacy 'expandedSchema', and four registry references are maintenance cost with no runtime value.

**Sites (7).**

- [`convex/mapHallwayBackfill.ts:1-86`](../../convex/mapHallwayBackfill.ts#L1-L86) — Legacy-row types and rewrite; cursorless take(HALLWAY_BACKFILL_BATCH) at 73; the skip/replace loop at 76-83
- [`convex/schema.ts:25, 109-127`](../../convex/schema.ts#L25) — defineSchema with no schemaValidation override; from/to are required door objects
- [`convex/lib/mapEntityContracts.ts:114-119`](../../convex/lib/mapEntityContracts.ts#L114-L119) — connectionDoorValidator is a required object shape
- [`convex/mapHallwayBackfill.test.ts:1-180`](../../convex/mapHallwayBackfill.test.ts#L1-L180) — Keeps an expandedSchema with every legacy field; covers only 3 rows, never the more-than-32 case
- [`convex/__tests__/export-coverage.test.ts:113-116, 248-249`](../../convex/__tests__/export-coverage.test.ts#L113-L116) — Import and coverage entries for HALLWAY_BACKFILL_BATCH and backfillHallwayConnections
- [`convex/__tests__/modules.setup.ts:41`](../../convex/__tests__/modules.setup.ts#L41) — '../mapHallwayBackfill.ts' module registration (missed by the finders)
- [`convex/_generated/api.d.ts:72, 154`](../../convex/_generated/api.d.ts#L72) — Checked-in generated references; regenerate, do not hand-edit

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/chain-contract.ts:39-57`](../../src/data/maps/chain-contract.ts#L39-L57) — The legacy deletedAt branch of isTombstoned/tombstoneDeletedAt is still live for mapSystems and signature rows (for example mapAuthoringCollapse.ts:72, 392-398). Keep it.
- [`convex/mapChainCleanup.ts:339-364`](../../convex/mapChainCleanup.ts#L339-L364) — backfillChainRetention is a separate one-off ('run once after deploy'). It is data-state, not schema-enforced, so retiring it needs its own operator confirmation per deployment. Not part of this deletion.
- [`convex/mapStatics.ts:17, 184-200`](../../convex/mapStatics.ts#L17) — backfillStaticPlaceholders is a cursor-paged, idempotent repair action. It is not a completed one-off; keep it.

</details>

**Home.** `Deletion only (convex/mapHallwayBackfill.ts and its test)`

**Boundary check.** Deletion inside the convex zone only. The helpers it imports (blankHallway, connectionRemovedTombstone, tombstoneDeletedAt, the door validators) all have other production consumers (mapScanApply, mapAuthoringCollapse, mapAuthoringFields, schema), so deleting it leaves no newly unused export for Fallow.

**API sketch.**

```ts
None (removal). Removes the internal.mapHallwayBackfill.backfillHallwayConnections internalMutation and the HALLWAY_BACKFILL_BATCH export.
```

**Migration steps.**

1. Operator precondition: confirm that the current convex/schema.ts (required mapConnections.from/to, default validation) has been deployed successfully to staging and prod Convex. A successful deploy proves no legacy rows remain. Optionally run backfillHallwayConnections once on each deployment and expect { rewritten: 0 }.
2. Delete convex/mapHallwayBackfill.ts and convex/mapHallwayBackfill.test.ts.
3. Remove '../mapHallwayBackfill.ts' from convex/__tests__/modules.setup.ts:41.
4. Remove the import (export-coverage.test.ts:113-116) and the two entries (248-249).
5. Regenerate convex/_generated (Convex codegen, through the normal dev/CI flow) so api.d.ts lines 72 and 154 drop the module. Do not hand-edit generated files.
6. Separately and optionally: open an operator check for backfillChainRetention (mapChainCleanup.ts:339-364) and retire it the same way once it is confirmed run on both deployments.

**Tests.** Delete convex/mapHallwayBackfill.test.ts. convex/__tests__/export-coverage.test.ts and convex/__tests__/modules.test.ts must pass with the module removed (modules.setup.ts drives convex-test module loading). No behavior test is lost: the rewrite path cannot run under the current schema.

**Notes.** Drift and bug: the batch has no cursor, and replaced rows keep their _creationTime, so with more than 32 legacy rows every call re-reads and skips the same first 32 and never reaches the rest. If any deployment still runs an older optional-door schema, do not delete. Fix the batch to page with .paginate(cursor) first. The local clone has no main or staging refs, so the deploy state cannot be checked from the repo; the operator confirmation is required.

<sub>Reported by: area:convex.</sub>

<a id="p335"></a>

## P335: Delete the dead refreshPricesOnDemand and drop the cache tags nothing invalidates

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -25 (about -14 production, about -11 test)
- **Depends on:** —

**Problem.** refreshPricesOnDemand is exported from market-prices/refresh-on-view.ts, but only its own test calls it; the refresh route uses getLivePrices. It is the only code that revalidates priceTag, so priceTag tags 30-60s entries that nothing ever busts. entityNameTag ('days' cache life) and EVE_STATUS_TAG (60-300s) are passed to cacheTag but appear in no revalidateTag call in src, convex, scripts, docs or .claude. These tags suggest on-demand busting that does not exist, and they keep a dead export plus its test alive. Every other cacheTag in the repo (BLUEPRINT_STRUCTURE, PRICES_FRESHNESS, WH_STATICS, historyTag and the per-owner feature tags) has a real invalidator.

**Verifier revision.** The core holds. refreshPricesOnDemand has no production caller; only its own test calls it. It is the only revalidateTag for priceTag. Checked against all 18 revalidateTag sites, entityNameTag and EVE_STATUS_TAG have no invalidator anywhere, and the bundled Next docs say cacheTag exists only for on-demand invalidation. Two parts are rejected. The 'lib cache registry' alternative refers to something that does not exist, and inventing one plus a registry test is out of proportion for three tags. The claim that all three entries expire on short cacheLife values is wrong for entity names, which use cacheLife('days').

**Sites (8).**

- [`src/data/market-prices/refresh-on-view.ts:1, 14-16, 59-64, 182-186`](../../src/data/market-prices/refresh-on-view.ts#L1) — priceTag is used only at line 63. refreshPricesOnDemand (182-186) is its only revalidateTag, and revalidateTag is imported on line 1 only for it.
- [`src/data/market-prices/refresh-on-view.test.ts:11, 23-27, 30, 215-222`](../../src/data/market-prices/refresh-on-view.test.ts#L11) — The only caller of refreshPricesOnDemand.
- [`src/app/api/market-prices/refresh/route.ts:19-26`](../../src/app/api/market-prices/refresh/route.ts#L19-L26) — The refresh route goes through getLivePrices and never busts tags.
- [`src/data/eve-data/entity-names.ts:1, 4-8, 14`](../../src/data/eve-data/entity-names.ts#L1) — entityNameTag is used only by cacheTag. cacheLife is NAME_CACHE_LIFE = 'days'.
- [`src/data/eve-status/constants.ts:3`](../../src/data/eve-status/constants.ts#L3) — EVE_STATUS_TAG = 'eve-status'
- [`src/data/eve-status/queries.ts:1, 4, 35-47`](../../src/data/eve-status/queries.ts#L1) — cacheTag(EVE_STATUS_TAG). The live cache expires after 300s and the offline cache after 60s.
- [`src/data/eve-status/queries.test.ts:5, 14, 29, 34, 65`](../../src/data/eve-status/queries.test.ts#L5) — Asserts that cacheTag is called with EVE_STATUS_TAG. Needs updating if the tag goes.
- [`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheTag.md:15`](../../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheTag.md#L15) — "allows you to tag cached data for on-demand invalidation", so a tag with no invalidator does nothing.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-history/constants.ts:21-23`](../../src/data/market-history/constants.ts#L21-L23) — historyTag has a real invalidator (market-history/refresh-on-view.ts:104) and a reader (queries.ts:65). Keep it.
- [`src/data/eve-data/entity-names.ts:8`](../../src/data/eve-data/entity-names.ts#L8) — Contrary to the proposal, this cache life is 'days', not short. Deleting the tag is still correct because nothing invalidates it, and character, corporation and alliance names effectively never change.

</details>

**Home.** `n/a (deletion only)`

**Boundary check.** Deletion only. No new imports, and the deletions remove next/cache imports from data zones (market-prices, eve-data, eve-status). No boundary rule is affected.

**API sketch.**

```ts
No new API. Removes priceTag(typeId), refreshPricesOnDemand(typeIds), entityNameTag(id) and EVE_STATUS_TAG.
```

**Migration steps.**

1. In market-prices/refresh-on-view.ts, delete refreshPricesOnDemand (182-186) and priceTag (14-16), remove cacheTag(priceTag(typeId)) at line 63, and drop cacheTag and revalidateTag from the next/cache import on line 1 (keep cacheLife).
2. In market-prices/refresh-on-view.test.ts, delete the refreshPricesOnDemand describe block (215-222), trim the import on line 30, and drop revalidateTagMock if nothing else uses it.
3. In eve-data/entity-names.ts, delete entityNameTag (4-6) and the cacheTag call (14), and drop cacheTag from the import. In entity-names.test.ts, drop cacheTag from the next/cache mock (line 5) if nothing else uses it.
4. In eve-status, delete EVE_STATUS_TAG (constants.ts:3) and cacheTag (queries.ts:37), and fix the imports. In queries.test.ts, remove the assertion at line 65, the import at line 29 and the cacheTag mock wiring.
5. Before deleting EVE_STATUS_TAG, confirm with the owner that nobody purges 'eve-status' by tag from the hosting dashboard. Nothing in the repo (docs/, .claude/, runbooks) mentions it. If someone does, keep that one tag and add a comment naming the manual purge as its invalidator.

**Tests.** No new tests. Update src/data/market-prices/refresh-on-view.test.ts and src/data/eve-status/queries.test.ts as above. The existing behaviour tests still guard what matters: prices live-over-seed, seed fallback and write-behind (refresh-on-view.test.ts:89-213), eve-status cache-life selection and retry, and entity-names resolution.

**Notes.** Do not build a tag registry. Tags are slice-local constants, and the 15 or so live tags all pair with an invalidator in the same slice or in a cron declaration. If the team wants a guard later, a grep-style rail that requires every cacheTag argument to also appear in a revalidateTag call is cheaper than a registry, but it is not justified for three tags. If P332 lands first, the prices edits touch the same file; apply both to the current revision-on-view.ts.

<sub>Reported by: gap:next-cache-tags-and-invalidation.</sub>

<a id="p042"></a>

## P042: Move wormhole-site domain constants out of the Drizzle schema so client bundles stop pulling in pg-core

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -33 in schema.ts, +8 in site-taxonomy.ts, +5/-1 in sleeper-classes.ts, about 7 import lines changed, plus about +15 for the rail; net about -20 production lines
- **Depends on:** —
- **Existing primitive:** `src/data/esi-refresh-jobs/schema.ts (constants-split pattern)`

**Problem.** features/wormhole-sites/schema.ts mixes domain constants (SITE_TYPES, WORMHOLE_CLASSES, SLEEPER_CLASS_CODES and isSleeperClassCode) with module-scope pgEnum and pgTable calls from drizzle-orm/pg-core. Client-reachable modules import those constants at runtime: site-filter (via SitesFilterLayout), api-contract (via widget.tsx, used by the mapper's signature windows), and ShipClassIcon and npc-summary (via LazySiteDetails and SiteCardLightbox). The app package has no sideEffects flag, so the pgTable and pgEnum calls are retained, and pg-core's table and column builders likely ship in both the /sites and atlas client chunks.

The sleeper class list is also defined twice: SLEEPER_CLASS_CODES in schema.ts and SLEEPER_CLASS_ORDER in sleeper-classes.ts. Two constant arrays and their types in schema.ts are dead.

**Verifier revision.** The core holds and reaches further than claimed. widget.tsx ('use client') imports siteDetailEndpoint at runtime from api-contract.ts, which uses SITE_TYPES and WORMHOLE_CLASSES in module-scope z.enum calls and imports them from schema.ts. widget is imported by mapper SignatureWindow, ActiveSiteViewer and scanner-section-table, so schema.ts is in the atlas mapper's client graph as well as /sites, where SitesFilterLayout imports site-filter and LazySiteDetails and SiteCardLightbox reach ShipClassIcon and npc-summary. The repo package.json declares no sideEffects, so the module-scope pgTable and pgEnum calls must be kept. drizzle-orm itself is sideEffects:false, which only lets the bundler drop unused pg-core modules, not the ones pgTable and the column builders use.

The design needs three changes:
(1) SLEEPER_CLASS_CODES and isSleeperClassCode belong in the existing sleeper-classes.ts, whose SLEEPER_CLASS_ORDER duplicates them value for value.
(2) SIGNATURE_LABELS, TRIGGER_LABELS, SignatureLabel and TriggerLabel have no consumer anywhere; only composition/drizzle-schema.ts's `export *` keeps them alive. Delete them rather than move them, or Fallow will flag them as unused.
(3) There is no CI build analyzer (.github/workflows has only test, coverage-health and cleanup), so verify the saving through Vercel's build output and pin it with a lint rail.

**Sites (13).**

- [`src/features/wormhole-sites/schema.ts:1-36`](../../src/features/wormhole-sites/schema.ts#L1-L36) — Domain constants (3-33) share a module with pgEnum (35-36) and pgTable (38-144)
- [`src/features/wormhole-sites/api-contract.ts:1-14`](../../src/features/wormhole-sites/api-contract.ts#L1-L14) — Runtime SITE_TYPES and WORMHOLE_CLASSES in module-scope z.enum
- [`src/features/wormhole-sites/widget.tsx:1, 8`](../../src/features/wormhole-sites/widget.tsx#L1) — 'use client' with a runtime import of siteDetailEndpoint from ./api-contract
- [`src/mapper/signatures/SignatureWindow.tsx:9`](../../src/mapper/signatures/SignatureWindow.tsx#L9) — The mapper imports widget, so schema.ts reaches the atlas client graph
- [`src/features/wormhole-sites/site-filter.ts:1-14`](../../src/features/wormhole-sites/site-filter.ts#L1-L14) — Runtime WORMHOLE_CLASSES from ./schema
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:1, 20`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L1) — 'use client' importing ../site-filter
- [`src/features/wormhole-sites/components/ShipClassIcon.tsx:3, 32`](../../src/features/wormhole-sites/components/ShipClassIcon.tsx#L3) — Runtime isSleeperClassCode from ../schema; reached from LazySiteDetails and SiteCardLightbox (both 'use client') through NpcRow and SiteShipClasses
- [`src/features/wormhole-sites/npc-summary.ts:1-2, 16-22`](../../src/features/wormhole-sites/npc-summary.ts#L1-L2) — isSleeperClassCode from ./schema plus SLEEPER_CLASS_ORDER from ./sleeper-classes: the same list from two homes
- [`src/features/wormhole-sites/sleeper-classes.ts:1-10`](../../src/features/wormhole-sites/sleeper-classes.ts#L1-L10) — SLEEPER_CLASS_ORDER ['F','C','B','T'] duplicates SLEEPER_CLASS_CODES
- [`src/features/wormhole-sites/sites-query.ts:5, 18-20`](../../src/features/wormhole-sites/sites-query.ts#L5) — Server-side consumer of the same constants
- [`src/features/wormhole-sites/types.ts:1-3`](../../src/features/wormhole-sites/types.ts#L1-L3) — Type-only re-export of SiteType and WormholeClass from ./schema
- [`src/composition/drizzle-schema.ts:1`](../../src/composition/drizzle-schema.ts#L1) — `export *` barrel used by drizzle.config and namespace imports; the only thing keeping SIGNATURE_LABELS and TRIGGER_LABELS 'used'
- [`src/data/esi-refresh-jobs/schema.ts:1-19`](../../src/data/esi-refresh-jobs/schema.ts#L1-L19) — Precedent: pgEnum values imported from ./constants

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/owned-blueprints/schema.ts:4-8`](../../src/features/owned-blueprints/schema.ts#L4-L8) — OWNED_BLUEPRINT_OWNER_TYPES is used only inside its schema; consumers import types only. No client runtime path.
- [`src/features/owned-assets/schema.ts:15-16`](../../src/features/owned-assets/schema.ts#L15-L16) — Same: no runtime import outside the schema
- [`src/data/wh-statics/schema.ts:15-27`](../../src/data/wh-statics/schema.ts#L15-L27) — WH_STATICS_SNAPSHOT_STATUSES is used only in its schema; cross-check.ts imports types only

</details>

**Home.** `New src/features/wormhole-sites/site-taxonomy.ts for SITE_TYPES, SiteType, WORMHOLE_CLASSES and WormholeClass. Existing src/features/wormhole-sites/sleeper-classes.ts for SLEEPER_CLASS_CODES, SleeperClassCode and isSleeperClassCode, replacing SLEEPER_CLASS_ORDER.`

**Boundary check.** Every consumer (schema.ts, api-contract, site-filter, sites-query, npc-summary, ShipClassIcon and types.ts) is inside src/features/wormhole-sites, the auto-discovered feature zone, so all imports are intra-zone. src/composition/drizzle-schema.ts keeps re-exporting schema.ts, which the composition rule allows (features). It loses only the non-table exports, and none are read through the barrel: there are no schema.SITE_TYPES-style accesses. The new modules import nothing, so they add no edges.

**API sketch.**

```ts
// src/features/wormhole-sites/site-taxonomy.ts (no imports)
export const SITE_TYPES = ['combat', 'gas', 'ore', 'relic', 'data'] as const;
export type SiteType = (typeof SITE_TYPES)[number];
export const WORMHOLE_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type WormholeClass = (typeof WORMHOLE_CLASSES)[number];

// src/features/wormhole-sites/sleeper-classes.ts
export const SLEEPER_CLASS_CODES = ['F', 'C', 'B', 'T'] as const; // also the display order
export type SleeperClassCode = (typeof SLEEPER_CLASS_CODES)[number];
export function isSleeperClassCode(code: string): code is SleeperClassCode;
export const SLEEPER_CLASS_LABEL: Record<SleeperClassCode, string>;
```

**Migration steps.**

1. Create site-taxonomy.ts with SITE_TYPES, SiteType, WORMHOLE_CLASSES and WormholeClass, moved verbatim from schema.ts 3-7.
2. Move SLEEPER_CLASS_CODES, SleeperClassCode and isSleeperClassCode from schema.ts 28-33 into sleeper-classes.ts. Delete SLEEPER_CLASS_ORDER, and change npc-summary.ts line 22 to iterate SLEEPER_CLASS_CODES.
3. Delete SIGNATURE_LABELS, SignatureLabel, TRIGGER_LABELS and TriggerLabel (schema.ts 9-26). They have no consumers.
4. schema.ts: `import { SITE_TYPES, WORMHOLE_CLASSES } from './site-taxonomy'` for the two pgEnum calls. The enum names and values are unchanged, so drizzle-kit generates no migration. Leave no re-exports, to avoid Fallow duplicate-exports.
5. Repoint imports:
- api-contract.ts and sites-query.ts: SITE_TYPES and WORMHOLE_CLASSES from './site-taxonomy'.
- site-filter.ts: WORMHOLE_CLASSES from './site-taxonomy'.
- types.ts: SiteType and WormholeClass from './site-taxonomy'.
- npc-summary.ts and ShipClassIcon.tsx: isSleeperClassCode and SleeperClassCode from sleeper-classes.
6. Add an ESLint no-restricted-imports rail, scoped to src/features/wormhole-sites/** except queries.ts and the db tests, that bans runtime imports of ./schema and ../schema (allowTypeImports: true) and drizzle-orm*. Follow the createEslintRail pattern in scripts/vendor-rail.test.mjs.
7. Compare /sites and atlas client chunk sizes in the Vercel build output for the PR, because there is no bundle analyzer in CI and local builds are not allowed.

**Tests.** Existing tests that guard behaviour: site-filter.test.ts, npc-summary.test.ts (class ordering now from SLEEPER_CLASS_CODES), api-contract.test.ts, sites-query.test.ts, dev-sample.test.ts and queries.test.ts. Also composition registry and schema-reflection tests, which use drizzle-schema and must still see the same tables and enums.

New tests:
- A small sleeper-classes or site-taxonomy assertion that SLEEPER_CLASS_CODES order is F, C, B, T and that isSleeperClassCode rejects 'X'.
- A rail test in scripts/ asserting that a probe file under wormhole-sites/components is rejected when it imports '../schema' at runtime and accepted for a type-only import.

**Notes.** No DB change: pgEnum('site_type') and pgEnum('wormhole_class') keep identical values, and the tables are untouched.

The drizzle-schema barrel stops exporting the constants. Nothing reads them through it: account-merge and the tests use tables only.

The bundle saving is very likely but unmeasured. The mechanism is certain: the app has no sideEffects flag, so the module-scope pgTable and pgEnum calls must be kept. The byte count needs the Vercel build output.

SLEEPER_CLASS_ORDER and SLEEPER_CLASS_CODES currently agree, so merging them changes no ordering.

<sub>Reported by: concern:efficiency.</sub>

<a id="p277"></a>

## P277: Delete the dead motion-variable write on the map shell; ChainSurface's scope is the only writer

- **Status:** [x] done
- **Category:** efficiency · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about −15 lines (an 11-line effect plus ref plumbing, 1 CSS selector, 1 attribute)
- **Depends on:** —
- **Existing primitive:** `src/mapper/motion/motion-contract.ts:motionCssProperties`

**Problem.** useChainDials keeps a shellRef and an effect that writes motionCssProperties(motionConfig) inline onto ChainLive's [data-map-shell] div. ChainSurface writes the identical record onto the nested [data-map-motion-scope] div, and motion-contract.css redeclares the tempo defaults on that scope. The shell's values are therefore always shadowed. Every rule that reads --map-motion-* targets nodes and edges inside the React Flow scope, so the shell write, shellRef, the data-map-shell attribute and the [data-map-shell] selector are dead.

**Sites (12).**

- [`src/mapper/chain/use-chain-dials.ts:3,13-17,30-40,56`](../../src/mapper/chain/use-chain-dials.ts#L3) — shellRef and the motionCssProperties effect; shellRef is returned.
- [`src/mapper/chain/ChainLive.tsx:45,105-110`](../../src/mapper/chain/ChainLive.tsx#L45) — The only use of shellRef is ref={shellRef} on the data-map-shell div.
- [`src/mapper/canvas/ChainSurface.tsx:55-67`](../../src/mapper/canvas/ChainSurface.tsx#L55-L67) — Writes motionCssProperties(motion) to the scope div that wraps ReactFlow. This is the effective writer.
- [`src/mapper/chain/MotionLayer.tsx:46-52`](../../src/mapper/chain/MotionLayer.tsx#L46-L52) — Always passes motion={motionConfig} to ChainSurface inside the shell.
- [`src/mapper/motion/motion-contract.css:1-10`](../../src/mapper/motion/motion-contract.css#L1-L10) — Defaults declared on both [data-map-shell] and [data-map-motion-scope]; the scope declaration shadows inherited shell values.
- [`src/mapper/motion/motion-contract.css:16-31,37-46,89-97,181-198`](../../src/mapper/motion/motion-contract.css#L16-L31) — All var(--map-motion-*) consumers. Every selector is a node or edge class.
- [`src/mapper/canvas/SystemNode.tsx:66-69`](../../src/mapper/canvas/SystemNode.tsx#L66-L69) — Applies map-node-enter and map-node-exit inside React Flow nodes.
- [`src/mapper/canvas/ChainLinkEdge.tsx:35-44`](../../src/mapper/canvas/ChainLinkEdge.tsx#L35-L44) — Applies the map-edge-grow and map-edge-fade classes inside React Flow edges.
- [`src/mapper/motion/motion-contract.ts:32-37,79-89`](../../src/mapper/motion/motion-contract.ts#L32-L37) — DEFAULT_MOTION_CONFIG and motionCssProperties.
- [`src/mapper/motion/motion-contract.test.ts:68-99`](../../src/mapper/motion/motion-contract.test.ts#L68-L99) — Guards the scope block's fallback tempos. The regex /\[data-map-motion-scope\]\s*\{/ still matches once [data-map-shell] is dropped from the selector list.
- [`src/mapper/chain/ChainHost.tsx:15`](../../src/mapper/chain/ChainHost.tsx#L15) — The unauthenticated ChainSurface without motion has no shell and relies only on the scope's CSS defaults, which stay.
- [`src/mapper/canvas/MapCanvas.tsx:21`](../../src/mapper/canvas/MapCanvas.tsx#L21) — Same: an empty ChainSurface that relies on the scope defaults.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/motion/motion-contract.css:7-9`](../../src/mapper/motion/motion-contract.css#L7-L9) — The tempo literals duplicate DEFAULT_MOTION_CONFIG on purpose, as a pre-hydration fallback, and motion-contract.test.ts:68-99 pins them. Keep them on the scope selector.

</details>

**Home.** `src/mapper/canvas/ChainSurface.tsx (existing sole writer; no new primitive)`

**Boundary check.** All files are in the mapper zone (src/mapper/**). No imports are added; one import (motionCssProperties in use-chain-dials.ts) is removed. No cross-zone edges change.

**API sketch.**

```ts
useChainDials(): drops `shellRef` from its return value; nothing else changes. ChainSurface({ motion?: MotionConfig, ... }) stays the only caller of motionCssProperties in production.
```

**Migration steps.**

1. In src/mapper/chain/use-chain-dials.ts, delete the motion-variable useEffect (lines 32-40), the shellRef declaration (30) and its return entry (56). Drop motionCssProperties and useEffect from the imports, and keep DEFAULT_MOTION_CONFIG and MotionConfig for the state.
2. In src/mapper/chain/ChainLive.tsx, remove shellRef from the destructure (45) and ref={shellRef} (106). Also remove data-map-shell="" (108), which nothing else references; keep data-map-can-edit, which ChainHost.test.ts:257-265 asserts.
3. In src/mapper/motion/motion-contract.css lines 1-2, reduce the selector list to [data-map-motion-scope] only. Keep both --xy-edge-stroke tokens and the three tempo defaults in that block.
4. Run the mapper tests (motion-contract.test.ts, ChainHost.test.ts) through test-runner.

**Tests.** Existing: motion-contract.test.ts:68-99 still parses the [data-map-motion-scope] block and checks the fallback tempos. ChainHost.test.ts:257-265 still checks data-map-can-edit on the shell div. No new tests are needed; this only removes code. Optionally, extend the CSS test to assert that the stylesheet no longer contains '[data-map-shell]', so the selector cannot return.

**Notes.** Reframe this as dead-code removal. The efficiency gain is negligible, because the write runs only on MapControls dial changes. Effect ordering does not matter, since both writers apply identical values and the child (ChainSurface) runs first. For --map-motion-ease and -ease-settle, which are not declared in CSS, the scope's own inline write is what nodes and edges inherit, so removing the shell write leaves no gap. P278 touches motionCssProperties in the same file and can land in the same change.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p312"></a>

## P312: Delete test-only signature-model exports and move signatureIdentityKey next to SignatureWindowRow

- **Status:** [x] done
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -35 production (functions and imports), -30 test, +4
- **Depends on:** —
- **Existing primitive:** `src/mapper/signatures/signature-update-flash.ts:signatureIdentityKey`

**Problem.** signature-model.ts exports three functions that no production code calls, along with the imports and tests that keep them alive. buildSignatureRows builds the `${systemId}:${signatureId}` row identity inline twice, while signature-update-flash.ts exports signatureIdentityKey for the same identity, which the scanner table and flash hook use to match those rows.

**Sites (9).**

- [`src/mapper/signatures/signature-model.ts:240-247`](../../src/mapper/signatures/signature-model.ts#L240-L247) — filterSignatureRows: test-only
- [`src/mapper/signatures/signature-model.ts:274-292`](../../src/mapper/signatures/signature-model.ts#L274-L292) — scannerWormholeSize and scannerWormholeLifetime: test-only. scannerLifeUpperBound at :294-301 is live and stays
- [`src/mapper/signatures/signature-model.ts:13-17`](../../src/mapper/signatures/signature-model.ts#L13-L17) — isCodexSizeLocked and lifetimeRowDisplay imports become unused; lifetimeUpperBoundLabel stays
- [`src/mapper/signatures/signature-model.ts:113-121`](../../src/mapper/signatures/signature-model.ts#L113-L121) — Inline identity key, twice
- [`src/mapper/signatures/signature-update-flash.ts:1-2, 21-25, 71`](../../src/mapper/signatures/signature-update-flash.ts#L1-L2) — signatureIdentityKey definition and its use in diffSignatureUpdates; already imports type SignatureWindowRow from signature-model
- [`src/mapper/signatures/use-signature-update-flash.ts:6-11, 51`](../../src/mapper/signatures/use-signature-update-flash.ts#L6-L11) — Imports signatureIdentityKey from signature-update-flash and builds keys for elimination events
- [`src/mapper/signatures/scanner-section-table.tsx:21-26, 212`](../../src/mapper/signatures/scanner-section-table.tsx#L21-L26) — Imports signatureIdentityKey from signature-update-flash to mark updated rows
- [`src/mapper/signatures/signature-update-flash.test.ts:5, 41`](../../src/mapper/signatures/signature-update-flash.test.ts#L5) — Test importer of signatureIdentityKey
- [`src/mapper/signatures/signature-model.test.ts:7-22, 86-89, 146-148, 350-430`](../../src/mapper/signatures/signature-model.test.ts#L7-L22) — Imports the dead functions. filterSignatureRows asserts at :86-89/:146-148 actually pin buildSignatureRows' kind merging. The wormhole size/lifetime test mixes in live scannerLifeUpperBound asserts

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/SignatureWindow.tsx:97`](../../src/mapper/signatures/SignatureWindow.tsx#L97) — Toast id `signature-identify:${systemId}:${signatureId}`: a prefixed toast-dedupe id, not a row-map key. Adoption would be cosmetic and is optional
- [`src/mapper/signatures/connection-authoring-api.ts:201, 218`](../../src/mapper/signatures/connection-authoring-api.ts#L201) — Toast ids `signature-remove:`/`signature-restore:`, same reasoning
- [`src/mapper/signatures/signature-model.ts:53, 84`](../../src/mapper/signatures/signature-model.ts#L53) — SignatureWindowRow.key (`signature:${_id}` / `connection:${id}[:to]`) is a React/render key, deliberately different from the system+signature identity

</details>

**Home.** `src/mapper/signatures/signature-model.ts (signatureIdentityKey moves here, next to SignatureWindowRow)`

**Boundary check.** All files are in the mapper zone (src/mapper/**) and every import is intra-zone (./signature-model). signature-update-flash.ts already imports from signature-model, so moving the function adds no edge. It removes the alternative edge signature-model -> signature-update-flash, which would have formed a cycle with the existing type import.

**API sketch.**

```ts
// signature-model.ts
export function signatureIdentityKey(row: Pick<SignatureWindowRow, 'systemId' | 'signatureId'>): string { return `${row.systemId}:${row.signatureId}`; }
```

**Migration steps.**

1. Move signatureIdentityKey verbatim from signature-update-flash.ts:21-25 into signature-model.ts below the SignatureWindowRow interface.
2. In buildSignatureRows, replace both template literals (:116, :120) with signatureIdentityKey(projected).
3. signature-update-flash.ts: import signatureIdentityKey alongside the existing type import from './signature-model' and delete the local definition. Do not re-export it.
4. Repoint importers: use-signature-update-flash.ts:8, scanner-section-table.tsx:26 and signature-update-flash.test.ts:5 import signatureIdentityKey from './signature-model'.
5. Delete filterSignatureRows, scannerWormholeSize and scannerWormholeLifetime. Remove the now-unused isCodexSizeLocked and lifetimeRowDisplay from the import at :13-17. ScannedKind stays, since SignatureWindowRow.kind uses it.
6. signature-model.test.ts: replace the filterSignatureRows calls at :86-89 and :146-148 with `rows.filter((row) => row.systemId === X && row.kind === K)` so the buildSignatureRows merge assertions survive. In the size/lifetime test, delete the scannerWormholeSize/scannerWormholeLifetime expectations, keep every scannerLifeUpperBound and formatSignatureAge expectation, retitle it, and drop the two names from the import list.

**Tests.** Existing guards: signature-model.test.ts 'merges list rows...' and 'lists the linked hole on both scanners...' (keep them, with inline filters). signature-update-flash.test.ts:41 covers the key round-trip. connection-intelligence.test.ts:73-103 keeps lifetimeRowDisplay covered after the scanner wrappers go. Optionally add one assertion that a mapSignatures row and a connection door with the same system+signature collapse to a single buildSignatureRows entry. That pins the dedupe identity now shared with the flash diff.

**Notes.** buildSignatureRows' last-write-wins order (connection rows overwrite document rows) must stay. Only the key expression changes. The filterSignatureRows test asserts verify buildSignatureRows' kind classification and must be rewritten, not deleted.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p313"></a>

## P313: Use atlasMapHref in handoffCreatedMap

- **Status:** [x] done
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -2/+2
- **Depends on:** —
- **Existing primitive:** `src/features/maps/map-navigation.ts:atlasMapHref`

**Problem.** handoffCreatedMap builds `/atlas?map=` with its own URLSearchParams instead of calling atlasMapHref from the sibling map-navigation module. atlasMapHref is the canonical atlas-link builder, already used by MapMenu, MapTrackingMenu and the atlas page.

**Verifier revision.** Most of the proposal does not hold. (1) apiFetch is already the shared primitive. The per-endpoint wrappers are typed, named seams; MapAccessDialog.test.ts:13 mocks './map-access-client' by path, and three dedicated test files import them. Collapsing them into a postMap(endpoint, body) only moves `cache: 'no-store'` into a helper that has to re-declare apiFetch's generic BodyArg typing. The `{ body, cache: 'no-store' }` idiom is repo-wide (StructureComposer.tsx:333-354, structure-search-client.ts:6, market-prices use-refresh-on-view.ts:48), so a maps-only helper would not be canonical. (2) The status-to-copy chains are not the same shape. map-access-client's 409 branch indexes CONFLICT_MESSAGES by the typed outcome.error.code. map-lifecycle-client maps an action string, not a status. feedback-view.ts uses error.detail. A flat {[status]: copy} table helper fits only two plain-string branches per module and would lose the typed narrowing. That leaves two sites, saving about 4 lines. (3) Merging three cohesive modules into one file is pure churn. What survives: handoffCreatedMap hand-builds the atlas href that atlasMapHref already produces, in the same feature and zone.

**Sites (5).**

- [`src/features/maps/map-creation-client.ts:42-51`](../../src/features/maps/map-creation-client.ts#L42-L51) — Inline `new URLSearchParams({ map: mapId })` plus `/atlas?${query}`
- [`src/features/maps/map-navigation.ts:17-23`](../../src/features/maps/map-navigation.ts#L17-L23) — atlasMapHref: identical encoding for a non-empty id; '' maps to '/atlas'
- [`src/components/composition/map/MapMenu.tsx:26, 79, 113`](../../src/components/composition/map/MapMenu.tsx#L26) — Existing atlasMapHref consumer
- [`src/app/(site)/atlas/MapTrackingMenu.tsx:6, 20`](../../src/app/%28site%29/atlas/MapTrackingMenu.tsx#L6) — Existing atlasMapHref consumer
- [`src/features/maps/map-creation-client.test.ts:98-115`](../../src/features/maps/map-creation-client.test.ts#L98-L115) — Pins navigate:'/atlas?map=map%2Fone', which atlasMapHref('map/one') also produces

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/map-access-client.ts:7-32`](../../src/features/maps/map-access-client.ts#L7-L32) — Typed apiFetch wrapper and status copy. The 409 branch is keyed by error.code, and MapAccessDialog.test.ts:13 mocks this module path. Not worth merging
- [`src/features/maps/map-lifecycle-client.ts:9-29`](../../src/features/maps/map-lifecycle-client.ts#L9-L29) — Three typed wrappers. Failure copy is keyed by action, not status, so it does not share the claimed status chain
- [`src/features/maps/map-creation-client.ts:14-33`](../../src/features/maps/map-creation-client.ts#L14-L33) — Wrapper combined with the minimum-interstitial delay; two plain status branches. Merging saves nothing material
- [`src/features/feedback/components/feedback-view.ts:27-43`](../../src/features/feedback/components/feedback-view.ts#L27-L43) — Status-to-copy in another feature, using error.detail and network/protocol kinds. Different shape, and a table helper would not fit
- [`src/scripts/map-replay.ts:243`](../../src/scripts/map-replay.ts#L243) — Console hint `open /atlas?map=${mapId}`. The scripts zone may not import features (rule from 'scripts' allows composition, platform/auth, data, db, lib, mapper)
- [`src/features/maps/map-navigation.ts:25-34`](../../src/features/maps/map-navigation.ts#L25-L34) — mapDeletionHref builds '/atlas?...' while preserving other params. Different concept

</details>

**Home.** `src/features/maps/map-navigation.ts:atlasMapHref (existing)`

**Boundary check.** map-creation-client.ts and map-navigation.ts are both in the features zone (autoDiscover src/features, the same src/features/maps subtree), so './map-navigation' is an intra-zone import. No new zone edge.

**API sketch.**

```ts
export function atlasMapHref(map: string | string[] | undefined): string // existing, unchanged
// handoffCreatedMap: actions.navigate(atlasMapHref(mapId));
```

**Migration steps.**

1. In map-creation-client.ts, add `import { atlasMapHref } from './map-navigation';`.
2. Replace :49-50 with `actions.navigate(atlasMapHref(mapId));`.
3. Leave map-access-client.ts, map-lifecycle-client.ts and the rest of map-creation-client.ts unchanged.

**Tests.** map-creation-client.test.ts:98-115 ('resets and closes the persistent dialog before query navigation') already asserts the exact href '/atlas?map=map%2Fone' and guards the swap. map-navigation.test.ts covers atlasMapHref itself.

**Notes.** The only difference is an empty mapId: atlasMapHref('') returns '/atlas', while the inline code returns '/atlas?map='. mapId comes from a successful createMap outcome (outcome.data.mapId), so it is never empty, and atlasMapHref's behavior is the better one if it ever were.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p234"></a>

## P234: Fold getAdjustedPrices and getAveragePrices into one column-parameterized reader

- **Status:** [x] done
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -18 / +8
- **Depends on:** —
- **Existing primitive:** `src/lib/fan-out.ts:mapByIdDroppingNulls (per-id variant)`

**Problem.** src/data/industry-indices/queries.ts has two exported readers that issue the same `select typeId, <col> from adjusted_prices where typeId in (...)` and the same skip-null Map build, differing only in adjustedPrice vs averagePrice. Fallow's semantic pass groups them (industry-indices/queries.ts:38-47 and 53-62). getAdjustedPrice (66-69) has no production caller; only queries.test.ts imports it.

**Verifier revision.** Only the twin price readers survive. getAdjustedPrices and getAveragePrices run the same select on adjusted_prices, with the same null-dropping loop, and differ only in the column. The generic `mapRowsById` in src/lib/fan-out.ts is rejected for four reasons. (1) The repeated part is a 2-3 line idiom (empty-ids guard plus a Map build), and the only substantive code at each site is the per-row shaping, which would stay. (2) The sites differ in semantics: getTypeAttributesBatch pre-seeds every requested id with {}, the price readers drop null values, getSystemCostIndicesBatch pivots into nested maps, and eve-data/queries.ts:167-185 already has its own derive helper. (3) fan-out.ts is a per-id concurrency primitive (mapByIdDroppingNulls fans out N getter calls), which is a different concept from a single IN query. (4) npc-stats/queries.ts is not the same shell. It composes getTypeAttributesBatch twice and never runs a select inArray, and Fallow grouped it only because of the 3-token prologue.

**Sites (4).**

- [`src/data/industry-indices/queries.ts:37-49`](../../src/data/industry-indices/queries.ts#L37-L49) — getAdjustedPrices; caller src/features/industry-planner/queries.ts:273
- [`src/data/industry-indices/queries.ts:51-64`](../../src/data/industry-indices/queries.ts#L51-L64) — getAveragePrices; caller src/composition/board/price-book.ts:30
- [`src/data/industry-indices/queries.ts:66-69`](../../src/data/industry-indices/queries.ts#L66-L69) — getAdjustedPrice: production-dead, only src/data/industry-indices/queries.test.ts:83-91 uses it
- [`src/data/industry-indices/queries.test.ts:56-92`](../../src/data/industry-indices/queries.test.ts#L56-L92) — mocked-db tests keyed on adjustedPrice/averagePrice row fields

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/npc-stats/queries.ts:5-27`](../../src/data/npc-stats/queries.ts#L5-L27) — Not the same shell: composes getTypeAttributesBatch twice; no select/inArray
- [`src/data/eve-data/queries.ts:136-150`](../../src/data/eve-data/queries.ts#L136-L150) — getTypeAttributesBatch pre-seeds every id with {} (callers rely on that), unlike the drop-missing readers
- [`src/data/eve-data/queries.ts:95-134`](../../src/data/eve-data/queries.ts#L95-L134) — getTypeNames/getTypeLabels: idiomatic guard + Map build; per-row shaping is the only content
- [`src/data/eve-data/queries.ts:167-185`](../../src/data/eve-data/queries.ts#L167-L185) — mapBlueprintActivities is already a local helper with derive/drop-null
- [`src/data/eve-data/character-facts.ts:24-60, 109-126`](../../src/data/eve-data/character-facts.ts#L24-L60) — getSystemFacts/getNpcStationFacts/getTypeMarketFacts: same idiom, different joins and shaping (secClass derivation)
- [`src/data/market-prices/queries.ts:24-35`](../../src/data/market-prices/queries.ts#L24-L35) — getPrices: same idiom, row spread plus source cast
- [`src/data/industry-indices/queries.ts:7-30`](../../src/data/industry-indices/queries.ts#L7-L30) — getSystemCostIndicesBatch pivots into a nested Map
- [`src/data/maps/queries.ts:442-452`](../../src/data/maps/queries.ts#L442-L452) — getCharacterNames: already a one-line new Map(rows.map(...))
- [`src/lib/fan-out.ts:1-11`](../../src/lib/fan-out.ts#L1-L11) — mapByIdDroppingNulls is per-id concurrent fan-out, not a batched IN read; wrong home for a rows-to-map helper

</details>

**Home.** `src/data/industry-indices/queries.ts (private helper)`

**Boundary check.** Everything stays inside the data/industry-indices zone. Callers src/features/industry-planner/queries.ts (features -> data allowed) and src/composition/board/price-book.ts (composition -> data allowed) keep importing the same exported names.

**API sketch.**

```ts
function readPriceColumn(typeIds: number[], column: 'adjustedPrice' | 'averagePrice'): Promise<Map<number, number>>;
export const getAdjustedPrices = (typeIds: number[]) => readPriceColumn(typeIds, 'adjustedPrice');
export const getAveragePrices = (typeIds: number[]) => readPriceColumn(typeIds, 'averagePrice');
```

**Migration steps.**

1. Add private readPriceColumn(typeIds, column) that keeps the empty short-circuit and selects { typeId: adjustedPrices.typeId, price: adjustedPrices[column] }, skipping null prices.
2. Re-implement getAdjustedPrices and getAveragePrices as one-line delegates, keeping the exported names and signatures (the vi.mock in price-book.test.ts and app/api/industry/cost-indices/route.test.ts mock by name).
3. Delete getAdjustedPrice (66-69) and its test block (queries.test.ts:83-91), since nothing in production calls it.
4. Update the canned rows in queries.test.ts:58-62 and 72-76 to the new selected key.

**Tests.** src/data/industry-indices/queries.test.ts: keep the 'skipping NULL-priced rows' (getAdjustedPrices) and 'skipping rows without one' plus empty-input (getAveragePrices) cases, with canned rows renamed to the helper's selected key. Indirect guards: src/composition/board/price-book.test.ts and src/app/api/industry/cost-indices/route.test.ts.

**Notes.** Both readers must keep dropping nulls (0 is a valid price; test asserts out.get(41) === 0). No caller reads both columns for the same ids, so there is no efficiency case for a combined two-column read. The generic mapRowsById is not worth the indirection: drizzle row inference would have to flow through a generic read callback for a 2-line saving per site.

<sub>Reported by: area:data-eve.</sub>

<a id="p278"></a>

## P278: Name the settle spring once in motion-contract (SETTLE_SPRING) instead of three springFamily(0) calls

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** +2/−0 net (one constant, three call-site edits)
- **Depends on:** —
- **Existing primitive:** `src/mapper/motion/motion-contract.ts:springFamily`

**Problem.** The zero-overshoot 'settle' ease, which backs CSS --map-motion-ease-settle, the fog open and close timing, and camera flights, is spelled springFamily(0) at three call sites. Each call rebuilds the same ease closure and the same 25-stop CSS linear() string. The concept has a name in CSS but none in TypeScript. The rebuild cost itself is negligible.

**Verifier revision.** The duplication is real: three sites rebuild springFamily(0). The efficiency claim does not hold at realistic sizes. springFamily(0) clamps the fraction to 0, so backFactorFor returns at once, with no 80-step bisection. What remains is about 25 small evaluations, toFixed calls and a join, a few microseconds of work. runFogTick does it per animation frame, but only while the fog is animating, and the same frame does canvas painting in paintFog that costs far more. cameraEaseOf runs once per camera flight, and motionCssProperties once per dial change. Caching fogTimingOf in fog-host or memoising springFamily would add state for no measurable gain; reject that part. The useful part is a naming one. Three call sites spell the 'settle' ease as the magic value springFamily(0), the same concept the CSS calls --map-motion-ease-settle. One exported constant names it, and as a side benefit removes the per-frame allocation and gives the fog ease a stable reference.

**Sites (5).**

- [`src/mapper/fog/fog-model.ts:137-146`](../../src/mapper/fog/fog-model.ts#L137-L146) — fogTimingOf calls springFamily(0).ease when not in reduced motion.
- [`src/mapper/fog/fog-model.ts:410-418`](../../src/mapper/fog/fog-model.ts#L410-L418) — advanceFogFrame calls fogTimingOf on each tick.
- [`src/mapper/fog/fog-host.ts:63-76`](../../src/mapper/fog/fog-host.ts#L63-L76) — runFogTick calls advanceFogFrame for each scheduled frame while the fog is animating.
- [`src/mapper/canvas/camera-follow-model.ts:81-89`](../../src/mapper/canvas/camera-follow-model.ts#L81-L89) — cameraEaseOf calls springFamily(0).ease. use-camera-follow.ts:101 and 203 call it once per flight.
- [`src/mapper/motion/motion-contract.ts:44-77,86-87`](../../src/mapper/motion/motion-contract.ts#L44-L77) — springFamily: when the fraction is 0, backFactorFor returns 0 with no bisection. It then builds the 25-stop cssLinear. motionCssProperties calls springFamily(0).

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/motion/motion-contract.ts:100-112`](../../src/mapper/motion/motion-contract.ts#L100-L112) — tweenPlanOf uses springFamily(config.overshootPct), a config-dependent spring, and use-motion.ts:46-47 already memoises it. This is not the settle constant.
- [`src/mapper/fog/fog-host.ts:42-51`](../../src/mapper/fog/fog-host.ts#L42-L51) — The proposed fogTimingOf cache in FogHostRuntime is rejected: it would add invalidation state to save microseconds per frame.

</details>

**Home.** `src/mapper/motion/motion-contract.ts (export SETTLE_SPRING next to springFamily)`

**Boundary check.** All in the mapper zone. fog-model.ts and camera-follow-model.ts already import from ../motion/motion-contract, so no new edges are added.

**API sketch.**

```ts
/** The zero-overshoot ease: CSS --map-motion-ease-settle, fog reveals, camera flights. */
export const SETTLE_SPRING: SpringFamily = springFamily(0);
```

**Migration steps.**

1. In src/mapper/motion/motion-contract.ts, add `export const SETTLE_SPRING: SpringFamily = springFamily(0);` after springFamily, and use SETTLE_SPRING.cssLinear for '--map-motion-ease-settle' in motionCssProperties.
2. In src/mapper/fog/fog-model.ts:143, replace springFamily(0).ease with SETTLE_SPRING.ease and update the import.
3. In src/mapper/canvas/camera-follow-model.ts:87, replace springFamily(0).ease with SETTLE_SPRING.ease and update the import.
4. Do not add caching to fog-host or memoise springFamily.

**Tests.** Existing: motion-contract.test.ts:27 and :89 (settle peak ≤ 1; --map-motion-ease-settle equals springFamily(0).cssLinear), fog-model.test.ts:52-53 and :140 (fogTimingOf), and camera-follow-model.test.ts:189-199 (cameraEaseOf ease bounds). Optionally, add one assertion that SETTLE_SPRING.cssLinear === springFamily(0).cssLinear, so the constant cannot drift from the factory.

**Notes.** Keep fogTimingOf's reduced-motion branch, which returns the identity ease, unchanged. As a side effect, timing.ease becomes referentially stable across frames, which is harmless. This can land in the same commit as P277, since both edit motionCssProperties' file.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p113"></a>

## P113: Reuse tween-model's pruneBy for motion-host-model's pruneToLive

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -17 +2 production; about +15 test
- **Depends on:** —

**Problem.** motion-host-model.pruneToLive (68-86) re-implements tween-model.pruneBy (191-208): a Map filter that returns the input reference when nothing is pruned. The only difference is that it keeps entries by key membership in another Map rather than by value. The identity return matters: stepMotion (178-183) detects change by reference.

**Verifier revision.** The core duplication is real. pruneBy and pruneToLive are the same reference-stable Map filter: scan for something to drop, return the input Map when nothing is dropped, otherwise copy the survivors. pruneToLive's `size === 0` shortcut gives the same result as the scan. Both live in mapper/motion, and motion-host-model already imports from tween-model (lines 11-18). The design changes in two ways. (1) No new src/mapper/lib/collections.ts. Reuse and export the existing pruneBy, widening keep to (value, key). A new file would also need a test file and an entry in surface.test.ts's exhaustive list, for two consumers in the same folder. (2) Drop the captureGhostNodes index. truth.nodes.find runs only for ghosts not yet captured (line 95 skips captured ones), so it runs once per newly departed system per intent merge, not per frame. An eager id→node Map would cost O(nodes) on every merge, including the common merge with no new ghosts, which is worse in the usual case.

**Sites (5).**

- [`src/mapper/motion/tween-model.ts:191-208`](../../src/mapper/motion/tween-model.ts#L191-L208) — pruneBy(entries, keep(value)), module-private
- [`src/mapper/motion/tween-model.ts:174-188`](../../src/mapper/motion/tween-model.ts#L174-L188) — four pruneBy callers; changed is detected by identity at 178-183
- [`src/mapper/motion/motion-host-model.ts:68-86`](../../src/mapper/motion/motion-host-model.ts#L68-L86) — pruneToLive: same algorithm keyed on live.has(key), plus a redundant size===0 shortcut
- [`src/mapper/motion/motion-host-model.ts:93, 118, 194-195`](../../src/mapper/motion/motion-host-model.ts#L93) — pruneToLive callers: captureGhostNodes, captureGhostEdges and stepHost
- [`src/mapper/motion/motion-host-model.ts:11-18`](../../src/mapper/motion/motion-host-model.ts#L11-L18) — already imports from ./tween-model, so no new edge

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/motion/motion-host-model.ts:88-109`](../../src/mapper/motion/motion-host-model.ts#L88-L109) — captureGhostNodes' linear find at 96 runs only for not-yet-captured ghosts (95), once per new departure per merge, with about 1-50 ghosts × hundreds of nodes. That is negligible, and an eager index would slow the no-ghost merge. Optional micro-fix: hoist String(systemId) out of the find predicate.

</details>

**Home.** `src/mapper/motion/tween-model.ts: export the existing pruneBy`

**Boundary check.** Both modules are in the mapper zone (src/mapper/**). A same-zone import needs no rule, and the import edge motion-host-model → tween-model already exists, so no boundary changes.

**API sketch.**

```ts
export function pruneBy<Key, Value>(entries: ReadonlyMap<Key, Value>, keep: (value: Value, key: Key) => boolean): ReadonlyMap<Key, Value>; // returns `entries` itself when every entry is kept
```

**Migration steps.**

1. tween-model.ts: export pruneBy, widen keep to (value, key), and iterate entries() in the scan loop so the key is available. The existing value-only callers at 174-177 compile unchanged.
2. motion-host-model.ts: delete pruneToLive's body (68-86). Either inline `pruneBy(x, (_, key) => live.has(key))` at 93, 118, 194 and 195, or keep a one-line `const pruneToLive = (s, live) => pruneBy(s, (_, k) => live.has(k))` for readability. Add pruneBy to the existing ./tween-model import.
3. Run the test-runner agent's `pnpm check` (fallow unused-exports is satisfied because motion-host-model now imports pruneBy).

**Tests.** Add a direct pruneBy test in src/mapper/motion/tween-model.test.ts: it returns the same reference when nothing is pruned, returns the same reference for an empty Map, prunes by value, and prunes by key. Existing guards: tween-model.test.ts 270-277 (frame.changed false and frame.state is state when nothing changes); use-motion.test.ts 146-172 (ghost captured from pre-merge truth, ghostNodes.size 0 after expiry) and 345 (reset clears ghosts).

**Notes.** The identity return must be kept exactly: stepMotion's changed detection and the no-change early return in stepHost (186-188) depend on it. pruneToLive's `snapshots.size === 0` early return gives the same result as the scan, so dropping it is safe. If a pruneBy consumer ever appears outside mapper/motion, move it to src/mapper/lib, or to src/lib if a non-mapper consumer appears, and add it to surface.test.ts at that point.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p114"></a>

## P114: Share one djb2 string hash between wormhole seeding and fog brush rotation

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -8 / +6 in production code, +15 in tests
- **Depends on:** —
- **Existing primitive:** `src/mapper/lib/prng.ts:mulberry32`

**Problem.** wormholeSeed (src/mapper/canvas/wormhole/palette.ts:87-91) and stampAngle (src/mapper/fog/fog-painter.ts:199-205) each hand-roll the same unsigned djb2 loop (hash = 5381; hash = (hash * 33 + c) >>> 0). Both use it to derive a deterministic visual parameter from a node or edge key. mulberry32 already lives in src/mapper/lib/prng.ts, the mapper's home for deterministic randomness, so the string-to-seed half belongs beside it.

**Verifier revision.** The duplication is real: palette.ts:88-89 and fog-painter.ts:200-203 contain the same unsigned djb2 loop, both turning a string key into a stable visual seed inside the mapper zone, and there is no other string hash to reuse (proof-kit.ts positionDigest is a 64-bit BigInt FNV-1a digest with a different contract). The efficiency claim does not hold. Per frame the hashing costs about (strokes x stamps per stroke x key length), roughly 100 x 6 x 30 character operations, a few microseconds. Each stamp also runs save/translate/rotate/drawImage/restore, which costs orders of magnitude more. Keep this as a small dedupe. Hoisting the hash to once per stroke comes free with the new stampAngle signature, so it should not be sold as a performance fix. Do not add a hash field to FogPaintDisc or FogPaintStroke: that would widen the fog-model frame types for no measurable gain.

**Sites (6).**

- [`src/mapper/canvas/wormhole/palette.ts:87-91`](../../src/mapper/canvas/wormhole/palette.ts#L87-L91) — wormholeSeed: djb2 loop, then (hash % 4096) / 4096
- [`src/mapper/fog/fog-painter.ts:199-205`](../../src/mapper/fog/fog-painter.ts#L199-L205) — stampAngle: the same djb2 loop, then ((hash + index * 97) % 360) degrees to radians
- [`src/mapper/fog/fog-painter.ts:234-259`](../../src/mapper/fog/fog-painter.ts#L234-L259) — stampStroke calls stampAngle(stroke.key, step) per stamp (line 256), so the key is re-hashed each step
- [`src/mapper/fog/fog-painter.ts:271-290`](../../src/mapper/fog/fog-painter.ts#L271-L290) — disc (line 277) and wake (line 288) stamps call stampAngle(key, 0)
- [`src/mapper/lib/prng.ts:1-9`](../../src/mapper/lib/prng.ts#L1-L9) — existing home: mulberry32, imported by fog-painter.ts:1 and layout/proof-kit.ts:2
- [`src/mapper/canvas/wormhole/host.ts:43`](../../src/mapper/canvas/wormhole/host.ts#L43) — sole consumer of wormholeSeed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/layout/proof-kit.ts:213-228`](../../src/mapper/layout/proof-kit.ts#L213-L228) — positionDigest is a 64-bit FNV-1a BigInt hex digest pinned by determinism fixtures. It is a different algorithm and contract and must not change.

</details>

**Home.** `src/mapper/lib/prng.ts`

**Boundary check.** prng.ts is in the mapper zone (src/mapper/**), and both consumers (src/mapper/canvas/wormhole/palette.ts and src/mapper/fog/fog-painter.ts) are in the same zone, so the imports are intra-zone and need no rule. fog-painter.ts:1 and layout/proof-kit.ts:2 already import ../lib/prng. No consumer outside mapper, so src/lib is not warranted.

**API sketch.**

```ts
// src/mapper/lib/prng.ts
export function djb2(key: string): number; // unsigned 32-bit: h = 5381; h = (h * 33 + key.charCodeAt(i)) >>> 0

// palette.ts
export function wormholeSeed(key: string): number { return (djb2(key) % 4096) / 4096; }

// fog-painter.ts (module-private)
function stampAngle(hash: number, index: number): number; // (((hash + index * 97) % 360) * Math.PI) / 180
```

**Migration steps.**

1. Before refactoring, add a fog-painter.test.ts assertion that pins the rotate() argument for one disc key and for stroke steps 0 and 1. The fake ctx already logs rotate args at line 58, but no test reads them.
2. Add djb2 to src/mapper/lib/prng.ts and add src/mapper/lib/prng.test.ts with known vectors: djb2('') === 5381 and djb2('31000001') % 4096 === 3818.
3. palette.ts: replace the loop in wormholeSeed with djb2(key). palette.test.ts:27-28 must stay green.
4. fog-painter.ts: change stampAngle to (hash, index). In stampStroke, compute const hash = djb2(stroke.key) once before the loop and pass stampAngle(hash, step). In paintFog, pass stampAngle(djb2(disc.key), 0) and stampAngle(djb2(wake.key), 0).
5. Delete the inline loop in stampAngle. Leave FogPaintDisc and FogPaintStroke unchanged.

**Tests.** Existing guard: src/mapper/canvas/wormhole/palette.test.ts:27-28 pins wormholeSeed('31000001') = 3818/4096. Add: src/mapper/lib/prng.test.ts (djb2 vectors), plus a fog-painter.test.ts rotate-angle assertion written before the change so the output is proven bit-identical.

**Notes.** The output must stay bit-identical. Keep the >>> 0 unsigned coercion: do not switch to | 0 or Math.imul, which would change the values, and with them wormhole shader seeds and fog brush rotations. hash + index * 97 is computed in float64 on a value below 2^32 plus a small int, so the result is exact and unchanged when the hash is precomputed. The efficiency gain is negligible; do not describe it as a perf fix.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p290"></a>

## P290: Count active sessions with count() and read the two pending-deletion queues concurrently

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -4 / +5
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/admin-users.ts:getAccountTotals (count() pattern)`

**Problem.** getActiveSessionCount selects the id of every unexpired session for a user and returns rows.length. Two lines above it, getAccountTotals uses `db.select({ n: count() })`. readRequestedDeletions awaits its user-scope query, then its character-scope query, although the second does not depend on the first.

**Verifier revision.** Two of the four items survive, and only as small cleanups; none is a real efficiency problem at realistic sizes. Rejected (1): assertSourceEmpty runs once per account merge, a rare event. It runs about 13 `SELECT 1 … LIMIT 1` probes (13 `user_id` tables found by grep). executeMergeRules has already run every contributor's rules one statement at a time in the same transaction, and the locks cover only the two user rows. A UNION ALL would make the SQL harder to read and would rewrite the merge.test.ts assertion on the exact statements, for a few milliseconds. Rejected (4): running the 404 bisection in sequence is the safe choice. esiFetch → enforceBudget checks `pre.effectiveRemaining < ESI_BUDGET_FLOOR` against a scoreboard snapshot before each dispatch. If the halves ran in parallel, many sibling requests could pass that check before any of their 404s were recorded, so a batch with many departed characters could push past the error floor. A one-line comment saying so is optional. Kept (3): getActiveSessionCount loads rows only to count them, while getAccountTotals in the same file already uses the count() idiom. Kept (2): the two queries in readRequestedDeletions do not depend on each other and can run together. This saves one Neon round trip on the deletion-retry cron.

**Sites (4).**

- [`src/platform/auth/admin-users.ts:215-221`](../../src/platform/auth/admin-users.ts#L215-L221) — getActiveSessionCount: `select({ id: session.id })` … `return rows.length`. Called per page view from src/app/(site)/settings/account/page.tsx:34 and src/app/(site)/admin/users/[userId]/page.tsx:137.
- [`src/platform/auth/admin-users.ts:112-121`](../../src/platform/auth/admin-users.ts#L112-L121) — getAccountTotals: existing count()/countDistinct idiom inside Promise.all, the pattern to copy.
- [`src/platform/auth/purge.ts:86-108`](../../src/platform/auth/purge.ts#L86-L108) — readRequestedDeletions: users query 87-93, then links query 94-101, awaited in sequence. The links WHERE (isNull(user.deletionRequestedAt)) does not use the first result. The output keeps users first, then links.
- [`src/composition/account-lifecycle/account-purge.ts:115-121`](../../src/composition/account-lifecycle/account-purge.ts#L115-L121) — Only caller: retryRequestedDeletions on the cron, DELETION_RETRY_BATCH = 20.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/purge/merge.ts:96-111`](../../src/platform/purge/merge.ts#L96-L111) — assertSourceEmpty runs once per merge (src/composition/account-lifecycle/account-merge.ts:86), after executeMergeRules (merge.ts:80-90) has already run every rule in sequence. About 13 cheap probes on a rare path, and merge.test.ts:81-98 pins the exact per-table statements. Not worth a UNION ALL.
- [`src/platform/auth/affiliation-source.ts:66-77`](../../src/platform/auth/affiliation-source.ts#L66-L77) — Sequential bisection protects the ESI error budget. Parallel 404 fan-out would pass enforceBudget's pre-dispatch floor check (src/platform/esi/dispatch.ts:203-238, called from src/platform/esi/index.ts:27-36) on a stale snapshot. The top-level chunk loop at 119-123 is sequential for the same reason.

</details>

**Home.** `In place: src/platform/auth/admin-users.ts and src/platform/auth/purge.ts (no new primitive).`

**Boundary check.** Both edits stay inside zone platform/auth and import only drizzle-orm (already imported: count in admin-users.ts line 1). No new cross-zone imports.

**API sketch.**

```ts
export async function getActiveSessionCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
  return row?.n ?? 0;
}
// readRequestedDeletions: const [users, links] = await Promise.all([usersQuery, linksQuery]);
```

**Migration steps.**

1. admin-users.ts: rewrite getActiveSessionCount to `db.select({ n: count() })` with the same WHERE, returning `row?.n ?? 0`, as getAccountTotals does.
2. purge.ts: wrap the two builders in readRequestedDeletions in `const [users, links] = await Promise.all([...])`. Keep the flatMap of users first, then the links loop, so the output order is unchanged.
3. Leave assertSourceEmpty and the affiliation bisection unchanged. Optionally add a one-line comment at affiliation-source.ts:70 saying the halves run in sequence so concurrent 404s cannot overshoot the ESI error floor.

**Tests.** Guards that already exist: src/platform/auth/admin-users.db.test.ts:231-233 (count goes from 1 to 0 after expiry/revoke) and src/composition/account-lifecycle/account-purge.test.ts (mocks readRequestedDeletions). Add a db test for readRequestedDeletions if none covers it: one user-scope request, one character-scope request, and one character inside a pending user deletion, which must be excluded. Assert the user-first order.

**Notes.** drizzle's count() maps to a number, so the return type is unchanged. Under Promise.all the neon-http db sends two HTTP requests at once, which is safe outside a transaction. Do not run the assertSourceEmpty probes in parallel inside the postgres-js transaction; they would share one connection anyway.

<sub>Reported by: area:platform.</sub>

<a id="p135"></a>

## P135: Route isGscConfigured through readEnv instead of a process.env parameter

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** +1 / -1
- **Depends on:** —
- **Existing primitive:** `src/lib/env.ts:isHostedVercel, src/lib/env.ts:readEnv`

**Problem.** src/data/gsc/constants.ts:27-29 `isGscConfigured(env = process.env)` reads GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL off a passed-in object. That bypasses readEnv's typed registry and evades the no-restricted-syntax rule that forces server env through readEnv. Its sibling source.ts reads the same two names through requireEnv. No caller passes the parameter.

**Verifier revision.** Most of the proposal is refuted. (1) isDevelopment()/isProductionBuild(): `process.env.NODE_ENV === ...` is the project's sanctioned idiom ('NODE_ENV and NEXT_PUBLIC_* stay direct reads', eslint.config.mjs:375). Next inlines it, and a helper saves nothing per site. (2) deploymentTier(): the three VERCEL_ENV comparisons ask different questions (preview-only, production-only, either) and already go through readEnv. (3) The synthetic-pilot 'drift' is deliberate layering, not drift. The HTTP route (platform/auth/synthetic-pilot.ts:10-33) adds development + localhost + same-origin checks because it is network-reachable. The store's gate (synthetic-pilot-store.ts:23-57) is the minimum safety invariant shared with e2e/auth-seed.ts:5,32, which calls becomeSyntheticPilot directly in the Playwright process while CI's webServer runs `pnpm start` (playwright.config.ts:33). The affiliation filter (affiliation-source.ts:112) is an ESI-call optimisation for dev. One rule for all three would break e2e seeding or loosen the HTTP route. (4) hasEnv()/isFeedbackConfigured(): `!readEnv('LINEAR_API_KEY')` is already a single call, with one consumer. What survives is a real bypass of the existing primitive. isGscConfigured reads `env.GSC_*` through a `process.env` default parameter, which skips both readEnv and the lint selector (that selector matches only `process.env.X`). It has 5 production consumers, and it is the only production-source place that passes process.env as a value.

**Sites (9).**

- [`src/data/gsc/constants.ts:27-29`](../../src/data/gsc/constants.ts#L27-L29) — `isGscConfigured(env: NodeJS.ProcessEnv = process.env)` evades the lint selector (object is `env`, not `process.env`)
- [`src/data/gsc/source.ts:31-46`](../../src/data/gsc/source.ts#L31-L46) — Reads the same names through requireEnv('GSC_SERVICE_ACCOUNT_JSON') and requireEnv('GSC_SITE_URL')
- [`src/lib/env.ts:6-21, 54-63`](../../src/lib/env.ts#L6-L21) — Both GSC names are registered as `required` (z.string().min(1)), so readEnv returns undefined for ''. Semantics match the current Boolean(a && b).
- [`src/data/gsc/ingest.ts:326-335`](../../src/data/gsc/ingest.ts#L326-L335) — Consumer: syncGsc skip guard
- [`src/app/(site)/admin/AudienceCard.tsx:4, 24`](../../src/app/%28site%29/admin/AudienceCard.tsx#L4) — Consumer
- [`src/app/(site)/admin/search/page.tsx:3, 14`](../../src/app/%28site%29/admin/search/page.tsx#L3) — Consumer
- [`src/app/(site)/admin/health/ScheduledTasks.tsx:5, 141`](../../src/app/%28site%29/admin/health/ScheduledTasks.tsx#L5) — Consumer
- [`src/app/(site)/admin/load-signals.ts:3, 28`](../../src/app/%28site%29/admin/load-signals.ts#L3) — Consumer
- [`eslint.config.mjs:370-377`](../../eslint.config.mjs#L370-L377) — Selector requires object.object.name='process', so `env.X` is not caught

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/env.ts:71-74`](../../src/lib/env.ts#L71-L74) — isHostedVercel is fine as is; deploymentTier() adds nothing
- [`src/platform/auth/same-origin.ts:17-24`](../../src/platform/auth/same-origin.ts#L17-L24) — Preview-only question, via readEnv already
- [`src/app/(site)/page.tsx:84`](../../src/app/%28site%29/page.tsx#L84) — Production-only question (the demo stays visible on preview), via readEnv already
- [`src/platform/auth/synthetic-pilot.ts:10-33`](../../src/platform/auth/synthetic-pilot.ts#L10-L33) — HTTP mint gate: intentionally stricter than the store
- [`src/composition/synthetic-pilot-store.ts:23-57`](../../src/composition/synthetic-pilot-store.ts#L23-L57) — Store invariant shared with e2e/auth-seed.ts:32, which runs outside the dev server. Must stay looser on NODE_ENV.
- [`src/platform/auth/affiliation-source.ts:110-114`](../../src/platform/auth/affiliation-source.ts#L110-L114) — Dev-only ESI optimisation, not an authorization gate
- [`src/platform/auth/auth.ts:115`](../../src/platform/auth/auth.ts#L115) — Sanctioned literal NODE_ENV check
- [`src/features/wormhole-sites/dev-sample.ts:13`](../../src/features/wormhole-sites/dev-sample.ts#L13) — Sanctioned literal NODE_ENV check plus readEnv
- [`src/proxy.ts:26`](../../src/proxy.ts#L26) — Sanctioned literal NODE_ENV check (inlined at build)
- [`src/components/composition/LocalSyntheticPilotControl.tsx:10`](../../src/components/composition/LocalSyntheticPilotControl.tsx#L10) — Client DCE literal, which must stay
- [`src/mapper/canvas/MapControls.tsx:88`](../../src/mapper/canvas/MapControls.tsx#L88) — Client DCE literal, which must stay
- [`src/lib/alerts.ts:25-27`](../../src/lib/alerts.ts#L25-L27) — isOpsAlertConfigured is already a named helper; hasEnv would not shorten it
- [`src/app/api/feedback/route.ts:78-88`](../../src/app/api/feedback/route.ts#L78-L88) — Single preflight via readEnv; one consumer, so no isFeedbackConfigured extraction
- [`src/features/feedback/create-linear-issue.ts:51`](../../src/features/feedback/create-linear-issue.ts#L51) — requireEnv inside the transport is correct alongside the route's preflight

</details>

**Home.** `src/data/gsc/constants.ts (existing function), using src/lib/env.ts:readEnv`

**Boundary check.** constants.ts is in the data zone (src/data/gsc). Rule `{from:'data', allow:[..., 'lib', 'config']}` permits importing @/lib/env. Consumer imports do not change: app (admin pages) allows data; data (ingest.ts) is the same slice. No client component imports data/gsc/constants (checked with a grep for 'use client'), so adding zod via readEnv does not reach a client bundle.

**API sketch.**

```ts
import { readEnv } from '@/lib/env';
export function isGscConfigured(): boolean {
  return Boolean(readEnv('GSC_SERVICE_ACCOUNT_JSON') && readEnv('GSC_SITE_URL'));
}
```

**Migration steps.**

1. In src/data/gsc/constants.ts, import readEnv from '@/lib/env' and replace isGscConfigured with the parameterless readEnv form. No caller passes `env`; a grep across src confirms it.
2. Optionally add a production lint selector for `process.env` used as a bare value, so this loophole cannot reopen. src/scripts/map-replay.ts:96 and src/scripts/ci-sde-seed.ts:52 legitimately pass process.env to child processes and would need the script block exempted. Skip this if the exemption is not wanted.
3. Run pnpm check through test-runner.

**Tests.** Existing guards cover it: src/app/(site)/admin/AudienceCard.test.ts:53-94 (vi.stubEnv, including GSC_SITE_URL='' → not configured, which readEnv's min(1) schema preserves) and src/data/gsc/ingest.test.ts:195-210 (deleting both keys → 'skipped/not_configured'). Neither mocks '@/lib/env'. Optionally add a direct case in a new src/data/gsc/constants.test.ts: only one var set → false; both set → true.

**Notes.** Behavior is unchanged. The current Boolean(a && b) treats '' as unset, and readEnv on a `required` (min(1)) name returns undefined for '', so both agree. Keep the function in constants.ts rather than source.ts: source.ts is 'server-only' and imports google-auth-library, which admin pages should not pull in just to render a 'not connected' state. The warn-once NODE_ENV checks in lib/rate-limit.ts:59 and platform/esi/scoreboard/index.ts:36 belong to the Upstash opportunity, as the finding says.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p136"></a>

## P136: Derive problem-type URIs, the outbound UA contact and same-origin's fallback from PRODUCTION_SITE_URL

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about 3 lines changed and 3 imports added; about +8 lines for the optional user-agent test
- **Depends on:** —
- **Existing primitive:** `src/config/site-url.ts:PRODUCTION_SITE_URL`

**Problem.** PRODUCTION_SITE_URL is the canonical production origin, and src/config/site-url.test.ts pins it. Three modules still spell 'https://lgi.tools' themselves: problemBody's RFC 9457 `type` URI, OUTBOUND_CONTACT inside OUTBOUND_USER_AGENT, and requireSameOrigin's last-resort canonicalOrigin fallback. A host change needs four edits, and the pinning test guards only one of them.

**Sites (5).**

- [`src/config/site-url.ts:1-4`](../../src/config/site-url.ts#L1-L4) — PRODUCTION_SITE_URL = 'https://lgi.tools'; SITE_URL falls back to it
- [`src/config/site-url.test.ts:1-8`](../../src/config/site-url.test.ts#L1-L8) — pins PRODUCTION_SITE_URL only
- [`src/lib/problem.ts:63-76`](../../src/lib/problem.ts#L63-L76) — type: `https://lgi.tools/problems/${failure.category}` at line 66
- [`src/config/user-agent.ts:1-10`](../../src/config/user-agent.ts#L1-L10) — OUTBOUND_CONTACT = 'https://lgi.tools/contact' at line 3, composed into OUTBOUND_USER_AGENT at line 10
- [`src/platform/auth/same-origin.ts:1, 17-30`](../../src/platform/auth/same-origin.ts#L1) — already imports SITE_URL from @/config/site-url; final `?? 'https://lgi.tools'` at line 29

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/contact/page.tsx:22`](../../src/app/%28site%29/contact/page.tsx#L22) — CONTACT_EMAIL 'lgi.tools@pm.me' is an email address, not the site origin
- [`src/app/(site)/preview/primitives/forms.tsx:62`](../../src/app/%28site%29/preview/primitives/forms.tsx#L62) — intentionally malformed demo value 'htp://lgi.tools/api' in a primitives preview
- [`src/lib/problem.test.ts:66`](../../src/lib/problem.test.ts#L66) — test fixture; it should keep asserting the literal so it still pins the wire value

</details>

**Home.** `src/config/site-url.ts:PRODUCTION_SITE_URL (existing)`

**Boundary check.** Home zone: config. src/lib/problem.ts is in zone lib, and rule {from: lib, allow: [config]} allows it, with precedent at src/lib/discord.ts:1. src/config/user-agent.ts is in config, a same-zone import. src/platform/auth/same-origin.ts is in platform/auth, whose rule allows config, and the file already imports @/config/site-url. lib/problem.ts is also reached by transport/decode.ts and transport/endpoint.ts (transport→lib), by convex tests and by runtime (src/proxy.ts). Boundary rules check direct imports only, so lib→config is the only new edge, and config imports nothing.

**API sketch.**

```ts
No new API. Use `${PRODUCTION_SITE_URL}/problems/${failure.category}`, `const OUTBOUND_CONTACT = `${PRODUCTION_SITE_URL}/contact``, and `?? PRODUCTION_SITE_URL`.
```

**Migration steps.**

1. src/config/user-agent.ts: import { PRODUCTION_SITE_URL } from './site-url' and set OUTBOUND_CONTACT = `${PRODUCTION_SITE_URL}/contact`.
2. src/lib/problem.ts: import { PRODUCTION_SITE_URL } from '@/config/site-url' and build `type` from it.
3. src/platform/auth/same-origin.ts: add PRODUCTION_SITE_URL to the existing @/config/site-url import and replace the trailing 'https://lgi.tools' literal.
4. Leave the test fixtures' literal strings as they are. They now act as wire-format pins for the derived values.

**Tests.** Existing guards: src/lib/problem.test.ts:66 asserts 'https://lgi.tools/problems/unexpected'; src/platform/auth/same-origin.test.ts stubs BETTER_AUTH_URL; src/platform/auth/eve-sso.test.ts and src/platform/esi/index.test.ts compare against OUTBOUND_USER_AGENT symbolically. Add src/config/user-agent.test.ts asserting OUTBOUND_USER_AGENT ends with '(https://lgi.tools/contact)' so the ESI-facing contact is pinned too. Optionally add a same-origin case with NEXT_PUBLIC_SITE_URL set to a malformed value, asserting that an Origin of https://lgi.tools is accepted.

**Notes.** No behaviour change: every derived string is byte-identical. Keep PRODUCTION_SITE_URL, not SITE_URL, at all three sites. SITE_URL would make problem-type URIs and the ESI User-Agent contact vary on staging and dev, which is wrong for stable identifiers. In same-origin, SITE_URL is already tried first on line 28.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p268"></a>

## P268: Resolve the Better Auth secret once with empty-string fallback (readAuthSecret in lib/env)

- **Status:** [x] done
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -4 / +5 (plus ~15 test lines)
- **Depends on:** —
- **Existing primitive:** `src/lib/env.ts:readEnv`

**Problem.** The secret expression `readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET')` appears three times. Because readEnv returns '' for an empty verbatim variable, the documented fallback to SESSION_SECRET never happens when BETTER_AUTH_SECRET is present but empty, which is the .env.example template. Locally, auth then signs sessions and encrypts JWKS private keys with Better Auth's public default secret, while the synthetic-pilot tooling refuses to run and the industry page's 'auth not configured' guard disagrees with what createAuth actually uses.

**Sites (8).**

- [`src/platform/auth/auth.ts:60`](../../src/platform/auth/auth.ts#L60) — secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'), which passes '' to Better Auth
- [`src/composition/synthetic-pilot-store.ts:47-52, 61-64`](../../src/composition/synthetic-pilot-store.ts#L47-L52) — same expression, then throws on falsy; later compares to auth.$context.secret
- [`src/app/(site)/industry/industry-characters.ts:25-27, 67`](../../src/app/%28site%29/industry/industry-characters.ts#L25-L27) — authEnvConfigured = Boolean(same expression), which gates swallowing BetterAuthError
- [`src/lib/env.ts:23-30, 54-63`](../../src/lib/env.ts#L23-L30) — BETTER_AUTH_SECRET and SESSION_SECRET are verbatim, so '' passes through readEnv
- [`src/lib/env.test.ts:42-47`](../../src/lib/env.test.ts#L42-L47) — line 46 pins the buggy `??` result ''
- [`.env.example:58-70`](../../.env.example#L58-L70) — ships BETTER_AUTH_SECRET= empty and documents the SESSION_SECRET fallback
- [`src/app/(site)/industry/industry-characters.test.ts:51-59`](../../src/app/%28site%29/industry/industry-characters.test.ts#L51-L59) — guards the null-when-unconfigured and rethrow-when-configured paths
- [`src/composition/synthetic-pilot-store.db.test.ts:226-235`](../../src/composition/synthetic-pilot-store.db.test.ts#L226-L235) — refusal case ['BETTER_AUTH_SECRET', '']; its reason changes if SESSION_SECRET is present in the test env

<details><summary>Excluded sites (not the same concept)</summary>

- [`e2e/auth-seed.db.test.ts:26-45`](../../e2e/auth-seed.db.test.ts#L26-L45) — out of scope (e2e); exercises each secret name alone via dotenv, unaffected
- [`.claude/cloud/setup.sh:128-129`](../../.claude/cloud/setup.sh#L128-L129) — cloud sessions ensure both secrets are non-empty, so they are unaffected

</details>

**Home.** `src/lib/env.ts (readAuthSecret)`

**Boundary check.** The home is in zone lib (src/lib/**). The lib rule allows only config, and readAuthSecret uses readEnv from the same file. Consumers: src/platform/auth/auth.ts (platform/auth allows lib), src/composition/synthetic-pilot-store.ts (composition allows lib) and src/app/(site)/industry/industry-characters.ts (app allows lib). All legal.

**API sketch.**

```ts
/** BETTER_AUTH_SECRET, else SESSION_SECRET; an empty value counts as unset. */
export function readAuthSecret(): string | undefined {
  return readEnv('BETTER_AUTH_SECRET') || readEnv('SESSION_SECRET') || undefined;
}
```

**Migration steps.**

1. Add readAuthSecret to src/lib/env.ts next to readEnv.
2. In src/lib/env.test.ts, keep the `readEnv('BETTER_AUTH_SECRET')` → '' assertion (verbatim semantics) and delete line 46, which pins the bug. Add readAuthSecret cases: primary set; primary '' with SESSION 'fallback' → 'fallback'; primary unset with SESSION set → SESSION; both ''/unset → undefined.
3. src/platform/auth/auth.ts:60 → `secret: readAuthSecret(),`.
4. src/composition/synthetic-pilot-store.ts:47 → `const secret = readAuthSecret();` and keep the throw and the ctx.secret comparison.
5. src/app/(site)/industry/industry-characters.ts: delete authEnvConfigured (25-27) and change line 67 to `!readAuthSecret()`.
6. In synthetic-pilot-store.db.test.ts 233, also stub SESSION_SECRET to '' for the ['BETTER_AUTH_SECRET', ''] case. That keeps it testing the missing-secret refusal: if the test process carries a SESSION_SECRET, the refusal would otherwise come from the later ctx.secret mismatch.
7. Update the .env.example comment at line 59 to 'falls back to SESSION_SECRET if this is unset or empty'.

**Tests.** New readAuthSecret cases in src/lib/env.test.ts as above. industry-characters.test.ts 51-59 should pass unchanged; add a case where BETTER_AUTH_SECRET is '' and SESSION_SECRET is 'x' and a BetterAuthError rethrows, because auth is now configured. synthetic-pilot-store.db.test.ts covers the refusal and the matching ctx.secret path.

**Notes.** Dependency evidence for the claims above: node_modules/better-auth/dist/context/create-context.mjs lines 38-44 (validateSecret: default secret throws only when NODE_ENV=production; skipped in tests) and 70-80 (empty secret → 'better-auth-secret-12345678901234567890'). Also node_modules/better-auth/dist/plugins/jwt/sign.mjs 34-39 (the JWKS private key is decrypted with ctx.context.secretConfig; auth.ts 181-182 keeps private-key encryption on). Local migration effect: a dev whose .env.local came from the template (BETTER_AUTH_SECRET empty, SESSION_SECRET set) has been signing with the default secret. After the fix, existing local sessions are invalid, and the JWT plugin fails with 'Failed to decrypt private key' until the local jwks rows are deleted. Say so in the PR. Hosted environments are unaffected for the reason given in `reason`; checking that the hosted value is non-empty is still a cheap sanity step before release. The `||` semantics are the correct ones and match the documented contract.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p185"></a>

## P185: Tag the wormhole-site detail caches with the SDE tag and rename it SDE_CACHE_TAG (no sdeCache helper)

- **Status:** [x] done
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** +4 for the fix; the rename touches about 17 lines with net 0
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/constants.ts:BLUEPRINT_STRUCTURE_TAG`

**Problem.** Two SDE-derived caches carry no SDE tag: listSiteDetails and getSiteDetail read type_dogma for NPC combat stats but are cached with cacheLife('max') and no tag. After an SDE re-ingest changes Sleeper dogma, site pages, the site catalogue and the scanner index keep the old DPS, alpha, EHP and EWAR until the instance recycles. When the prices tag revalidates the priced wrappers, they recompute over the same untagged inner entry. The SDE tag is also named 'blueprint-structure' although every SDE reader in data/eve-data uses it. That name hides its scope and makes such omissions likelier.

**Verifier revision.** The correctness half is confirmed. listSiteDetails and getSiteDetail are cacheLife('max') with no tag, yet they compute NPC combat stats from type_dogma through getCombatStatsBatch and getTypeAttributesBatch. runIngest truncates and re-ingests type_dogma (ingest.ts 115, 215). The SDE cron revalidates only BLUEPRINT_STRUCTURE_TAG, and no tag reaches these entries. Inner cache tags propagate outward (use-cache-wrapper.js propagateCacheLifeAndTagsToRevalidateStore), so tagging the two inner functions also tags listPricedSiteDetails, getPricedSiteDetail and getScannerSiteIndex. The sdeCache() helper is rejected. The bundled cacheLife.md says to call cacheLife in the same function where caching is defined and to avoid abstracting it into shared utilities. The helper would not have prevented this bug either: the untagged functions never opted into SDE caching at all. One cited copy (industry-planner 203-205) is cacheLife('hours') with two tags, so it does not fit a 'max' helper. Renaming the tag is kept as a cheap clarity fix, because the tag covers systems, stations, skills, dogma and universe assets, not just blueprint structures.

**Sites (15).**

- [`src/features/wormhole-sites/queries.ts:179-185, 240-241`](../../src/features/wormhole-sites/queries.ts#L179-L185) — listSiteDetails: 'use cache', cacheLife('max'), no cacheTag; calls getCombatStatsBatch
- [`src/features/wormhole-sites/queries.ts:323-326, 369-370`](../../src/features/wormhole-sites/queries.ts#L323-L326) — getSiteDetail: same
- [`src/features/wormhole-sites/queries.ts:307-311, 387-403`](../../src/features/wormhole-sites/queries.ts#L307-L311) — getScannerSiteIndex, listPricedSiteDetails, getPricedSiteDetail: 'hours' + PRICES_FRESHNESS_TAG, nesting the untagged entries
- [`src/data/npc-stats/queries.ts:5-27`](../../src/data/npc-stats/queries.ts#L5-L27) — getCombatStatsBatch reads attributes through getTypeAttributesBatch
- [`src/data/eve-data/queries.ts:136-150`](../../src/data/eve-data/queries.ts#L136-L150) — getTypeAttributesBatch selects type_dogma (uncached)
- [`src/data/eve-data/ingest.ts:115, 215-231`](../../src/data/eve-data/ingest.ts#L115) — TRUNCATE ... type_dogma, then streamInsert of type_dogma
- [`src/app/api/cron/refresh-sde/declaration.ts:77-82`](../../src/app/api/cron/refresh-sde/declaration.ts#L77-L82) — after runSdePipeline, revalidates only BLUEPRINT_STRUCTURE_TAG with 'max'
- [`src/data/eve-data/constants.ts:103`](../../src/data/eve-data/constants.ts#L103) — BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure'
- [`src/data/eve-data/queries.ts:260-262, 281-283, 344-346, 387-389, 416-418, 423-425, 474-476`](../../src/data/eve-data/queries.ts#L260-L262) — 7 SDE readers using the tag (systems index, stations, structure types, capital hulls, target filters, filter sets, rigs)
- [`src/data/eve-data/universe-assets.ts:343-345, 350-352, 357-359`](../../src/data/eve-data/universe-assets.ts#L343-L345) — 3 universe assets
- [`src/data/eve-data/meta.ts:22-24`](../../src/data/eve-data/meta.ts#L22-L24) — SDE version
- [`src/data/eve-data/character-facts.ts:65-67, 143-145`](../../src/data/eve-data/character-facts.ts#L65-L67) — dogma attribute ids, skill catalog
- [`src/features/industry-planner/queries.ts:116-118, 233-235`](../../src/features/industry-planner/queries.ts#L116-L118) — blueprint structure, blueprint search index ('max')
- [`src/features/industry-planner/queries.ts:203-205`](../../src/features/industry-planner/queries.ts#L203-L205) — getBlueprintPricing: cacheLife('hours') plus PRICES_FRESHNESS_TAG and the SDE tag; does not match a 'max' helper
- [`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md:46-50`](../../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md#L46-L50) — 'Call cacheLife in the same function or component where caching is defined. Avoid abstracting it into shared utilities'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/queries.ts:138-159, 289-305`](../../src/features/wormhole-sites/queries.ts#L138-L159) — listSites and getSiteSearchIndex read only the sites table, seeded outside the SDE pipeline; no SDE tag needed
- [`src/composition/sitemap.ts:50-53`](../../src/composition/sitemap.ts#L50-L53) — reads sites and changelog, not SDE
- [`src/data/wh-statics/queries.ts:312-317`](../../src/data/wh-statics/queries.ts#L312-L317) — own WH_STATICS_TAG over wh_system_statics; not SDE
- [`src/features/changelog/load.ts:29-31`](../../src/features/changelog/load.ts#L29-L31) — file-backed, not SDE

</details>

**Home.** `Existing constant src/data/eve-data/constants.ts (rename BLUEPRINT_STRUCTURE_TAG to SDE_CACHE_TAG = 'sde'); call cacheTag inline in each 'use cache' body. No new helper module.`

**Boundary check.** features/wormhole-sites imports data/eve-data/constants; the features rule allows "data". It already imports data/market-prices and data/npc-stats. data/eve-data modules import their own constants. features/industry-planner already imports the constant. api/cron/refresh-sde imports data (api rule allows "data").

**API sketch.**

```ts
// src/data/eve-data/constants.ts
/** Every cache derived from SDE tables; the refresh-sde cron revalidates it after a re-ingest. */
export const SDE_CACHE_TAG = 'sde';
// in listSiteDetails / getSiteDetail
'use cache';
cacheLife('max');
cacheTag(SDE_CACHE_TAG);
```

**Migration steps.**

1. Correctness fix first: in src/features/wormhole-sites/queries.ts, add `cacheTag(SDE_CACHE_TAG)` (or BLUEPRINT_STRUCTURE_TAG, if the rename lands later) after cacheLife('max') in listSiteDetails (line 184) and getSiteDetail (line 325), and import the constant from '@/data/eve-data/constants'.
2. Rename the constant to SDE_CACHE_TAG with value 'sde' and a doc comment, and update all 17 references: constants.ts 103; eve-data/queries.ts (7); universe-assets.ts (3); meta.ts (1); character-facts.ts (2); industry-planner/queries.ts 118, 205, 235; refresh-sde/declaration.ts 6, 82. Leave cacheLife inline at every site, as the docs advise.
3. Keep the cron's single revalidateTag(SDE_CACHE_TAG, 'max'); SDE data tolerates stale-while-revalidate.

**Tests.** In src/features/wormhole-sites/queries.test.ts (it already mocks cacheTag), add assertions that listSiteDetails and getSiteDetail call cacheTag with the SDE tag, next to the existing 'market-prices-freshness' assertion at line 138. In src/app/api/cron/refresh-sde/route.test.ts (revalidateTagMock is declared but nothing asserts on it), assert revalidateTag(SDE_CACHE_TAG, 'max') on a 'reingested' run and no call on 'up-to-date'. No existing test references the string 'blueprint-structure', so the rename breaks none.

**Notes.** Tags propagate from inner to outer 'use cache' scopes. After the fix, the priced wrappers and getScannerSiteIndex are revalidated by the SDE cron too, and the explicit SDE tag on getBlueprintPricing (industry-planner 205) becomes redundant but harmless; keep it for explicitness. Changing the tag value from 'blueprint-structure' to 'sde' is safe across a deploy, because new deployments start with fresh caches. The cacheLife lifetimes stay as they are: 'max' at the 15 readers and 'hours' at getBlueprintPricing. Calling cacheLife or cacheTag from a helper would work at runtime (both read workUnitAsyncStorage), but the bundled docs advise against it. That guidance and the lifetime mismatch at industry-planner 203-205 are why the helper is dropped.

<sub>Reported by: gap:next-cache-tags-and-invalidation.</sub>

<a id="p079"></a>

## P079: Rebuild useClientCommitted on createClientStore

- **Status:** [x] done
- **Category:** client-data · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -22 / +8 in src/lib/use-client-committed.ts
- **Depends on:** —
- **Existing primitive:** `src/lib/client-store.ts:createClientStore,useClientStore`

**Problem.** src/lib/use-client-committed.ts re-implements, line for line, the store that src/lib/client-store.ts already provides (listener set, value, server snapshot, a guarded set-and-notify), so two copies of the same store primitive sit side by side in src/lib.

**Sites (7).**

- [`src/lib/use-client-committed.ts:1-36`](../../src/lib/use-client-committed.ts#L1-L36) — hand-rolled listeners/released/clientSnapshot/serverSnapshot/release + useSyncExternalStore and useEffect(release, [])
- [`src/lib/client-store.ts:23-45`](../../src/lib/client-store.ts#L23-L45) — createClientStore/useClientStore: same subscribe/get/serverValue/Object.is-guarded set
- [`src/lib/use-client-committed.test.ts:1-11`](../../src/lib/use-client-committed.test.ts#L1-L11) — SSR test: server snapshot renders 'held'
- [`src/components/composition/ServerStatus.tsx:55`](../../src/components/composition/ServerStatus.tsx#L55) — consumer
- [`src/components/composition/industry-workspace/StructuresManager.tsx:286`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L286) — consumer
- [`src/platform/auth/components/AuthProvider.tsx:18`](../../src/platform/auth/components/AuthProvider.tsx#L18) — consumer (also uses createClientStore for authStore at L11)
- [`src/mapper/windows/MapWindowLayer.tsx:236`](../../src/mapper/windows/MapWindowLayer.tsx#L236) — consumer

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/use-hydrating.ts:1-22`](../../src/lib/use-hydrating.ts#L1-L22) — per-component hydration flag with a no-op subscribe; deliberately not a global latch (doc explains why); different semantics
- [`src/features/industry-planner/recent-blueprints.ts:19-75`](../../src/features/industry-planner/recent-blueprints.ts#L19-L75) — localStorage-sourced snapshot with a raw-string cache; createClientStore's in-memory value does not fit
- [`src/features/search-recents/storage.ts:9-11, 93-119`](../../src/features/search-recents/storage.ts#L9-L11) — same localStorage-sourced shape as recent-blueprints; not this primitive

</details>

**Home.** `src/lib/use-client-committed.ts (keep the file and export; build it on src/lib/client-store.ts createClientStore/useClientStore)`

**Boundary check.** Both files are in the lib zone (src/lib/**), and an import within a zone is always allowed. The consumers keep importing '@/lib/use-client-committed', as today: components-composition (ServerStatus, StructuresManager) allows lib; platform/auth (AuthProvider) allows lib; mapper (MapWindowLayer) allows lib. No new edges.

**API sketch.**

```ts
import { useEffect } from 'react';
import { createClientStore, useClientStore } from './client-store';

const clientCommitted = createClientStore(false);

/** (keep existing doc comment) */
export function useClientCommitted(): boolean {
  const committed = useClientStore(clientCommitted);
  useEffect(() => { clientCommitted.set(true); }, []);
  return committed;
}
```

**Migration steps.**

1. In src/lib/use-client-committed.ts, delete `listeners`, `released`, `subscribe`, `clientSnapshot`, `serverSnapshot` and `release`.
2. Add `const clientCommitted = createClientStore(false);` (not exported, so Fallow unused-exports stays clean) and import createClientStore/useClientStore from './client-store'.
3. Replace the useSyncExternalStore call with `useClientStore(clientCommitted)` and the effect with `useEffect(() => { clientCommitted.set(true); }, [])`. Keep the existing doc comment verbatim.
4. Leave all four consumers untouched; the export name and signature do not change.
5. Run `pnpm check` through test-runner.

**Tests.** Keep src/lib/use-client-committed.test.ts (the server render stays 'held'). src/lib/client-store.test.ts already covers the Object.is guard, unsubscribe, and the server value after a publish. Optionally add a test that two Probe renders through renderToStaticMarkup both stay 'held' even after calling the hook's store set path; there is no DOM test environment (no jsdom or testing-library in package.json), so do not add a client-commit test.

**Notes.** No behavior differences. release()'s `if (released) return` equals set()'s Object.is guard on booleans, and both notify a copied listener list. Lead outside this id: features/search-recents/storage.ts and features/industry-planner/recent-blueprints.ts are two parallel localStorage-backed recents stores (safe storage accessor, cachedRaw/snapshot cache, listener set, push-to-head with dedupe and cap). They have drifted: recent-blueprints wraps setItem in try/catch (L70-74), while search-recents calls store.setItem unguarded (storage.ts L90), so a quota or security error throws from pushRecent. That is worth its own finding.

<sub>Reported by: gap:page-visibility-lifecycle-signal.</sub>

<a id="p061"></a>

## P061: Read the user in PreferencesProvider from ReadIdentity, not a second useSession

- **Status:** [x] done
- **Category:** react-hook · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -8 / +2
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/read-identity.ts:useReadIdentity, currentReadIdentity`

**Problem.** PreferencesProvider re-subscribes to better-auth's session to get user.id and mirrors it into userIdRef with a useEffect for its stable set() callback. That duplicates what AuthProvider publishes through the ReadIdentity store, which offers both a hook and a synchronous getter.

**Sites (9).**

- [`src/components/PreferencesProvider.tsx:50-60`](../../src/components/PreferencesProvider.tsx#L50-L60) — second authClient.useSession(); userIdRef plus copy effect
- [`src/components/PreferencesProvider.tsx:62-93`](../../src/components/PreferencesProvider.tsx#L62-L93) — load effect keyed on [loading, userId]
- [`src/components/PreferencesProvider.tsx:95-104`](../../src/components/PreferencesProvider.tsx#L95-L104) — set() reads userIdRef.current to decide on the server PUT
- [`src/platform/auth/components/AuthProvider.tsx:16-34`](../../src/platform/auth/components/AuthProvider.tsx#L16-L34) — canonical useSession; layout effect publishes ReadIdentity, then authStore
- [`src/platform/auth/read-identity.ts:10-24`](../../src/platform/auth/read-identity.ts#L10-L24) — useReadIdentity / currentReadIdentity; publish dedupes on userId+characterId
- [`src/platform/auth/components/auth-state.ts:26-44`](../../src/platform/auth/components/auth-state.ts#L26-L44) — characterId == null resolves to SIGNED_OUT, so ReadIdentity is null
- [`src/platform/auth/session-identity.ts:13-24`](../../src/platform/auth/session-identity.ts#L13-L24) — session characterId is null when there is no active character
- [`src/app/api/preferences/route.ts:17-31`](../../src/app/api/preferences/route.ts#L17-L31) — server keys preferences by userId only
- [`src/app/layout.tsx:82-83`](../../src/app/layout.tsx#L82-L83) — AuthProvider wraps PreferencesProvider

**Home.** `src/platform/auth/read-identity.ts (existing: useReadIdentity, currentReadIdentity)`

**Boundary check.** PreferencesProvider.tsx is in zone components (src/components/*.tsx). The components rule allows platform/auth, and the file already imports '@/platform/auth/components/AuthProvider'. The change removes the '@/platform/auth/auth-client' import and adds '@/platform/auth/read-identity'.

**API sketch.**

```ts
const { loading } = useAuth();
const userId = useReadIdentity()?.userId ?? null; // the string, so a character switch does not refetch
useEffect(() => { ... }, [loading, userId]);
const set = useCallback(function set<T>(def: PreferenceDef<T>, value: T) { ...; if (currentReadIdentity() !== null) void apiFetch(putPreferenceEndpoint, ...); }, []);
```

**Migration steps.**

1. In PreferencesProvider.tsx, replace `authClient.useSession()` with `const userId = useReadIdentity()?.userId ?? null;` and keep `useAuth().loading`.
2. Delete userIdRef and its copy effect (lines 57-60) and drop the useRef import.
3. In set(), replace `userIdRef.current` with `currentReadIdentity() !== null`.
4. Remove the authClient import.
5. Keep the load effect's dependencies as [loading, userId], with userId a string.

**Tests.** There is no behavioral test today; src/components/coverage.test.ts only imports the module. Add src/components/PreferencesProvider.test.ts in the repo's hook-mocking style. Mock '@/platform/auth/read-identity' (useReadIdentity, currentReadIdentity), '@/platform/auth/components/AuthProvider' (useAuth) and '@/transport/api-client' (apiFetch), and make react's useEffect a no-op. Call PreferencesProvider({children}) and take set from element.props.value. Assert that set() PUTs when currentReadIdentity() returns {userId:'u1',characterId:1} and only writes locally when it returns null.

**Notes.** Behavior differences to accept: (1) A session whose user has no active character (deriveSessionIdentity characterId null) is synced to the server today, because raw user.id is non-null. After the change it is local-only, which matches how AuthState (SIGNED_OUT) and every other ReadIdentity-gated read treat that session; this is an alignment, not a regression. (2) A set() made before AuthProvider settles may PUT today if better-auth data arrives first. After the change it is local-only until ReadIdentity publishes, and the reconcile on load may then let a server value win. That window is the pre-ready window (`ready` false) and negligible. (3) Ordering is safe: AuthProvider's layout effect calls publishReadIdentity before authStore.set, both flush in one sync render, so when loading flips false userId is already current and the effect runs once. currentReadIdentity() also updates earlier (layout effect) than today's ref (passive effect).

<sub>Reported by: concern:client-hooks.</sub>

<a id="p279"></a>

## P279: Make useChainFocusMenus depend on the stable menu callbacks so React Flow's memo chain holds

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about +3/−3 in use-chain-focus-menus.ts
- **Depends on:** —

**Problem.** useAuthoringMenus returns a fresh object every render. useChainFocusMenus passes the whole object as a dependency of onNodeContextMenu and onEdgeContextMenu, although the callbacks only use the stable openNodeMenu and openEdgeMenu. The handlers are rebuilt on every ChainLive render and passed to ReactFlow, whose renderer and wrapper components are memoised on those props. The result is that every NodeWrapper and EdgeWrapper re-renders on every unrelated ChainLive update (pilot tracking, Convex page deltas, tombstone ticks), even when no node or edge changed.

**Verifier revision.** I traced each claim to see what actually re-renders. The React Flow part is real but narrower than claimed. onNodeContextMenu and onEdgeContextMenu list the fresh `menus` object as a dependency, yet they only call menus.openNodeMenu and menus.openEdgeMenu, which are stable useCallbacks. They reach ReactFlow through MotionLayer and ChainSurface. In @xyflow/react 12.11.6, GraphView, NodeRenderer, EdgeRenderer, NodeWrapper and EdgeWrapper are all React.memo, and the handlers are passed as props down that chain. A new identity therefore re-renders every node and edge wrapper on each ChainLive render, for example on tracking updates (useLiveValue(api.mapTrackingLive.forMap)), Convex page updates, or the tombstone clock. The other ReactFlow handlers, onNodesChange and onNodeClick, are already stable, so menus is the only thing breaking the memo. The rest is refuted. Stabilising useChainAuthoringMutations changes no render and no effect, because nothing that consumes `authoring` is memoised: EdgeContextMenu, MapEventLog, SignatureWindow, ScannerWindowFrame, ScannerSections, ScannerSectionBlock and ActiveScannerPanel are plain components, and NodeAddMenu and HomePrompt get inline arrows. The scanner context memo lists `now` by design. Its only consumer is a fresh `cells` closure handed to a non-memo ScannerSectionBlock, and wormholeCells rebinds setters and scans origin leads per row inside render whatever the ctx identity. So F49's per-row cost is not touched by stabilising inputs, and it is O(rows × connections), which is small. Also, memoising useAuthoringMenus' return value would still churn, because that object includes nodeMenu, edgeMenu and panelTarget state; React Flow would get new handlers exactly when a menu opens or closes. Destructuring the stable callbacks is the correct fix.

**Sites (10).**

- [`src/mapper/chain/use-chain-focus-menus.ts:35-65`](../../src/mapper/chain/use-chain-focus-menus.ts#L35-L65) — Both handlers depend on [canEdit, menus] but use only menus.openNodeMenu and menus.openEdgeMenu.
- [`src/mapper/chain/use-authoring-menus.ts:38-69`](../../src/mapper/chain/use-authoring-menus.ts#L38-L69) — The open and close callbacks are useCallback([]) and stable. The returned object literal is new every render and also carries the nodeMenu, edgeMenu and panelTarget state.
- [`src/mapper/chain/ChainLive.tsx:67-95,131-142`](../../src/mapper/chain/ChainLive.tsx#L67-L95) — The menus from useAuthoringMenus flow into useChainFocusMenus, and the handlers into MotionLayer.
- [`src/mapper/chain/MotionLayer.tsx:14-52`](../../src/mapper/chain/MotionLayer.tsx#L14-L52) — Not memoised. Spreads the surface handlers into ChainSurface.
- [`src/mapper/canvas/ChainSurface.tsx:69-86`](../../src/mapper/canvas/ChainSurface.tsx#L69-L86) — Passes onNodesChange, onNodeClick, onNodeContextMenu and onEdgeContextMenu to ReactFlow.
- [`src/mapper/chain/use-chain-node-sync.ts:90-95`](../../src/mapper/chain/use-chain-node-sync.ts#L90-L95) — onNodesChange is useCallback([]) and stable, and onNodeClick (use-chain-focus-menus.ts:26-33) is stable too, so menus is the only thing breaking the memo.
- [`src/mapper/canvas/SystemNode.tsx:406`](../../src/mapper/canvas/SystemNode.tsx#L406) — memo(SystemNodeComponent), behind xyflow's memoised NodeWrapper.
- [`src/mapper/canvas/ChainLinkEdge.tsx:201`](../../src/mapper/canvas/ChainLinkEdge.tsx#L201) — memo(ChainLinkEdgeComponent), behind xyflow's memoised EdgeWrapper.
- [`src/mapper/tracking/use-tracked-system.ts:37-41`](../../src/mapper/tracking/use-tracked-system.ts#L37-L41) — Live tracking subscription read in ChainLive (line 99). Frequent re-renders that usually leave nodes unchanged.
- [`src/mapper/chain/use-map-chain-pages.ts:126-145`](../../src/mapper/chain/use-map-chain-pages.ts#L126-L145) — Tombstone clock that re-renders ChainLive while any connection is dying.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/chain/optimistic-authoring.ts:601-727`](../../src/mapper/chain/optimistic-authoring.ts#L601-L727) — It does return new functions every render (Convex's createMutation.withOptimisticUpdate allocates per call; node_modules/convex/dist/esm/react/client.js 26-44, 503-516). But no consumer of `authoring` is memoised or used in an effect, so stabilising it changes nothing. The cost is about 14 closures per render. Rejected.
- [`src/mapper/chain/use-chain-focus-menus.ts:67-77`](../../src/mapper/chain/use-chain-focus-menus.ts#L67-L77) — edgeActions only feeds EdgeContextMenu (ChainLive.tsx 181-188), which is not memoised, so its identity is irrelevant. Only its menus dependency needs narrowing, so the menus parameter type can shrink.
- [`src/mapper/authoring/MapAuthoringOverlay.tsx:34-50`](../../src/mapper/authoring/MapAuthoringOverlay.tsx#L34-L50) — The useCallback is inert because MapEventLog (src/mapper/log/MapEventLog.tsx:27) is not memoised. No benefit from a stable authoring.
- [`src/mapper/signatures/SignatureProvider.tsx:114-118`](../../src/mapper/signatures/SignatureProvider.tsx#L114-L118) — bindConnectionSetters(mapId, authoring) and [...connectionDetails.values()] are rebuilt each render, but they feed the non-memo SignatureWindow and ScannerWindowFrame. Memoising them saves nothing measurable.
- [`src/mapper/signatures/SignatureWindow.tsx:90-99`](../../src/mapper/signatures/SignatureWindow.tsx#L90-L99) — identifyRow is recreated, but its consumer ScannerWindowFrame (scanner-window-frame.tsx 105-182) is not memoised.
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:76-131,203-215,272`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L76-L131) — The ctx memo lists `now` by design. wormholeCells binds setters (211) and calls originLeadsOf (272) per row during render regardless of ctx identity, so stabilising inputs does not remove that work.
- [`src/mapper/signatures/scanner-section-table.tsx:279-305`](../../src/mapper/signatures/scanner-section-table.tsx#L279-L305) — Its only ctx consumer is `cells={(row) => sectionCells(section.id, row, ctx)}`, a fresh closure each render, passed to the non-memo ScannerSectionBlock (135-159).
- [`src/mapper/signatures/ActiveSignatureEditor.tsx:75-79,143`](../../src/mapper/signatures/ActiveSignatureEditor.tsx#L75-L79) — A single-connection editor. The spread is O(connections) once per render, and setters are rebound inline at 143 anyway. Negligible.

</details>

**Home.** `src/mapper/chain/use-chain-focus-menus.ts (in place; no new primitive)`

**Boundary check.** Mapper zone only (src/mapper/chain). Only the type import of AuthoringMenus from ./use-authoring-menus is used, so no new imports or cross-zone edges are added.

**API sketch.**

```ts
export function useChainFocusMenus(
  canEdit: boolean | undefined,
  menus: Pick<AuthoringMenus, 'openNodeMenu' | 'openEdgeMenu' | 'setEditingConnectionId' | 'closeEdgeMenu'>,
  mapId: string,
  authoring: ChainAuthoringMutations,
  focusTokenRef: RefObject<number>,
  setFocusRequest: (request: CameraFocusRequest | null) => void,
): { edgeActions; onEdgeContextMenu; onNodeClick; onNodeContextMenu }
// inside: const { openNodeMenu, openEdgeMenu, setEditingConnectionId, closeEdgeMenu } = menus;
// onNodeContextMenu deps [canEdit, openNodeMenu]; onEdgeContextMenu deps [canEdit, openEdgeMenu];
// edgeActions deps [mapId, authoring, setEditingConnectionId, closeEdgeMenu]
```

**Migration steps.**

1. Per AGENTS.md, get a docs-researcher brief on React Flow's handler and memo guidance and on React's useCallback before editing.
2. In src/mapper/chain/use-chain-focus-menus.ts, narrow the `menus` parameter to a Pick of the four stable callbacks and destructure them at the top of the hook.
3. Change the dependencies of onNodeContextMenu (line 46) to [canEdit, openNodeMenu] and of onEdgeContextMenu (line 64) to [canEdit, openEdgeMenu], and call the destructured functions in the bodies.
4. Change the edgeActions useMemo to use and depend on setEditingConnectionId and closeEdgeMenu instead of menus. Leave authoring as is: its consumer is not memoised, so stabilising it buys nothing.
5. ChainLive.tsx needs no change; passing the full `menus` object still satisfies the Pick type. Do not wrap useAuthoringMenus' return value in useMemo, because it carries menu state and would still change whenever a menu opens.
6. Do not memoise useChainAuthoringMutations or the SignatureProvider, SignatureWindow and ActiveSignatureEditor values; there is no consumer that benefits.
7. Verify by profiling the atlas with React DevTools: with a stable map and a tracking update, NodeWrapper and EdgeWrapper should no longer re-render. Then run pnpm check through test-runner.

**Tests.** The repo has no hook-testing tooling (no @testing-library, and tests render with renderToStaticMarkup), so handler identity cannot be unit-tested cheaply. The guards are react-hooks/exhaustive-deps from eslint-config-next core-web-vitals, which the destructured dependencies satisfy, and the existing ChainHost.test.ts rendering of ChainLive. Optionally, a test could spy on the ChainSurface props across two client renders, but that needs a DOM environment the suite does not use today, so it is not recommended.

**Notes.** The evidence for the memo chain is in node_modules/@xyflow/react/dist/esm/index.js (12.11.6). NodeWrapper is memo at 2368 and NodeRenderer at 2411; EdgeWrapper at 3045 and EdgeRenderer at 3062; GraphView at 3276. ReactFlow passes onNodeContextMenu and onEdgeContextMenu into GraphView at 3775, and NodeRenderer forwards them as NodeWrapper onContextMenu at 2407. nodes and edges go through StoreUpdater, not GraphView, so with stable handlers GraphView skips entirely when ChainLive re-renders. The React Compiler is not enabled (next.config.ts and package.json have no compiler entry), so manual dependencies are what count. The behavior of the handlers is unchanged; only their identity is. F27's root-cause claim is technically true, but its effect does not matter: no consumer is memoised. F49's recommendation to delete the inert memos (useWormholeCellContext, restoreFromEvent) is an optional cleanup, not part of this change.

<sub>Reported by: area:mapper-chain, area:mapper-signatures.</sub>

<a id="p080"></a>

## P080: Read the board in the industry workspace only when a member sheet is open

- **Status:** [x] done
- **Category:** client-data · **Kind:** efficiency · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -6 / +5 in ProfileWorkspace.tsx; +10 in the test
- **Depends on:** —
- **Existing primitive:** `src/components/composition/board/use-board-live.ts:useBoardLive; src/components/use-live-dataset.ts:useLiveDataset`

**Problem.** The industry landing fetches the heaviest account read, /api/account/board (every pilot's raw datasets, name book, net-worth history, after() refresh of four datasets, and up to five cold reconciles), on every view. Its result feeds only the identity header of an opened member sheet, which the default overview never renders.

**Sites (12).**

- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:224-228`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L224-L228) — useBoardLive() unconditional in ProfileWorkspaceBody
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:272`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L272) — only board.response.characters and board.now are used, passed as data
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:122-130, 150-176`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L122-L130) — BoardData.characters/now; consumed only in the member branch through OpenMember
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:281-321`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L281-L321) — OpenMember forwards character/now to MemberSheet; keyed by profile:member, so it remounts per open
- [`src/components/composition/industry-workspace/MemberDetail.tsx:91-137, 146-200`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L91-L137) — MemberHeader/CharacterIdentity is the only consumer; falls back to pending identity when character is null
- [`src/components/composition/board/use-board-live.ts:7-13`](../../src/components/composition/board/use-board-live.ts#L7-L13) — useLiveDataset(boardEndpoint) with a 5-step cold reconcile schedule
- [`src/components/use-live-dataset.ts:23-33, 46-50`](../../src/components/use-live-dataset.ts#L23-L33) — per-endpoint remembered memory, so a later open draws a previously loaded board at once
- [`src/composition/board/board-view.ts:25-70, 93-115`](../../src/composition/board/board-view.ts#L25-L70) — readRaws fan-out, after(refreshBoardDatasets), name book and net-worth history
- [`src/app/api/account/industry-slots/route.ts:26-44`](../../src/app/api/account/industry-slots/route.ts#L26-L44) — the landing's skills read already triggers its own on-view skills refresh
- [`src/composition/sync/skills-sync.ts:48-57`](../../src/composition/sync/skills-sync.ts#L48-L57) — getSkillLevelsForUserOnView → after(refreshSkillsOnView)
- [`src/composition/sync/industry-jobs-sync.ts:47-55`](../../src/composition/sync/industry-jobs-sync.ts#L47-L55) — jobs feed refreshes jobs on view; the board's jobs refresh is redundant here
- [`src/components/composition/industry-workspace/ProfileWorkspace.test.ts:56-61, 270-327`](../../src/components/composition/industry-workspace/ProfileWorkspace.test.ts#L56-L61) — mocks useBoardLive; pins live, unlinked and pending identity on an open member

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/LiveBoard.tsx:11`](../../src/components/composition/board/LiveBoard.tsx#L11) — home board legitimately needs the full board

</details>

**Home.** `src/components/composition/industry-workspace/ProfileWorkspace.tsx (move the existing useBoardLive call into OpenMember; no new primitive)`

**Boundary check.** ProfileWorkspace.tsx and use-board-live.ts are both in the components-composition zone (src/components/composition/**), so the import is intra-zone. useBoardLive's own imports (composition for boardEndpoint, components for useLiveDataset) are already allowed by the components-composition rule (allow: composition, components, ...). No new edges.

**API sketch.**

```ts
function OpenMember({ controls, doc, member, levels, capacities, onBack, backRef, onEdit, onRemove }: {...without character/now}) {
  const board = useBoardLive();
  const character = board.response?.characters.find((c) => c.characterId === member.characterId) ?? null;
  return <MemberSheet character={character} now={board.now} ... />;
}
interface BoardData { roster; capacities; levels; structures; hulls } // characters/now removed
```

**Migration steps.**

1. In ProfileWorkspace.tsx, remove `const board = useBoardLive();` from ProfileWorkspaceBody (L226) and drop `characters` and `now` from the data object at L272.
2. Remove `characters` and `now` from the BoardData interface (L122-130) and the `character={...}`/`now={data.now}` props passed to OpenMember (L165-166).
3. In OpenMember, drop the `character` and `now` props, call `useBoardLive()`, and derive `character` by finding member.characterId in `board.response?.characters` (null when absent). Pass `board.now` as now. Keep MemberHeader's existing `member.linked && character !== null` guard, so unlinked members never use board data.
4. Keep the import of useBoardLive (now used only by OpenMember) and the BoardCharacter type import.
5. Update ProfileWorkspace.test.ts: make the useBoardLive mock a hoisted vi.fn, and assert it is not called when rendering the overview (no `character` param) and is called when `character=` opens a member. The existing live, unlinked and pending identity assertions must pass unchanged.
6. Check by hand with the dev server: open a member from the rail when the home board has not loaded yet. The portrait morph (pilotTransitionName) still runs because the fallback identity keeps the same characterId, and the corporation, alliance and status lines fill in once the board answers.

**Tests.** ProfileWorkspace.test.ts: add 'the overview does not read the account board' (useBoardLive mock not called without a member param) and 'opening a member reads the account board' (called once with character=<id>). Keep the identity block at L270-327, which guards the live, unlinked-stale and pending identity states.

**Notes.** Tradeoff to keep in mind: useCapacities' doc says 'Selecting a portrait reads nothing new' (L59-62, written before the board read was added). After the move, opening a member does trigger one board GET (and its after() refresh, which the per-pilot freshness gates make cheap). Because OpenMember is keyed by `${profile.id}:${member.characterId}`, each open re-runs the load effect. The per-endpoint memory draws any earlier board response at once, so only the first open in a session shows pending identity details. If the owner wants zero reads on select, the alternative is a slim identity read (corporation, alliance, profile, status). Do not keep the full board on the landing. Do not add an `enabled` flag to the shared useLiveDataset for this one consumer; moving the hook is enough.

<sub>Reported by: area:components-composition, concern:efficiency.</sub>

<a id="p155"></a>

## P155: Render LoadFailed with useLiveDataset's retry in LiveBoard and delete BOARD_LOAD_FAILED

- **Status:** [x] done
- **Category:** error-handling · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** -3/+6 in LiveBoard.tsx, -1 in board-view-model.ts, +~40 new test
- **Depends on:** —
- **Existing primitive:** `src/components/ui/load-failed.tsx:LoadFailed`

**Problem.** When the home board's first read fails both automatic attempts, LiveBoard shows 'Couldn’t load your characters — reload the page to try again.' as a dead-end warn Banner, although useBoardLive (useLiveDataset) already returns retry. The two sibling live-dataset consumers render the LoadFailed primitive with click-to-retry.

**Sites (9).**

- [`src/components/composition/board/LiveBoard.tsx:10-16`](../../src/components/composition/board/LiveBoard.tsx#L10-L16) — line 13: response === null -> <Banner tone="warn">{BOARD_LOAD_FAILED}</Banner>; retry never read
- [`src/components/composition/board/board-view-model.ts:19`](../../src/components/composition/board/board-view-model.ts#L19) — BOARD_LOAD_FAILED says to reload the page; its only consumer is LiveBoard
- [`src/components/composition/board/use-board-live.ts:11-13`](../../src/components/composition/board/use-board-live.ts#L11-L13) — returns useLiveDataset's full result, including failed and retry
- [`src/components/use-live-dataset.ts:13-21, 103-114`](../../src/components/use-live-dataset.ts#L13-L21) — LiveDatasetState.retry; loading = response === null && !failed
- [`src/lib/live-dataset.ts:36-39`](../../src/lib/live-dataset.ts#L36-L39) — loadFailureStep returns 'keep' once data is loaded, so failed is set only while response is null
- [`src/components/ui/load-failed.tsx:9-30`](../../src/components/ui/load-failed.tsx#L9-L30) — the primitive: title, detail?, retryLabel, onRetry
- [`src/features/industry-jobs/components/IndustryJobsPanel.tsx:22-33`](../../src/features/industry-jobs/components/IndustryJobsPanel.tsx#L22-L33) — sibling live-dataset consumer using LoadFailed + retry
- [`src/features/industry-jobs/components/CorpJobsBoard.tsx:47-58`](../../src/features/industry-jobs/components/CorpJobsBoard.tsx#L47-L58) — sibling live-dataset consumer using LoadFailed + retry
- [`src/components/composition/board/HomeBoardView.test.ts:118-133`](../../src/components/composition/board/HomeBoardView.test.ts#L118-L133) — covers only LiveBoard's loading branch; no failure-path test exists

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:346-351`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L346-L351) — uses LoadFailed, but its data comes from useIndustryProfiles (state.refresh), not useLiveDataset; a copy-style precedent, not a live-dataset consumer

</details>

**Home.** `src/components/ui/load-failed.tsx:LoadFailed (existing)`

**Boundary check.** LiveBoard.tsx is in components-composition (src/components/composition/**). Rule `from: components-composition` allows ui, so importing '@/components/ui/load-failed' is legal. No other imports change; the Banner import is removed.

**API sketch.**

```ts
export function LiveBoard({ mainId }: { mainId: number }) {
  const { response, now, loading, retry } = useBoardLive();
  if (loading) return <BoardSkeleton />;
  if (response === null) {
    return <LoadFailed title="Your characters didn't load" retryLabel="Retry loading your characters" onRetry={retry} />;
  }
  if (response.characters.length === 0) return <BoardEmpty />;
  return <HomeBoardView board={response} now={now} mainId={mainId} />;
}
```

**Migration steps.**

1. In LiveBoard.tsx, destructure retry from useBoardLive(), replace the Banner arm with LoadFailed (title and retryLabel in the 'X didn't load' / 'Retry loading X' voice of the jobs panels), and drop the Banner and BOARD_LOAD_FAILED imports.
2. Delete BOARD_LOAD_FAILED from board-view-model.ts:19; otherwise fallow unused-exports flags it.
3. Keep the `response === null` guard rather than `if (failed)`. It narrows response for the lines below, and given loading's definition it is true exactly when failed. A later failure with data on screen keeps the board, as useLiveDataset intends.
4. Add the failure-path test, then run pnpm check through test-runner.

**Tests.** Add src/components/composition/board/LiveBoard.test.ts following IndustryJobsPanel.test.ts:7-46,120-133. vi.mock('./use-board-live') with a hoisted controllable return. Assert: loading renders the skeleton ('Loading your characters'); response null + failed renders the LoadFailed title and retry label; invoking the element's onRetry calls the mocked retry once; an empty characters list renders BoardEmpty. Keep the separate file so HomeBoardView.test.ts:130-132 (real hook, loading state) is unaffected.

**Notes.** This is a user-visible fix: a failed board read now offers in-place retry instead of telling the pilot to reload. retry() clears failure and bumps attempts, so the board drops back to the skeleton while it reloads (loading = response === null && !failed), matching the jobs panels. The dead-end copy came from the board predating the retry and LoadFailed commit (26b9a94), which migrated only the jobs consumers.

<sub>Reported by: area:components-composition.</sub>

<a id="p097"></a>

## P097: Render slot pools with one poolFigure encoding in the industry workspace

- **Status:** [x] done
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -8 production lines; +15 test lines
- **Depends on:** —
- **Existing primitive:** `src/components/composition/industry-workspace/workspace-model.ts:poolFigure`

**Problem.** The industry workspace formats the same PoolSummary in two encodings. ProductionCapacity's capacityCount always shows used/total, with '?' for unknown usage, and its legend explains that. workspace-model's poolFigure, used by the team table, drops the used figure when usage is unknown. A member with 8 known slots and an unread job feed therefore reads '?/8' in its member panel and '8' in its team-table row. The capacity half of the two functions is logically identical, written twice with different branch order.

**Verifier revision.** Two formatters do encode the same PoolSummary differently, and the same member reads differently on different screens. The capacity half is not drifted, though: the finder's claim that the '+' rules differ is wrong. Both produce '?' when unknownCapacity>0 && capacity===0, 'N+' when capacity is partly known, and 'N' when it is fully known. Only the used half differs. poolFigure drops the used figure when unknownUsed>0 or when capacity is wholly unknown. capacityCount always prints used/total, with '?' for unknown usage. The team table calls poolSummaries([one id]) per row, so it never shows '+'. The real inconsistencies are:
- One member with skills synced and jobs unknown reads '8' in its team-table row (ProfileOverview) and '?/8' in its own ProductionCapacity panel (MemberDetail:188).
- On the overview, the panel reads '?/8+' while the rows read '8' and '?'.
ProfileOverview's doc comment (81-84) documents the terse table encoding on purpose, so which encoding wins is a product call and the scope must say so. poolFigure has no unit test, while the panel encoding is pinned by ProfileWorkspace.test.ts.

**Sites (8).**

- [`src/components/composition/industry-workspace/workspace-model.ts:159-167`](../../src/components/composition/industry-workspace/workspace-model.ts#L159-L167) — poolFigure and its doc comment. The capacity branch matches capacityCount; the used branch returns capacity alone when unknownUsed>0 or capacity is wholly unknown. No unit test.
- [`src/components/composition/industry-workspace/workspace-model.ts:139-157`](../../src/components/composition/industry-workspace/workspace-model.ts#L139-L157) — poolSummaries. A single-member summary has unknownCapacity in {0,1} with capacity 0 when unknown, so '+' never shows in the team table.
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:15-21`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L15-L21) — capacityCount: always `${used}/${total}`, with '?' for used when unknownUsed>0
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:55, 62-67`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L55) — call site and the '? = not yet known. + = additional capacity still syncing.' legend
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:70-84, 94-98`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L70-L84) — team table cells use poolFigure on per-member summaries; the doc comment at 81-84 documents 'used over total when jobs are known, total alone otherwise'
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:143-144`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L143-L144) — ProductionCapacity panel rendered directly above the team table
- [`src/components/composition/industry-workspace/MemberDetail.tsx:188`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L188) — the same member's own panel goes through capacityCount ('?/8' where its team row reads '8')
- [`src/components/composition/industry-workspace/ProfileWorkspace.test.ts:193, 208, 247, 253-261`](../../src/components/composition/industry-workspace/ProfileWorkspace.test.ts#L193) — pins the panel encoding: '?/8+', '?/?', '?/11', '3/11', '2/7', '1/3'. Nothing pins poolFigure's output.

**Home.** `src/components/composition/industry-workspace/workspace-model.ts (keep the existing exported poolFigure)`

**Boundary check.** Every site is in the components-composition zone (src/components/composition/**) and imports through relative './workspace-model'. ProductionCapacity.tsx already imports from workspace-model.ts, so no zone boundary is crossed and no rule is involved.

**API sketch.**

```ts
export function poolFigure(pool: PoolSummary): string
// used/total; used is '?' when any member's jobs are unknown; total is '?' when nothing is known, 'N+' when partly known, 'N' when fully known
```

**Migration steps.**

1. Settle the encoding with the owner. The recommendation is used/total everywhere (the capacityCount encoding): the visible legend documents it and ProfileWorkspace.test.ts pins it.
2. Rewrite poolFigure in workspace-model.ts to capacityCount's logic and update its doc comment (159-162).
3. In ProductionCapacity.tsx, delete capacityCount (15-21), import poolFigure from './workspace-model', and call poolFigure(pools[pool]) at line 55.
4. Update the TeamSkillsPanel doc comment in ProfileOverview.tsx (81-84) to say slots read used over total, with '?' for unknown.
5. If the owner instead wants the terse table, keep both encodings but share the capacity half: export poolTotal(pool) from workspace-model.ts, have poolFigure and the panel both build on it, and pin both in tests. Do not keep two independent copies.

**Tests.** Add poolFigure cases to src/components/composition/industry-workspace/workspace-model.test.ts:
- fully known {capacity 10, used 3} -> '3/10'
- usage unknown {capacity 10, unknownUsed 1} -> '?/10'
- partly known capacity {capacity 3, unknownCapacity 1, unknownUsed 2} -> '?/3+'
- nothing known -> '?/?'
- capacity unknown, usage known -> 'used/?'
Existing guards that must stay green: ProfileWorkspace.test.ts 193, 208, 247 and 253-261. Optionally assert the team-table cell in the 'team' render reads '?/8'.

**Notes.** The '+' handling is already equivalent in both copies, so there is no drift there. The only visible change is in team-table rows where jobs are unknown: '8' becomes '?/8', and a member with known usage but unknown capacity changes from '?' to 'n/?'. Unlinked members keep rendering '—' in the table, and ProductionCapacity keeps its own unlinked-member message.

<sub>Reported by: area:components-composition.</sub>

<a id="p171"></a>

## P171: Count board used slots with countUsedSlots instead of a local filter

- **Status:** [x] done
- **Category:** server-pipeline · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -2 / +4
- **Depends on:** —
- **Existing primitive:** `src/features/industry-jobs/slots.ts:countUsedSlots`

**Problem.** board-assemble's mapIndustry derives used slots with its own rule: every job whose status occupies a slot, with no category check and no job_id dedupe. It also sums the three capacities by hand. The industry workspace uses countUsedSlots from features/industry-jobs/slots.ts. The two agree on today's data, but the slot rule now lives in two places, and a change to slots.ts (for example a new activity, or corp jobs once the board has them) would not reach the board tile.

**Verifier revision.** The bypass is real. mapIndustry counts used slots as statuses.filter(jobOccupiesSlot).length over every personal job, instead of calling the slot module's own countUsedSlots. The claimed visible divergence is overstated, though. Every activity ESI reports today (1, 3, 4, 5, 8, 9, 11) maps to a slot category, and activity 7 (reverse engineering) has been retired, so the category rule gives the same number for real data. The board has no corp-job feed, and slots.ts itself says it is not established whether corp-installed jobs are missing from the personal feed. The actual win is a single 'used slots' rule (category plus job_id dedupe), not a corrected number. The proposed exported totalUsedSlots and totalSlotCapacity helpers would each have one consumer, so the category summing should stay local to board-assemble, in line with AGENTS.md's real-second-consumer rule.

**Sites (6).**

- [`src/composition/board/board-assemble.ts:336-351`](../../src/composition/board/board-assemble.ts#L336-L351) — mapIndustry: used = statuses.filter(jobOccupiesSlot).length; max = manufacturing + science + reactions, summed inline
- [`src/composition/board/board-assemble.ts:453-455`](../../src/composition/board/board-assemble.ts#L453-L455) — caller; identity.characterId is in scope (line 431)
- [`src/features/industry-jobs/slots.ts:36-63`](../../src/features/industry-jobs/slots.ts#L36-L63) — jobOccupiesSlot and countUsedSlots: category-gated, deduped by job_id, corp jobs filtered by installer_id
- [`src/features/industry-jobs/industry-jobs-styles.ts:18-31`](../../src/features/industry-jobs/industry-jobs-styles.ts#L18-L31) — jobCategory returns null only for activities outside 1/3/4/5/8/9/11
- [`src/components/composition/industry-workspace/workspace-model.ts:120-127`](../../src/components/composition/industry-workspace/workspace-model.ts#L120-L127) — workspace uses countUsedSlots with corp jobs
- [`src/composition/board/board-assemble.test.ts:358-364`](../../src/composition/board/board-assemble.test.ts#L358-L364) — pins used 2 / max 7 (an active job past its end counts as ready; delivered holds no slot)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/board-view-model.ts:453-454`](../../src/components/composition/board/board-view-model.ts#L453-L454) — Sums the per-pilot slots.used and slots.max across pilots. This aggregates the board's numbers rather than re-deriving them, so it is not a bypass.
- [`src/app/api/account/industry-slots/route.ts:36-43`](../../src/app/api/account/industry-slots/route.ts#L36-L43) — Uses slotCapacity correctly; it reports capacity only, not usage.

</details>

**Home.** `Use the existing src/features/industry-jobs/slots.ts countUsedSlots. Keep a local sum over JobCategory in src/composition/board/board-assemble.ts; no new export.`

**Boundary check.** board-assemble.ts is in the composition zone. The 'from: composition' rule allows 'features', and the file already imports jobOccupiesSlot and slotCapacity from @/features/industry-jobs/slots and deriveJobStatus from @/features/industry-jobs/job-state. Importing countUsedSlots and the JobCategory type from the same feature is therefore legal.

**API sketch.**

```ts
// board-assemble.ts (local)
const slotTotal = (r: Readonly<Record<JobCategory, number>>) => r.manufacturing + r.science + r.reactions;
function mapIndustry(data: CharacterJobsData, levels: Record<string, number> | null, now: number, characterId: number): BoardIndustryData
// slots: { used: slotTotal(countUsedSlots(characterId, data.jobs, [])), max: slotTotal(slotCapacity(levels)) }
```

**Migration steps.**

1. Add a characterId parameter to mapIndustry and pass identity.characterId from assembleBoardCharacter (line 454).
2. Replace `used: statuses.filter(jobOccupiesSlot).length` with slotTotal(countUsedSlots(characterId, data.jobs, [])). Pass [] because the board has no corp-job feed. Comment that corp jobs should be passed in once the board reads them.
3. Replace the inline capacity sum with slotTotal(capacity).
4. Keep `statuses` (deriveJobStatus) for the active and ready counts. Slot occupancy does not depend on deriving 'ready', because active, ready and paused all occupy a slot.
5. Remove the jobOccupiesSlot import from board-assemble if nothing else there uses it. It stays exported because countUsedSlots uses it and slots.test.ts tests it.

**Tests.** Existing guards that must pass unchanged: board-assemble.test.ts 358-364 (used 2, max 7) and board-view.db.test.ts around line 426. Add a board-assemble case with an activity outside the slot categories (for example activity_id 7) and a duplicated job_id. Both should leave used unchanged, pinning the shared rule. slots.test.ts countUsedSlots (line 52 onward) already covers dedupe, category gating and installer filtering.

**Notes.** No visible change is expected on current ESI data. Do not describe this as a number fix. countUsedSlots reads the raw ESI status, while the board derives status for its active and ready counts. Both are correct for their purpose: an active job past its end and a ready job both occupy a slot. If the board later gets the corp feed, passing it in makes the board and the workspace agree on corp-installed jobs without any further code change.

<sub>Reported by: area:features-owned.</sub>

<a id="p330"></a>

## P330: Retire the stale tracking codemod, tokenize its three leftovers, and fix the IPv6 loopback checks in scripts/

- **Status:** [x] done
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 for the deleted .py, -8 for the duplicate helpers and FlatMap, +6 for loopback.mjs, three one-token class edits, and about +10 test lines
- **Depends on:** —
- **Existing primitive:** `scripts/profile-parse.mjs`

**Problem.** scripts/tokenize_tracking.py still maps four values to tracking-ui, tracking-control, tracking-emphasis and tracking-display. globals.css no longer defines those tokens, and eslint.config.mjs:76-89 bans them, so running the script now would introduce lint errors. Three call sites still use arbitrary values equal to live tokens: 0.04em is copy, 0.08em is label, 0.12em is wide. scripts/profile-parse.mjs lists '::1' in LOOPBACK_HOSTS, but the host comes from URL.hostname, which is '[::1]'. An IPv6 loopback DATABASE_URL is therefore refused as non-local. scripts/run-e2e-guard.mjs has no IPv6 entry at all, so http://[::1]:3000 is treated as remote. Both checks fail closed (false refusals, not a safety hole); src/lib/url-safety.ts has the correct set. validate-resolver-output.ts redeclares FlatMap although it already imports from ./resolver-fixtures. timestampSlug and the profile output dir are copied in both profile scripts.

**Verifier revision.** Partly holds. These parts check out: the codemod is stale, three arbitrary tracking values match existing tokens, the '::1' loopback entry can never match because URL.hostname returns '[::1]' (checked in node), run-e2e-guard has no IPv6 check, and FlatMap is redeclared. The proposed 'shared profile helpers' part is mostly refuted. The signal handlers and persist-with-fallback blocks only look alike: their bodies and fallback result shapes do different things. The errorMessage drift is not a bug, because profile-sites-dev itself uses the message form for structured request and write errors and the stack form for uncaught faults. Only timestampSlug and the output dir are true duplicates, and they are one line each.

**Sites (13).**

- [`scripts/tokenize_tracking.py:1-45`](../../scripts/tokenize_tracking.py#L1-L45) — Stale one-shot codemod. Lines 15-24 map to tracking-ui, control, emphasis and display, which are retired. No references anywhere in the repo.
- [`eslint.config.mjs:76-89`](../../eslint.config.mjs#L76-L89) — legacyTypeRoleSelectors bans exactly the four tokens the codemod emits.
- [`src/app/globals.css:355-359`](../../src/app/globals.css#L355-L359) — Live tracking scale: optical 0.01, copy 0.04, label 0.08, wide 0.12, eyebrow 0.18.
- [`src/features/wormhole-sites/components/SiteCardHeader.tsx:55`](../../src/features/wormhole-sites/components/SiteCardHeader.tsx#L55) — tracking-[0.04em] should be tracking-copy.
- [`src/features/changelog/components/EntryCard.tsx:18`](../../src/features/changelog/components/EntryCard.tsx#L18) — tracking-[0.08em] should be tracking-label.
- [`src/app/(site)/sites/[id]/page.tsx:73`](../../src/app/%28site%29/sites/[id]/page.tsx#L73) — tracking-[0.12em] should be tracking-wide.
- [`scripts/profile-parse.mjs:6, 164-182`](../../scripts/profile-parse.mjs#L6) — LOOPBACK_HOSTS has '::1'. parseDatabaseTarget stores url.hostname, which is '[::1]' for IPv6 (checked with node), so isLocalDatabaseTarget never matches it.
- [`scripts/run-e2e-guard.mjs:1-8`](../../scripts/run-e2e-guard.mjs#L1-L8) — isLocalBaseUrl accepts only localhost and 127.0.0.1.
- [`src/lib/url-safety.ts:1-12`](../../src/lib/url-safety.ts#L1-L12) — Correct reference set ['localhost','127.0.0.1','[::1]']. [::1] is already tested in src/lib/convex-service-door.test.ts:14.
- [`scripts/validate-resolver-output.ts:49-53, 71`](../../scripts/validate-resolver-output.ts#L49-L53) — Already imports from ./resolver-fixtures but redeclares type FlatMap at line 71.
- [`scripts/resolver-fixtures.ts:26`](../../scripts/resolver-fixtures.ts#L26) — export type FlatMap = Record<string, number>
- [`scripts/profile-sites-dev.mjs:33, 88-90`](../../scripts/profile-sites-dev.mjs#L33) — PROFILE_DIR and timestampSlug, identical to the suite's copies.
- [`scripts/profile-sites-suite.mjs:7, 23-25`](../../scripts/profile-sites-suite.mjs#L7) — PROFILE_DIR and timestampSlug, identical copies. The suite already imports profile-parse.mjs at line 4.

<details><summary>Excluded sites (not the same concept)</summary>

- [`scripts/profile-sites-dev.mjs:567-572`](../../scripts/profile-sites-dev.mjs#L567-L572) — The signal handler requests an abort and cleans up the process group. The suite's handler (suite:170-175) records interruptedBy and kills the child. Only the three-line for loop is shared, so it is not worth a helper.
- [`scripts/profile-sites-dev.mjs:511-528`](../../scripts/profile-sites-dev.mjs#L511-L528) — On write failure, persistResult rebuilds an 'aborted' result through shapeProfileResult with an output-write-failed reason. The suite's persistSuite (suite:141-154) spreads status 'failed'. The fallbacks differ; only the mkdir and writeFile lines match.
- [`scripts/profile-sites-dev.mjs:507-509, 577, 593`](../../scripts/profile-sites-dev.mjs#L507-L509) — Not drift: the dev script uses the message form for structured request and output errors (lines 400 and 521) and the stack form for uncaught or unexpected faults. The suite (65-67) always uses the stack form. Leave both as they are.
- [`src/components/ui/callout.tsx:17`](../../src/components/ui/callout.tsx#L17) — tracking-[0.03em] has no token. The same applies to Footer.tsx:10,17 (0.03em), HeroBanner.tsx:4 (-0.02em) and :9 (0.28em), and GlobalSearch.tsx:204 (0.07em).
- [`src/scripts/sde-seed-cache.ts:226`](../../src/scripts/sde-seed-cache.ts#L226) — '127.0.0.1' is a psql host argument, not a loopback check.

</details>

**Home.** `New scripts/loopback.mjs for isLoopbackHostname (two consumers). scripts/profile-parse.mjs, which both profilers already import, for timestampSlug and PROFILE_DIR_NAME. The tokens already exist in src/app/globals.css.`

**Boundary check.** Top-level scripts/ is outside every fallow zone: the 'scripts' zone is src/scripts/** only, and scripts/** is in boundaries.coverage.allowUnmatched. The .mjs scripts run under plain node (Node 22.22 locally, Node 24 in CI per .github/actions/setup-node-pnpm). They could import src/lib/url-safety.ts via type stripping, but that breaks if url-safety ever gains an @/ alias import, so the loopback set stays a scripts-local module. The three tracking edits change only class strings in their own files (app zone page.tsx, features zone components) and add no imports.

**API sketch.**

```ts
// scripts/loopback.mjs
export const LOOPBACK_HOSTNAMES = Object.freeze(['localhost', '127.0.0.1', '[::1]']);
export function isLoopbackHostname(hostname) { return LOOPBACK_HOSTNAMES.includes(hostname); }
// scripts/profile-parse.mjs (optional additions)
export const PROFILE_DIR_NAME = '.local/site-profiles';
export function timestampSlug(iso) { return iso.replace(/[-:.]/g, ''); }
```

**Migration steps.**

1. Delete scripts/tokenize_tracking.py. Nothing references it, and it now emits banned utilities.
2. Replace tracking-[0.04em] with tracking-copy (SiteCardHeader.tsx:55), tracking-[0.08em] with tracking-label (EntryCard.tsx:18) and tracking-[0.12em] with tracking-wide (sites/[id]/page.tsx:73).
3. Optional, recommended now that the codemod is gone: add a Literal and TemplateElement selector to legacyTypeRoleSelectors (eslint.config.mjs:76-89) for tracking-\[0?\.(01|04|08|12|18)em\], with a message that names the matching token. Use P334's literalAndTemplate helper if it lands first.
4. Add scripts/loopback.mjs. In profile-parse.mjs, delete LOOPBACK_HOSTS (line 6) and use isLoopbackHostname(database.host) in isLocalDatabaseTarget. In run-e2e-guard.mjs, have isLocalBaseUrl return isLoopbackHostname(new URL(baseUrl).hostname) inside the existing try/catch.
5. In validate-resolver-output.ts, delete line 71 and add `type FlatMap` to the existing './resolver-fixtures' import at lines 49-53.
6. Optional: export timestampSlug and PROFILE_DIR_NAME from profile-parse.mjs. Import them in both profilers (PROFILE_DIR = path.join(ROOT, PROFILE_DIR_NAME)) and delete dev:88-90 and suite:23-25. Leave the signal handlers, persist functions, errorMessage and diagnostic alone.

**Tests.** Add to scripts/profile-parse.test.mjs (next to lines 184-186): expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@[::1]:5433/db','postgres-js'))).toBe(true). This fails today. Add to scripts/run-e2e-guard.test.mjs: remoteSkipSeedError({ baseUrl: 'http://[::1]:3000', skipSeed: true }) returns null. This also fails today. If timestampSlug moves, add a profile-parse test for it. If the tracking rail is added, extend scripts/ui-adoption-rail.test.mjs: reject 'tracking-[0.08em]' and keep accepting tracking-label and tracking-optical (the existing case at lines 174-188).

**Notes.** The proposal is right that four of the codemod's targets are gone (ui, control, emphasis, display). Its other four targets (copy, label, wide, eyebrow) still exist. Both loopback checks fail closed: the profiler refuses with postgres-not-local, and the e2e guard demands E2E_STORAGE_STATE. So this is a false-refusal bug with no safety impact. url-safety.ts is the correct copy, and both script copies drifted from it. Do not unify errorMessage: the message/stack split in profile-sites-dev is deliberate per error kind. Do not try to share the signal or persist code.

<sub>Reported by: area:lib-infra.</sub>

<a id="p197"></a>

## P197: Collapse the three purge drain loops in httpMapAccess into one private helper

- **Status:** [x] done
- **Category:** convex · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -18/+12
- **Depends on:** —
- **Existing primitive:** `convex/lib/httpAuth.ts:authorizedJsonAction`

**Problem.** convex/httpMapAccess.ts has three loops that call a batch mutation up to MAX_PURGE_BATCHES times until !hasMore, each falling back to the same 503 'Purge batch limit exceeded' response. projectMapAccess ignores batch.deleted. purgeMapAccess sums it. purgeMapChain sums it and adds remaining: false. These differences are intentional parts of the response contracts. They are not bugs.

**Verifier revision.** Revised: the drain-loop half holds, the door-wrapper half is rejected. The drain loop really is written out three times in convex/httpMapAccess.ts, and each copy carries the same 503 fallback. Nothing exercises that branch today, because MAX_PURGE_BATCHES is 10,000 and no test reaches it. But all three consumers live in one module, so it should be a private helper there. It does not belong in convex/lib/httpAuth.ts, whose job is bearer and JSON authorization. The mutationDoor/queryDoor half is rejected. The real pass-through count is 8, not 9. Each one is already a one-line lambda, so a wrapper saves about a line per door. It also needs generic typing over Convex FunctionReference and OptionalRestArgs. Meanwhile the doors that are not pure pass-through would keep the long form: deleteExpiredTrackingReceipts (id casts), mapTrackingSnapshot (wraps the result in { tracked }), and all three httpJump doors (dispatch and id casts). That would leave two styles side by side.

**Sites (4).**

- [`convex/httpMapAccess.ts:7`](../../convex/httpMapAccess.ts#L7) — MAX_PURGE_BATCHES = 10_000
- [`convex/httpMapAccess.ts:57-75`](../../convex/httpMapAccess.ts#L57-L75) — projectMapAccess drains mapJumpBookkeeping.purgeForMap when the claim set is empty; ignores deleted; returns the reconcile counts
- [`convex/httpMapAccess.ts:77-89`](../../convex/httpMapAccess.ts#L77-L89) — purgeMapAccess drains purgeUserClaims, sums deleted, returns { deleted }
- [`convex/httpMapAccess.ts:99-109`](../../convex/httpMapAccess.ts#L99-L109) — purgeMapChain drains purgeMapBatch, sums deleted, returns { deleted, remaining: false }

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/httpMapAccess.ts:91-97, 112-117`](../../convex/httpMapAccess.ts#L91-L97) — purgeUserMapClaims is pass-through; mapTrackingSnapshot wraps the result in { tracked }. Both stay as written.
- [`convex/httpEngine.ts:11-14`](../../convex/httpEngine.ts#L11-L14) — pass-through door; a wrapper would save about one line
- [`convex/httpLocation.ts:17-28`](../../convex/httpLocation.ts#L17-L28) — two pass-through doors; same reasoning
- [`convex/httpAccountMerge.ts:17-48, 50-66`](../../convex/httpAccountMerge.ts#L17-L48) — four pass-through doors, plus deleteExpiredTrackingReceipts, which casts ids and so is not pass-through
- [`convex/httpJump.ts:95-189`](../../convex/httpJump.ts#L95-L189) — three doors that dispatch on a discriminant and cast ids; a door wrapper would not fit them
- [`convex/lib/httpAuth.ts:29-40`](../../convex/lib/httpAuth.ts#L29-L40) — authorizedJsonAction stays the only door primitive. The drain helper does not belong in this auth module.

</details>

**Home.** `Private (unexported) helper in convex/httpMapAccess.ts`

**Boundary check.** The helper is used only inside convex/httpMapAccess.ts (convex zone), so no import is added. The three mutations it drives (convex/mapJumpBookkeeping.ts, convex/mapAccessProjection.ts, convex/mapPurge.ts) are in the same zone and are reached through internal.*, as they are today.

**API sketch.**

```ts
async function drainBatches(
  step: () => Promise<{ deleted: number; hasMore: boolean }>,
): Promise<{ deleted: number; finished: boolean }>  // loops up to MAX_PURGE_BATCHES
const batchLimitExceeded = (): Response => new Response('Purge batch limit exceeded', { status: 503 });
```

**Migration steps.**

1. Add drainBatches and batchLimitExceeded as module-private functions in convex/httpMapAccess.ts. The result shape { deleted, finished } matches src/lib/batched-delete.ts BatchedDeleteResult, so the vocabulary is consistent; do not import that module.
2. projectMapAccess: inside the `claims.length === 0 && outcome !== 'stale'` branch, call `const { finished } = await drainBatches(() => ctx.runMutation(internal.mapJumpBookkeeping.purgeForMap, { mapId: body.mapId }))` and return finished ? Response.json(counts) : batchLimitExceeded().
3. purgeMapAccess: `const { deleted, finished } = await drainBatches(() => ctx.runMutation(internal.mapAccessProjection.purgeUserClaims, { userId: body.userId }))`, then return finished ? Response.json({ deleted }) : batchLimitExceeded().
4. purgeMapChain: the same, returning Response.json({ deleted, remaining: false }) when finished.
5. Leave every other door unchanged; add no mutationDoor/queryDoor.

**Tests.** Existing guards: convex/httpMapAccess.test.ts:208 ({ deleted: 129 }), :231 ({ deleted: 1 }), :281 ({ deleted: 130, remaining: false }) and :128 (multi-batch bookkeeping drain inside projectMapAccess). The 503 branch is not covered today and stays uncovered behind the 10,000 cap. If coverage of it is wanted, give drainBatches a `max` parameter, move it to convex/lib/drainBatches.ts, and add a unit test with max = 2.

**Notes.** Keep the three response bodies exactly: projectMapAccess returns the reconcile counts and ignores deleted; purgeMapAccess returns { deleted }; purgeMapChain returns { deleted, remaining: false }; and every limit hit returns the same 503 text. All three batch mutations return { deleted, hasMore } (mapPurge.ts:55-58, mapJumpBookkeeping.ts:33-36, mapAccessProjection.ts:54-57), so one step type covers them. A related literal drift (restoreMergeTracking's .max(1000) at httpAccountMerge.ts:38 against MERGE_TRACKING_LIMIT) is handled in P195's migration.

<sub>Reported by: area:convex, concern:request-pipeline.</sub>

<a id="p323"></a>

## P323: Delete the always-true locationChanged guard and fold the repeated no-location, jump-evidence and scan-routing literals

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 / +12
- **Depends on:** —
- **Existing primitive:** `convex/lib/indexedQuery.ts:uniqueByUserCharacter`

**Problem.** characterLocationApply guards its system-change patch with a nine-field comparison that always passes, which suggests a write suppression that never happens. characterLocationSync spells out the same 'no location fix' result three times. jumpEvidence repeats the same empty tail in four early returns. applyScannedRow has two branches that make the identical applyWormholeRow call.

**Verifier revision.** Three of the five items hold up. (1) locationChanged is dead: next.transitionObservedAt is this mutation's Date.now() (characterLocationApply.ts:75, 272), so it never equals a stored value from an earlier mutation, and the guard always passes. (2) applyScannedRow's two branches make the identical applyWormholeRow call, and findPasteConnection is pure, so the branches merge safely. (3) The result literals repeat, but only three of the four cited are the same concept. The offline (229-245), 304-unchanged (307-321) and errorResult (407-423) results all mean 'no new location fix': held etags and null location fields, which applyLocationResult treats as no-write (characterLocationApply.ts:240-241). The literal at 349-363, and the one at 393-404 that the finders mixed up with errorResult, carry a real ESI location and a fresh etagLocation, so they are a different concept. jumpEvidence's four early returns share a tail and can spread one constant. findCharacterLocation is rejected: it has two call sites (mapTrackingLive.ts:51, 148) and binds the table name, so inlining makes the code worse, not simpler. On locationChanged, only deletion preserves behavior. Making the guard ignore timestamps would change jump processing, because transitionObservedAt is the key mapJumpAuthoring and mapJumpEvidence use to decide whether a transition was processed.

**Sites (8).**

- [`convex/characterLocationApply.ts:75, 263-280, 309-334`](../../convex/characterLocationApply.ts#L75) — now = Date.now(); the systemChanged branch builds next with transitionObservedAt: now and patches only if locationChanged, which compares transitionObservedAt, so it is always true
- [`convex/characterLocationApply.ts:240-241`](../../convex/characterLocationApply.ts#L240-L241) — A result with solarSystemId null is a no-write, which is why the three no-location literals are one signal
- [`convex/characterLocationSync.ts:229-245`](../../convex/characterLocationSync.ts#L229-L245) — Offline result: null location fields, held etags, expiresAt = window, error null, plus the online trio
- [`convex/characterLocationSync.ts:307-321`](../../convex/characterLocationSync.ts#L307-L321) — 304-unchanged result: the same ten fields with expiresAt resolved
- [`convex/characterLocationSync.ts:407-423`](../../convex/characterLocationSync.ts#L407-L423) — errorResult: the same ten fields with expiresAt null, error = code, and the online trio null
- [`convex/mapJumpEvidence.ts:33-43, 46-55, 58-68, 83-95`](../../convex/mapJumpEvidence.ts#L33-L43) — Four early returns ending in originLive:false, scannedTypeCodes:[], candidates:[]; the first three also return transition:null and lastProcessedTransitionAt:null
- [`convex/lib/mapScanApply.ts:128-135`](../../convex/lib/mapScanApply.ts#L128-L135) — The paste-connection branch and the Wormhole-group branch make the identical applyWormholeRow call
- [`convex/lib/mapConnectionLookup.ts:136-149`](../../convex/lib/mapConnectionLookup.ts#L136-L149) — findPasteConnection is pure (filter/find, no throw), so the group check can short-circuit it

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/characterLocationSync.ts:349-363`](../../convex/characterLocationSync.ts#L349-L363) — Same-system result: carries the ESI solarSystemId, station and structure and a fresh etagLocation. It is a real fix, not a held/no-location result.
- [`convex/characterLocationSync.ts:393-404`](../../convex/characterLocationSync.ts#L393-L404) — System-changed result with ship. Different concept.
- [`convex/mapTrackingLive.ts:23-29`](../../convex/mapTrackingLive.ts#L23-L29) — findCharacterLocation is called twice (51, 148) and fixes the table name. Inlining would duplicate the table literal rather than simplify.
- [`convex/characterLocationApply.ts:283-295`](../../convex/characterLocationApply.ts#L283-L295) — The stationary-path guard compares only fields that can actually change. It is live; keep it.

</details>

**Home.** `File-local helpers in convex/characterLocationSync.ts and convex/mapJumpEvidence.ts; edits in place in convex/characterLocationApply.ts and convex/lib/mapScanApply.ts`

**Boundary check.** Everything stays inside the convex zone (convex/**). The helpers are module-private and add no imports, so the rule from 'convex' (allow platform/esi, platform/auth, data, lib) is unaffected.

**API sketch.**

```ts
// characterLocationSync.ts (private)
function noLocationRead(characterId: number, held: HeldState, expiresAt: number | null, error: string | null): LocationReadResult; // the 10 non-online fields with location fields null and held etags
function errorResult(characterId, code, held): CharacterResult { return { ...noLocationRead(characterId, held, null, code), online: null, etagOnline: null, onlineExpiresAt: null }; }
// mapJumpEvidence.ts (private, no `as const` so the inferred return keeps mutable arrays)
const NO_ORIGIN = { originLive: false, scannedTypeCodes: [], candidates: [] };
// mapScanApply.ts
if (row.group === 'Wormhole' || findPasteConnection(state.connections, systemId, row.signatureId) !== undefined) return (await applyWormholeRow(ctx, state, row, mapId, systemId, now)).outcome;
```

**Migration steps.**

1. characterLocationApply.ts: delete locationChanged (309-334) and patch unconditionally in the systemChanged branch (replace 277-279 with `await ctx.db.patch(existing._id, next);`). Behavior is unchanged. Do not reintroduce a guard that ignores timestamps without owner sign-off: suppressing the write would keep the old transitionObservedAt, and mapJumpAuthoring.ts:212/444 and mapJumpEvidence.ts:83-86 key jump processing on it.
2. characterLocationSync.ts: add noLocationRead(characterId, held, expiresAt, error). Rewrite errorResult (407-423) as its spread plus the three online nulls. Rewrite the offline return (229-245) as `{ ...noLocationRead(characterId, held, probe.windowExpiresAt, null), online: false, etagOnline: probe.etagOnline, onlineExpiresAt: probe.onlineExpiresAt }`. Rewrite the 304 return (307-321) as `return noLocationRead(characterId, held, expiresAt, null)`. Leave 349-363 and 393-404 explicit.
3. mapJumpEvidence.ts: add NO_ORIGIN and spread it in all four early returns. Add `transition: null, lastProcessedTransitionAt: null` explicitly in the first three. Keep the `as const` on canEdit and tracked.
4. mapScanApply.ts: merge 128-134 into one condition with the group check first, which skips the connection scan for Wormhole rows, and drop the unused `connection` binding.

**Tests.** Existing guards: convex/characterLocationSync.test.ts (304 byte-identical at 310, the offline pilot at 598, ESI error and budget-exhausted paths); convex/characterLocationApply.test.ts systemChanged cases (around 133, 254, 287, 321, 432, 595); convex/mapJump.test.ts, mapJumpPending.test.ts, mapJumpReturn.test.ts and httpJump.test.ts for jumpEvidence shapes; convex/mapScan.test.ts for wormhole and list routing. Add one apply test asserting that a systemChanged result whose solar system already matches the row still advances transitionObservedAt, which pins the behavior the deleted guard hid. Check that each jumpEvidence early-return shape (denied, untracked, no transition, already processed) is asserted with toEqual so the spread cannot drop a key.

**Notes.** Owner question to record, not to act on here: should a systemChanged result whose solarSystemId already equals the stored row (for example after a racing run) be treated as a non-transition? Today it writes prevSolarSystemId = existing.solarSystemId (A→A) and a new transitionObservedAt. A guard that only ignored timestamps would still fail to stop that, because prevSolarSystemId differs. The correct check would be `existing.solarSystemId === result.solarSystemId`, which changes behavior and needs its own change. mapFixtureTracking.ts:69 is a third uniqueByUserCharacter('characterLocation') lookup; that is not a reason to inline the helper.

<sub>Reported by: area:convex.</sub>

<a id="p154"></a>

## P154: Remove dead try/catch and .catch wrappers around apiFetch and convert the impossible-rejection test mocks to network outcomes

- **Status:** [x] done
- **Category:** error-handling · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 lines across 6 source files; 4 test mocks rewritten
- **Depends on:** —
- **Existing primitive:** `src/transport/api-client.ts:apiFetch`

**Problem.** apiFetch never rejects; every transport failure arrives as `{ ok: false, kind: 'network' }`. Six client call sites still wrap it in try/catch or .catch(() => null). Some duplicate the !ok branch they already have (FeedbackModal, use-account-characters), some add a nullable type the caller then has to handle (use-slots-live, updateProfile), and one has an empty catch that would also swallow a consumer callback's error (use-refresh-on-view). Their tests mock apiFetch rejecting, which hides the real contract.

**Verifier revision.** apiFetch (src/transport/api-client.ts:28-47) catches both fetch and decode failures and returns networkFailure(cause). Its only code outside a try is endpointUrl (line 33), which cannot realistically throw. So the two cited try/catch blocks are dead, and FeedbackModal's catch duplicates feedbackErrorMessage's network branch. The grep found four more dead catch paths around plain apiFetch calls that the finders missed, so the scope widens. One part of the proposal is wrong: FEEDBACK_NETWORK_ERROR_MESSAGE cannot simply become private, because feedback-view.test.ts:7,92 imports it. Several tests also mock apiFetch rejecting, a path the real function never takes, and must be converted to resolved network outcomes.

**Sites (8).**

- [`src/transport/api-client.ts:28-47`](../../src/transport/api-client.ts#L28-L47) — fetch and decode errors both become networkFailure(cause); line 33 endpointUrl only builds a string
- [`src/features/feedback/components/FeedbackModal.tsx:28-43`](../../src/features/feedback/components/FeedbackModal.tsx#L28-L43) — try/catch maps a rejection to FEEDBACK_NETWORK_ERROR_MESSAGE, which feedbackErrorMessage already returns for kind 'network'
- [`src/features/feedback/components/feedback-view.ts:11-12, 27-32`](../../src/features/feedback/components/feedback-view.ts#L11-L12) — constant plus the network branch that already covers the case
- [`src/features/wormhole-sites/widget.tsx:28-43`](../../src/features/wormhole-sites/widget.tsx#L28-L43) — catch returns the same error state as the !ok branch
- [`src/features/industry-jobs/use-slots-live.ts:30-41`](../../src/features/industry-jobs/use-slots-live.ts#L30-L41) — apiFetch(...).catch(() => null), so onResult takes OutcomeOf \| null and treats null like !ok
- [`src/features/industry-planner/profiles/use-industry-profiles.ts:42-47`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L42-L47) — updateProfile: .catch(() => null) then `res ?? { ok: false }`
- [`src/components/use-account-characters.ts:30-41`](../../src/components/use-account-characters.ts#L30-L41) — .catch branch repeats the then-branch's failure handling (set [] only for a different characterId; respect ignore)
- [`src/data/market-history/use-refresh-on-view.ts:38-56`](../../src/data/market-history/use-refresh-on-view.ts#L38-L56) — empty catch {}; only the finally (setRefreshing(false)) is needed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/profiles/use-industry-profiles.ts:87, 115`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L87) — wraps sync.request, which throws 'Profile session changed' (profile-sync.ts:70-74); the catch is live
- [`src/features/industry-planner/blueprints-source.ts:14-25`](../../src/features/industry-planner/blueprints-source.ts#L14-L25) — catch resets the cached promise after the code's own `throw new Error(...)` on !ok; live
- [`src/data/eve-data/systems-search.ts:21-33`](../../src/data/eve-data/systems-search.ts#L21-L33) — same cached-promise reset pattern; live
- [`src/components/composition/telemetry/client.ts:17`](../../src/components/composition/telemetry/client.ts#L17) — fire-and-forget `void apiFetch(...).catch(() => {})`; dead but harmless; optional cleanup
- [`src/data/convex/leave-signal.ts:15`](../../src/data/convex/leave-signal.ts#L15) — same fire-and-forget pattern; optional
- [`src/features/industry-planner/components/use-planner-location-writes.ts:36-42, 75-80`](../../src/features/industry-planner/components/use-planner-location-writes.ts#L36-L42) — apiFetch inside readWithRetries, no local try; not this pattern

</details>

**Home.** `src/transport/api-client.ts:apiFetch (existing; no new primitive)`

**Boundary check.** No new imports. Consumers stay in their zones: features (feedback, wormhole-sites, industry-jobs, industry-planner) may import transport per `from: features`; components (use-account-characters.ts) may import transport per `from: components`; data (market-history) may import transport per `from: data`.

**API sketch.**

```ts
// FeedbackModal.tsx
async function submitFeedback(title, message, path, category): Promise<SubmitState> {
  const result = await apiFetch(feedbackEndpoint, { body: { title, message, path, category } });
  return result.ok ? { kind: 'success' } : { kind: 'error', message: feedbackErrorMessage(result) };
}
// widget.tsx
const result = await apiFetch(siteDetailEndpoint, { params: { id: siteId }, signal });
return result.ok ? { siteId, status: 'ready', site: result.data } : { siteId, status: 'error' };
// use-industry-profiles.ts
function updateProfile(body): Promise<ProfilesResult> { return apiFetch(updateIndustryProfileEndpoint, { body }); }
```

**Migration steps.**

1. Optionally add a JSDoc line to apiFetch: 'Never rejects: transport and decode failures resolve as { ok: false, kind: "network" }'. This makes the contract explicit for future callers.
2. FeedbackModal.tsx: remove the try/catch in submitFeedback and the FEEDBACK_NETWORK_ERROR_MESSAGE import. Keep the export in feedback-view.ts, since feedback-view.test.ts:7,92 consumes it.
3. widget.tsx: remove the try/catch in loadWidgetState.
4. use-slots-live.ts: drop `.catch(() => null)` and narrow onResult's parameter to OutcomeOf<typeof industrySlotsEndpoint> (remove the `result !== null` check).
5. use-industry-profiles.ts: updateProfile returns apiFetch(...) directly; leave the two sync.request catches alone.
6. use-account-characters.ts: delete the .catch block; the then-branch already handles !ok identically.
7. use-refresh-on-view.ts: change try/catch/finally to try/finally so a throwing onResult surfaces instead of being swallowed.
8. Convert the impossible-rejection mocks to `mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') })` in FeedbackModal.test.ts:111, use-refresh-on-view.test.ts:84 and use-account-characters.test.ts:83,90. Leave use-industry-profiles.test.ts:145 (remove path through sync.request).
9. Run pnpm check through test-runner.

**Tests.** Existing guards: FeedbackModal.test.ts:93-125 (success, 429 and network copy; after conversion, the network case goes through feedbackErrorMessage), feedback-view.test.ts:30-100 (the network branch returns FEEDBACK_NETWORK_ERROR_MESSAGE), use-refresh-on-view.test.ts:78-90 (setRefreshing [[true],[false]] on failure), use-account-characters.test.ts:79-100 (a failed refresh keeps the remembered roster; a different pilot gets []), use-slots-live.test.ts, use-industry-profiles.test.ts. Add a widget test asserting a network outcome renders 'This wormhole site could not be loaded.' if none exists.

**Notes.** Behavior is preserved at every site because each catch produced the same result as the existing !ok branch. The one deliberate change is use-refresh-on-view: an exception thrown by the caller's onResult callback becomes an unhandled rejection instead of being silently swallowed. The refreshing flag still clears via finally. FeedbackModal.test.ts:100 mocks `kind: 'http'`, which is not a real outcome kind (the real one is 'api'); it passes only because feedbackErrorMessage branches on status, so fix it while converting the mocks. The proposal's suggested ordering after a 'failureMessage' rewrite of feedback-view is not required; this change touches only submitFeedback.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p142"></a>

## P142: Use rateLimitPreflight in account/active-character and sync-leave instead of inline copies

- **Status:** [x] done
- **Category:** api-route · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -8 / +4
- **Depends on:** —
- **Existing primitive:** `src/app/api/rate-limit-preflight.ts:rateLimitPreflight; src/lib/rate-limit.ts:checkRateLimit`

**Problem.** rateLimitPreflight(request, options, onLimited) exists for runMutationRoute's preflight slot, and characters/unlink, purge-character and sessions/revoke use it. active-character and sync-leave instead hand-write its body: `async () => { const limit = await checkRateLimit(request, {...}); return limit.ok ? null : problemResponse(limit.failure); }`. They also import checkRateLimit directly into the route.

**Verifier revision.** Only the bypass is real. active-character (16-19) and sync-leave (14-20) inline the exact body of rateLimitPreflight with problemResponse, while account/characters/unlink uses the primitive for the same thing. account/delete is fixed by P141 with the existing rateLimitPreflight. The rest is rejected. (1) Moving limit-before-parse rests on a false premise. The limiter is an Upstash round trip (2 s timeout, one retry, paid per command, per vendor-resilience-registry.ts 108-124), while rejecting a malformed body is local work. Parse-first spends no Redis command on garbage, and feedback/route.test.ts:238 pins that behaviour. (2) A rateLimit stage with key 'user' would have one consumer, maps/create. Its identity memo exists so that preflight and authorize share one checkUserId, and maps/create/route.test.ts:67-68 pins rateLimit('user-1', …). (3) rateLimitResponse for non-pipeline routes saves no lines over the two-line checkRateLimit/apiResponse pair. auth/[...all] wraps a library handler with a per-path policy map. (4) checkRateLimitFor would have one consumer and would force a rewrite of the maps/create test mocks.

**Sites (7).**

- [`src/app/api/rate-limit-preflight.ts:1-13`](../../src/app/api/rate-limit-preflight.ts#L1-L13) — existing primitive
- [`src/app/api/account/active-character/route.ts:6, 16-19`](../../src/app/api/account/active-character/route.ts#L6) — inline copy of rateLimitPreflight with problemResponse
- [`src/app/api/sync-leave/route.ts:5, 14-20`](../../src/app/api/sync-leave/route.ts#L5) — inline copy of rateLimitPreflight with problemResponse
- [`src/app/api/account/characters/unlink/route.ts:30-34`](../../src/app/api/account/characters/unlink/route.ts#L30-L34) — correct use with problemResponse
- [`src/app/api/account/purge-character/route.ts:20-24`](../../src/app/api/account/purge-character/route.ts#L20-L24) — correct use with apiResponse 429
- [`src/app/api/account/sessions/revoke/route.ts:14-18`](../../src/app/api/account/sessions/revoke/route.ts#L14-L18) — correct use with apiResponse 429
- [`src/app/api/account/delete/route.ts:16-22`](../../src/app/api/account/delete/route.ts#L16-L22) — inline checkRateLimit; migrated to rateLimitPreflight in P141

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/maps/create/route.ts:24-46`](../../src/app/api/maps/create/route.ts#L24-L46) — the only user-keyed limiter; the memo lets preflight and authorize share one checkUserId; test pins rateLimit('user-1', …) at route.test.ts:67-68
- [`src/app/api/feedback/route.ts:33-40`](../../src/app/api/feedback/route.ts#L33-L40) — parse-first is deliberate and pinned (route.test.ts:238); it saves an Upstash command per malformed request
- [`src/app/api/telemetry/route.ts:18-41`](../../src/app/api/telemetry/route.ts#L18-L41) — parse and the local size check run before the paid Redis limiter; keep
- [`src/app/api/market-refresh-route.ts:28-32`](../../src/app/api/market-refresh-route.ts#L28-L32) — same parse-first ordering; already one shared factory for both refresh routes
- [`src/app/api/auth/[...all]/route.ts:29-40`](../../src/app/api/auth/[...all]/route.ts#L29-L40) — per-path policy around a library handler; a wrapper saves nothing
- [`src/lib/rate-limit.ts:87-101`](../../src/lib/rate-limit.ts#L87-L101) — checkRateLimitFor would have one consumer (maps/create)

</details>

**Home.** `src/app/api/rate-limit-preflight.ts (existing rateLimitPreflight)`

**Boundary check.** Both routes and rate-limit-preflight.ts are in zone api. rate-limit-preflight imports lib/rate-limit and lib/failure, which the api rule allows. No new module.

**API sketch.**

```ts
preflight: rateLimitPreflight(request, { name: 'account-switch', perMinute: 30 }, problemResponse)
preflight: rateLimitPreflight(request, { name: 'sync-leave', perMinute: 30 }, problemResponse)
```

**Migration steps.**

1. In src/app/api/account/active-character/route.ts, replace the preflight arrow (16-19) with rateLimitPreflight(request, { name: 'account-switch', perMinute: 30 }, problemResponse) and swap the '@/lib/rate-limit' import for '@/app/api/rate-limit-preflight'.
2. Do the same in src/app/api/sync-leave/route.ts (14-20) with { name: 'sync-leave', perMinute: 30 }.
3. Leave maps/create, feedback, telemetry, market-refresh-route and auth/[...all] unchanged. account/delete moves in P141.

**Tests.** sync-leave/route.test.ts mocks checkRateLimit in '@/lib/rate-limit'. rateLimitPreflight imports from the same module, so the mock still applies. Run it and the active-character/problem-matrix paths unchanged. rate-limit-preflight.test.ts already covers the primitive. No new tests are needed.

**Notes.** The response bytes are identical: both copies already use problemResponse, which is rateLimitPreflight's onLimited here. The order must not change: rate limit before authorize. Do not reorder parse and limit on the public routes. The Upstash limiter costs a network command per call and fails closed in production, so parse-first is the cheaper order for floods of malformed bodies, and a test pins it.

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p287"></a>

## P287: Reuse Better Auth's get-session result for the background authorization check

- **Status:** [x] done
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about +8 / -2 in route.ts; about +10 test lines
- **Depends on:** —
- **Existing primitive:** `src/composition/character-authorization.ts:checkUserCharacterAuthorizations (already wrapped in React cache())`

**Problem.** GET /api/auth/[...all] lets Better Auth resolve the session for /get-session, then calls auth.api.getSession again inside after() just to learn the user id for checkUserCharacterAuthorizations. Each client session fetch (AuthProvider and PreferencesProvider useSession) therefore pays for two session resolutions, and each one runs the customSession roster query.

**Verifier revision.** Only one waste holds up: the auth route resolves the session twice on every /api/auth/get-session request. Better Auth resolves it once to build the response, then route.ts:17 calls auth.api.getSession again inside after(). customSession runs resolveActiveCharacter on every getSession call even when the cookie cache is on (node_modules/better-auth/dist/plugins/custom-session/index.mjs), so each get-session request costs a second roster query plus the session lookup.

The rest of the framing does not hold:
- A signed-in atlas render does not drain the outboxes two or three times. AtlasBound uses checkSession (route-guards.ts:18-24, a plain auth.api.getSession with no after-check), so the render schedules one reconcile from listMapChromeData, and a second only when resolveUserCorpAccess finds a changed affiliation. The get-session check is a separate request.
- The two reconciles in checkCharacterAuthorizations are both deliberate: one revokes known-bad access before the slow token checks, the other publishes what those checks found.
- An idle reconcile costs two LIMIT queries on outbox tables that are normally empty (tracking-merge-retry.ts:49-50, affiliation-store.ts:191-203).

The proposed module-level single flight is rejected:
- A caller that joins a drain already in flight is skipped for any rows it enqueued after that drain read the outbox. publishAccessChanges enqueues revocations and then reconciles, so a joined drain would hold those revocations until the next trigger. That is a correctness regression.
- In-process memory does not coordinate across serverless instances.
Concurrent drains really do duplicate projectMapAccess calls for the same pending rows, because readPendingMapAccessChanges does not claim rows. That needs a database-level claim, not an in-memory gate.

**Sites (10).**

- [`src/app/api/auth/[...all]/route.ts:13-20`](../../src/app/api/auth/[...all]/route.ts#L13-L20) — betterAuthGet(request) resolves the session. after() then calls auth.api.getSession({ headers: request.headers }) a second time.
- [`src/platform/auth/auth.ts:200-206`](../../src/platform/auth/auth.ts#L200-L206) — customSession calls resolveActiveCharacter (roster query) on every getSession call.
- [`src/platform/auth/auth.ts:111-117`](../../src/platform/auth/auth.ts#L111-L117) — cookieCache is enabled in production (maxAge 300). That spares only the base session row; the customSession callback still runs every time.
- [`src/platform/auth/session-identity.ts:4-25`](../../src/platform/auth/session-identity.ts#L4-L25) — The JSON body Better Auth returns for get-session includes user, so user.id can be read from the response.
- [`src/composition/character-authorization.ts:14-36,51-60`](../../src/composition/character-authorization.ts#L14-L36) — Two reconcile paths, both deliberate: the reconcile inside publishAccessChanges runs before and after the token checks, and the no-work branch reconciles at line 31. The function is wrapped in React cache().
- [`src/composition/map-access.ts:47-49`](../../src/composition/map-access.ts#L47-L49) — An atlas render schedules one reconcile through after().
- [`src/composition/corp-access.ts:15-16`](../../src/composition/corp-access.ts#L15-L16) — Schedules a reconcile only when the affiliation refresh reports accessChanged.
- [`src/app/(site)/atlas/AtlasBound.tsx:78-96`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L78-L96) — The atlas gate is checkSession, not getFullSession, so the render schedules no authorization check of its own.
- [`src/composition/map-affiliation-access.ts:16-19`](../../src/composition/map-affiliation-access.ts#L16-L19) — reconcile = readPendingTrackingMerges + readPendingMapAccessChanges, then delivery only when rows exist.
- [`src/platform/auth/affiliation-store.ts:191-203`](../../src/platform/auth/affiliation-store.ts#L191-L203) — The pending read is a plain SELECT ... LIMIT 100 with no claim or lease, so concurrent drains overlap.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/session.ts:10-14`](../../src/composition/session.ts#L10-L14) — Already deduped per render by React cache(), and checkUserCharacterAuthorizations is cache()-wrapped too. The atlas never calls it.
- [`src/composition/character-authorization.ts:22,31,36,51`](../../src/composition/character-authorization.ts#L22) — The repeated reconciles are intentional: revoke before the slow ESI checks, publish after. Keep them.
- [`src/composition/map-affiliation-access.ts:16-19`](../../src/composition/map-affiliation-access.ts#L16-L19) — Single-flighting here is rejected. A joined in-flight drain would miss rows enqueued after its read, such as the revocations publishAccessChanges just wrote, and in-memory state is per instance.

</details>

**Home.** `src/app/api/auth/[...all]/route.ts (local change; no new primitive)`

**Boundary check.** The route is in the api zone and already imports @/composition/character-authorization and @/composition/auth; the api rule allows composition. The change adds no import edges.

**API sketch.**

```ts
// route.ts
function sessionUserId(body: unknown): string | null; // returns body.user.id when it is a non-empty string, else null
export async function GET(request: Request): Promise<Response> {
  const { result: response, merged } = await runWithMergeTracking(() => betterAuthGet(request));
  if (new URL(request.url).pathname === '/api/auth/get-session' && response.ok) {
    const copy = response.clone();
    after(async () => {
      const userId = sessionUserId(await copy.json().catch(() => null));
      if (userId) await checkUserCharacterAuthorizations(userId);
    });
  }
  ...
}
```

**Migration steps.**

1. In src/app/api/auth/[...all]/route.ts, clone the Better Auth response synchronously, before it is returned or rewrapped in the merged branch, and only when the path is /api/auth/get-session and response.ok.
2. Inside after(), parse the clone with .json().catch(() => null), extract user.id with a small local type guard (sessionUserId), and call checkUserCharacterAuthorizations(userId) only when it is a string. Remove the auth.api.getSession call.
3. Leave reconcileAffiliationAccess, checkCharacterAuthorizations, listMapChromeData and resolveUserCorpAccess unchanged.
4. Update the route test, then run pnpm check through test-runner.

**Tests.** Changes to src/app/api/auth/[...all]/route.test.ts:
- Update the case at 93-107. Assert that getSessionMock is never called. With body { user: { id: 'returning-user' } }, assert the check runs with 'returning-user'. With a null body, assert no check.
- Add a case: a non-OK or non-JSON get-session response schedules no check, or a check that no-ops, and never throws from after().

Existing guards that stay green: src/composition/session.test.ts and src/composition/map-affiliation-access.test.ts.

**Notes.** Clone before return: once the body is streamed to the client, it cannot be read in after(). The merged branch builds new Response(response.body, ...); cloning first leaves response.body readable. Response.clone() tees the stream and buffers the unread copy, which is fine for the small session JSON.

Optional and smaller: listMapChromeData's after(reconcile) and resolveUserCorpAccess's after(reconcile) can both fire in one atlas render after an affiliation change. A request-scoped scheduler in map-affiliation-access.ts, scheduleAffiliationReconcile = cache(() => after(reconcileAffiliationAccess)), would collapse them. It only helps on that rare path. cache() is a no-op in route handlers, so route behavior would not change.

Lead, not in scope: duplicate concurrent drains across requests need a claim (lease or FOR UPDATE SKIP LOCKED) on pending_map_access_changes. That is a schema change; in-memory coalescing cannot fix it.

<sub>Reported by: area:composition.</sub>

<a id="p059"></a>

## P059: Move AFK state into TrackingHeartbeat and narrow MapPresenceContext to the presence map

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -15 / +3 (useMapPresenceAfk, MapPresenceValue, wrapper useMemo, afk import)
- **Depends on:** —

**Problem.** MapPresenceProvider owns useAfkState() and publishes it next to presence in one context value, though TrackingHeartbeat is the only reader of afk. This forces a wrapper object and useMemo, a throwing useMapPresenceAfk hook, and an AfkGateState type import into the presence leaf module. AFK transitions also invalidate every presence consumer (SystemIntelMarks per node, FriendliesSection, OutboundArrowProvider). That cost is negligible in practice, but it is an unneeded coupling.

**Verifier revision.** The simplification holds: afk has exactly one reader (TrackingHeartbeat, via useMapPresenceAfk), and bundling it into MapPresenceContext adds a throwing hook, a wrapper object, and a cross-file type import for no consumer benefit. The efficiency claims are overstated, though. onAfkTick returns the same state object when nothing is due, so React bails out of the always-on 30s tick without rendering. AFK context changes happen only about three times per episode (prompt, pause, dismiss), and only after the tab has been hidden for an hour, so the per-node SystemIntelMarks re-renders do not matter. The src/AGENTS.md argument does not apply either: that rule covers app-wide state (session, preferences), and this map-scoped context's presence value changes after load by design. The AFK machinery runs without TrackingHeartbeat only while access is loading (undefined), because access === false returns NoMapAccess before the provider mounts. Revised scope: move the state and narrow the context, and drop the interval-gating change, which adds a second effect and dependency for no measurable gain.

**Sites (10).**

- [`src/mapper/tracking/PresenceProvider.tsx:11-28`](../../src/mapper/tracking/PresenceProvider.tsx#L11-L28) — useAfkState() at 20; value {presence, afk} at 25; the only reason for the wrapper useMemo
- [`src/mapper/tracking/presence-context.ts:1-25`](../../src/mapper/tracking/presence-context.ts#L1-L25) — MapPresenceValue carries afk (7-10); useMapPresenceAfk (19-25) is its only reader and throws without a provider
- [`src/mapper/tracking/TrackingControls.tsx:15-16, 42-49`](../../src/mapper/tracking/TrackingControls.tsx#L15-L16) — TrackingHeartbeat: the sole afk consumer; gates useSyncSubject on afk.paused and renders AfkDialog
- [`src/mapper/tracking/AfkGate.tsx:31-55`](../../src/mapper/tracking/AfkGate.tsx#L31-L55) — useAfkState: visibility listener and 30s interval; onAfkTick returns the same object when idle, so the tick causes no render
- [`src/mapper/tracking/afk-model.ts:39-49`](../../src/mapper/tracking/afk-model.ts#L39-L49) — onAfkTick returns `state` unchanged unless a prompt or pause is due
- [`src/mapper/canvas/SystemIntelMarks.tsx:53-56`](../../src/mapper/canvas/SystemIntelMarks.tsx#L53-L56) — per-node presence consumer
- [`src/mapper/windows/SystemIntelligenceBody.tsx:239-241`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L239-L241) — FriendliesSection: another presence-only consumer the finder missed
- [`src/mapper/tracking/OutboundArrowProvider.tsx:30-41`](../../src/mapper/tracking/OutboundArrowProvider.tsx#L30-L41) — reads only .presence
- [`src/mapper/chain/ChainLive.tsx:102, 111, 153`](../../src/mapper/chain/ChainLive.tsx#L102) — access === false returns before the provider mounts; TrackingHeartbeat mounts only when access === true, so the state reset on remount happens only on the undefined→true load transition
- [`src/mapper/tracking/TrackingControls.test.ts:25, 71-77, 224-232`](../../src/mapper/tracking/TrackingControls.test.ts#L25) — mocks useMapPresenceAfk; 'empties the heartbeat character set while the AFK gate is paused' guards the behavior

**Home.** `src/mapper/tracking/AfkGate.tsx (useAfkState, unchanged) called from src/mapper/tracking/TrackingControls.tsx:TrackingHeartbeat`

**Boundary check.** Every touched file is in the mapper zone (src/mapper/**). No new cross-zone import: TrackingControls already imports './AfkGate', and presence-context drops its './AfkGate' type import.

**API sketch.**

```ts
// presence-context.ts
export const MapPresenceContext = createContext<ReadonlyMap<number, SystemPresence> | null>(null);
export function useSystemPresence(systemId: number): SystemPresence | null; // useContext(MapPresenceContext)?.get(systemId) ?? null
// TrackingControls.tsx
export function TrackingHeartbeat({ mapId }: { readonly mapId: string }) { const afk = useAfkState(); ... }
```

**Migration steps.**

1. TrackingControls.tsx: import { AfkDialog, useAfkState } from './AfkGate'; replace `useMapPresenceAfk()` with `useAfkState()` in TrackingHeartbeat; delete the './presence-context' import.
2. presence-context.ts: delete useMapPresenceAfk and the AfkGateState import. Change the context type to `ReadonlyMap<number, SystemPresence> | null` and make useSystemPresence `useContext(MapPresenceContext)?.get(systemId) ?? null`. Delete the MapPresenceValue interface.
3. PresenceProvider.tsx: remove the useAfkState import and call, plus the `{presence, afk}` useMemo; render `<MapPresenceContext value={presence}>`.
4. OutboundArrowProvider.tsx:30: `const presence = useContext(MapPresenceContext);` and update the guard to `presence === null || presence.size === 0`.
5. TrackingControls.test.ts: change the './AfkGate' mock to `{ AfkDialog: () => null, useAfkState: () => mocks.afk }` and delete the './presence-context' mock (71-77).
6. Leave AfkGate.tsx's interval as is (do not add phase/visibility gating).

**Tests.** Existing: TrackingControls.test.ts 'empties the heartbeat character set while the AFK gate is paused' (224-232) and the heartbeat call test (~190) guard the behavior once the mock moves to useAfkState. afk-model.test.ts covers transitions unchanged. SystemIntelMarks.test.ts and SystemIntelligenceBody tests mock useSystemPresence and are unaffected. ChainHost.test.ts mocks MapPresenceProvider as pass-through and is unaffected. No new test needed.

**Notes.** Behavior preserved: AFK state now resets when TrackingHeartbeat remounts. The only remount path is access undefined→true at load (access false unmounts the provider too, and Convex useQuery keeps the last value across reconnects), so there is no new way to un-pause. TrackingHeartbeat re-renders on AFK changes exactly as before. The finder's efficiency framing (interval cost, per-node re-renders) and the src/AGENTS.md client-store argument do not hold; justify the change as a simplification only. Do not add a shared page-visibility hook for this; the existing listener is fine.

<sub>Reported by: gap:page-visibility-lifecycle-signal.</sub>

[Index](README.md#roadmap) · [Wave 2: Tooling and test-harness foundations](wave-02-tooling-and-test-harness-foundations.md) →
