# Wave 11 (PR #678) review: tests, stacking, deletions, kit/docs commits

OLD = origin/claude/primitives-wave-10 (01e0edf2), NEW = origin/claude/primitives-wave-11 (55d0e25b). Everything was read through git refs only.

## Findings

None. I found no wave 11 defect in this lens that I could tie to a concrete failure.

One related problem is not wave 11's (it is already covered by the pending promote fix). `eslint.config.mjs:860-865` on NEW still restricts `logUsageEvent` from `@/data/telemetry/queries` for `src/app/api/cron/**`. That export no longer exists: it was removed in wave 10 by 01e0edf2 (P159), so the rule is dead. Wave 11 does not touch eslint.config.mjs.

## 1. Stacking

- The OLD tip is 01e0edf2. `git merge-base --is-ancestor` confirms OLD is an ancestor of NEW, and the first parent of 1f7471e6 is 01e0edf2. So NEW contains wave 10 unchanged.
- `git log OLD..NEW` holds exactly 22 commits, linear, with no merges (`--merges` is empty):
  - Kit/docs: 1f7471e6, d90a23e7, 31b896c9.
  - The 18 items, one commit each: P192 d2ce55dc, P193 a9ad6a94, P150 d4cc94f9, P191 9c0bc061, P194 c80f70a6, P190 cd3fb7fe, P345 984e9edb, P188 4cd31e5c, P189 3b64d72e, P292 0785f96d, P297 60390d25, P286 41698aab, P178 f7b596b4, P336 a65f2e8f, P239 42b74231, P184 fa15655b, P241 39d5e26a, P273 d24d0e58.
  - Then 55d0e25b, which only adds `src/composition/esi-character-search.test.ts`.
- origin/development (3a8e28c3) is an ancestor of NEW.
- **Revert check.** For the 24 files touched by both wave 9/10 (`development...wave-10`) and wave 11, I intersected the lines wave 9/10 added with the lines wave 11 removes. I ran the same check against the last six development fix commits (3a8e28c3, 0b1e8bf0, 5d9caa3a, ba191c61, bfbbf20e, c830dabc). Only three overlaps came up, and all are refactors, not reverts:
  - `skills-sync.test.ts`: its mock moves from `./esi-refresh-owner-sync` to `@/data/esi-refresh-jobs/queries`, because P188 made those helpers module-private.
  - `owned.ts`: `basePathFor` is renamed and exported as `ownedResourcePath` (P194).
  - `purge/contributors.ts`: one import line gains `PurgeCharacterSubject` (P241).
- **Pending promote-fix files.** Only one of them has a wave 11 hunk:
  - `src/composition/account-lifecycle/account-purge.db.test.ts`, hunk `@@ -20,6 +20,9 @@`. NEW lines 23-24 add `vi.mock('next/cache', () => ({ cacheLife, cacheTag, revalidateTag }))` after the deletion-jobs mock. The "moves failed old jobs behind a newly queued request…" test is at NEW line 695, so there is **no textual conflict**.
  - Semantic note: after the merge, the pending version of that test runs under this file-wide mock. It needs it if the test drives `retryRequestedDeletions → finishDeletionJob → purgeLink → runPurge(character)`, because that path now calls `revalidateTag(tag, { expire: 0 })`. Without a request store, `revalidateTag` throws "Invariant: static generation store missing" (`next/dist/server/web/spec-extension/revalidate.js`). If the pending fix adds its own `vi.mock('next/cache')` to this file, drop the duplicate.
  - `character-unlink.ts`, `character-unlink.test.ts`, `admin-users.db.test.ts`, `tracking-merge-retry.db.test.ts` and `eslint.config.mjs`: no wave 11 hunks, so nothing to conflict. None of their paths reach `runPurge`: `unlinkCharacter` → `identityProjectionRunners.runAfterCharacterUnlink` only revokes map claims and erases net-worth history. So P241's new `revalidateTag` call does not affect them.

## 2. Deletions: no remaining importers, and coverage kept

I grepped NEW `src convex e2e scripts eslint.config.mjs .fallowrc.json .github` for each name:

- **Gone with 0 references:** parseIntHeader, parseStoredInt, structureIdsSeenBy, searchWithCharacter, firstValidSearch, JobsEsiRead, SkillsEsiRead, SheetEsiRead, CorpContextRead, AuthedSingleRead, CorpStructuresReadResult, AuthedPagedRead, RefreshCorpMember, LinkedCharacterHealth, CorpStructuresSyncState, memoizePerRun, pendingStaticsBySystem, getCharacterSkills, getSkillsForCharacters, readCharacterSkills, saveHoldingNodes, MAX_CUSTOM_STRUCTURE_RIGS, MAX_CORP_STRUCTURE_RIGS, NODE_INSERT_BATCH, STRUCTURE_ESI_PATH, slotsFromRigs.
- **Moved, not deleted:** fetchCharacterSearch and EsiCharacterSearchError are now module-private in `composition/esi-character-search.ts`.
- **Export dropped only:** rigFitsStructure is private in `data/eve-data/structures.ts`. Its only other textual use is a local test helper that calls the production `fittingRigs`.
- **Made private:** enqueueBudgetDeferral, targetedOwnerResult and readCharacterSkillLevels have no external users.

Where each removed test's behaviour is now asserted:

- **saveHoldingNodes, "reports superseded when a concurrent refresh wins the insert race"** (corp-holdings queries.db.test). The non-transactional path is gone; holding nodes are now replaced only inside the corp-assets transaction. Superseded mapping is asserted in `db/snapshot-replace.test.ts` "replaceOwnerSnapshot reports a wrapped unique violation as superseded once the transaction rolled back". Corp serialization is asserted in `owned-assets/corp-snapshot.db.test.ts` "serializes simultaneous refreshes into one complete content and index pair". The two remaining node tests ("stores the tree…" and "replaces the corp tree…") still run through `replaceHoldingNodes` on a transaction.
- **NODE_INSERT_BATCH chunking:** snapshot-replace.test "insertInBatches issues nothing for an empty set and splits a large one, in order, into 1000-row statements", plus the 9,000-row DB test.
- **owned-assets, "coalesces a refresh that loses the insert race to superseded, stamping nothing":** owned-assets queries.db.test "reports a unique violation as superseded and rolls the whole replace back" (asserts kept rows, kept etags, no revalidate) and "queues a refresh behind an open one on the sync row…".
- **live-dataset-view, "enumerates linked characters and reads data + per-id state in parallel":** replaced by "reads data and one batched state map concurrently…". It still proves concurrency, because readStates is called while readData is held pending.
- **rigFitsStructure describe:** renamed "the rig fitting rule" with the same cases, driven through `fittingRigs`. "Upwell rig slots" adds tests for rigSlotsFrom, fittedRigIds, fittingRigs and findUnfitRig. validation.test is stronger: exact reasons instead of `ok:false`.
- **memoizePerRun:** memoize.test "memoizeAsync calls through once per argument…" and character-sheet refresh.test "reads the sheet once for the direct phase and once for structures".
- **pendingStaticsBySystem:** memoize.test "singleFlight shares one load per key…" and "singleFlight hands one rejection to every concurrent caller and does not cache it". wh-statics client.test is unchanged.
- **parseIntHeader / parseStoredInt:** both had identical semantics to the new `parseIntOrNull`. Covered by headers.test "parseIntOrNull prefix-parses…" and "intHeader parses the named header…".
- **getSkillsForCharacters / readCharacterSkills / getCharacterSkills:** skill-queue queries.db.test "reads the queue, SP figures and levels from one row…" and "maps each listed character with a sync row…". board-view.db.test still exercises the board end to end.
- **Type-only removals** (JobsEsiRead, SheetEsiRead and the rest of the read-result types, RefreshCorpMember, LinkedCharacterHealth, CorpStructuresSyncState): these had no tests of their own. Typecheck covers them.

Removed-assertion counts per test file: every removed `expect` is re-added in the same or a stronger form. Examples: `'max'` → `{ expire: 0 }`, `.ok` → the full reason, `/roles` → `/roles/`.

## 3. New tests: can they fail against OLD, and are they sound?

- **P189 four refreshers** (`owner-sync-port.concurrency.db.test.ts`). On OLD, four concurrent `getFreshAccessTokenForCharacter` calls each run `loadAccountRow` before any write commits. So all four call SSO with RT0. The three losers get invalid_grant, miss the CAS, and reflect the stored rotated token. `vends` would still match, but `expect(fetchSpy).toHaveBeenCalledOnce()` fails with 4 calls. Each mock call builds a new `Response.json` and the token body is a string (`body.toString()`), so the spy can read it. The test is gated by `describe.skipIf(!harness.reachable)`.
- **P239, 9,000 rows.** OLD issued one INSERT with 9,000 × 8 bound parameters, which is over postgres-js's 65,534 cap, so it throws. The type ids are distinct, so NEW has no unique violation.
- **P239 owned-assets queue test.** On OLD the loser's DELETE waits on the blocker's row. After COMMIT its statement snapshot cannot see the blocker's new (34,100) row, so its INSERT (34,5) hits a unique violation. OLD returns 'superseded'; the test expects 'saved'.
- **P239 structures queue test.** On OLD, delete and insert run before the blocked sync upsert, so `storedStructureIds` during the block is not `[600020]` and the test fails. The rollback test also fails on OLD: the delete commits, the insert throws, and rows come back empty.
- **"Superseded rolls back".** A duplicate `[asset(), asset()]` really violates the natural key, because `saveOwnedAssets` does not aggregate.
- **P241 orchestrator test.** OLD `runPurge` never calls `revalidateTag`, so `mock.calls` is `[]` and the test fails.
- **P241 registry gate.** On OLD no contributor has `cacheTags`, so all six are undeclared and the test fails. The scan is not vacuous: an empty match would fail its first `toEqual` of six names.
- **P150 abort tests** (capability-route.test, mutation-route.test). OLD `runCapabilityRoute` ignored the signal and recorded the aborted 503 or failure, so `toHaveBeenCalledOnce` and `recordedOutcomes` fail. The handler builds a fresh Response each call.
- **55d0e25b.** This tests new code. Each case kills a specific mutation:
  - Dropping the 401/403 skip fails case 2.
  - An off-by-one in `remaining` fails case 2.
  - Retrying on a 503 fails case 3.
  - A wrong exhaustion error fails case 4.
  - A missing `throwIfAborted` fails case 5: the token would be vended.
  - The `beforeEach` resets both mocks, and every call builds a fresh Response.
- **P193 route tests.** OLD did not skip 401/403 and returned 503, while the test expects 200.
- **Other red-to-green tests:**
  - P292: OLD made 9 sheet reads; the test expects `[1, 1]`.
  - P184: tests expect `{ expire: 0 }`; OLD used `'max'`.
  - P297: `readRolesForSync` is new.
  - P188: priority picker tests.
- **Harness gating.** All new DB tests use `skipIf(!harness.reachable)` in `*.db.test.ts` files. The harness refuses to skip when `DATABASE_URL` is set, and CI has Postgres.
- **Shared fixtures.**
  - `ownedDatasetPortFake` is a byte-for-byte copy of the two local `makePort` fakes it replaces (assets and blueprints).
  - The `corp-snapshot.db.test` port literal has the same members.
  - `ownerFixture` matches every old builder, and `corporationId: null` is added only to character-only owners.
  - No failure path became always-succeed.
- **next/cache mocks in DB tests.** They do not hide a production failure:
  - `expireNow` uses `revalidateTag(tag, { expire: 0 })`. Next 16.3.4's `validateAndNormalizeCacheLifeProfile` accepts it, and the docs recommend it outside Server Actions.
  - The only new `revalidateTag` call site is `runPurge`. Its callers are all request-scoped: the account/delete and purge-character routes, the housekeeping cron route, and `proveCharacter` in Better Auth's route (which already uses `after()`).
  - No script, Convex module or e2e seed imports a purge or a writer.
  - Every other writer change is a 1:1 swap of `'max'` for `expireNow`, or a removal (the rig save).
  - Unmocked DB tests that reach purge either use the `['credential']` tier only (owner-transfer.db.test) or mock the purge.
- **Order dependence and shared bodies.**
  - Per-test `mockClear`/`mockReset` on `revalidateTag`.
  - Distinct owner ids in files without reset.
  - Fake timers are restored in the esi index.test `afterEach`.
  - Response-returning mocks use `…Once` or per-call construction.
  - The market-prices X-Pages test returns one shared Response, but it asserts exactly one `esiFetch` call per loop iteration, so a regression fails anyway.
- **schema.db.test pg_index fix.** `map_access` has no primary key and exactly one unique index (`map_access_map_grantee_unique`). OLD (`pg_indexes`, `indexdef LIKE 'CREATE UNIQUE INDEX%'`) and NEW (`pg_index` with `indisunique` on `'<schema>.map_access'::regclass`, `pg_get_indexdef`) return the same row with the same text, so the assertion is unchanged.

## 4. Suppressions, config and rails

- **Added lines:**
  - No `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `.skip`/`.only`/`.todo`, istanbul/c8/v8 ignores, or Fallow directives.
  - The only `skipIf` lines are harness gating.
  - The only "fallow" hit is the kit's `--fallow-env` usage string.
- **Changed files:** wave 11 changes nothing outside `src/`, `docs/` and `convex/`. eslint.config.mjs, .fallowrc.json, vitest.config.ts, package.json and .github are untouched.
- **eslint `importNames` entries** (only in the cron block):
  - Live: `requireCronAuth` (`src/transport/cron.ts:20`), `withAdvisoryLock` (`src/db/advisory-lock.ts:26`), `directClient` (`src/db/index.ts:140`).
  - Dead since wave 10 01e0edf2: `logUsageEvent`, as noted above.
  - All other entries are module-group patterns that do not name exports.
- **Rails:**
  - vendor-resilience-registry: every wrapper `module`/`symbol` still exists; wave 11 touches none of those modules.
  - syntax-exemption rail: no exemption files changed; the new `platform/esi` files build paths, not hosts.
  - guard-emissions: names none of the changed routes.
  - Purge coverage and registry: extended with the `cacheTags` gate.
  - same-origin coverage: moves custom-structures/search from exempt to pipeline, matching P150.
  - idempotency and data-ownership registries: updated to `runMutationRoute` and replaceOwnerSnapshot.
  - None references a deleted export.

## 5. Kit/docs commits

- **1f7471e6:** adds one link line to the wave 10 guide.
- **d90a23e7:** wave-11.json cautions text, and P240 marked done.
- **31b896c9:**
  - Adds an opt-in `hostGuard` flag: `make_args.py --host-guard`, default false. When set, implement-wave.js skips `env_guard.sh`, `cleanup.sh snapshot` and `cleanup.sh sweep`, and returns a note asking the operator to run the sweep. HANDOFF.md tells the operator to run them from the main session.
  - The commit adds no destructive command: no rm, git reset/clean, or kill. It only stops the workflow from running two existing scripts. Those scripts are unchanged; their existing behaviour is `rm -rf .next/dev/types`, killing next dev only with `--kill-next`, killing only dev processes that appeared after the snapshot, and removing only clean worktrees.
  - Caveat for the operator: with `--host-guard`, the workflow no longer checks that `DATABASE_URL` points at local :5433. Running `env_guard.sh` by hand first, as HANDOFF says, is what keeps the DB harness off a remote database.
- **AGENTS.md rules:**
  - No rule is broken: no merges, nothing suppressed, no CI or config change.
  - That `pnpm check` passed before each push is the PR's claim; I could not verify it from refs.

## Leads checked and refuted

- **Duplicate `structure_id` in an ESI page set.** With replaceOwnerSnapshot this now resolves as 'superseded': the transaction rolls back and no stamp is written. Before, it threw and left the structures deleted. The new behaviour keeps the prior rows and refetches on the next view. It is quieter, not lossy, so I dropped it (outside this lens anyway).
- **`problem-matrix.test` mocks `upsertCorpStructureRigs` returning undefined.** The rigs route reads `saved.rigTypeIds`, but that test only drives the 403 path.
- **P188 picker change** (first match → priority order): for single-result datasets the result is the same. The character sheet's private copy already used this priority.
- **singleFlight on vendTokenFor:** the entry is cleared on settle, so nothing outlives custody. The DB test asserts null after unlink.
- **P150 aborts and the ESI error budget:** dispatch.ts:151 skips the no-response report when the caller's signal aborted.
- **`corp-viewer.test` now uses the real `usableStoredRoles`:** it is real logic, so this is not vacuous.
- **The `countSessionsWaitingOn` poll could count other suites' sessions:** it cannot. They lock other schemas' relations, so they never wait on the holder.
