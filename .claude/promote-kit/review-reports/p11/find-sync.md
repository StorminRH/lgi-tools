# Wave 11 review: owner sync, token vending, corp roles, read batching

Items covered: P190, P345, P188, P189, P292, P297, P286, P178.
Diff reviewed: `origin/claude/primitives-wave-10...origin/claude/primitives-wave-11`.

## Findings

None. I could not tie any change in this lens to a concrete failure from a real caller or input.

## Leads checked and refuted

### P189: singleFlight, vendTokenFor, statics client
- **Keying.** `vendTokenFor = singleFlight(async (characterId) => ...)` (src/composition/sync/owner-sync-port.ts:34) is keyed by the numeric characterId only. Two different characters never share an entry. `getFreshAccessTokenForCharacter(characterId)` takes no user input, so a coalesced caller gets exactly what its own call would have returned. Callers reach a characterId only through their own linked characters (`listCharactersWithHealth`, `access.characterIdsByCorporation`), and a character is one account row owned by one user. No token can cross between users.
- **Eviction.** `load(key).finally(() => inFlight.delete(key))` (src/lib/memoize.ts:6-17) removes the entry on resolve and on reject. The entry is set synchronously before the `.finally` microtask can run, even when `load` returns an already-settled promise. Nothing outlives the vend: no expired token, no stale `null`, no stale error. The real-Postgres test (owner-sync-port.concurrency.db.test.ts) covers the custody-ended case.
- **Per process only.** The map is module state. Cross-instance races still go through the existing CAS in eve-token-service. The `forceRefresh` caller (character-authorization.ts:53) calls the token service directly and never joins a shared vend.
- **Recursion and deadlock.** The token service never calls `vendTokenFor`, so a vend cannot wait on itself.
- **Statics client.** `loadSystemStatics = singleFlight(fetchSystemStatics)` matches the removed `pendingStaticsBySystem` code: same per-system key, deleted in `finally`, same arity. memoize.ts imports nothing and has no `server-only`, so the `'use client'` module can bundle it.

### P292: memoizeAsync
- **Same as before.** memoizeAsync is the old `memoizePerRun` moved as is. It never evicts, by declared design, and that was already the old behaviour.
- **Port scope.** `makeSheetPort()` runs once per `onView`/`runJob` call through `ownerSyncDataset`. So the memo of `listCharacters` (keyed by userId) and `vendToken` (keyed by characterId) lives for one run and one user. makeSheetPort has no other caller.
- **Phase memo.** `phasePort` (features/character-sheet/refresh.ts:140) is built inside each `refreshDirectSections` call.
  - Each direct section reads only `sheet[key]` (`readSectionState`) and writes only its own key (`mergeSheetSection` jsonb `||`, `stampSheetSection` `jsonb_set`), so one snapshot is exact.
  - The structures phase keeps the raw port and reads the merged row.
  - A rejected `readSheet` is shared within the phase. `runOwnerSync` rethrows non-budget errors, so `Promise.all` rejected before too. No change.

### P188: ownerSyncDataset
- **Mapping.** Each dataset key maps to the same refresh as before:
  - `skills` → `refreshSkillsForUser`
  - `character_industry_jobs` → `refreshJobsForUser`
  - `corporation_industry_jobs` → `refreshCorpJobsForUser`
  - `owned_blueprints` → `refreshOwnedBlueprintsForUser`
  - `owned_assets` → `refreshOwnedAssetsForUser` for runJob and the planner on-view; `refreshCharacterOwnedAssetsForUser` for the board's on-view, same key as before
  - `character_sheet` → `refreshCharacterSheetForUser`
  - `corp_context` → `refreshCorpContextForUser`

  The worker table (esi-refresh-worker.ts:64-70) still binds each key to its matching `runJob`. No dataset was dropped or renamed.
- **Picker.** Only the sheet runs several descriptors. Every other refresh is a single `runOwnerSync`, which yields at most one result per target (character and corp passes use different `ownerType`s). For those, filter-then-rank equals the old "first result for target".
- **Sheet picker.** The old picker ranked over unfiltered results, but runJob passes `{ target }` and the engine filters owners by `targetMatches`, so every result already belonged to the target. The ranking is the same: deferred > retryable > permanent > first > owner_unavailable.
- **Import cycles.** `ownerSyncDataset(...)` captures `refresh` at module load. Every refresh lives in features or data, which may not import composition, so no cycle can leave it undefined.

### P190: softRead and shared types
- **Error mapping.** All three wrappers keep the same mapping. A thrown `EsiServerError` becomes `{kind:'error', code:'esi_server_error'}`. `EsiBudgetExhaustedError` and any other throw (for example a JSON `SyntaxError`) are rethrown by `softEsiFailure`. An `error` result keeps its `code`.
- **expiresAt.** The only new field on fresh and unchanged results is `expiresAt`. No consumer spreads, serialises or persists a read result.
- **Removed types.** Each one matched its shared replacement field for field:
  - `LinkedCharacterHealth` and `RefreshCorpMember` are the same shape as `EnumeratedOwner`.
  - `CorpStructuresSyncState` is the same as `PagedOwnerSyncState`.
  - `CorpStructuresReadResult` is now `PagedOwnerReadResult`, which also carries `responseHeaders`, already supplied by `readPagedEndpoint`.
  - `CorpContextRead`, `JobsEsiRead`, `SkillsEsiRead` and `SheetEsiRead` are now `SingleOwnerRead`.

### P297: readRolesForSync and usableStoredRoles
- **Same character and corporation.** The row is read by `readCorpRoles([characterId]).get(characterId)` and reused only if `row.corporationId === characters.corporation_id`, which `readRoleCorporationId` reads. The engine groups corp members by that same column (`listLinkedCharacters`).
- **Freshness.** It reuses the exact gate corp-viewer already used: `freshnessGate('character_corp_roles')`, 3,600 s × 1,000 = 3,600,000 ms. It compares `now - row.fetchedAt` in ms. `fetchedAt` is a notNull timestamptz returned as a Date.
- **Fallback to ESI.** A missing row (undefined), a null `corporationId`, another corporation or a stale row all fall through to the old live probe. The `roles` arrays are notNull. A null local corporation still returns null before any read, as before.
- **Authorization.** Only a stored row can be reused. Roles are used only to pick the credential (`selectCorpCredential`; no other `readRoles` consumer). ESI still authorizes the corp read with that character's token. App visibility comes from the viewer's own stored roles, not from the sync credential.
- **Live paths unchanged.** The mutation gates (`probeAndStoreRoles` with `expectedCorporationId`) and the viewer fallback (`fetchAndStoreCorpRoles`) stay live. Tests cover both.
- **Declared costs.** Two consequences are declared or follow directly from the "trusted for up to an hour" decision, so I did not report them:
  - Repeated 403s while a revoked role ages out.
  - A newly granted role noticed up to about an hour later. resolveCorpViewer already trusts stored roles for an hour.

### P286: one skills-row read for the board
- `readCharacterSkillRow` returns the same `data` as the removed `readCharacterSkills`, and `levels: row.skillLevels ?? null` matches the removed levels reader.
- A missing row gives null, which drops out of the map, so data and levels are both null, as before.
- The cached getter keeps `cacheLife('minutes')` and `cacheTag(skillsTag(id))`. `getCharacterSkillLevels` keeps the same tag for skills-sync, so `expireNow(skillsTag)` covers both caches.
- The removed functions had no other consumers on the old ref (board-view only). The net-worth fresh path uses the uncached reader.

### P178: inArray sync-state readers
- **Columns.** The column sets are shared constants with the single-row readers, plus the id column, which is stripped when the map is built.
- **Empty lists.** Each reader returns early with an empty Map when the id list is empty.
- **Owner filter.** The asset reader filters `ownerType = 'character'`, so a corporation with the same id never matches. The skills and jobs sync tables are keyed by character only.
- **Map keys.** Every id column is `bigint` with `mode: 'number'`, so the keys match the numeric `characterId` lookups.
- **Unchanged inputs.** The ids still come from the user's linked characters. Board, net-worth (fresh) and the jobs view (`readCharacterOwners`) all switched. The owner-sync ports keep the single-row readers.

### P345: test helpers
- **Defaults.** `ownedDatasetPortFake` defaults match the two deleted local `makePort` fakes in owned-assets and owned-blueprints exactly: roles `[]`, vend `'token'`, empty fresh read, null state.
- **Owner fixture.** `ownerFixture` matches the deleted owner builders. Corp-member wrappers keep their corporationId. Character tests now carry `corporationId: null`, which `makeCharacterDescriptor` overwrites anyway.
- **Not vacuous.** The new tests assert concrete calls and results:
  - memoize: shared promise, eviction, shared rejection
  - vendTokenFor: one token-service call, then a re-vend
  - readRolesForSync: reuse, fallbacks, budget rethrow, live gates
  - softRead matrix
  - ownerSyncDataset picker
  - sheet: two reads per run
  - live-dataset-view batched states
  - list readers against Postgres, including the empty list and absent rows
