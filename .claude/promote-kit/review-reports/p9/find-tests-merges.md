# PR #676 wave 9: tests, merges, deletions, kit/docs commits

Scope: `git diff origin/development...origin/claude/primitives-wave-09` (OLD = origin/development 3a8e28c3, NEW = wave tip b5102b80). Read-only review through refs.

## Findings

### 1. A deleted test case left one rule unchecked: unlinking a character that isn't the active one must leave the active character alone (low, test coverage only)

- **Where (new ref):** `src/app/api/account/characters/unlink/route.test.ts:143` replaces the old case and mocks `reconcileAfterCharacterRemoval` (line 99). The rule itself is the guard at `src/platform/auth/account-purge.ts:40` (`if (u?.activeCharacterId === characterId)`).
- **Old assertion:** OLD `route.test.ts:120` is the test "unlinks and re-points only when the removed character was active". Its second half (lines 151-153) posts `characterId: '200'` while 100 is active, then asserts `expect(repointActiveToOldestMock).not.toHaveBeenCalled()`.
- **New state:**
  - All three unlink paths now hand the active-character decision to `reconcileAfterCharacterRemoval` → `repairUserIdentity`, through `unlinkCharacter`.
  - The route test mocks reconcile, so it can no longer check this.
  - Every DB case that goes through reconcile removes the active character:
    - `admin-users.db.test.ts` "repairs the active character after operator unlink…", "moves a synthetic email off the unlinked character…" and "keeps a surviving source and moves its identity off the moved character"
    - `account-purge.db.test.ts` "purges a fresh Better Auth link…", "preserves a fresh Better Auth link…" and the new malformed-id case
  - No test on the new ref asserts that removing a character that isn't active leaves `activeCharacterId` unchanged. The same goes for an email that doesn't name the removed character.
- **Scenario:** Someone drops or inverts the `activeCharacterId === characterId` guard in `repairUserIdentity`. The suite still passes. In production, every alt unlink (self-service, admin, reassign) silently moves the user's active character to the oldest link.
- **This is not a production defect today.** The guard in `account-purge.ts:40` is correct.
- **Minimal fix:** add one DB case in `src/platform/auth/admin-users.db.test.ts`.
  - Setup: seed MOVED and SURVIVOR on SOURCE, with `activeCharacterId: SURVIVOR` and `email: syntheticEmail(SURVIVOR)`.
  - Action: `deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR, runners)`, or `unlinkCharacter` with a direct delete.
  - Assert: the identity is still `{ email: syntheticEmail(SURVIVOR_CHAR), activeCharacterId: SURVIVOR_CHAR }`.

No other findings.

## Lens results

### 1. Merges
- The merge base of dev and the wave is 3a8e28c3, the dev tip. b5102b80 is a real two-parent merge (0931da31 + 3a8e28c3), not a squash.
- The wave branched from a66b25d9, the wave-8 tip. a66b25d9..0931da31 is 22 linear commits with no merges: the 19 items, 0931da31 (P146 review), defc5b5e and 33b317a6.
- Byte-identical checks:
  - `git diff 0931da31 b5102b80` == `git diff a66b25d9 3a8e28c3`, so the merge brought in exactly the dev side.
  - `git diff 3a8e28c3 b5102b80` == `git diff a66b25d9 0931da31`, so the three-dot diff is exactly the wave's commits. There were no conflict edits.
- The two sides touched no common file. The only file both the wave and a promote fix ever touched is `src/data/eve-data/api-contract.ts`:
  - 6316aa5d added `pending` to `entityNamesResponseSchema`.
  - P153 (9baf9dcb) only drops `export` from `universeAssetVersionParamsSchema`.
  - The hunks are disjoint, and `pending` is intact on the tip.
- Promote fixes: 5d9caa3a, 0b1e8bf0, c830dabc, bfbbf20e, ba191c61, c2678df7, 4212d7e6 and 6316aa5d are ancestors of the wave base. 3a8e28c3 arrives through the merge.
- Every file those fixes touched is identical on dev and the wave tip, apart from api-contract.ts above. Spot-checked on the tip:
  - `loadedSystemsById` and `useSystemsById` are present.
  - `if (open) onConfirm()` is at `confirm-dialog.tsx:92`.
  - The `ADVISORY_LOCKS` pin is present, and so is `env_guard.sh`.
  - CockpitKpis has the signed `formatSigned(marginPct)`.
  - entity-names has `pending`, and `drizzle/0082_eve_entity_names_resolved_at.sql` is present.
- StructuresManager is the only wave file that consumes 3a8e28c3's API (`useSystemsById`). The wave changed only its read-identity lines there.

### 2. Deletions
Nothing in src, convex, e2e or scripts still imports the deleted or un-exported symbols. The grep covered:
- `admin-mutation`, `adminMutationGate`, `checkAdminMutation`, `is-admin`
- `composition/session` `isAdmin`, `computeIsAdmin`, `resolveErrorMessage`, `outcomeMessage`
- `isDeleteAcknowledged`, `readRedis/MemoryBudgetSnapshot`, `switch/unlinkCharacterFormSchema`
- `EVE_PROVIDER_ID` from eve-sso or eve-sso-constants. Every importer now uses `@/lib/eve-provider`; only an unrelated mock line was dropped.
- `universeAssetVersionParamsSchema` and `systemStaticsParamsSchema` are now used only inside their own contract module.

In src outside tests, `state_mismatch` appears only in `link-merge.spike.test.ts`, where it is Better Auth's own `?error=`. It is not `auth_error`.

Where each deleted behaviour is still asserted:

**Admin detection**
- `is-admin.test.ts` cases: `admin-policy.test.ts` "grants admin to the ADMIN role and to the env superadmin, never through an unset or garbage id". It covers USER/ADMIN/superadmin, `''`, `not-a-number`, plus `0`, and also "reads the superadmin only from a positive whole-number…".
- `isAdmin(null)`: `route-guards.test.ts` "checkAdmin uses forbidden for anonymous…" and "requireAdminPage redirects anonymous…".
- Wiring into the session: `session-identity.test.ts` "…feeds characterId + role to the injected isAdmin".

**The admin gate**
- `checkAdminMutation` (admin before origin): `mutation-route.test.ts` "maps an authorization failure without observing, parsing, or handling" (origin never called) and the boundary-order tests. Also the per-route tests:
  - wh-statics: "refuses a caller without admin authority before the origin check" and "returns the cross-origin problem before parsing the form"
  - esi-jobs/retry: "returns the mapped cross-origin problem before parsing"
- same-origin-coverage DIRECT_MUTATIONS / ADMIN_MUTATIONS checks: all of those routes moved into `PIPELINE_MUTATIONS`, whose `runMutationRoute` source check now covers them. Account/delete also has a new route test, "throttles before reading the session, then checks origin only after authorizing".

**Redirect helpers and statuses**
- Account unlink: "refuses…" (`error=not_linked` / `last_character`), "unlinks, then settles…" (`/settings/characters`) and "maps an unlinkAccount failure…" (`error=unlink_failed`).
- Admin unlink: "refuses…" (`/admin/users/eve-user-2?error=not_linked`, `last_character`) and "reports a character removed by a concurrent unlink as a conflict" (`unlink_failed`).
- wh-statics: refresh, promote, reject, not-pending and empty, with exact locations.
- Role: pathname `/admin/users` and sanitised `q`.
- Reassign, sessions/revoke and esi-jobs/retry: exact locations.
- Active-character: `?error=not_linked`, then success.

**Other deleted helpers**
- `outcomeMessage`: `statics-view.test.ts` "outcome notice".
- `resolveErrorMessage`: `error-copy.test.ts`, both tests.

**Reassign route cases**
- "rebinds the source identity…": `admin-users.db.test.ts` "keeps a surviving source and moves its identity off the moved character" and `character-unlink.test.ts` "removes the character, then settles…".
- "keeps the committed move successful when source reconciliation fails" is intentionally inverted (declared 500). It is covered by `character-unlink.test.ts` "a reconcile failure skips the link-changed runners…" plus `mutation-route.test.ts` "lets unexpected handler errors propagate".

**Gap:** the account-unlink "inactive" assertion. See finding 1.

### 3. New tests
P161 DB regressions, reasoned against the OLD code:

| Test (new ref) | Old code path | Result on old code |
|---|---|---|
| `admin-users.db.test.ts` "moves a synthetic email off the unlinked character on the admin path and a direct removal" | Old `deleteLinkedCharacter` never touched `user.email` (only `repointActiveToOldest`) | email stays `90000021@eve.invalid`, so `toEqual({email: synthetic(SURVIVOR)…})` **fails**. The import of `character-unlink` also fails. |
| `admin-users.db.test.ts` "keeps a surviving source and moves its identity off the moved character" | Old `reassignCharacter` with a survivor only repointed the active character. Reconcile ran only when no rows remained. | email stays synthetic(MOVED), so it **fails** (library level; the old route compensated by calling reconcile) |
| `account-purge.db.test.ts` "repairs the identity from the oldest parseable link and never mints NaN@eve.invalid…" | Old `repairUserIdentity(…, firstRemaining.accountId)` used `syntheticEmail(Number('not-a-character'))` | email becomes `NaN@eve.invalid`, so it **fails** |
| `account-purge.db.test.ts` "admin-users 'refreshes role reads…'" (last-character race now deletes the user) | Old code left an empty user | **fails**, as the declared P161 change intends |

- **DB gating:** both new DB cases sit inside the files' existing `describe.skipIf(!harness.reachable)` blocks, with the same harness (`resetBetweenTests`). `runners.runBeforeUserDelete` and `runAfterCharacterLinkChanged` are reset in `beforeEach`, so the `not.toHaveBeenCalled()` checks don't depend on order.
- **Spot-checked that other new tests can fail:**
  - `link-character.test.ts`: async wrapper plus an `unhandledRejection` listener; the old `void link()` had no catch.
  - `feedback/route.test.ts`: a valid-body cross-origin post now gets 403 with `checkRateLimit` not called. The old code rate-limited first.
  - Universe assets: `read` called 2 times, not 4, for malformed versions.
  - `error-copy.test.ts`: `constructor` / `__proto__`. The old code returned the inherited function.
  - `admin-policy.test.ts`: env `0`. The old code granted admin to character 0.
  - `map-creation-client.test.ts`: `not_linked` copy.
- **Order and isolation:**
  - `map-affiliation-access.test.ts` uses `vi.resetModules()` per test for the coalescing state, `useRealTimers` in `afterEach` and `resetAllMocks` in `beforeEach`.
  - `character-authorization.test.ts` uses `resetAllMocks`.
  - `read-identity.test.ts` seeds `publishReadIdentity(null)` first.
  - eve-sso stubEnv calls are undone with `unstubAllEnvs`.
  - `map-creation-client.test.ts` uses `unstubAllGlobals` and `useRealTimers`.
- **Response and Request reuse:** every Request and Response in the new tests is built per call. The one shared Request (`seeOther`'s `formPost` in `api-response.test.ts`) has no body and only `.url` is read.
- **`src/lib/__tests__/capability-outcomes.ts` (0931da31):**
  - `capabilityOutcomeMock()` is a typed `vi.fn`.
  - `recordedCapabilityOutcomes` filters `capability_outcome` calls. Every suite asserts non-empty expected arrays, so it can't pass vacuously.
  - The hoisted `vi.mock` factory reads the top-level mock only inside the arrow function, so there is no TDZ.
  - All four suites call `emitCostMetricMock.mockReset()` in `beforeEach`.
- **P250 sanity check:** I compared every contract passed as `endpoint:` to `runMutationRoute` with its authorize, origin and parse failure codes. All declare `unauthenticated`/401, `cross_origin`/403 and `invalid_json`+`invalid_body`/400. Admin and form routes pass no endpoint. Feedback uses `allowAnonymous` and has no 401. No stage failure can throw at serialization.

### 4. Suppressions and config
- Added diff lines contain no `eslint-disable`, `@ts-expect-error`/`ignore`/`nocheck`, `.skip`/`.only`/`.todo`/`skipIf`, fallow, istanbul/v8/c8 ignore, baseline or threshold.
- Nothing outside `src/` and `docs/` changed: `eslint.config.mjs`, `.fallowrc.json`, `vitest.config.ts`, `package.json`, `scripts/` and `.github` are untouched.
- **Registries:**
  - syntax-exemption-rail (eve-sso.ts, eve-sso-constants.ts, preview page) and vendor-rail owners are unchanged and still match the config.
  - guard-emissions adds `seeOther` and `apiFailure` to `PROTECTED_RESPONSE_EXPORTS`, and `CORE_EXPORTS` route-guards stays `{checkSession, checkAdmin, checkUserId}`.
  - Idempotency-registry entries for the changed routes are still accurate.
  - same-origin-coverage now lists every admin route, account/delete and feedback as pipeline routes.

### 5. Kit and docs commits
- 33b317a6 adds only a "Landed in #674" line to the wave-8 guide.
- defc5b5e makes the common note wave-agnostic. It adds "run `pnpm exec vitest run scripts` when editing eslint.config.mjs", which is stricter than and additive to `pnpm check`. It also updates the wave-9 cautions with wave-8 facts and marks P067 done.
- Neither commit deletes anything or suggests squash, force-push, skipping `pnpm check`, suppressions or threshold changes. The wave merges development with a merge commit, as AGENTS.md requires.

## Leads checked and refuted
- **The merge dropping or reverting a dev change:** refuted by the byte-identical diff equalities. There was no shared file except disjoint api-contract.ts hunks.
- **The 6316aa5d `pending` field lost in api-contract.ts:** present on the tip.
- **Admin route tests vacuous because they set `isAdmin: false` while the role is ADMIN:** `checkAdmin` reads the session's computed `isAdmin` field, not the role, so the 403 tests are real.
- **Guard tests failing because `getFullSession` calls `after()`:** every affected suite mocks `next/server` `after`. `route-guards.test.ts` asserts the scheduling. React `cache` doesn't memoize outside RSC, so call counts hold.
- **Reassign settle failure now skipping the target's linkChanged:** the same as the old library semantics. The old test "keeps the source user when required collaborative purge fails" already asserted no linkChanged at all. It is documented in `character-unlink.ts`.
- **The `owned-data-coverage` source scan being empty or vacuous:** it matches `*OnView(` route files (corp-structures and others) and requires the measured-read count to equal the OnView count.
- **The vendor/server-only rails referencing removed eve-sso exports:** they are config-level path lists and are still valid.
- **e2e depending on the old 404/409/400 statuses or `auth_error` codes:** e2e has no references to the changed routes.
