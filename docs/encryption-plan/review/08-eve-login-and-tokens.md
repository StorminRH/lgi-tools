# Part 08: EVE login, token custody and token-bearing calls

**Status:** Draft for owner review

## In one paragraph

Today Vercel exchanges the EVE login code, sees every refresh token in plaintext, and stores tokens under an environment key the operator can read. This part moves the code exchange, the JWT check, the owner-hash check and every token into the sealed service. The browser makes the PKCE verifier and sends it only to the sealed service, which holds the client secret. The sealed service returns a signed identity assertion, and Better Auth creates the session and the Convex JWT from it as today. Refresh, the daily re-check, revoke on purge and the two token-bearing searches all run in the sealed service. The login button, the CCP consent screen, the 22 scopes, the reconnect state and the 7-day session stay the same.

## How it works today

- **Login.** Better Auth's `genericOAuth` plugin runs EVE SSO with `pkce: true` and `prompt: 'consent'`, making the PKCE verifier on the server. The callback `/api/auth/oauth2/callback/eve` runs on Vercel, where `getToken` calls `exchangeCodeForToken` with `EVE_CLIENT_SECRET` from Vercel's env. Access and refresh tokens arrive on Vercel in plaintext (06, leak 3).
- **Identity.** `getUserInfo` verifies the access token against CCP's JWKS (`jose`, issuer `https://login.eveonline.com`, audience `EVE Online`) and parses `sub`. `proveCharacter` then runs `classifyProof`: noop, backfill owner hash, refuse, transfer (sale) or merge. Affiliation refresh and `auth_login` telemetry follow.
- **Storage.** A database hook encrypts both tokens with AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY`, copies the JWT `owner` claim into `account.ownerHash` and resets the authorization counters. `account.scope` records the requested 22-scope `EVE_SCOPES` list.
- **Session.** 7 days, sliding (Better Auth's default one-day update age), with a 5-minute cookie cache in production. The `jwt` plugin mints the ES256 Convex JWT (audience `convex`, 7 days). `jwks-cache.ts` caches LGI's own signing keys, not CCP's.
- **Linking.** `startCharacterLink` calls `authClient.oauth2.link`; the target travels in OAuth state (`link-intent.ts`) and a merge rebinds it to the survivor. Sign-in and link entry are limited to 10 per minute per IP.
- **Refresh.** `getFreshAccessTokenForCharacter` reuses an access token with more than 60 s left, otherwise refreshes with a compare-and-swap on the stored refresh-token ciphertext. Two-strike `invalid_grant`: the first strike marks it suspect for 5 minutes, the second nulls the tokens. Retryable failures back off 5, 10, 15 minutes, then hourly.
- **Daily re-check.** `checkUserCharacterAuthorizations` runs in `after()` on `get-session` and server renders. It claims due characters with a 2-minute lease, force-refreshes four at a time within 35 s, publishes access changes to the map outbox, and suspends characters failing for 24 hours. Nothing runs for absent users.
- **Reconnect.** `deriveCharacterHealth` flags a null refresh token or a missing scope.
- **Token users.** Convex location polling leases plaintext access tokens from `/api/internal/eve-token`; owner sync uses `owner-sync-port.ts`; `/api/maps/search-characters` searches with the first scoped character (public exact-name fallback); `/api/account/custom-structures/search` searches with every scoped character and reads up to 8 structures.
- **Revoke.** The purge decrypts and revokes the refresh token at CCP, best-effort, before deleting the `account` row.

Files: `src/platform/auth/` (`auth.ts`, `eve-sso.ts`, `eve-sso-constants.ts`, `eve-token-service.ts`, `token-crypto.ts`, `account-token-encryption.ts`, `owner-hash-claim.ts`, `owner-reconcile.ts`, `jwks-cache.ts`, `link-intent.ts`, `link-character.ts`, `scope-health.ts`, `authorization-store.ts`, `authorization-policy.ts`, `linked-characters.ts`, `local-session.ts`); `src/composition/` (`auth.ts`, `character-authorization.ts`, `session.ts`, `map-character-search.ts`, `structure-search.ts`, `account-lifecycle/owner-transfer.ts`, `account-lifecycle/account-purge.ts`); `src/app/api/auth/[...all]/route.ts`; `src/app/api/internal/eve-token/route.ts`; `src/app/api/internal/eve-characters/route.ts`; `convex/lib/characterSync.ts`.

## What changes

Nothing visible changes for users. Vercel stops receiving tokens or usable codes; the client secret and all tokens move into the sealed service under the token key, retiring `EVE_TOKEN_ENCRYPTION_KEY` (Part 31); the owner-hash decision runs in custody before any key is released; `/api/internal/eve-token` goes when Part 17 ships.

Dropped from the older design: the two CCP applications (Identity and Data) and public browser clients, browser-held refresh tokens and D-LOC-2's browser refresh leases (its rules are ported into the enclave instead), per-feature scope requests, and the bind-time `jti` and `iat` checks (CCP's own single-use code replaces them). 04 §12 remains a scope reference only.

## Design

**Login flow**

| Step | Where | What happens |
|---|---|---|
| 1 | Browser | The same button makes a PKCE verifier, `state` and the browser session keys (Part 09), then redirects to CCP with the same scopes and `prompt=consent`. |
| 2 | Vercel | A specific route at today's callback path (`src/app/api/auth/oauth2/callback/eve/route.ts`) beats the catch-all and answers 303 to a client page, `/auth/callback`. The CCP portal setting is unchanged and rollback is a deploy. Vercel sees the code but cannot redeem it. |
| 3 | Browser | Checks `state`, strips the code with `history.replaceState`, verifies the attestation (Part 06), and sends a sealed `login` request {code, verifier, session public keys, optional link proof} through `/api/auth/sealed` (Part 07). It shows today's loading shell. |
| 4 | Custody | Redeems the code with the sealed client secret. Verifies the JWT against CCP's JWKS (signature, both issuer forms, audience, `sub`, `exp`). Runs `classifyProof` against its own record. Seals the refresh token into Neon, records the browser session key, and replies sealed to it with the identity assertion and wrapped keys (Part 09). Keys go out only after any transfer or merge is recorded. |
| 5 | Vercel | The browser posts the assertion to `/api/auth/eve/session`, a small Better Auth plugin endpoint. Vercel verifies it, runs today's after-login work (user and account upsert without tokens, `upsertCharacterLoginIdentity`, affiliation refresh, `auth_login`, `runAfterCharacterLinkChanged`, merge or transfer metadata steps), and creates the session with `internalAdapter.createSession`, as `local-session.ts` does. The Convex JWT is minted as today. |

**Identity assertion.** An ES256 JWS from an enclave-held key whose public half is bound into the attestation `user_data` (Part 06) and pinned in Vercel's env. Claims: `characterId`, `name`, `ownerHash`, `scope`, `accountId`, `decision` (noop, backfill, transfer, merge with survivor and source), `jti`, `iat`, `exp` (60 s), audience per environment. Vercel stores `jti` in `verification` for single use. The assertion travels only sealed to the browser. The 10-per-minute IP limit moves to `/api/auth/sealed` and `/api/auth/eve/session`.

**Accounts and linking.** `accountId` is the account the sealed service resolved; for a new account it picks the ID and Vercel creates `user` with it. A link adds a proof signed by the current browser session key, which custody maps to an account through its own session-key record, never Vercel's cookie. Custody decides merges (survivor by account age, as `pickSurvivor`); Vercel then runs `mergeUsers` and expires cookie-cache cookies as today. Re-sealing after a merge is Part 11.

**Character-link record.** The sealed service's own record: {characterId, accountId, ownerHash, accountCreatedAt, linkedAt, version}, readable in Neon, MAC'd under an enclave-only key, written only by the enclave on login, link, unlink, merge, transfer and purge. Key release, polling, sync and searches read it, never `account.userId` or `account.ownerHash`. Rollback defence is Parts 12 and 28.

**Token custody**

| Concern | Rule in the sealed service |
|---|---|
| Storage | Refresh token sealed (AEAD, token key, AAD {`account`, row ID, character ID}) in the existing `refresh_token` column. Null-ness stays readable, so `hasRefreshToken`, `deriveCharacterHealth` and `authorization-store.ts` work unchanged. |
| Access tokens | Enclave memory only, reused until 60 s before expiry; a restart costs one refresh. `access_token`, both expiry columns and `id_token` are dropped. |
| Rotation and failures | Today's compare-and-swap on the old blob plus a per-character lock. Two-strike `invalid_grant`, 5-minute grace, backoff, counters and `eve_token_state_changed` events ported unchanged. Telemetry keeps the failure class only. |
| Daily re-check | Vercel keeps the trigger, claim lease and `publishAccessChanges`, sends one `recheck` job with the claimed IDs, and waits up to today's 35 s. |
| Revoke | The purge sends `revoke(accountRowId)` before deleting the row, best-effort as today. Custody deletes the link record. |

**Token-bearing lookups**

| Lookup | Path | Result |
|---|---|---|
| Access-list typeahead | Vercel sends `{userId, search}` as a service job | Readable character IDs; Vercel resolves names and keeps the exact-name fallback |
| Scope health (`/api/internal/eve-characters`) | Stays on Vercel | Unchanged |
| Structure search | Browser sends a sealed request; the Vercel route goes | Up to 8 structures sealed to the browser session key; today's scope filter and 401/403 skipping ported |
| Location, sync | Workers (Parts 17, 18) | No token leaves the enclave |

**Session and keys (decision 7).** The session-key record expires with the session and slides with it. The browser wipes keys on sign-out or when `get-session` returns nothing. If keys are gone while the cookie lives (cleared storage; Safari eviction needs 7 idle days, by which time the session has lapsed), the app treats the user as signed out and shows today's login button.

**Outage.** New logins fail with today's error; existing sessions continue. If the service is lost for good, the owner may ship a release that restores a Vercel exchange for identity only, discarding tokens. It re-opens leak 3 and is never automatic.

**Limits.** Whoever serves lgi.tools could ship a page that leaks the verifier or the keys after login, and anyone holding a user's EVE login reaches their data (decision 5). Both are accepted in Part 28. The dev sealed service (Part 25) runs the same custody code; the synthetic-pilot dev sign-in stays dev-only.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `account` IDs, `scope`, `ownerHash`, authorization and invalid-grant counters, `deletionRequestedAt`, timestamps | Yes | No | LGI server; the sealed service writes the counters |
| Refresh token | Null-ness only | Yes, under the token key | Sealed service |
| Access token | No | Enclave memory only | Sealed service |
| Client secret | Visible in CCP's portal | Sealed in the enclave | Sealed service |
| PKCE verifier | No | Browser and enclave only | Browser, sealed service |
| Identity assertion | Yes (to Vercel) | Sealed in transit | Sealed service signs, Vercel verifies |
| Character-link record | Yes, MAC'd | No | Sealed service |
| Browser session key record | No | Yes, under the service root key (Part 07) | Sealed service |
| Typeahead results | Yes | No | Sealed service, then LGI server |
| Structure search results | No | Yes, to the browser session key | Sealed service, then browser |

## Hard rules

1. [Agreed] No EVE token, in any form an operator could use, exists outside the sealed service (decision 1).
2. [Agreed] Logging in with EVE is the gate for keys, and the owner-hash check runs before any key is released (decisions 1 and 5).
3. [Agreed] The 7-day session is unchanged. There are no extra prompts or re-login timers (decision 7).
4. [Proposed] The PKCE verifier is made in the browser and sent only to the sealed service, never to Vercel.
5. [Proposed] Vercel creates sessions only from a verified, unexpired, single-use identity assertion. Nothing else mints a production session (the dev sign-in stays dev-only).
6. [Proposed] Key release, polling, sync and searches read the sealed service's own character-link record, never readable `account` columns.
7. [Proposed] Token code lives in the custody zone. Workers get access tokens through one custody function and never see refresh tokens.
8. [Proposed] Token telemetry and errors carry failure classes, never token text or response bodies. The error text from `exchangeCodeForToken` is replaced by a code.
9. [Proposed] Revoke stays best-effort and never blocks a purge.
10. [Proposed] The break-glass Vercel exchange exists only as a manual release, never as an automatic fallback.

## Assumptions

- **CCP rejects a code redeemed without its verifier when a challenge was sent.** Check with the dev CCP app.
- **CCP never grants a subset of the requested scopes**, so writing the JWT `scp` claim to `account.scope` matches today's behaviour. Check by comparing `scp` with `EVE_SCOPES` at login.
- **Better Auth 1.6.30 can create a user with a supplied ID and a session from a plugin endpoint.** `local-session.ts` already proves the session half. Check the user half with a spike test like `link-merge.spike.test.ts`.
- **Existing refresh tokens keep working when redeemed by the enclave with the same client.** Nothing about the client changes, but confirm on staging.
- **The login round trip stays within Part 07's 300 ms budget.** Measure on staging.

## What users see

Nothing new. The button, CCP consent screen, reconnect badges, linking and session length are unchanged. The callback shows today's loading shell for a moment. During a sealed-service outage, sign-in shows today's error.

## Questions for the owner

1. **Wrap or replace genericOAuth?** Wrapping cannot work: Better Auth makes the verifier on the server. Recommended: replace it with a small plugin that accepts the identity assertion; Better Auth keeps sessions and the Convex JWT.
2. **Where does the callback run?** Recommended: a client page behind today's registered path. An inbound enclave endpoint needs a port and a subdomain; a new path needs a portal change and complicates rollback.
3. **What does `account` keep?** Recommended: IDs, `scope`, readable but untrusted `ownerHash`, the counters and the sealed refresh token. Drop the access token, ID token, `password` and both expiry columns.
4. **Session versus keys?** Recommended: keys live exactly as long as the session; missing keys mean signed out.
5. **How much does the operator-visible client secret matter?** Little. It cannot refresh without a refresh token or redeem a code without its verifier, and resetting it only breaks logins visibly. Its real exposure is the served-code caveat. Recommended: keep the confidential client, seal the secret into the enclave, remove it from Vercel's env after migration.
6. **Logins during an outage?** Recommended: pause, with the manual break-glass release. This limits Part 10's outage unlock to users whose session is still valid; please confirm.
