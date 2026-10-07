# Part 09: Keys, sealed formats and getting keys back

**Status:** Draft for owner review

## In one paragraph

This part sets the whole key model. KMS seals one service root key. Under it sit one user key per LGI account, a map key per map in numbered key epochs, a corp key per corp, and one token key. The corp and token keys never leave the enclave. At each EVE login the browser makes a fresh browser session key. The sealed service checks the login and returns the user's key wrapped to that session key. The browser keeps it non-extractable in IndexedDB until the session ends. Map keys reach the browser as wraps under the user key. Every sealed row uses one envelope format. That format names its key and binds the table, owner, row ID and version, so a row cannot be swapped or mixed with another version. This part retires the older design's identity machinery.

## How it works today

- There are no user keys, map keys or browser crypto. Map contents, locations and personal data are plaintext in Convex and Neon (see 06).
- One envelope, `encryptAes256Gcm`: AES-256-GCM, a random 12-byte IV, stored as the string `v1:iv:tag:ciphertext` in base64. It has no associated data and no key ID, and decryption returns `null` on any failure.
- EVE tokens in `account` use that envelope under one environment key, `EVE_TOKEN_ENCRYPTION_KEY`. Better Auth database hooks encrypt them on create and update. `eve-token-service.ts` and `owner-transfer.ts` decrypt them.
- Corp asset pulls in `esi_snapshots` use the same envelope under `ESI_SNAPSHOT_ENCRYPTION_KEY`. Operators can read both environment keys.
- Sessions last 7 days (`expiresIn`). Better Auth's default one-day `updateAge` extends them whenever they are used, and the cookie cache is 5 minutes in production.
- The browser keeps device-local conveniences in `localStorage`: preferences, search recents and planner recent blueprints. Nothing is stored in IndexedDB.

Files: `src/lib/aes-gcm.ts`, `src/platform/auth/token-crypto.ts`, `src/platform/auth/auth.ts`, `src/platform/auth/eve-token-service.ts`, `src/composition/account-lifecycle/owner-transfer.ts`, `src/data/esi-snapshots/crypto.ts`, `src/lib/preferences.ts`, `src/features/search-recents/storage.ts`, `src/features/industry-planner/recent-blueprints.ts`.

## What changes

Nothing visible changes for users. Keys arrive inside the existing login round trip. The new format replaces `v1` envelopes feature by feature (Part 30), and both environment keys retire in Phase 5 (Part 31). One rare exception is under What users see.

## Design

### Key inventory

| Key | Scope and storage | Leaves the enclave? | Seals | Rotation |
|---|---|---|---|---|
| Service root key | One per environment; KMS blob in Neon (Part 06) | Never | Key records | Rare; key records rewrapped |
| User key | One per LGI account; key record, plus optional passkey and recovery wraps (Part 10) | Only to that account's browser session keys | Personal and user-authored documents, net-worth days, precomputed views, map key wraps, per-viewer corp results | None; destroyed at deletion (Part 11) |
| Map key, epoch N | Per map per epoch; key record, plus a wrap under each member's user key | Only as those wraps | Map and location rows | On removal, block, corp loss or sale (Part 13) |
| Corp key | Per corporation; key record | Never | Corp documents, holding index (Part 23) | Optional epoch per full replace |
| Token key | One per environment; key record | Never | EVE tokens (Part 08) | New epoch, applied at each refresh |
| Browser session key | Two non-extractable P-256 pairs made at each login (ECDSA signs, ECDH receives keys); IndexedDB, public halves registered sealed (Part 07) | Private halves stay in the browser | Nothing at rest | Every login |

All keys except the browser session key are random 256-bit keys made in the enclave and stored as key records under the service root key. The identity-assertion and Convex service-JWT signing keys (Parts 07 and 08) are key records of kind `service`.

### Getting keys back by logging in

1. The browser's crypto worker makes the browser session key. It also makes the PKCE verifier (Part 08).
2. The browser verifies a fresh attestation and takes the channel key from it (Part 06).
3. It sends the login request, HPKE-sealed to the channel key (Part 07). The request carries the code, the verifier and both session public keys.
4. The enclave checks the EVE login and, before releasing any key, the owner hash against its own record (Part 14). It finds the account through its own character-link record, loads or creates the user key, registers the session key for 7 days and returns the identity assertion for Vercel (Part 08).
5. The reply carries the user key, HPKE-sealed to the session's ECDH public key. The HPKE `info` binds `sessionKeyId`, `accountId` and the user key's `keyId`.
6. The browser opens the wrap and imports the user key as a non-extractable HKDF key. It stores the key in IndexedDB and discards the bytes.
7. To open a map, the browser reads its own wraps for that map and calls `unwrapKey` straight into non-extractable keys. Map key bytes never reach page script. If an epoch has no wrap yet, the browser sends a sealed `mapKeys.request`. The enclave checks access (Part 12) and writes the wrap (Part 13).

The same steps run on any device.

**Session length.** Today a session extends while it is in use. To match that without trusting Vercel, each signed request pushes the session key's expiry to 7 days from now. Sign-out, a session revoke, account deletion and expiry delete the registration (Part 07). Part 08 settles the edge cases.

### Browser storage rules

| Rule | Detail |
|---|---|
| Where and what | One IndexedDB database, `lgi-keys`, used only by the crypto worker. It holds only non-extractable `CryptoKey` objects (session key, user key, cached map key epochs), each tagged with account ID, session ID and expiry. Never OPFS, `localStorage` or cookies |
| No stored plaintext | Decrypted content stays in memory. Today's device-local `localStorage` conveniences stay as they are |
| Wipe | At sign-out, account switch, a missing or expired session on load, or a tag mismatch; a map's keys also go when its access ends |
| No `persist()` | Firefox prompts for it, so the app never calls it |
| Private windows, tabs | Private windows keep keys in memory and log in per window, as today. Tabs share the store, and a Web Lock stops two of them making session keys at once |
| Safari | Tracking prevention deletes script storage after 7 days of Safari use without a visit, which is never sooner than a 7-day idle session ends |
| Keys gone, session alive | Rare (manual clearing, storage pressure). Treated as an expired session: the normal EVE login |

### Algorithms and libraries

| Use | Algorithm | Implementation |
|---|---|---|
| Content and key-record sealing | Seal v2 (below): HKDF-SHA256, AES-256-GCM, HMAC-SHA256 commitment | WebCrypto in both the browser and the enclave (Node 24 `globalThis.crypto.subtle`) |
| Sealed requests, replies and key delivery | HPKE (RFC 9180), base mode, DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM | One pinned HPKE library over WebCrypto, shared by browser and enclave |
| Request signatures | ECDSA P-256 with SHA-256 | WebCrypto |

P-256 is native and non-extractable in every current engine, so no fallback library is needed. This settles Part 07's open choice, replacing its X25519 channel key. No post-quantum suite; the suite byte leaves room. The code lives in `src/lib/seal/`, imported by both the app and the enclave image (Part 05), and replaces `src/lib/aes-gcm.ts` once `v1` envelopes are gone.

### Seal v2 envelope

Binary layout, stored as `bytea` in Neon and `v.bytes()` in Convex:

`version (1 byte, 0x02) | suite (1, 0x01) | keyId (16) | salt (32) | nonce (12) | commitTag (32) | ciphertext + GCM tag`

- `encKey = HKDF(K, salt, info = ['lgi/seal/v2/enc', aadHash])` and `commitKey = HKDF(K, salt, info = ['lgi/seal/v2/commit', aadHash])`. Both are derived as non-extractable keys.
- `aadHash = SHA-256(AAD)`. `commitTag = HMAC(commitKey, aadHash)`, checked with `subtle.verify` before decrypting. A row then opens under exactly one key, and per-message keys remove GCM nonce limits.
- AAD is a list of strings, each prefixed with its 4-byte length: label, table, owner, row ID, version, `keyId`, epoch. Integers are canonical decimal and bytes are base64url. Labels come from one registry, and a unit test checks they are unique.
- `keyId` is a random 16 bytes, so it reveals nothing. It names one key record and one epoch.
- No padding: Part 03 accepts sizes as metadata, and Part 17 may pad location rows.

### AAD binding table

The table name is always the first AAD field after the label.

| Sealed item | Owner | Row ID | Version | Key |
|---|---|---|---|---|
| Per-owner document (assets, blueprints, skills, sheet, jobs; corp documents) | `ownerType:ownerId` | Dataset name | Readable `version` after the write (Part 02) | User key; corp key for corp owners |
| User-authored document, `favoriteBlueprints` | `userId` | Row `id` or preference key | `revision`, added where missing | User key |
| Net-worth day, precomputed view, per-viewer corp result | `userId` | `day` or view name (plus `corporationId`) | Write count | User key |
| Map row | `mapId` | Opaque `rowKey` made by the enclave | Row version | Map key epoch |
| Location row | `mapId` | `characterId` | Sequence | Map key epoch |
| Map key wrap (`mapKeyWraps`) | `userId` | `mapId` | Epoch | User key, label `lgi/wrap/v2`; the browser opens it with `unwrapKey` |
| EVE token (`account`) | `userId` | `account.id` and field | Refresh count | Token key |
| Key record (`sealed_key_records`) | Kind and subject | `keyId` | Epoch | Service root key |

Binding the version stops a ciphertext being paired with another row's metadata or another version. It cannot stop a whole old row being restored. That is caught only where a high-water mark lives elsewhere: the enclave's map version (Part 16) and the token refresh count. A restored personal row shows older EVE data until the next sync. That limit is accepted.

### Key-record storage

| Store | Columns (readable unless marked) | Writer |
|---|---|---|
| Neon `sealed_key_records` | `key_id` (primary key), `kind` (user, map, corp, token, service), `subject` (user, map or corp ID, or environment), `epoch`, `root_key_id`, `wrapped_key` (sealed), `created_at`, `retired_at`, `destroy_after`; unique on (`kind`, `subject`, `epoch`) | `sealed_service` Neon role only |
| Convex `mapKeyWraps` | `mapId`, `userId`, `epoch`, `keyId`, `wrapped` (sealed); members read only their own rows | Enclave only (`requireSealedService`, Part 07) |
| Neon `user_key_backups` | Passkey and recovery-key wraps (Part 10) | Browser via a sealed request |

### Retired from the older design

These go, because the sealed service now holds user keys and checks EVE logins itself (decisions 1, 5, 7 and 9): the account root secret, keyring and its Neon project; per-character identity and encryption keys and recovery anchor keys; device keys and device classes; the key directory, sigchains, Sigsum, JWKS witnesses and re-attestation; QR device linking; tidy and compromise revoke, account proofs, vetoes and cooldowns; root-secret, CEK and CIK rotation; the mandatory recovery secret and passphrase unlocker; group epoch secrets, op frames, commits and confirm tags (replaced by map key epochs, Part 13); and the post-quantum and MLS tracks. The old label rules, key commitment, non-extractable storage and Safari notes carry over in reduced form.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| KMS-sealed service root key blob | Yes, as a blob | Yes (KMS) | Sealed service |
| Key record metadata (`key_id`, kind, subject, epoch, timestamps) | Yes | No | Sealed service writes; LGI server stores |
| User, map, corp, token and service keys | No | Yes (root key) | Sealed service |
| Map key wraps | `mapId`, `userId`, epoch, `keyId` | Key bytes | Sealed service wraps; browser unwraps |
| Browser session registration | No | Yes (root key, Part 07) | Sealed service |
| Envelope header and AAD fields | Yes (already readable columns) | No | Browser and sealed service |

## Hard rules

1. [Agreed] Keys come back only by logging in with EVE. The sealed service checks the login itself, and every unlock is immediate, with no delay, prompt or setting (decisions 1, 5 and 7).
2. [Agreed] Passkeys and recovery keys stay optional and silent (decision 9).
3. [Proposed] One user key per LGI account, not per character.
4. [Proposed] Corp keys, the token key, the service root key and service signing keys never leave the enclave.
5. [Proposed] The owner-hash check runs before any key leaves the enclave. A user key goes only to a browser session key registered to that account, with HPKE `info` binding session, account and `keyId`.
6. [Proposed] Map keys are also wrapped to each member's user key. Only the enclave writes `sealed_key_records` and `mapKeyWraps`, through its own Neon role and Convex credential.
7. [Proposed] Browser keys are non-extractable `CryptoKey` objects in IndexedDB only, handled by the crypto worker and wiped by the rules above. No decrypted content is persisted in the browser. The app never calls `navigator.storage.persist()` and shows no key or storage copy.
8. [Proposed] All new sealing uses Seal v2 from `src/lib/seal/` with a registered label. No feature defines its own envelope or calls `crypto.subtle` encryption directly.
9. [Proposed] Every envelope binds table, owner, row ID, version and `keyId` as AAD. Readers rebuild the AAD from readable columns and expected context, never from the ciphertext, and check the commitment tag before decrypting. A failed open returns a code and logs no key or plaintext.
10. [Proposed] WebCrypto only, plus one pinned HPKE library shared by browser and enclave. Keys are imported raw or pkcs8, never JWK.
11. [Proposed] No new data uses a `v1` envelope or an environment key. Both retire per Part 31.

## Assumptions

| Assumption | How to check |
|---|---|
| Every user's browser supports non-extractable P-256 ECDSA and ECDH, HKDF and AES-GCM `unwrapKey` | Boot probe in a dev build; user agents in `session`; crypto vectors per engine (Part 32) |
| The chosen HPKE library accepts a non-extractable P-256 recipient key and gives identical results in Node 24 | Cross-engine test vectors before Phase 1 |
| Safari deletes storage only after 7 days of use without a visit, so sessions end first | Test on the owner's iPhone and Mac with a session past 7 days |
| Better Auth's default one-day `updateAge` is what keeps sessions alive today | `node_modules/better-auth/dist/context/create-context.mjs`; confirm in a dev session |

## What users see

Nothing new. Logins, page loads and new devices look as they do today. One rare exception: if the browser loses its stored keys while the session cookie survives, the user sees the normal EVE login, as when a session expires. This is required because the sealed service must not release keys on Vercel's cookie alone.

## Questions for the owner

1. **Per-account or per-character keys?** Recommended: per account. Today's data, sessions, board and net worth are all per account. Per-character keys would add wraps and re-seals and hide nothing from LGI, which already sees character links.
2. **Wrap map keys to members' user keys too?** Recommended: yes. Members can still open maps through a sealed-service outage (Part 10), and map keys never reach page script as bytes. The cost is one small row per member per epoch.
3. **P-256 or X25519 for HPKE and session keys?** Recommended: P-256, native everywhere with one code path. X25519 is fine if every user's browser has it.
4. **Keep the commitment tag and per-message keys?** Recommended: yes. They cost 64 bytes and two key derivations per row. The alternative is plain AES-GCM with a random nonce, which is simpler but opens under more than one key in theory.
5. **Rotate a user key after "sign out everywhere"?** Recommended: no. A stolen profile loses server access when its session is revoked. Rotating would mean re-sealing every document for little gain.
