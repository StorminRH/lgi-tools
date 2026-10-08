# Part 07: Reaching the sealed service: transport and request authentication

**Status:** Draft for owner review

**Verification findings (2026-10-08, to apply as questions are settled):**
- Code facts: 11 optimistic edits confirmed; `swallowMutationRejection` wraps all 14 chain-authoring mutations (remove and restore also have an unswallowed path in the missing-signature flow); the two map routes take only IDs from the browser and read map content through service-secret actions; Upstash also limits map creation to 5 per minute per user; revocation never reaches Convex today (an issued Convex JWT stays valid up to 7 days; the cookie cache honours a revoked session up to 5 minutes); `/api/internal/eve-token`, `/api/internal/eve-characters` and `/leave-sync` are missing from the mapping table.
- Platform facts: a second `customJwt` provider and `identity.issuer` work (issuer must be a URL; set `applicationID`; every backend needs the env var); `ctx.scheduler.runAt` works but every scheduled run is a billed call; unauthenticated queries work today; a Node process can subscribe with `ConvexClient` and `setAuth`, but each token refresh re-runs all its authenticated queries; Better Auth can set a custom session column (declare it without a default) and a plugin endpoint can create a session from an external assertion (the SIWE plugin is a precedent); non-extractable P-256 keys in IndexedDB need a Safari/Firefox/Chrome spike, and Safari ITP may clear IndexedDB after 7 days without interaction; HPKE is available with zero dependencies (`hpke`).
- Cost: as drafted, one map edit costs about 8 Convex calls against today's 1 and moves the ciphertext about 7 times; cancelling or merging per-row schedulers, keeping the reply small and separate, dropping the body on completion, a one-shot status read and a longer enclave token bring it to about 5 to 6 calls.
- Conflicts with agreed decisions: the `sealedJobs` inbox and awaited jobs (Part 05 direct Neon claim; page loads never wait), 7-day map dedupe and the map-wide version (Part 05 clean-ups 2 and 7), the `access` class (access-list edits stay readable), the `session` class and `session.touch` (Better Auth keeps its default refresh), role checks from Part 12 inputs (readable-is-not-trusted dropped), the latency budget table (Part 01: no formal numbers), the status row as the lease row and the drift-check nonce (Parts 05 and 06).

**Carried from the Part 06 review (2026-10-08):** browsers read the attestation document from the status row; the per-login nonce round trip is dropped (question 7 settled for the status-row document).

**Carried from the Part 3 review (2026-10-07):** decide whether the readable sealed-request record needs the account ID at all. Map event `kind` and `actor` are now sealed, so the request record is the remaining place that shows who edited a map and when.

## In one paragraph

This part decides how browsers, Vercel and Convex send work to the sealed service and get answers back. The default is to relay everything through Convex. A browser writes a sealed request row, the enclave picks it up over a connection it opens itself, and it writes a reply row. AWS needs no inbound port, and no new origin appears. Each request is encrypted to a key the browser found in an attestation it verified before sending anything. It is signed by the browser session key registered at EVE login, so the enclave never relies on Vercel's cookie or Convex's JWT. The part also ties keys to today's rolling sessions and sets idempotency, ordering, size limits, deadlines, cron work, which of today's paths move, and the credential that lets only the enclave write sealed Convex rows.

## How it works today

There is no sealed service. None of today's channels signs requests or encrypts payloads beyond TLS.

- **Browser to Convex.** A WebSocket, authenticated by Better Auth's ES256 `jwt` (audience `convex`, 7 days) through a `customJwt` provider. `requireMapAccess` takes the user from `identity.subject` and checks the projected `mapAccess` claim. Eleven map edits use optimistic updates. Five mutations have none: `mapScan.applyScan` (returns data, shows "Scan applied"), `identifySignature`, `removeSignatures`, `restoreSignatures` ("Restore failed" on error) and `linkStubToResolvedConnection`; three are wrapped in `swallowMutationRejection`. None carries an idempotency key. The Convex client queues mutations while offline and resends them on reconnect, so an edit made before a laptop sleeps still lands.
- **Sessions.** Better Auth sessions last 7 days and roll forward on use (`updateAge` left at its default). Production caches the session in a cookie for 5 minutes. Sign-out deletes the session row; "log out everywhere" and admin revoke call `revokeUserSessions`, which deletes the user's rows.
- **Vercel and Convex.** `convex/http.ts` exposes 16 HTTP actions behind `Bearer CONVEX_SERVICE_SECRET`. Convex calls Vercel with the same secret, for example to lease access tokens from `/api/internal/eve-token`.
- **Browser to Vercel.** Typed endpoint contracts with RFC 9457 problem codes. `/api/maps/jump` and `/api/maps/signature-elimination` take map content. `/api/maps/search-characters` and `/api/account/custom-structures/search` use the user's tokens, with no rate limit; structure search fires on a 250 ms debounce. Upstash limits sign-in, link and log out everywhere to 10 per minute. Convex's rate-limiter component is unused and due to be unmounted.
- **Scheduling.** Vercel crons check `CRON_SECRET`. Convex runs three daily purges and the hourly collapse.

Files: `convex/http.ts`, `convex/lib/httpAuth.ts`, `convex/auth.config.ts`, `convex/crons.ts`, `convex/convex.config.ts`, `convex/lib/mapAccess.ts`, `convex/mapScan.ts`, `src/platform/auth/auth.ts`, `src/platform/auth/admin-users.ts`, `src/app/api/account/sessions/revoke/route.ts`, `src/transport/endpoint.ts`, `src/lib/rate-limit.ts`, `src/app/api/maps/jump/route.ts`, `src/app/api/maps/signature-elimination/route.ts`, `src/app/api/maps/search-characters/route.ts`, `src/app/api/account/custom-structures/search/route.ts`, `src/composition/map-character-scoping.ts`, `src/mapper/chain/optimistic-authoring.ts`, `src/mapper/signatures/use-signature-missing-flow.ts`, `src/features/custom-structures/use-structure-search.ts`.

## What changes

Nothing visible changes for users. Pages, flows, timings and error states stay as they are. Behind the scenes, Convex gains a request table, a readable status query, an enclave-only write credential and a few functions. Browsers gain a channel client that seals, signs and, after an enclave restart, re-seals requests. Vercel gains the login routes listed under "Before a session exists" (Part 08), and the session row gains one readable column. Routes that carry map content or use tokens are removed as each feature moves.

Dropped from the older docs: the Durable Objects relay, the `relay.` and `api.` origins, device-signed `POST /session` with short-lived API tokens and relay capabilities, MapRoom sequencing and head-hash chains, padded op frames, location frame batching and the relay conformance suite.

## Design

### Transport options

| | Convex-relayed (default) | HTTPS behind a Vercel rewrite |
| --- | --- | --- |
| Path | Browser → Convex mutation → enclave subscription → reply row | Browser → `lgi.tools/sealed/*` → rewrite → public AWS endpoint |
| AWS exposure | None inbound | Public port, certificate, DDoS exposure |
| Payload privacy | Application-layer encryption | Still needed: TLS ends at Vercel |
| Map edits | Reply and sealed rows land in one Convex transaction | Browser still waits on Convex |
| Enclave restart | Requests wait, are re-sealed and complete | Requests fail; browsers retry |
| Latency | One extra push hop (estimate 30 to 80 ms) | Slightly lower |

Recommendation: Convex-relayed.

### Convex surface

| Item | Kind | Caller | Does |
| --- | --- | --- | --- |
| `sealedRequests` | Table | | Envelope fields, `userId` from the JWT (null before login), `deadline`, `status` (pending, done, expired, rejected), reply ciphertext, `completedAt`, and an optional follow-up slot: `followUpStatus` (none, pending, done, expired), follow-up ciphertext, `followUpDeadline` |
| `sealed.status` | Public query, no auth | Browser | Returns the status row: attestation document, channel key ID, boot time |
| `sealed.submit` | Public mutation | Browser (JWT) | Checks size, class and pending cap; sets `deadline` from receipt time; inserts, idempotent on `requestId` |
| `sealed.reply` | Public query | Browser (JWT) | Status, reply and follow-up for the caller's own `requestId` |
| `/sealed-submit`, `/sealed-reply` | HTTP actions | Vercel (service secret) | The same before a session exists |
| `sealed.pending`, `sealed.complete` | Query, mutation | Enclave only | Pull work in order; write the outcome, or a follow-up, with the fencing check |
| `sealedJobs` | Table | | Readable server-job inbox (see Server-originated work) |
| `/enqueue-sealed-job`, `/sealed-job-result` | HTTP actions | Vercel (service secret) | Enqueue a job, idempotent on `dedupeKey`; read an awaited job's status and readable result |
| `sealed.jobs`, `sealed.completeJob` | Query, mutation | Enclave only | Pull due jobs; write status and readable result with the fencing check |

There is no claim step. Part 05 runs one leader under a lease, and `complete` rejects a stale fencing number, so a dead leader's row stays pending for the new one.

### Channel keys and envelope

1. At boot the enclave creates a fresh P-256 **channel key** and puts its public half in the attestation document's `public_key` (Part 06). It writes the document, key ID and boot time to its status row (the Part 05 lease row) and refreshes the document every few minutes.
2. At login the browser reads `sealed.status` and runs Part 06's checks before sending anything (decision 1). Replaying an old document is harmless: that boot's private key is gone, and retired images fail the fingerprint list. This replaces Part 06's nonce round trip at login; the daily drift check keeps its nonce.
3. When the key ID changes, the channel client re-verifies and re-seals pending requests. No UI is involved.
4. Requests use the Part 09 suite, from `src/lib/seal/`: HPKE base mode, DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM. The reply uses a key exported from the same context; a follow-up reply uses a second key exported under its own label.

| Envelope part | Readable in Convex | Inside the ciphertext |
| --- | --- | --- |
| `v`, `requestId`, `channelKeyId`, `class`, `mapId` (map classes) | Yes, bound as AAD | Repeated and checked |
| `sessionKeyId`, `accountId`, operation name and body (JSON, zod-checked) | No | Yes |
| ECDSA P-256 signature by the browser session key over AAD and body | No | Yes |
| Reply: outcome, problem code, data (today's return values) | Only `status` | Yes |
| Follow-up reply (elimination result, Part 16) | Only `followUpStatus` | Yes |

Operations are declared like today's `src/transport/endpoint.ts` contracts: `defineSealedOperation` with zod schemas and closed problem codes, in `src/platform/sealed-envelope/`. Part 05 already makes that zone importable by `app`, `mapper`, `convex` and the sealed zones; it is added to `.fallowrc.json` in the same change.

### Request authentication

- **Registration.** At login the browser creates non-extractable P-256 signing and key-agreement keys (Part 09) and sends their public halves in the login request. The enclave stores `{sessionKeyId, accountId, public keys}` sealed under the service root key in Neon; a readable binding would let an operator attach their own key to a victim. The identity assertion (Part 08) carries `sessionKeyId`, and Vercel writes it to a readable column on the new session row.
- **Every request.** The enclave decrypts, opens the registration and checks the signature. It then requires a Neon `session` row with that `sessionKeyId`, the same user and an unexpired `expiresAt` (cached up to 60 s, inside today's 5-minute cookie cache). Then it checks the role from its own inputs (Part 12). The Convex JWT only filters out strangers.
- **Expiry and revocation.** Rolling expiry, sign-out, log out everywhere, admin revoke and account deletion already change or delete session rows, so they carry over with no new path. Trusting the readable row is safe because a deleted row only denies service. Housekeeping deletes registrations whose row is gone.
- **Before a session exists.** Login goes through `/api/auth/sealed`, which applies today's Upstash IP limit, forwards ciphertext to `/sealed-submit` and polls `/sealed-reply` every 100 ms until the reply or the deadline. Every new login route on Vercel (Part 08):

  | Route | Kind | Does |
  | --- | --- | --- |
  | `/api/auth/oauth2/callback/eve` (today's registered callback path) | Route handler, beats the Better Auth catch-all | Answers 303 to `/auth/callback`; sees the code but cannot redeem it |
  | `/auth/callback` | Client page | Minimal blank interstitial; the browser checks `state`, strips the code and sends the sealed `login` request |
  | `/api/auth/sealed` | Route handler | Pass-through above; Upstash IP limit |
  | `/api/auth/eve/session` | Better Auth plugin endpoint | Verifies the single-use identity assertion, runs today's after-login work and creates the session; Upstash IP limit |

### Idempotency, re-sealing and ordering

| Concern | Rule |
| --- | --- |
| Idempotency | A retry keeps its `requestId` and resends the same ciphertext unless the channel key changed. A completed `requestId` returns the stored reply |
| Re-seal | The enclave marks a row with an old `channelKeyId` `rejected`, code `rekey` (retryable). The client re-seals it under the same `requestId`. `submit` replaces the ciphertext when `channelKeyId` differs and the row is not done; the deadline restarts |
| Deadlines | Convex sets them from receipt time (`_creationTime` plus the class deadline). An edit resent after sleep gets a fresh deadline and lands, as today |
| Replay | Old ciphertext cannot be opened after a restart. Within a boot, the enclave keeps a seen-`requestId` set per session key in memory |
| Map dedupe | Sealed map state holds `requestId`s applied in the last 7 days, written with the rows. No map edit applies twice |
| Per-map order | One request at a time per map, in Convex submission order (Part 05 queue); one client's order comes from the Convex client. A `rekey` row keeps its place: later rows wait until it returns or expires |
| Atomic completion | One enclave mutation writes the sealed rows, map version, applied `requestId` and reply |
| Follow-up reply | A request may carry at most one follow-up. Only a `map` request with the `eliminate` flag (Part 16) asks for one: `complete` sets `followUpStatus` pending and `followUpDeadline` 15 s after the main reply (today's elimination timeout). The elimination write, in the same queue turn, writes its rows, map version and the follow-up in one mutation. A retry of a done request returns both stored replies |

Accepted limit outside maps: an operator who hides a completed reply and restarts the enclave can make the browser re-seal its retry. Document and access-list writes carry an expected version (Part 05), so the duplicate fails; lookups and logins only read or redeem single-use codes. Dropping or delaying requests is denial, not disclosure.

### Size limits

`/api/auth/sealed` keeps Upstash at 10 per minute per IP. `submit` caps requests at 64 KiB and 50 pending per user, with no per-minute limits by default (Question 8). The enclave drops anything that fails decryption and keeps no duplicate counters, since an operator who controls Convex can deny service anyway.

### Mapping today's paths

| Today | Outcome |
| --- | --- |
| 11 optimistic edits and the five `mapScan` mutations | `map` class; replies carry today's return values |
| `/api/maps/jump`, `/api/maps/signature-elimination`; `/jump-evidence`, `/resolve-jump`, `/signature-elimination` actions | `map` class; routes and actions removed, logic runs in workers |
| `/api/maps/access`, `/api/maps/create` | `access` class; map creation, its attempt ladder and its compensation run in the sealed service (Part 12) |
| `/api/maps/delete`, `/api/maps/restore`, `/api/maps/purge-now` | Stay (readable lifecycle; Part 12) |
| `/api/account/custom-structures/search` | `lookup` class; route removed |
| `/api/maps/search-characters` | Route stays. With no scoped character, Vercel's tokenless exact-name lookup, as today, never touching the sealed service. Otherwise an awaited `characterSearch` service job (recorded exception below; Part 08) |
| `/api/account/corp-structures/rigs`, `/api/account/corp-sharing` | `corp` class (Parts 21, 23) |
| `/api/eve/type-names` | Deleted; `FriendlyList` reads the `ship-types` asset (Parts 04, 24) |
| `engine.heartbeat`, `mapTrackingOptIn.setTracking`, `/map-tracking-snapshot` | Stay readable (tracking selections are metadata) |
| Purge, projection, merge and receipt actions | Stay (readable IDs, metadata) |

### Deadlines and errors

| Class | Deadline | On a miss, the user sees |
| --- | --- | --- |
| `login` | 20 s | Today's sign-in error |
| `map`, optimistic | 30 s | Today's failed-mutation state; the change rolls back |
| `map`, not optimistic | 30 s | Nothing changes until the reply, as today; then the caller's existing handling (silent when swallowed, "Restore failed" for restore) |
| `map`, elimination follow-up | 15 s after the main reply | Nothing, as today's elimination timeout: no toast or flash, and the next follow-up is gated by today's digest |
| `access` (member edits, map creation) | 30 s | Today's route error toast |
| `lookup` (structure search) | 10 s | Today's empty or error state, including the 503 `structure_search_unavailable` problem |
| `session` (`session.touch`, Part 09) | 10 s | Nothing; the session keeps its current expiry and the touch is retried on the next app load or daily tick |
| `keys` (`mapKeys.request`, Part 09) | 20 s | Today's map loading state, then the request is retried; no new copy |
| `backup` (enrolment, activation, removal, restore; Part 10) | 30 s | Part 10's existing failure handling: the one-line passkey failure, today's generic error for a recovery key, removal or restore |
| `corp` (rig and tax save, sharing toggle; Parts 21, 23) | 30 s | Today's route error responses |
| `admin` (owner-only `tokens.reseal`, Part 31) | 30 s | Today's admin error response |

Server jobs (see Server-originated work) have their own deadlines:

| Job | Deadline | On a miss |
| --- | --- | --- |
| Doorbell jobs (purges, collapse, access-change, affiliation, sync, view refresh) | Minutes | Nothing; the job retries |
| Awaited: corp recheck (Part 23) | 10 s, Vercel waits | Vercel serves nothing for that corp, never the old view |
| Awaited: `characterSearch` (Part 08) | 10 s, Vercel waits | Today's empty or error state for the typeahead |
| Awaited: `merge.confirm` (Part 11) | 10 s, Vercel waits | Vercel redirects as today; the next sealed request carries the confirm |
| Awaited: daily token `recheck` (Part 08) | 35 s, Vercel waits | Today's re-check failure handling |
| Conversion `convert:<feature>` (Part 31) | None; runs to completion | Resumes from its Neon cursor after a restart; failures count in `sealed_conversion_progress` |

`submit` schedules `expire` at the deadline with `ctx.scheduler.runAt`, and `complete` schedules a purge 10 minutes later, so no cron is added. A pending follow-up gets its own `expire` at `followUpDeadline`, and the purge waits until it is done or expired. Problem codes map onto today's error states. Optimistic updates stay until the reply or the deadline, not only until `submit` returns (Part 16).

### Latency budgets

| Flow | Today | Added p95 |
| --- | --- | --- |
| EVE login, callback to signed in | Server code exchange | 300 ms (status read, one relayed round trip, reply poll) |
| Map edit, optimistic change to confirmed rows | One Convex mutation | 250 ms |
| Character and structure search | One Vercel route | 200 ms |
| Map open needing `mapKeys.request` (new joiners, older epochs only) | Convex queries only | 250 ms (one relayed round trip) |
| Personal view refresh (Part 19 rule 10), enqueue to view written | Inline ESI calls in `after()` | Absolute: p95 under 3 s for one character's jobs or skills; the enclave gets inbox jobs by Convex push |
| Corp recheck (Part 23), enqueue to rebuilt view | Synchronous ESI fetches, 10 s timeout | No more than today's ESI fetches; hard cap 10 s |

Measure on staging before Phase 1 ships; the personal view budget before Part 19 switches routes.

### Server-originated work

Convex crons and Vercel jobs put rows into a readable `sealedJobs` inbox: `{jobId, kind, subject, readable IDs, dueAt, attempts, dedupeKey, deadline, status, result}`. `result` holds only problem codes and readable IDs. Vercel enqueues through a new `/enqueue-sealed-job` action behind the service secret. Jobs are doorbells: the enclave acts only where its sealed state agrees, for example collapsing a connection only if its sealed lifetime has passed. Location polling schedules itself from heartbeats (Part 17). Purges that need only readable timestamps stay in Convex.

| Job shape | Kinds | How it runs |
| --- | --- | --- |
| Doorbell | Access-change and rotation checks (Parts 12, 13), affiliation drain, decision-record follow-ups such as `abandon`, `revoke-sessions`, `unlink` (Part 08), personal sync and view refresh (Parts 18, 19), corp pulls (Part 23), purges and collapse | Enqueue and forget; retried with `attempts` |
| Awaited | Corp recheck (Part 23), `characterSearch` (Part 08), `merge.confirm` (Part 11), daily token `recheck` (Part 08) | Vercel enqueues, then polls `/sealed-job-result` every 100 ms until a result or the job deadline |
| Long-running | `convert:<feature>` (Part 31), started by an owner admin action | Holds a cursor in Neon, pages with compare-and-swap and resumes after a restart; no deadline |

Every other job only removes access (accepted unsigned, Part 08) or rings a doorbell the enclave checks against its own state; `characterSearch` is the one job that uses a user's token on Vercel's word alone. **Recorded exception to rule 6:** the scoped map character search is a `{userId, search}` awaited job authorized by Vercel's cookie, not a browser-signed request. Reason: its input (a search term) and its output (character IDs, which Vercel then names) are readable metadata, the token never leaves custody, and the route keeps today's flow, including the tokenless exact-name path that never reaches the sealed service. Custody tries the user's scoped characters in order, as today, against its own link record. The worst an operator gains is ESI searches spent on a user's token, returning public results. Part 08 states the same design. Structure search is not covered by this exception: its results are content and stay a browser-signed `lookup` request.

### Enclave write credential

Convex gets a second `customJwt` provider whose issuer is the sealed service, with a signing key created and sealed inside the enclave. The enclave mints 5-minute tokens with subject `sealed-service` and its fingerprint. `requireSealedService(ctx)` checks `identity.issuer` as well as the subject. Every public function that writes sealed rows or reads the pending queue calls it and checks the fencing number. Internal functions may delete expired sealed rows by readable timestamps but never write content. This guards against other users and Vercel, not the Convex operator, who could swap the public key. Neon writes use a separate `sealed_service` role.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Request ID, class, `mapId`, deadline, status, timestamps, size | Yes | No | LGI server (Convex) |
| Request body, operation, account, signature | No | Yes (HPKE) | Browser seals; sealed service opens |
| Reply body and problem code | Status only | Yes (HPKE export key) | Sealed service seals; browser opens |
| Attestation document, channel public key, key ID | Yes | No (signed by AWS) | Sealed service publishes; browser verifies |
| Session key registration | No | Yes (service root key) | Sealed service |
| `sessionKeyId` on the session row | Yes | No | LGI server writes; sealed service reads |
| Applied map `requestId`s | No | Yes (sealed map state) | Sealed service |
| Follow-up reply body | Status only | Yes (second HPKE export key) | Sealed service seals; browser opens |
| `sealedJobs` rows, including awaited results (codes, character IDs from `characterSearch`) | Yes | No | LGI server enqueues; sealed service runs |

## Hard rules

1. [Agreed] Convex stays the relay and store, and everything stays on lgi.tools.
2. [Agreed] The browser verifies the attestation before it sends anything (decision 1), reading it from the readable status row.
3. [Agreed] Users see no new prompts, banners or copy. Failures use today's error states.
4. [Proposed] Requests travel through Convex. The enclave connects outbound only.
5. [Proposed] Every request is sealed to the attested channel key with the Part 09 suite, readable fields bound as AAD and repeated inside.
6. [Proposed] The enclave authenticates each user request by the session key signature against a sealed registration, and requires a live session row with the same `sessionKeyId` and user (cached at most 60 s). Cookies, Convex JWTs and readable bindings never grant anything, except the one recorded exception in rule 10.
7. [Proposed] A retry keeps its `requestId` and is re-sealed only after a channel-key change. Convex sets deadlines from receipt time. No map edit applies twice; other writes carry an expected version.
8. [Proposed] Map requests run in per-map submission order, `rekey` rows holding their place. Rows, applied `requestId` and reply are written in one transaction.
9. [Proposed] Only the enclave's JWT, checked by issuer and subject, can call public functions that write sealed rows or read the queue, with the fencing number. Internal functions may only delete expired sealed rows.
10. [Proposed] Server jobs carry readable IDs only; the enclave re-checks sealed state. Awaited job results hold only codes and readable IDs. The one job that uses a user's token on Vercel's word is `characterSearch`, a recorded exception to rule 6 because its term and results are readable metadata (Part 08).
11. [Proposed] Operations are declared once in `src/platform/sealed-envelope/`; nothing else defines a wire shape.
12. [Proposed] Logs carry request IDs and codes, never bodies.
13. [Proposed] Deadlines: 20 s login, 30 s map, access, backup, corp and admin, 20 s keys, 10 s lookup and session, 15 s for an elimination follow-up after its main reply; awaited jobs 10 s, except 35 s for the daily token re-check; conversion jobs none. Expiry uses `ctx.scheduler.runAt`; done rows are purged after 10 minutes, once any follow-up is done or expired; no new cron.
14. [Proposed] Optimistic updates stay until the reply or the deadline (binds Part 16).
15. [Proposed] The sealed service writes Neon only through its `sealed_service` role.
16. [Proposed] Each route or action carrying map content or using tokens is removed in the release that moves its feature. `/api/maps/search-characters` stays as the entry point for the rule 10 exception.
17. [Proposed] A request carries at most one follow-up reply, used only for the elimination result of a `map` request with the `eliminate` flag; it is written with the elimination's rows in one mutation and sealed under its own export key.
18. [Proposed] Latency budgets include the Part 19 personal view refresh: enqueue to view written, p95 under 3 s.

## Assumptions

| Assumption | How to check |
| --- | --- |
| The Convex client works through the vsock forwarder | Part 05 check 2 |
| Convex push latency from `us-east-1` meets the budgets | Staging measurement |
| Convex accepts a second `customJwt` provider and exposes its issuer | Dev deployment spike |
| Unauthenticated Convex queries work on the login page | Spike with `ConvexClientProvider` |
| Better Auth can set a custom session column at creation | Spike against `internalAdapter.createSession` |
| The Convex client keeps order and resends queued mutations after reconnect | Convex docs plus tests |
| Nitro's `public_key` field can carry the channel key | Part 06 spike |

Tests (Part 32) cover reconnect after sleep, two tabs on one map, a restart with edits in flight, a revoked session, a hidden completed reply, an elimination follow-up that arrives late or expires, and each awaited job missing its deadline.

## What users see

Nothing new. Login and map edits may take slightly longer, within the budgets. During an enclave restart, requests wait, are re-sealed and complete, or show today's error states.

## Questions for the owner

1. **Transport?** Recommended: Convex-relayed. The rewrite saves a little latency but needs an inbound port.
2. **Message format?** Recommended: zod-checked JSON in HPKE with binary AAD. CBOR adds a dependency for no gain.
3. **Deadlines?** Recommended: those above, on today's error states.
4. **Durable dedupe for map edits?** Recommended: keep applied `requestId`s in sealed map state for 7 days. The alternative accepts that an operator who hides a completed reply could make one edit apply twice across a restart.
5. **Enclave write credential?** Recommended: an enclave-signed JWT provider. A shared secret would let Vercel write sealed rows.
6. **Login before a session?** Recommended: through `/api/auth/sealed`, which keeps IP limits.
7. **Attestation source at login?** Recommended: the status row, which meets decision 1 exactly and saves a round trip. The alternative, Part 06's nonce request, sends a request before verification.
8. **Per-minute limits?** Recommended: only the size and pending caps, since today's searches have none. If wanted, give lookups their own bucket above the staging peak and keep `@convex-dev/rate-limiter`, cancelling its planned unmount.
9. **Map character search?** Recommended: keep it as an awaited `characterSearch` service job, a recorded exception to rule 6, because its term and results are readable metadata and the route keeps today's flow. Alternative: a browser-signed `lookup` request, which removes the exception but moves the route's tokenless fallback and name resolution into the browser and the sealed service.
