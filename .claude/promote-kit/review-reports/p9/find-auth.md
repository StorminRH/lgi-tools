# Wave 9 review: auth, sessions and ownership (security lens)

Scope: P161, P167, P176, P254, P256, P257, P222, P337, EVE_PROVIDER_ID import move.
OLD = origin/development, NEW = origin/claude/primitives-wave-09.

## Findings

### F1. P161 repairs `user.email` only for future unlinks. Emails left stale before deploy stay open to account takeover (medium)

- **Where:** `src/platform/auth/character-unlink.ts:63` and `src/platform/auth/account-purge.ts:34-38` (NEW). The diff adds no migration or backfill (`git diff --stat` over `drizzle/`, `scripts/` and `src/db/` is empty).
- **Not a regression.** It is a gap in a declared security fix: the PR body's P161 entry says the stale email let a later sign-in "link back onto the old user", and the fix only stops new stale rows.
- **Scenario:**
  1. Before deploy, user U2 last signed in as R, so `overrideUserInfo` set `user.email = 'R@eve.invalid'`.
  2. U2 unlinked R through `/api/account/characters/unlink`. OLD never touched the email.
  3. After deploy, the buyer of R signs in as R with no session.
  4. `proveCharacter` finds no account row for R and returns NONE (`owner-transfer.ts`, `if (!row) return NONE`).
  5. Better Auth's `findOAuthUser` falls back to the email lookup and finds U2 (`node_modules/better-auth/dist/db/internal-adapter.mjs:461-478`).
  6. `handleOAuthUserInfo` implicitly links R to U2. Both sides pass the checks: `getUserInfo` returns `emailVerified: true`, and U2 was created verified (`oauth2/link-account.mjs:18-31`).
  7. It then creates a session for U2. The buyer is signed in as the seller.
  - NEW's reconcile never runs for rows that are already stale. The hole closes for a user only when they sign in again through OAuth, because `overrideUserInfo` then rewrites the email. Users who keep refreshing a session, or never return, stay exposed.
- **Evidence:**
  - OLD user unlink `finally`: `runAfterCharacterLinkChanged(...)`, then repoint the active character. No email write.
  - NEW does the repair only inside `unlinkCharacter`'s settle step, so only for removals made after deploy.
- **Minimal fix:** ship a one-off backfill, run at deploy, for every user whose email is `<n>@eve.invalid` and who has no `eve` account with `account_id = '<n>'`:
  - Set the email to `syntheticEmail(oldest parseable remaining link)`.
  - If that address is already held by another user, or the user has no link left, use a placeholder that can never collide and that EVE SSO can never produce, for example `<userId>@user.invalid`.
  - Without the backfill, record the remaining exposure in the PR's follow-ups.

### F2. A reconcile failure now skips `runAfterCharacterLinkChanged` and its location-tracking teardown on all three unlink paths (low)

- **Where:** `src/platform/auth/character-unlink.ts:62-66` (NEW).
  ```ts
  } finally {
    ({ accountEmptied } = await reconcileAfterCharacterRemoval(userId, characterId, runners));
    await runners.runAfterCharacterLinkChanged({ userId, characterId });
    await afterSettle?.(removed);
  }
  ```
- **What OLD did:**
  - User unlink ran `runAfterCharacterLinkChanged` first in its `finally`, then the active-character repoint. Admin unlink did the same.
  - Reassign's non-empty source ran `linkChanged(from)` and `linkChanged(to)` inside `reassignCharacter`. The route's reconcile came after those, wrapped in try/catch and logged.
  - So on OLD, for user unlink, admin unlink and a multi-character reassign, nothing that failed after the removal could skip `runAfterCharacterLinkChanged`.
- **What NEW does:** the only thing the PR declares is that a reassign reconcile failure returns 500. On NEW, any throw from reconcile also skips:
  - `teardownLocationTracking(userId, characterId)`: the Convex location-tracking purge and `cancelPendingTracking` for the removed character on the old owner.
  - `reprojectMapsForCharacter(characterId)` for maps that block the character.
  - `revalueAfterRosterChange(userId)`.
  - On reassign, the receiving admin's `linkChanged(to)` through `afterSettle`.
  - It also skips the route's usage event for an unlink or reassign that has already committed. The response becomes a bare 500 to a native form post.
  - `character-unlink.test.ts` ("a reconcile failure skips the link-changed runners") pins this as intended, but the PR body does not declare it.
- **Concrete triggers:**
  - A transient Neon error in reconcile's selects or update.
  - Deterministically, the legacy state from F1. Example:
    1. U2 still holds `email = 'R@eve.invalid'` after unlinking R on OLD.
    2. R was later linked to U1 through the link flow, which has no email check because `allowDifferentEmails: true`.
    3. U1 unlinks its email character X, and R is U1's oldest remaining link.
    4. `repairUserIdentity` runs `UPDATE user SET email = 'R@eve.invalid'` and violates the unique index on `user.email`.
    5. The unlink has already committed through Better Auth, but the active-character repoint (which runs after the email update), the location teardown and the reprojection are all skipped, and the user gets a 500.
- **Minimal fix:**
  - Nest the settle so the link-changed runners always run: `try { reconcile } finally { linkChanged; afterSettle }`.
  - Optionally, have `repairUserIdentity` tolerate a unique-violation on the email write, either by logging and skipping or by trying the next remaining character.

## Leads checked and refuted

- **Ownership on unlink and reassign.**
  - User unlink still checks `listLinkedCharacters(session.user.id)`, then calls Better Auth `unlinkAccount`, which deletes only from the session user's accounts.
  - Admin unlink moved from `accountBelongsToUser` to `listLinkedCharacters(...).some(...)`. That reads the same rows: the join is a leftJoin, the filter is `eveAccountsForUser`, and only malformed ids drop out.
  - The DELETE and the compare-and-swap UPDATE still use `userAccountMatch(userId, characterId)`. That expands to `userId`, `providerId = 'eve'` and `accountId = String(id)`, the same rows as the old predicates.
  - They still run inside `changeCharacterOwnership`, which is `withLockedUsers` plus the pending-deletion check, as before.
  - Reconcile runs outside the lock, as the old reassign's did.
- **Reconcile coverage.**
  - It runs after every removal that matched: user unlink, admin unlink, and reassign including a lost compare-and-swap.
  - It is skipped only when nothing was removed (revocation failed, remove failed, or admin no-match).
  - The empty-user deletion on a race past `last_character` is intended; the db test says so.
  - Reassign's declared 500 is implemented: the reconcile throw propagates through `reassignCharacter`.
- **Race between concurrent self-unlinks.** Two concurrent self-unlinks can empty a user, and reconcile then deletes it. This is intended (`admin-users.db.test.ts` comment), and Better Auth's last-account check was already racy on OLD.
- **Concurrent unlink of the replacement character.** Reconcile can write the email of a replacement that a concurrent unlink is removing at the same moment. Narrow, and the old reassign had the same pattern. Not reported.
- **`isAdminIdentity` vs `computeIsAdmin` and `session.isAdmin`.**
  - The logic is identical: ADMIN role, or the active character equals the superadmin id.
  - `superadminCharacterId()` is only stricter: `''` mapped to 0 on OLD and is null now; NaN was never matched.
  - `user.role` is a pg enum ('USER' | 'ADMIN'), so `normalizeCharacterRole` changes nothing for real rows, including the JWT role. Convex does not read the role.
  - `checkAdmin`'s denial (`!session?.isAdmin`, 403) and its order before the origin check are unchanged.
  - `/preview/primitives` now allows an ADMIN user with no active character, which is declared.
  - There is no ban concept in the codebase.
- **`getFullSession` side effects.**
  - `after()` is scheduled only when the session is non-null, so never for signed-out visitors.
  - The guarded routes make no second session call.
  - A duplicate `checkUserCharacterAuthorizations` is harmless: each claim is atomic, and replays of the access-change outbox are idempotent.
  - Authorize-before-origin ordering is unchanged. A cross-site POST does not carry the SameSite=Lax cookie anyway.
  - The corp-sharing route's switch to `checkSession` plus its endpoint contract still matches the declared problem codes (401 unauthenticated, 403 cross_origin, 400 invalid_*).
- **Drain coalescing.**
  - The window is keyed by start time, so after 15 s a new drain starts even if one hangs.
  - A rejection clears the slot.
  - A run that resolves with `failed > 0` is retried by the next visit after the window.
  - Post-enqueue callers (`publishAccessChanges`, `corp-access`, overflow) stay uncoalesced.
  - The shared promise lives inside an `after()` context that awaits it.
- **P254.**
  - `requireSessionPage` matches the old inline guard.
  - `isAuthErrorCode` uses `includes`, which rejects `constructor`, `__proto__` and arrays.
  - Nothing in `src`, `convex` or `e2e` produces the removed codes.
- **P256.**
  - `setActiveCharacter`'s `UPDATE ... WHERE id = $u AND EXISTS (account row)` selects the same ownership rows; the db test covers both the not-owned and the unknown cases.
  - The active-character route is its only caller.
  - `maps/create`'s only `reason` is `'unlinked-creator-character'`, and the contract now declares `not_linked`.
  - The other not_linked bodies are byte-identical to before.
- **P257.**
  - `/^[0-9]+$/` plus a safe-integer check rejects `''`, whitespace, exponent and hex forms, which `Number()` used to accept, and keeps every real EVE id.
  - `mapLinkedRows(rows, toLinkedCharacter)` has the same signature as before.
  - A malformed access change is acknowledged without an enqueue, and a malformed due id is claimed and never refreshed (the claim expires). Both are declared.
- **P222.**
  - Every rewritten predicate selects the same rows.
  - The admin search join moved from `::text` equality to the bigint CASE join, which is equivalent for digit ids.
  - The telemetry query's `'eve'` became `EVE_PROVIDER_ID`, which is `'eve'`.
  - `startCharacterLink` now `.catch`es the rejection.
- **EVE_PROVIDER_ID imports.** No importer from `./eve-sso` or `eve-sso-constants` is left in `src`, `convex`, `scripts` or `e2e`; only docs mention them.
- **P337.**
  - The credentials are read inside `buildTokenRequestInit` at call time, not at module load, so build and edge are unaffected.
  - The build happens before each `try`, so a missing credential still throws from refresh, with no retryable backoff, and from revoke into `bestEffort`.
  - The `genericOAuth` config reads are unchanged.
  - Nothing new is logged.
- **Pre-existing, outside this diff: `POST /api/auth/unlink-account` stays reachable.** The Better Auth catch-all exposes it, and it bypasses `unlinkCharacter` entirely: no map-claim revocation, no email repair. No UI calls it; only a user's own hand-crafted request could reach it. This is a lead, not a wave-9 defect.
