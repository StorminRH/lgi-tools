# Part 07: Reaching the sealed service: transport and request authentication

**Status:** Draft for owner review

## In one paragraph

This part decides how browsers, Vercel and Convex send work to the sealed service and get answers back. The default is to relay everything through Convex. A browser writes a sealed request row, the enclave picks it up over a connection it opens itself, and it writes a reply row. AWS needs no inbound port, and no new origin appears. Each request is encrypted to a key the browser found in a verified attestation. It is signed by the browser session key registered at EVE login, so the enclave never relies on Vercel's cookie or Convex's JWT. The part also sets replay protection, idempotency, per-map ordering, rate limits, deadlines, how crons enqueue work, and the credential that lets only the enclave write sealed Convex rows.

## How it works today

There is no sealed service. Three channels exist, and none of them signs requests or encrypts payloads beyond TLS.

- **Browser to Convex.** A WebSocket to the Convex deployment, allowed by the CSP. Better Auth's `jwt` plugin issues an ES256 token (audience `convex`, 7 days, matching the session), which Convex checks with a `customJwt` provider. Map functions call `requireMapAccess`, which takes the user from `identity.subject` and checks the projected `mapAccess` claim. Map edits are public Convex mutations with optimistic updates (11 call sites). They carry no idempotency key.
- **Vercel and Convex, both ways.** `convex/http.ts` exposes 16 HTTP actions (jumps, signature elimination, purges, access projection, tracking, merges), guarded by `authorizedAction` with `Bearer CONVEX_SERVICE_SECRET` and a constant-time compare. Convex calls back into Vercel with the same secret through `serviceFetch`, for example to lease access tokens from `/api/internal/eve-token`.
- **Browser to Vercel.** Typed endpoint contracts with RFC 9457 problem codes. Routes like the `/api/maps/jump` doorbell check the session. Upstash sliding-window limits guard sensitive routes (EVE sign-in and link: 10 per minute). Convex's rate-limiter component is mounted but unused.
- **Scheduling.** Vercel crons check `CRON_SECRET`. Convex runs four interval crons: three daily purges and the hourly collapse.

Files:

- `convex/http.ts`, `convex/lib/httpAuth.ts`, `convex/lib/bearerAuth.ts`, `convex/httpEngine.ts`, `convex/auth.config.ts`, `convex/crons.ts`, `convex/convex.config.ts`, `convex/lib/mapAccess.ts`, `convex/lib/characterSync.ts`
- `src/platform/auth/service-client.ts`, `src/platform/auth/auth.ts`, `src/platform/auth/auth-client.ts`, `src/platform/auth/components/ConvexClientProvider.tsx`
- `src/transport/endpoint.ts`, `src/transport/api-client.ts`, `src/transport/cron.ts`, `src/lib/convex-service-door.ts`, `src/lib/rate-limit.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/maps/jump/route.ts`, `src/mapper/chain/optimistic-authoring.ts`, `src/proxy.ts`

## What changes

Nothing visible changes for users. Pages, flows and error states stay as they are. Behind the scenes:

- Convex gains a request table, an enclave-only write credential and a few functions.
- Browsers gain a channel client that seals and signs requests.
- Vercel gains one pass-through route for requests sent before a session exists.

This part drops the following from the older docs: the Durable Objects relay and its migration plan, the `relay.` and `api.` origins, device-signed `POST /session` with 15-minute API tokens and 5-minute relay capabilities, MapRoom sequencing and head-hash chains, padded op frames, location frame batching and the platform-neutral relay conformance suite.

## Design

### Transport options

| | Convex-relayed (default) | HTTPS endpoint behind a Vercel rewrite |
| --- | --- | --- |
| Path | Browser → Convex mutation → enclave subscription → reply row | Browser → `lgi.tools/sealed/*` → Vercel rewrite → public AWS endpoint |
| AWS exposure | None inbound; the enclave dials out | Public port, certificate, DDoS exposure |
| Payload privacy | Application-layer encryption needed | Still needed: the rewrite ends TLS at Vercel |
| Fit with map edits | The reply and the sealed rows land in one Convex transaction, which browsers already watch | Browser still waits on Convex for the rows |
| Enclave restart | Requests wait in Convex until their deadline | Requests fail; browsers retry |
| Latency | One extra push hop (estimate 30 to 80 ms) | Slightly lower |

Recommendation: Convex-relayed.

### Convex surface

| Item | Kind | Caller | Does |
| --- | --- | --- | --- |
| `sealedRequests` | Table | | Envelope fields below, `userId` from the JWT (null before login), `status` (pending, claimed, done, expired, rejected), reply ciphertext, `completedAt` |
| `sealed.submit` | Public mutation | Browser (JWT) | Checks size, class and rate limits; inserts, idempotent on `requestId` |
| `sealed.reply` | Public query | Browser (JWT) | Returns status and reply for the caller's own `requestId` |
| `/sealed-submit`, `/sealed-reply` | HTTP actions | Vercel (service secret) | The same for requests sent before a session exists |
| `sealed.pending`, `sealed.claim`, `sealed.complete` | Query, mutations | Enclave only | Pull work in order, claim it, write results |

### Channel keys and envelope

1. At boot the enclave creates a fresh **channel key** (X25519) and puts its public half in the attestation document's `public_key` field (Part 06). It publishes the document, key ID and boot time on its readable status row (the Part 05 lease row).
2. At EVE login the browser fetches the attestation with a fresh nonce through an `attest` request, which carries only the nonce. It verifies the document before sending anything else (decision 1). It re-attests whenever the key ID changes, for example after a restart, and resubmits any pending requests. No UI is involved.
3. Every request is sealed with HPKE (RFC 9180, base mode, X25519, HKDF-SHA256, AES-256-GCM) to the channel key. The reply is encrypted under a key exported from the same HPKE context, so the browser needs no second key. Final algorithm choices sit in Part 09.

| Envelope part | Readable in Convex | Inside the ciphertext |
| --- | --- | --- |
| `v` (format version), `requestId`, `channelKeyId`, `class`, `mapId` (map classes only), `deadline` | Yes, bound as AAD | Repeated and checked against the outer copy |
| `sessionKeyId`, `accountId`, `clientSeq`, `issuedAt` | No | Yes |
| Operation name and body (JSON, checked with a shared zod schema) | No | Yes |
| Signature (ECDSA P-256 by the browser session key) over AAD and body | No | Yes |
| Reply: outcome, problem code, data | Only `status` | Yes |

Operations are declared like today's endpoint contracts: a `defineSealedOperation` helper in `sealed-service/shared/` with zod request and response schemas and closed problem codes, shared by browser, enclave and tests.

### Request authentication

- **Registration.** At login the browser creates a non-extractable ECDSA P-256 signing key and a non-extractable key-agreement key (Part 09). Their public halves go to the enclave inside the login request. The enclave records `{sessionKeyId, accountId, public keys, expiresAt = session expiry}` as a record sealed under the service root key, stored in Neon. A readable binding would let an operator attach their own key to a victim's account.
- **Every request.** The enclave decrypts, opens the registration record, checks the signature, checks expiry, then checks the role for the operation from its own verified inputs (Part 12). The Convex JWT on `submit` only filters out strangers and keeps rate limits fair. The enclave never trusts it, because Vercel issues it.
- **Revocation.** Sign-out, session revoke and account deletion delete the record; the enclave refuses unknown keys.
- **Before a session exists.** EVE login and `attest` go through a Vercel route, `/api/auth/sealed`, which applies today's Upstash IP limits and forwards ciphertext to a Convex HTTP action. Vercel sees only ciphertext, plus the identity assertion Part 08 hands it.

### Replay, idempotency and ordering

| Concern | Rule |
| --- | --- |
| Idempotency | `submit` is idempotent on `requestId`. A retry resends the same ciphertext. The enclave returns the stored reply for a `requestId` it has already completed and never applies it twice |
| Freshness | `issuedAt` must fall within 2 minutes of enclave time. The login reply gives the browser its offset from enclave time, so wrong device clocks still work |
| Replay | The enclave keeps a seen set per session key for the freshness window, in memory. After a restart it also skips requests that Convex marks done |
| Per-map order | The enclave runs each map's requests one at a time in Convex submission order (Part 05 queue). Within one browser and map, `clientSeq` must rise. If a gap appears, the enclave holds later requests until the gap's deadline, then rejects the gap with a retryable code |
| Atomic completion | For map classes, one enclave mutation writes the sealed rows, bumps the map version and stores the reply |

Accepted limit: an operator who controls Convex and restarts the enclave could make it apply one request issued in the previous 2 minutes a second time. An operator can always drop or delay requests. That is denial, not disclosure.

### Rate limits and abuse controls

| Layer | Control |
| --- | --- |
| Vercel `/api/auth/sealed` | Upstash, 10 per minute per IP, like today's sign-in limit |
| Convex `submit` | The mounted `@convex-dev/rate-limiter`, per user: 120 map requests and 30 other requests per minute; at most 50 pending; 64 KiB per request |
| Enclave | The same limits per account from its own counters; drops anything that fails decryption |

### Deadlines and errors

| Class | Deadline | On a miss, the user sees |
| --- | --- | --- |
| `attest`, `login` | 20 s | Today's sign-in error |
| `map` (edits) | 30 s | Today's failed-mutation state; the optimistic change rolls back |
| `access` (access-list edits) | 30 s | Today's route error toast |
| `lookup` (character and structure search) | 10 s | Today's empty or error state |
| Server jobs | Per kind, minutes | Nothing; the job retries |

`submit` schedules an `expire` function at the deadline with `ctx.scheduler.runAt`, so no new cron is needed. Done rows are purged 10 minutes after completion. Problem codes map onto today's error states, and no new copy is added. Optimistic updates must stay on screen until the reply arrives, not only until `submit` returns (Part 16).

### Latency budgets

| Flow | Today | Added budget, p95 |
| --- | --- | --- |
| EVE login, callback to signed in | Server code exchange | 300 ms (attestation check, relay hops) |
| Map edit, optimistic change to confirmed rows | One Convex mutation | 250 ms |
| Access-list character search | One Vercel route | 200 ms |

Measure on staging before Phase 1 ships.

### Server-originated work

Convex crons and Vercel jobs put rows into one readable `sealedJobs` inbox: `{jobId, kind, subject (mapId or ownerId), readable IDs, dueAt, attempts, dedupeKey}`. Convex crons insert directly. Vercel uses a new `/enqueue-sealed-job` HTTP action behind the service secret. Jobs are doorbells, not commands: the enclave acts only where its own sealed state agrees, for example collapsing a connection only if its sealed lifetime has passed. Location polling schedules itself from readable heartbeats (Part 17). Purges that only need readable timestamps stay in Convex.

### Enclave write credential

Convex gets a second `customJwt` provider whose issuer is the sealed service. Its signing key is created inside the enclave and kept sealed under the service root key. The enclave mints 5-minute tokens with subject `sealed-service` and its fingerprint, and sets them on its Convex client. Every function that writes sealed rows, claims requests or reads the pending queue calls `requireSealedService(ctx)` and checks the fencing number (Part 05). Members' tokens and the existing service secret cannot write sealed rows. This guards against other users and Vercel, not against the operator who runs Convex, who could swap the public key in Convex's environment. Neon writes use a separate `sealed_service` role.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Request ID, class, `mapId`, deadline, status, timestamps, size | Yes | No | LGI server (Convex) |
| Request body, operation name, account, signature | No | Yes (HPKE to the channel key) | Browser seals; sealed service opens |
| Reply body and problem code | Status only | Yes (HPKE export key) | Sealed service seals; browser opens |
| Attestation document, channel public key, key ID | Yes | No (signed by AWS) | Sealed service publishes; browser verifies |
| Session key registration | No | Yes (service root key) | Sealed service |
| `sealedJobs` rows | Yes (readable IDs only) | No | LGI server enqueues; sealed service runs |

## Hard rules

1. [Agreed] Convex stays the relay and store, and everything stays on lgi.tools with no new subdomain.
2. [Agreed] The browser verifies the enclave's attestation before it sends anything sensitive.
3. [Agreed] Users see no new prompts, banners or copy. Failures use today's error states.
4. [Proposed] Requests travel through Convex. The enclave opens connections outbound only and exposes no inbound port.
5. [Proposed] Every request is HPKE-sealed to the attested channel key, with its readable fields bound as AAD and repeated inside.
6. [Proposed] The enclave authenticates every user request by the browser session key signature against a sealed registration record. It never trusts a cookie, a Convex JWT or a readable binding.
7. [Proposed] Every request has a `requestId`, an `issuedAt` within 2 minutes and a deadline. Retries reuse the `requestId`, and no request is applied twice.
8. [Proposed] Map requests run in per-map order. `clientSeq` rises per browser and map. The sealed rows and the reply are written in one transaction.
9. [Proposed] Only the enclave's own JWT can write sealed rows, claim requests or read the pending queue. Writes carry the fencing number.
10. [Proposed] Server-originated jobs carry readable IDs only and act as doorbells. The enclave re-checks against sealed state.
11. [Proposed] Operations are declared once in `sealed-service/shared/` with zod schemas and closed problem codes, and nothing else defines a wire shape.
12. [Proposed] Logs on every hop carry request IDs and codes, never bodies.

## Assumptions

| Assumption | How to check |
| --- | --- |
| The Convex Node client's WebSocket works through the vsock forwarder | Part 05 check 2 |
| Convex push latency from `us-east-1` meets the budgets | Staging measurement before Phase 1 |
| Convex accepts a second `customJwt` provider beside Better Auth's | Spike against a dev deployment |
| WebCrypto supports non-extractable X25519 and ECDSA P-256 in the browsers our 18 users use | Crypto vectors per engine (Part 32); `@noble/curves` fallback for X25519 |
| The Convex client keeps one client's mutations in order across reconnects | Convex docs plus a reconnect test |
| Request volume fits the current Convex plan | Staging usage dashboard |
| Nitro attestation's `public_key` field can carry the channel key | Part 06 spike |

## What users see

Nothing new. Login and map edits may take slightly longer, within the budgets above. During an enclave restart, requests wait and then complete, or show today's error states.

## Questions for the owner

1. **Transport?** Recommended: Convex-relayed. The HTTPS rewrite saves a little latency but needs an inbound port and its own abuse handling.
2. **Message format?** Recommended: JSON checked by shared zod schemas inside an HPKE envelope with binary AAD. CBOR adds a dependency for no gain at this scale.
3. **Deadlines and errors?** Recommended: the deadlines above, mapped onto today's error states with no new copy.
4. **Replay after a restart?** Recommended: accept the one-repeat window. Persisting a sealed seen set adds rollback questions for little value.
5. **Enclave write credential?** Recommended: an enclave-signed JWT provider in Convex. A shared secret would let Vercel write sealed rows too.
6. **Login before a session exists?** Recommended: through `/api/auth/sealed` on Vercel, which keeps IP rate limits. An unauthenticated Convex mutation cannot see client IPs.
