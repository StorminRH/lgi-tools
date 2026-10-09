# Part 09: Keys, sealed formats and getting keys back

**Status:** Draft for owner review

**Carried from the Part 05 and 06 reviews (2026-10-08):** passkeys and recovery keys cover permanent loss only; no sign-in is possible during a sealed-service outage. Attestation `public_key` is at most 1024 bytes and `user_data` 512, so a post-quantum HPKE key must be referenced by hash.

**Carried from the Part 07 review (2026-10-09):** the browser session key is now a per-session HMAC stamp key, derived in the enclave under the root key from `sessionKeyId` and `accountId` and returned in the HPKE login reply. There is no ECDSA signing key, no session-key registration (readable or sealed), no `session.touch` and no `session` class; Better Auth keeps its default rolling refresh and the enclave checks the Neon session row (cached 60 s). Check whether a long-lived browser ECDH key is still needed, since every reply is sealed to its own request's HPKE context. New records under the root key: the channel private key, current and previous (Part 07 step 6), and the Convex write secret (step 2). The map version is gone (Part 05 clean-up 7, Part 07 step 4).

## In one paragraph

This part sets the whole key model. KMS seals one service root key. Under it sit one user key per LGI account, a map key per map in numbered key epochs, a corp key per corp, and one token key. The corp and token keys never leave the enclave. At each EVE login the browser makes a fresh browser session key. The sealed service checks the login and returns the user's key wrapped to that session key. The browser keeps it non-extractable in IndexedDB until the session ends. Map keys reach the browser as wraps under the user key. Every sealed row uses one envelope format. That format names its key and binds the table, owner, row ID and version, so a row cannot be swapped or mixed with another version. This part also says how keys follow account merges and character moves, and retires the older design's identity machinery.

## How it works today

- There are no user keys, map keys or browser crypto. Map contents, locations and personal data are plaintext in Convex and Neon (see 06).
- One envelope, `encryptAes256Gcm`: AES-256-GCM, a random 12-byte IV, stored as the string `v1:iv:tag:ciphertext` in base64. It has no associated data and no key ID, and decryption returns `null` on any failure.
- EVE tokens in `account` use that envelope under one environment key, `EVE_TOKEN_ENCRYPTION_KEY`. Better Auth database hooks encrypt them on create and update. `eve-token-service.ts` and `owner-transfer.ts` decrypt them.
- Corp asset pulls in `esi_snapshots` use the same envelope under `ESI_SNAPSHOT_ENCRYPTION_KEY`. Operators can read both environment keys.
- Sessions last 7 days (`expiresIn`). Better Auth's default one-day `updateAge` extends them on any authenticated use after a day, and the cookie cache is 5 minutes in production.
- Linking a character takes its target account from Vercel: `getUserInfo` passes `linkingUserId: await readLinkingUserId()` (from the OAuth state) to `proveCharacter`. Merges pick a survivor in `resolveMergePair` and `pickSurvivor`, and `commitMerge` runs `executeMergeRules`, which rekeys or discards the source account's rows; `follows-character` tables (characters, character sheets, corp roles) stay keyed by character. A sold character's prior-account data is purged in `finishCharacterTransfer`.
- `localStorage` holds preferences, search recents, planner recent blueprints, the telemetry visitor ID and the signed-in hint (`lgi:signed-in`), which an inline script in `SignedInFold` reads before hydration. `sessionStorage` holds the telemetry session flag and jump-doorbell memory. Nothing is stored in IndexedDB.

Files: `src/lib/aes-gcm.ts`, `src/platform/auth/token-crypto.ts`, `src/platform/auth/auth.ts`, `src/platform/auth/link-intent.ts`, `src/platform/auth/eve-token-service.ts`, `src/composition/account-lifecycle/owner-transfer.ts`, `src/composition/account-lifecycle/account-merge.ts`, `src/platform/purge/merge.ts`, `src/composition/account-lifecycle/character-transfer.ts`, `src/data/esi-snapshots/crypto.ts`, `src/lib/preferences.ts`, `src/features/search-recents/storage.ts`, `src/features/industry-planner/recent-blueprints.ts`, `src/components/composition/TelemetryReporter.tsx`, `src/platform/auth/signed-in-hint.ts`, `src/components/composition/SignedInFold.tsx`, `src/mapper/tracking/JumpDoorbellObserver.tsx`, `node_modules/better-auth/dist/context/create-context.mjs`.

## What changes

Nothing visible changes for users. Keys arrive inside the existing login round trip. The new format replaces `v1` envelopes feature by feature (Part 30), and both environment keys retire in Phase 5 (Part 31). One rare exception is under What users see.

## Design

### Key inventory

| Key | Scope and storage | Leaves the enclave? | Seals | Rotation |
|---|---|---|---|---|
| Service root key | One per environment; KMS blob in Neon (Part 06) | Never | Key records | Rare; key records rewrapped |
| User key | One per LGI account; key record, plus optional passkey and recovery wraps (Part 10) | Only to that account's browser session keys | Personal and user-authored documents, net-worth days, precomputed views, map key wraps, per-viewer corp results | None; destroyed at deletion (Part 11) or after a merge |
| Map key, epoch N | Per map per epoch; key record, plus a wrap under each member's user key | Only as those wraps | Map and location rows | On removal, block, corp loss or sale (Part 13) |
| Corp key | Per corporation; key record | Never | Corp documents, holding index (Part 23) | Optional epoch per full replace |
| Token key | One per environment; key record | Never | EVE tokens (Part 08) | New epoch, applied at each refresh |
| Browser session key | Two non-extractable P-256 pairs made at each login (ECDSA signs, ECDH receives keys); IndexedDB; public halves in a readable, enclave-MAC'd registration (Part 08) | Private halves stay in the browser | Nothing at rest | Every login |

All other keys are random 256-bit keys made in the enclave and stored as key records under the service root key, including the identity-assertion and Convex service-JWT signing keys (kind `service`, Parts 07 and 08).

### Getting keys back by logging in

1. The browser's crypto worker makes the browser session key. It also makes the PKCE verifier (Part 08).
2. The browser verifies a fresh attestation and takes the channel key from it (Part 06).
3. It sends the login request, HPKE-sealed to the channel key (Part 07). The request carries the code, the verifier and both session public keys. A link request is also signed by the current session's registered key.
4. The enclave checks the EVE login and, before releasing any key, the owner hash against its own character-link record (Part 14). It finds the account through that record, changed only as hard rule 5 allows. It loads the user key; it creates one only for a brand-new account, in the same step that writes the account's first link record. If an existing account's key record cannot be read or is missing, it fails closed with a retryable error. It writes the session registration and returns the identity assertion for Vercel (Part 08).
5. The reply carries the user key, HPKE-sealed to the session's ECDH public key. The HPKE `info` binds `sessionKeyId`, `accountId` and the user key's `keyId`.
6. The crypto worker opens the wrap, imports the user key as a non-extractable HKDF key, stores it in IndexedDB and drops the bytes. The bytes pass through the worker once here; ECDH `deriveKey` then `unwrapKey` would avoid even that, if cross-engine tests pass.
7. To open a map, the browser reads its own wrap for the current epoch and calls `unwrapKey` straight into non-extractable keys. At each rotation the enclave writes wraps for every current member at once (Part 13), so a normal map open adds no relay round trip. A sealed `mapKeys.request` is only the fallback for new joiners and older history epochs; the enclave checks access (Part 12) and writes the wrap.

The same steps run on any device.

**Session length.** One clock, matching `updateAge`. Better Auth's own refresh is switched off (`disableSessionRefresh`). On app load, and then once a day while a tab stays open, the crypto worker sends one signed `session.touch` sealed request if the last touch is over a day old. The enclave moves its registration's expiry to 7 days from now and returns a signed assertion; Vercel moves `session.expiresAt` to the same value from that reply. A view-only user therefore stays signed in exactly as today. Sign-out, a session revoke, account deletion and expiry delete the registration (Part 07). Part 08 settles the edge cases.

### Merges and character moves

| Event (today's code) | Key work in the enclave |
|---|---|
| Account merge (`mergeUsers`, `commitMerge`, `executeMergeRules`) | After the merge commits, re-seal the source account's sealed documents, net-worth days and `follows-character` documents under the survivor's user key with the survivor in the AAD owner. Write map key wraps for the survivor on every map it can now open. Recompute precomputed views. Then destroy the source user key. The source key stays usable for this job until it finishes. |
| Admin reassign of a character | No sealed data moves. Custody drops the character's token and link record (Part 08); its personal data re-syncs under the target account's user key after the character logs in there with EVE (Part 11). |
| Sale (`finishCharacterTransfer`) | Purge the character's documents with the seller's link, as today (decision 1); the buyer's account re-syncs them under its own key. |

The job is durable and idempotent on the merge or transfer decision record (Part 08).

### Browser storage rules

| Rule | Detail |
|---|---|
| Where and what | One IndexedDB database, `lgi-keys`, used only by the crypto worker. It holds only non-extractable `CryptoKey` objects (session key, user key, cached map key epochs), each tagged with account ID and session ID. Never OPFS, `localStorage` or cookies |
| No stored plaintext | Decrypted content stays in memory. Today's `localStorage` and `sessionStorage` items stay as they are |
| Wipe | At sign-out, account switch, or on load when there is no session or the tag's session ID differs from the current session's `sessionKeyId`; a map's keys also go when its access ends. The signed-in hint is cleared in the same step |
| No `persist()` | Firefox prompts for it, so the app never calls it |
| Private windows | Same `lgi-keys` store; the browser wipes it when the private session closes, so reloads and new tabs stay signed in as today. Only if opening IndexedDB throws do keys live in memory, shared between tabs over `BroadcastChannel`, before falling back to a login |
| Tabs | Tabs share the store; a Web Lock stops two of them making session keys at once |
| Safari | Tracking prevention deletes script storage after 7 days of Safari use without a visit, which is never sooner than a 7-day idle session ends |
| Keys gone, session alive | Rare (manual clearing, storage pressure). Treated as an expired session: the normal EVE login |

### Algorithms and libraries

| Use | Algorithm | Implementation |
|---|---|---|
| Content and key-record sealing | Seal v2 (below): HKDF-SHA256, AES-256-GCM, HMAC-SHA256 commitment | WebCrypto in both the browser and the enclave (Node 24 `globalThis.crypto.subtle`) |
| Sealed requests, replies and key delivery | HPKE (RFC 9180), base mode, DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM | One pinned HPKE library over WebCrypto, shared by browser and enclave |
| Request signatures | ECDSA P-256 with SHA-256 | WebCrypto |

P-256 is native and non-extractable in every current engine, so no fallback library is needed. Proposed, pending Question 3; if accepted, it replaces Part 07's X25519 channel key. No post-quantum suite; the suite byte leaves room. The code lives in `src/lib/seal/`, imported by both the app and the enclave image (Part 05), and replaces `src/lib/aes-gcm.ts` once `v1` envelopes are gone.

### Seal v2 envelope

Binary layout, stored as `bytea` in Neon and `v.bytes()` in Convex:

`version (1 byte, 0x02) | suite (1, 0x01) | keyId (16) | salt (32) | nonce (12) | commitTag (32) | ciphertext + GCM tag`

- `encKey = HKDF(K, salt, info = ['lgi/seal/v2/enc', aadHash])` and `commitKey = HKDF(K, salt, info = ['lgi/seal/v2/commit', aadHash])`. Both are derived as non-extractable keys.
- `aadHash = SHA-256(AAD)`. `commitTag = HMAC(commitKey, aadHash)`, checked with `subtle.verify` before decrypting. A row then opens under exactly one key, and per-message keys remove GCM nonce limits.
- AAD fields, in order: label, table, owner, row ID, version, `keyId`, epoch. Encoding is in hard rule 10.
- `keyId` is a random 16 bytes, so it reveals nothing. It names one key record and one epoch.
- No padding: Part 03 accepts sizes as metadata, and Part 17 may pad location rows.

### AAD binding table

| Sealed or MAC'd item | Owner | Row ID | Version | Key |
|---|---|---|---|---|
| Per-owner document (assets, blueprints, skills, sheet, jobs; corp documents) | `ownerType:ownerId` | Dataset name | Readable `version` after the write (Part 02) | User key; corp key for corp owners |
| User-authored document, `favoriteBlueprints` | `userId` | Row `id` or preference key | `revision`, added where missing | User key |
| Net-worth day, precomputed view, per-viewer corp result | `userId` | `day` or view name (plus `corporationId`) | Write count | User key |
| Map row | `mapId` | Opaque `rowKey` made by the enclave | Row version | Map key epoch |
| Location row | `mapId` | `characterId` | Sequence | Map key epoch |
| Map key wrap (`mapKeyWraps`) | `userId` | `mapId` | Epoch | User key, label `lgi/wrap/v2`; the browser opens it with `unwrapKey` |
| EVE token (`account`) | `userId` | `account.id` and field | Refresh count | Token key |
| Key record (`sealed_key_records`) | Kind and subject | `keyId` | Epoch | Service root key |
| Character-link record (readable, MAC only; with owner hash) | `accountId` | `characterId` | Record `version` | Enclave-only MAC key (Part 08) |
| Browser session registration (readable, MAC only) | `accountId` | `sessionKeyId` | `expiresAt` | Enclave-only MAC key over account, session ID, public keys and expiry |

Binding the version stops a ciphertext being paired with another row's metadata or version. It cannot stop a whole old row being restored; that is caught only by the enclave's map version (Part 16) and the token refresh count. A restored personal row shows older EVE data until the next sync, which is accepted.

### Key-record storage

| Store | Columns (readable unless marked) | Writer |
|---|---|---|
| Neon `sealed_key_records` | `key_id` (primary key), `kind` (user, map, corp, token, service), `subject` (user, map or corp ID, or environment), `epoch`, `root_key_id`, `wrapped_key` (sealed), `created_at`, `retired_at`, `destroy_after`; unique on (`kind`, `subject`, `epoch`) | `sealed_service` Neon role only |
| Convex `mapKeyWraps` | `mapId`, `userId`, `epoch`, `keyId`, `wrapped` (sealed); members read only their own rows | Enclave only (`requireSealedService`, Part 07) |
| Neon `user_key_backups` | Passkey and recovery-key wraps (Part 10) | Browser via a sealed request |

The writer column is hygiene. LGI operators own the Neon project and Convex admin keys, so integrity rests on Seal v2's commitment and AAD and on the enclave MACs, not on roles.

### Limits

Non-extractable keys stop keys being copied out later; they do not stop code served on lgi.tools from using them. Three limits stay: AWS signs the attestation, and the AWS account owner can change the key-release rule (visible through the published fingerprints); whoever serves lgi.tools could ship code that leaks keys after login (Parts 26 and 27); and anyone holding a user's EVE login reaches their data (decision 5).

### Retired from the older design

These go, because the sealed service now holds user keys and checks EVE logins itself (decisions 1, 5, 7 and 9): the account root secret and keyring; per-character identity and recovery keys; device keys, the key directory, sigchains and Sigsum; QR device linking; account proofs, vetoes and cooldowns; the mandatory recovery secret; group epoch secrets and op frames (replaced by map key epochs, Part 13); and the post-quantum and MLS tracks. Label rules, key commitment, non-extractable storage and the Safari notes carry over in reduced form.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| KMS-sealed service root key blob | Yes, as a blob | Yes (KMS) | Sealed service |
| Key record metadata (`key_id`, kind, subject, epoch, timestamps) | Yes | No | Sealed service writes; LGI server stores |
| User, map, corp, token and service keys | No | Yes (root key) | Sealed service |
| Map key wraps | `mapId`, `userId`, epoch, `keyId` | Key bytes | Sealed service wraps; browser unwraps |
| Browser session registration (account, session ID, public keys, expiry) | Yes, enclave-MAC'd | No | Sealed service writes; LGI housekeeping deletes expired rows |
| Character-link record (character, account, owner hash) | Yes, enclave-MAC'd | No | Sealed service |
| Envelope header and AAD fields | Yes (already readable columns) | No | Browser and sealed service |

## Hard rules

1. [Agreed] Every unlock follows an EVE login and is immediate, with no delay, prompt or setting. The normal path is the sealed service checking the login; passkey or recovery-key unlock covers outages (Part 10) (decisions 1, 5 and 7).
2. [Agreed] Passkeys and recovery keys stay optional, with no prompts or nudges; offered as a quiet option at login (decision 9).
3. [Proposed] One user key per LGI account, not per character.
4. [Proposed] Corp keys, the token key, the service root key and service signing keys never leave the enclave.
5. [Proposed] The enclave changes its character-link record only (a) on first login, (b) on a link request signed by a browser session key already registered to the target account, or (c) through a merge it decides itself from two owner-hash-verified logins. It never takes `linkingUserId` from Vercel or a target from `account` rows.
6. [Proposed] The owner-hash check runs before any key leaves the enclave. A user key goes only to a browser session key registered to that account, with HPKE `info` binding session, account and `keyId`. The enclave rejects any registration or link record it did not MAC.
7. [Proposed] A user key is created only for an account with no link records. Otherwise a missing or unreadable key record fails closed; the unique (`kind`, `subject`, `epoch`) constraint stops any create replacing a record.
8. [Proposed] Map keys are also wrapped to each member's user key, eagerly for every current member at each rotation. Only the enclave writes `sealed_key_records` and `mapKeyWraps`, as hygiene; integrity rests on Seal v2.
9. [Proposed] Merges and character moves re-seal, re-wrap or purge as the table above says; the source user key is destroyed only after its re-seal job finishes.
10. [Proposed] AAD is a list of strings, each with a 4-byte length prefix; the table name comes first after the label; integers are canonical decimal and bytes base64url. Labels come from one registry, and a unit test checks they are unique.
11. [Proposed] One session clock: Better Auth's own refresh off, one signed `session.touch` at most once a day, and registration and `session.expiresAt` moved together from its reply. The browser wipe keys on session ID, not a stored expiry.
12. [Proposed] Browser keys are non-extractable `CryptoKey` objects in IndexedDB only (memory only if IndexedDB throws), handled by the crypto worker, wiped by the rules above, with the signed-in hint cleared alongside. A Web Lock guards session-key creation. No decrypted content is persisted in the browser. The app never calls `navigator.storage.persist()` and shows no key or storage copy.
13. [Proposed] All new sealing uses Seal v2 from `src/lib/seal/` with a registered label. No feature defines its own envelope or calls `crypto.subtle` encryption directly.
14. [Proposed] Every envelope binds table, owner, row ID, version and `keyId` as AAD. Readers rebuild the AAD from readable columns and expected context, never from the ciphertext, check the header `keyId` against the readable column, and check the commitment tag before decrypting. A failed open returns a code and logs no key or plaintext.
15. [Proposed] WebCrypto only, plus one pinned HPKE library shared by browser and enclave. Keys are imported raw or pkcs8, never JWK.
16. [Proposed] No new data uses a `v1` envelope or an environment key. Both retire per Part 31.

## Assumptions

| Assumption | How to check |
|---|---|
| Every user's browser supports non-extractable P-256 ECDSA and ECDH, HKDF and AES-GCM `unwrapKey` | Boot probe in a dev build; user agents in `session`; crypto vectors per engine (Part 32) |
| The chosen HPKE library accepts a non-extractable P-256 recipient key and gives identical results in Node 24 | Cross-engine test vectors before Phase 1 |
| Private windows in Chrome, Firefox 115+ and Safari provide IndexedDB that survives reloads and new tabs | Manual test in each; unit test of the `BroadcastChannel` fallback |
| Safari deletes storage only after 7 days of use without a visit, so sessions end first | Test on the owner's iPhone and Mac with a session past 7 days |
| Better Auth's default one-day `updateAge` is what keeps sessions alive today, and `disableSessionRefresh` turns it off | `node_modules/better-auth/dist/context/create-context.mjs` and `dist/api/routes/session.mjs`; confirm in a dev session |
| Eager wraps at rotation stay cheap at 18 users | Time a rotation on the largest map in staging |

Tests (Part 32) add: a map open after a rotation makes no relay round trip; a view-only user stays signed in past 7 days; a link request without a valid session signature is refused; a merge leaves every survivor row readable.

## What users see

Nothing new. Logins, page loads, private windows and new devices look as they do today. Passkey and recovery-key unlock is a quiet option at login, shown plainly only when the sealed service is unreachable (Part 10). One rare exception: if the browser loses its stored keys while the session cookie survives, the user sees the normal EVE login, as when a session expires. This is required because the sealed service must not release keys on Vercel's cookie alone.

## Questions for the owner

1. **Per-account or per-character keys?** Recommended: per account. Today's data, sessions, board and net worth are all per account. The cost is re-seal work on merges, and a purge and re-sync on sales (which happen today anyway). Per-character keys would make character moves cheaper but add wraps everywhere and hide nothing from LGI, which already sees character links.
2. **Wrap map keys to members' user keys too?** Recommended: yes. Members can still open maps through a sealed-service outage (Part 10), and map opens need no relay round trip. The cost is one small row per member per epoch. This does not stop code on lgi.tools from using the keys (see Limits).
3. **P-256 or X25519 for HPKE and session keys?** Recommended: P-256, native everywhere with one code path. X25519 is fine if every user's browser has it.
4. **Keep the commitment tag and per-message keys?** Recommended: yes. They cost 64 bytes and two key derivations per row. The alternative is plain AES-GCM with a random nonce, which is simpler but opens under more than one key in theory.
5. **Rotate a user key after "sign out everywhere"?** Recommended: no. A stolen profile loses server access when its session is revoked. Rotating would mean re-sealing every document for little gain.
