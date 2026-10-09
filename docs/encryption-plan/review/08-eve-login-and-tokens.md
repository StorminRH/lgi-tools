# Part 08: EVE login, token custody and token-bearing calls

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** request authentication is a per-session HMAC stamp. The login reply (inside HPKE) returns a per-session HMAC key the enclave derives under the root key from `sessionKeyId` and `accountId`; the browser keeps it non-extractable; `sessionKeyId` reaches the session row through the identity assertion; the enclave checks the Neon session row (cached 60 s) on every request. There is no ECDSA signing key and no session-key registration.
- **Sign-in:** `/api/auth/sealed` applies the Upstash IP limit, forwards to `/sealed-submit` and returns at once; the browser reads its reply from Convex by request ID. No Vercel polling.
- **No job inbox and no awaited jobs:** the daily token `recheck` no longer has Vercel wait 35 s, and decision-record follow-ups (`abandon`, `revoke-sessions`, `unlink`) are not inbox jobs; rework both around the enclave scheduling its own work from readable Neon state.
- **Map character search:** no `characterSearch` service job and no rule 6 exception. A user with a scoped character sends a stamped `lookup` and the enclave runs today's logic; a user without one uses Vercel's exact-name lookup; the browser falls back to it if the sealed search fails or takes over 5 s. Settle here how the page learns which case applies from readable scope state.
- **ESI gate:** the enclave runs today's gate code with its own in-memory tally and sends today's `OUTBOUND_USER_AGENT` on every ESI and EVE SSO call.
- **Mapping gaps:** map `/api/internal/eve-token`, `/api/internal/eve-characters` and `/leave-sync`, which Part 07's mapping table missed.

## In one paragraph

Today Vercel exchanges the EVE login code, sees every refresh token in plaintext, and stores tokens under an environment key the operator can read. This part moves the code exchange, the JWT check, the owner-hash check and every token into the sealed service. The browser makes the PKCE verifier and sends it only to the sealed service, which holds the client secret. The sealed service returns a signed identity assertion, and Better Auth creates the session and the Convex JWT from it as today. Refresh, the daily re-check, revoke on purge and the two token-bearing searches all run in the sealed service. Ending a session on Vercel also cuts the device off from the sealed service. The login button, the CCP consent screen, the 22 scopes, the reconnect state and the 7-day session stay the same.

## How it works today

- **Login.** Better Auth's `genericOAuth` plugin runs EVE SSO with `pkce: true` and `prompt: 'consent'`, making the PKCE verifier on the server. Better Auth keeps the caller's `callbackURL` (and, for links, `errorCallbackURL`) server-side; its callback `/api/auth/oauth2/callback/eve` redirects straight there, and failures land on `errorCallbackURL` or Better Auth's error page. `getToken` calls `exchangeCodeForToken` with `EVE_CLIENT_SECRET`, so tokens arrive on Vercel in plaintext (06, leak 3). There is no `/auth` route or general loading page.
- **Identity.** `getUserInfo` verifies the access token against CCP's JWKS. `proveCharacter` first runs `finishPendingDeletion`, then `classifyProof`: noop, backfill owner hash, refuse, transfer (sale) or merge. A merge that fails before commit falls back to the standard link flow.
- **Storage.** A database hook encrypts both tokens under `EVE_TOKEN_ENCRYPTION_KEY` and copies the JWT `owner` claim into `account.ownerHash`. `account.scope` stores the requested `EVE_SCOPES` list; the JWT `scp` claim is never read.
- **Session.** 7 days, sliding on `get-session` (one-day update age), with a 5-minute cookie cache in production. The `jwt` plugin mints the Convex JWT.
- **Ending sessions.** Sign-out (`authClient.signOut`), "log out everywhere" (`/api/account/sessions/revoke` → `revokeUserSessions`), admin force logout (`/api/admin/sessions/revoke`), and account deletion (the user row cascades) delete session rows at once. A merge re-keys the source's sessions to the survivor.
- **Linking.** `startCharacterLink` calls `authClient.oauth2.link`, which adds the character to the current session without creating one. Sign-in and link entry are limited to 10 per minute per IP.
- **Admin character actions.** `/api/admin/characters/reassign` (`reassignCharacter`) moves an `account` row, tokens included, to another account. `/api/admin/characters/unlink` (`deleteLinkedCharacter`) deletes it, with no CCP revoke.
- **Refresh.** `getFreshAccessTokenForCharacter` reuses an access token with more than 60 s left, otherwise refreshes with a compare-and-swap on the refresh-token ciphertext, with two-strike `invalid_grant` and backoff.
- **Daily re-check.** `checkUserCharacterAuthorizations` runs in `after()` on `get-session` and server renders: a claim lease, four at a time within 35 s, access changes to the map outbox.
- **Token users.** Convex location polling leases tokens from `/api/internal/eve-token` and enumerates characters through `/api/internal/eve-characters`, which carries no token but starts `refreshAffiliationsAndReconcile` for stale affiliations. Owner sync uses `owner-sync-port.ts`. `/api/maps/search-characters` tries scoped characters in order until one has a usable token and throws if none does; only when no character holds the scope does it use the public exact-name lookup. Structure search uses every scoped character.
- **Revoke.** Only user and character deletion purges (`purgeLink`) revoke the refresh token at CCP, best-effort, before deleting the row. The transfer purge deletes the seller's row without revoking.

Files: `src/platform/auth/` (`auth.ts`, `eve-sso.ts`, `eve-token-service.ts`, `account-token-encryption.ts`, `owner-reconcile.ts`, `link-character.ts`, `scope-health.ts`, `authorization-store.ts`, `local-session.ts`, `admin-users.ts`, `purge.ts`); `src/composition/` (`character-authorization.ts`, `map-character-search.ts`, `structure-search.ts`, `account-lifecycle/{owner-transfer,account-purge,character-transfer,account-merge}.ts`); `src/app/api/` (`auth/[...all]`, `account/sessions/revoke`, `admin/sessions/revoke`, `admin/characters/{reassign,unlink}`, `internal/eve-token`, `internal/eve-characters`); `convex/lib/characterSync.ts`.

## What changes

Nothing visible changes for users. Vercel stops receiving tokens or usable codes. The client secret and all tokens move into the sealed service under the token key, retiring `EVE_TOKEN_ENCRYPTION_KEY` (Part 31). The owner-hash decision runs in custody before any key is released. The release that seals tokens moves every token consumer at once (Part 30 Phase 1): `/api/internal/eve-token` and `/api/internal/eve-characters` are deleted in that release, with `syncUser` (Part 17).

Dropped from the older design: the two CCP applications and public browser clients, browser-held refresh tokens and D-LOC-2's browser leases (its rules move into the enclave), per-feature scope requests, and bind-time `jti` and `iat` checks. 04 §12 remains a scope reference only.

## Design

**Login flow**

| Step | Where | What happens |
|---|---|---|
| 1 | Browser | The same button makes a PKCE verifier, `state` and the browser session keys (Part 09). It stores {state, verifier, callbackURL, errorCallbackURL, intent: sign-in or link} in `sessionStorage`, runs the attestation nonce round trip (Part 06) so its latency hides behind the consent screen, then redirects to CCP as today. |
| 2 | Vercel | A route at today's callback path beats the catch-all and answers 303 to `/auth/callback`, a minimal blank interstitial needed only because the browser holds the verifier. The CCP portal setting is unchanged. Vercel sees the code but cannot redeem it. |
| 3 | Browser | Checks `state` and attestation freshness, strips the code with `history.replaceState`, and sends one sealed `login` request {code, verifier, session public keys, optional link proof} through `/api/auth/sealed` (Part 07). |
| 4 | Custody | Redeems the code and verifies the JWT against CCP's JWKS (signature, both issuer forms, audience, `sub`, `exp`). Runs `finishPendingDeletion`, then `classifyProof`, against its own record. Seals the refresh token into Neon. For a transfer or merge it writes a durable decision record to Neon before replying. It records the browser session key and replies sealed with the identity assertion and wrapped keys (Part 09). |
| 5 | Vercel | Sign-in: the browser posts the assertion to `/api/auth/eve/session`, a small Better Auth plugin endpoint. Vercel verifies it, runs today's after-login work without tokens, and creates the session with `internalAdapter.createSession`, as `local-session.ts` does. It may run the decision processor early. The browser then navigates to the stored `callbackURL`; on failure to `errorCallbackURL` or `/api/auth/error?error=<code>`, as today. |

**Linking.** The link path reuses the current browser session key to sign the link proof and creates no session, as `oauth2.link` does today. Custody maps the proof to an account through its own session-key record, never Vercel's cookie. Only a merge re-keys sessions, as today; custody repoints those session-key records to the survivor.

**Decision records.** A Vercel drain cron processes custody's transfer and merge records (characterId, accounts, decision ID, MAC'd) idempotently, whether or not the browser returns. Transfer: today's transfer purge, grant removal, block and notices (Part 14). Merge: `mergeUsers`, with retries. If the merge ends permanently in a noop or `PendingDeletionError`, the processor sends custody an `abandon` job. Custody restores its prior record version only if its record still holds that decision.

**Identity assertion.** An ES256 JWS signed by a `service` key record under the service root key (Part 09). It is stable per environment and rotated only by the release job; its public half is published with the fingerprints and pinned in Vercel's env. Claims: `characterId`, `name`, `ownerHash`, `scope` (the requested `EVE_SCOPES`, as today), `accountId`, `decision`, `sid` (a random ID custody generates; Vercel stores it in a new `session.sid` column), `jti`, `iat`, `exp` (60 s), per-environment audience. Vercel stores `jti` in `verification` for single use. The 10-per-minute IP limit moves to `/api/auth/sealed` and `/api/auth/eve/session`. Differences between `scp` and `EVE_SCOPES` are logged as telemetry only.

**Records**

| Record | Fields | Storage | Writers |
|---|---|---|---|
| Character link | characterId, accountId, ownerHash, accountCreatedAt, linkedAt, version | Neon, readable, MAC'd under an enclave-only key | Enclave only, on login, link, unlink, merge, transfer (repointed to the buyer, no revoke), purge, admin unlink, admin reassign |
| Browser session key | sid, accountId, public keys, expiresAt | Neon, readable, MAC'd under an enclave-only key (amends Part 07 rule 6 and Part 09) | Enclave only |

Key release, polling, sync and searches read the link record, never `account.userId` or `account.ownerHash`. Rollback defence is Parts 12 and 28.

**Revocation and admin actions**

| Event on Vercel | Job to custody | Effect |
|---|---|---|
| Sign-out, log out everywhere, admin force logout, account deletion | `revoke-sessions` {sids or userId} | Session-key records deleted at once |
| Admin unlink | `unlink` {characterId} | Token and link record deleted; no CCP revoke, as today |
| Admin reassign | `unlink-for-reassign` {characterId} | Readable rows move as today; custody drops the token and the link record and releases nothing for that character until it logs in on the target account (Part 11) |

These jobs only remove access, so custody accepts them unsigned, like LGI's own removals in default 2.

**Token custody**

| Concern | Rule in the sealed service |
|---|---|
| Storage | Refresh token sealed (AEAD, token key, AAD {`account`, row ID, character ID}) in the existing `refresh_token` column. Null-ness stays readable, so `deriveCharacterHealth` works unchanged. |
| Access tokens | Enclave memory only, reused until 60 s before expiry. `access_token`, both expiry columns and `id_token` are dropped. |
| Rotation and failures | Today's compare-and-swap plus a per-character lock. Failure handling, counters and `eve_token_state_changed` ported unchanged. |
| Daily re-check | Vercel keeps the trigger, claim lease and `publishAccessChanges`, sends one `recheck` job and waits up to 35 s. |
| Revoke | User and character deletion purges send `revoke(accountRowId)` first, best-effort as today; custody deletes the link record. A transfer does not revoke. |

**Token-bearing lookups**

| Lookup | Path | Result |
|---|---|---|
| Access-list typeahead | No scoped character: Vercel's tokenless exact-name lookup, never touching the sealed service. Otherwise a `{userId, search}` service job; custody tries scoped characters in order, as today | Readable character IDs; Vercel resolves names |
| Structure search | Sealed request from the browser; the Vercel route goes | Up to 8 structures sealed to the browser session key; scope filter and 401/403 skipping ported |
| Location, sync | Workers (Parts 17, 18) | No token leaves the enclave |

The location poller enumerates characters from the link record joined with readable scope health. Part 17 must move the stale-affiliation refresh now in `/api/internal/eve-characters` to the heartbeat or presence path, so affiliation stays within ESI's one-hour cache while tracking (decision 6).

**Session and keys (decision 7).** The session-key record expires with the session. Whenever the browser sees the Better Auth session extend, it sends a signed `touch` to custody, at most once a day, so the two clocks match. The browser wipes keys on sign-out or when `get-session` returns nothing. If keys are missing while the cookie lives (cleared site data), the browser calls `authClient.signOut()` so server pages agree, and today's login button shows. It calls `navigator.storage.persist()` only where the browser decides silently (Chromium, Safari), never in Firefox, which prompts.

**Outage.** New logins fail with today's error; existing sessions continue. If the service is lost for good, the owner may ship a manual release restoring a Vercel exchange for identity only, discarding tokens (Question 6).

**Limits.** AWS signs the attestation, and the AWS account owner can change the key-release rule (visible through published fingerprints). Whoever serves lgi.tools could ship a page that leaks the verifier or keys after login. Anyone holding a user's EVE login reaches their data (decision 5). Part 28 accepts these. The dev sealed service (Part 25) runs the same custody code.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `account` IDs, `scope`, `ownerHash`, counters, `deletionRequestedAt`, timestamps | Yes | No | LGI server; the sealed service writes the counters |
| Refresh token | Null-ness only | Yes, token key | Sealed service |
| Access token | No | Enclave memory only | Sealed service |
| Client secret | Visible in CCP's portal | Sealed in the enclave | Sealed service |
| PKCE verifier | No | Browser and enclave only | Browser, sealed service |
| Identity assertion | Yes (to Vercel) | Sealed in transit | Sealed service signs, Vercel verifies |
| Character-link and browser session key records | Yes, MAC'd | No | Sealed service |
| Transfer and merge decision records | Yes, MAC'd | No | Sealed service writes, LGI server processes |
| Typeahead results | Yes | No | Sealed service, then LGI server |
| Structure search results | No | Yes, to the browser session key | Sealed service, then browser |

## Hard rules

1. [Agreed] No EVE token, in any form an operator could use, exists outside the sealed service (decision 1). The only exception would be the manual break-glass release, which is an owner decision (Question 6).
2. [Agreed] Logging in with EVE is the gate for keys, and the owner-hash check runs before any key is released (decisions 1 and 5).
3. [Agreed] The 7-day session is unchanged, with no extra prompts or re-login timers (decision 7).
4. [Proposed] The PKCE verifier is made in the browser and sent only to the sealed service.
5. [Proposed] Vercel creates sessions only from a verified, unexpired, single-use identity assertion. The dev sign-in stays dev-only.
6. [Proposed] Key release, polling, sync and searches read the character-link record, never readable `account` columns.
7. [Proposed] Token code lives in custody. Workers get access tokens through one custody function and never see refresh tokens.
8. [Proposed] Token telemetry and errors carry failure classes, never token text or response bodies.
9. [Proposed] Revoke stays best-effort, never blocks a purge, and runs only where it runs today.
10. [Proposed] Any break-glass is a manual release, never an automatic fallback.
11. [Proposed] The release that seals tokens moves every token consumer into the sealed service at once; there is no transitional vend from Vercel or Convex (Part 30).
12. [Proposed] Every Vercel path that ends sessions sends custody a revoke job; custody binds each session-key record to its `sid` and accepts removals unsigned.
13. [Proposed] Custody transfer and merge decisions are processed from a durable record, never only from the browser-relayed assertion.
14. [Proposed] Admin reassign and admin unlink update the link record by removal only; no admin action moves a token or sealed data.
15. [Proposed] Missing keys with a live cookie mean signed out, via `authClient.signOut()`: without keys the app cannot show sealed content, and the login screen is the only existing state that fits.
16. [Proposed] The browser keeps the session-key record's expiry in step with Better Auth's sliding session by a daily signed `touch`.

## Assumptions

- **CCP rejects a code redeemed without its verifier when a challenge was sent.** Check with the dev CCP app.
- **Better Auth 1.6.30 can create a user with a supplied ID and a session from a plugin endpoint.** `local-session.ts` already proves the session half. Check the user half with a spike test like `link-merge.spike.test.ts`.
- **Existing refresh tokens keep working when redeemed by the enclave with the same client.** Confirm on staging.
- **Callback-to-destination time stays close to today's.** Measure today's time from CCP's redirect to the destination page, then the new flow, on staging.

## What users see

Nothing new. The button, consent screen, destinations after login, error routes, reconnect badges, linking and session length are unchanged. The callback briefly shows a blank interstitial in place of today's server redirect. During a sealed-service outage, sign-in shows today's error.

## Questions for the owner

1. **Wrap or replace genericOAuth?** Wrapping cannot work: Better Auth makes the verifier on the server. Recommended: replace it with a small plugin that accepts the identity assertion; Better Auth keeps sessions and the Convex JWT.
2. **Where does the callback run?** Recommended: a client page behind today's registered path. An inbound enclave endpoint needs a port and a subdomain; a new path needs a portal change and complicates rollback.
3. **What does `account` keep?** Recommended: IDs, `scope`, readable but untrusted `ownerHash`, the counters and the sealed refresh token. Drop the access token, ID token, `password` and both expiry columns.
4. **Session versus keys?** Recommended: keys live exactly as long as the session, kept in step by the daily touch; missing keys mean signed out.
5. **How much does the client secret matter?** Little: it cannot refresh without a refresh token or redeem a code without its verifier. Recommended: keep the confidential client, seal the secret into the enclave, remove it from Vercel's env after migration.
6. **Logins during an outage, and break-glass?** Option A: pause logins, with a manual identity-only Vercel exchange for permanent loss; it re-opens leak 3 and is the one exception to rule 1. Option B: drop break-glass and recover only by restoring the enclave on a new instance, realistic with 18 users and a reserved instance. Recommended: A, never automatic. Either way, Part 10's outage unlock is limited to users whose session is still valid; please confirm.
