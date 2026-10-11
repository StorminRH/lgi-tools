# Wave 9 review: mutation and transport pipeline (P251, P141, P146, P250, P255, P306)

## Findings

None. I found no defect I could tie to a concrete failure from a real caller or input. Every behaviour change I saw in this lens is one the PR body declares, and each is implemented as described.

## Route-by-route verification (old `origin/development` vs new `origin/claude/primitives-wave-09`)

Stage order in `runMutationRoute` (`src/app/api/mutation-route.ts`) is the same on both refs: preflight, then authorize, then `requireSameOrigin`, then parse, then handle, all inside `runCapabilityRoute`.

| Route | Rate limit (key/budget, position) | Auth | Origin | Parse | Order old → new |
|---|---|---|---|---|---|
| admin/role | none → none | checkAdmin (403 forbidden) | after admin | parseFormBody `[userId,nextRole,q]` | admin→origin→parse, unchanged (old `adminMutationGate` = checkAdmin then origin) |
| admin/characters/reassign | none → none | checkAdmin | after admin | `[characterId,fromUserId]` | unchanged |
| admin/esi-jobs/retry | none → none | checkAdmin | after admin | `[jobId]` | unchanged |
| admin/wh-statics | none → none | checkAdmin | after admin | `[action,snapshotId]` (union; refresh arm needs `snapshotId` undefined, which it gets) | unchanged |
| admin/characters/unlink | none → none | checkAdmin | after admin | `[userId,characterId]` | already on the pipeline; unchanged |
| admin/sessions/revoke | none → none | checkAdmin | after admin | `[userId]` | unchanged |
| account/active-character | `account-switch`/30, preflight before session and origin | checkSession | after session | `[characterId]` | unchanged |
| account/characters/unlink | `account-unlink`/10, preflight before session and origin | checkSession | after session | `[characterId]` | unchanged |
| account/delete | `account-delete`/5, preflight before session and origin (old: same order, written out by hand) | checkSession (401) | 403 cross_origin after session | none (`input: none`, contract `request: null`) | unchanged |
| feedback | `feedback`/5 IP, inside handle after JSON parse | allowAnonymous | **moved first**, before parse | readJsonBody | old: parse→limit→validate→origin; new: origin→parse→limit→validate. This is the declared change. Malformed JSON still never reaches the limiter, getSession still runs only in handle, and title/message/path sanitising still runs for anonymous posts. |

### Redirects (status 303, absolute Location built from `new URL(path, request.url)` on both refs)

- role: `/admin/users` plus `q` only when `sanitiseAdminAccessQuery` returns a value. It returns `undefined` for blank input, never `''`, so this matches old `if (query)`.
- reassign: `/admin/users/<session user id>`. esi retry: `/admin/queue`. sessions revoke: `/admin/users/<userId>`.
- admin unlink: `/admin/users/<userId>` plus `?error=last_character|unlink_failed`, same as before. `not_linked` was a 404 and is now a 303 with `?error=not_linked` (declared).
- user unlink: `/settings/characters` plus `?error=not_linked|last_character|unlink_failed`, same keys as before.
- active-character: `/settings/characters` on success. `not_linked` was a 400 and is now a 303 with `?error=not_linked` (declared).
- wh-statics: `/admin/statics?outcome=<status>`, same as before. `snapshot_empty` and `snapshot_not_pending` were 409s and are now `?outcome=snapshot-empty|snapshot-not-pending` (declared). Both outcomes have copy in `OUTCOME_LABELS`.
- Open redirect: not possible. Every `seeOther` path is a constant or `/admin/users/${id}`. The id is either the session user id or `userIdField`, which is validated as `^[A-Za-z0-9_-]+$` before handle runs, so `//host`, `..` and backslashes cannot get in. Query values are set through `URLSearchParams` and are either constants or the sanitised `q`.

### Telemetry

- `seeOther` stashes only when a `failure` is passed. Success redirects stash nothing and record `succeeded`.
- `stashFailure` is called only from `api-response.ts`: apiResponse/declaredProblem, problemResponse and seeOther. Nothing earlier in these handlers stashes, so no success redirect can inherit a failure.
- Categories:
  - user unlink: not_linked and last_character record validation; unlink_failed records unexpected.
  - admin unlink: not_linked records not_found (the old 404 problem stashed the same category); last_character records validation; unlink_failed records conflict.
  - active-character not_linked records validation.
  - statics: busy records conflict; feed-unavailable records dependency_unavailable; the snapshot errors record conflict, the same category as the old 409s.
- All of this matches the declared P146 note.

### Stage failures against contracts (P250)

`apiFailure` throws, which surfaces as a 500, when a status or code is not declared. So I checked every route that now passes `endpoint`:

- account: corp-sharing, corp-structures/rigs, custom-structures (create, update, delete), industry-profiles (create, update, delete, duplicate), saved-plans (create, rename, favorite, delete), purge-character, sessions/revoke, delete
- feedback
- maps: access, create, jump, search-characters, signature-elimination, and delete/restore/purge-now through lifecycle-route
- preferences, sync-leave

Each one declares:
- 401 `unauthenticated`, for checkUserId and checkSession. maps/create's `identity` wraps checkUserId.
- 403 `cross_origin`.
- 400 `invalid_json`/`invalid_body` where it parses. purge-character's custom parse re-wraps the same two codes.

None of these routes uses checkAdmin, which would produce 403 `forbidden`. `checkRateLimit` only ever returns `rate_limited`, so the preflights that now use `apiResponse(…, 429, …)` cannot hit a status mismatch; this includes sync-leave, which used to use problemResponse. eve-token's `apiFailure` derives 500 for `not_configured` (unexpected) and 401 for `unauthenticated`, the same as the old ternary. The extracted `declaredProblem` is the old apiResponse problem branch, unchanged.

### P251 parseFormBody

- Missing fields are now `undefined` instead of `null`. Every required schema rejects both: `z.coerce.number().int().positive()` turns null into 0 and undefined into NaN, and `z.string()`/`z.enum` reject both. The optional `q` and `snapshotId` already received undefined.
- Only the listed fields are read.
- A `formData()` rejection now returns 400 `invalid_form` (declared).
- Detail strings change to `Invalid <field>` (declared). No client, e2e test or page reads the old strings.

### P255 resolveNotice

- It checks `Object.hasOwn`, so `constructor`, `toString`, `__proto__` and `hasOwnProperty` return the fallback or null and never return an inherited value. The test covers all four.
- Missing or repeated params resolve to null.
- Statics has no fallback, so an unknown code shows nothing, as before.
- Settings/characters keeps its generic fallback because Better Auth writes its own codes there.
- The admin user page gains `not_linked` copy.
- The `satisfies` tables match the producer code types.

### P306

- **Convex handshake:** `fetchConvexAccessToken` is a stable module-level function. Convex calls `fetchToken({ forceRefreshToken })`, the same argument shape the old wrapper forwarded. Forcing a refresh bypasses the cache, and a signed-out caller or a thrown error returns null. The effect's dependency identity stays stable.
- **Token reflection:** `readCachedToken` returns `reauth_required` for the same cases as before. The only change is that decryption now happens after the expiry check.
- **isDeleteAcknowledged:** it was `acknowledged === true` on a `boolean` state, so removing it changes nothing. The checkbox still gates both `canConfirm` and `onConfirm`. The delete API never had a confirmation field (`request: null`, `input: none` on both refs).
- **Schemas:** `characterIdFormSchema` and `characterIdField` are byte-identical to the switch and unlink schemas they replace, so validation is not loosened.
- **Scoreboard:** `resolveScoreboard().budgetSnapshot()` is what the removed helpers called.

## Leads checked and refuted

1. **Feedback origin-first opens an unthrottled path for cross-origin posts, each writing a `cross_origin_mutation` usage row.** Refuted as a regression. Unthrottled writes already existed: malformed-JSON posts never reached the limiter on the old ref, and every capability request already writes a `capability_outcome` row through `after()`. The change also does not loosen limits for same-origin or headerless clients, which still pass the origin gate and still hit the 5/min limiter. The budget change itself is declared.
2. **Role `q` could start appearing as `q=` now that seeOther only drops undefined.** Refuted: `sanitiseAdminAccessQuery` maps blank input to undefined.
3. **Admin unlink's switch from `accountBelongsToUser` to a `listLinkedCharacters` membership check could miss characters that lack a profile row.** Refuted: the query is a leftJoin and `parseLinkedAccountId` accepts every real EVE id.
4. **wh-statics `REFRESH_FAILURES` is a shared module-level failure object.** Refuted: `stashFailure` copies only category and code, and nothing mutates the object.
5. **A union schema with `fields` typed as `keyof z.input<S>` could leave out `snapshotId`.** Refuted: the refresh arm declares `snapshotId: z.undefined().optional()`, so the key exists on both arms, and typecheck passes.
6. **`unexpectedFailure('unlink_failed', err)` stashed without an `errorClass`.** `errorClass` is optional everywhere it is consumed (capability-stats, health-view), and the wave guide accepts this. Not a defect.
7. **Admin routes lost a rate limit.** Refuted: they had none on the old ref.
8. **The `adminMutationGate`/`checkAdminMutation` deletion left callers behind.** Refuted: a `git grep` over src, e2e, convex and scripts finds no references.
9. **Native forms might be JS-intercepted and depend on JSON.** Refuted: ActionForm is a plain `<form method="post">`, and no e2e test covers these routes.
10. **Vacuous tests.**
    - The capability-outcome probe filters real `emitCostMetric('capability_outcome', …)` calls.
    - The route tests assert Location, status and recorded outcomes.
    - problem-matrix exercises `invalid_form` with a real JSON body.
    - The delete test pins the throttle-before-session order and checks that origin is enforced after auth.
    - None of these is vacuous.
