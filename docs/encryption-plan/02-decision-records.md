# Decision records

Twenty-six decision records fix the rebuild's shape. Most were amended during review, the key directory record was replaced, and three new records settle join policy, post-quantum timing and MLS. "The draft" below means the review panel's first synthesis, before verification.

Each record gives the decision, the rejected alternatives, the reason, and the event that should reopen it. Where a record rests on an owner decision (OD-n), the recommended default binds until the owner changes it. Open questions (OQ-n) are answered by the current code or by the four truth checks in Rebuild plan.

Milestone IDs M0-M9 map to phases P0-P5 as described in Rebuild plan: M0 and M1 are P0, M2a and M2b are P1, M3 is P2, M5 is P3, M6 is P4 and M8 is P5; M4, M7 and M9 are later, on demand. GA means cutover at the end of P5.

### Index

Status compares each record with the panel's first synthesis.

| ID | Title | Status | Detailed spec IDs | Lands in |
| --- | --- | --- | --- | --- |
| DR-C1 | Wrap granularity | Amended | D-KEY-INV, D-KEY-REVOKE, D-GRP-2, D-GRP-3 | M2a-M3 |
| DR-C2 | AEAD and key commitment | Amended | D-SYNC-2, D-SYNC-3, D-LOC-4 | M2a |
| DR-C3 | Sync semantics | Kept | D-SYNC-1 to D-SYNC-11, D-ENGINE | M3 |
| DR-C4 | Standard as an explicit tier | Amended | D-TRUST-2, D-STD-1 to D-STD-8 | M3, M7 |
| DR-C5 | No server ingest in Sealed | Kept | D-TRUST-1 (S8), D-LOC-1 | M3 |
| DR-C6 | Corp bucket grant authority | Amended | D-CORP-1 to D-CORP-10 | M6 |
| DR-C7 | Browser floor and PRF detection | Kept | D-KEY-ENROL, D-KEY-PRF | M2a |
| DR-C8 | Shared ESI rate bucket | Amended | D-LOC-2, D-LOC-3, D-BOT-3 | M3, M4 |
| DR-C9 | ACL and log atomicity | Amended | D-GRP-4, D-GRP-5, D-GRP-6 | M3 |
| DR-C10 | KEM suite and non-extractability | Kept | Stack (crypto row), D-KEY-INV | M2a |
| DR-C11 | Invite semantics | Amended | D-MEM-INV, D-MEM-NOLINK, D-MEM-GUEST | M3, M4 |
| DR-STACK | Stack and repository | Amended | Stack table, D-INT-4 | M2a |
| DR-RELAY | Relay platform | Amended | D-RELAY, D-COST | M0, M3 |
| DR-FRONTEND | Frontend split | Kept | Components table, D-ROUTE | M1-M2a |
| DR-ESI-CUSTODY | ESI token custody | Amended | D-LOC-1, D-LOC-2, D-KT-9 | M3 |
| DR-BACKGROUND | Background work without plaintext | Kept | D-LOC-5, D-LOC-7, D-GRP-8 | M3 |
| DR-NETWORTH | Net worth | Amended | D-STD-4, D-DATA | M5 |
| DR-JOIN | Default join policy | New (OD-1) | D-MEM-ADMIT | M3 |
| DR-KT | Key directory | Replaced | D-KT-1 to D-KT-11 | M2b |
| DR-IDENTITY-PRIVACY | Alt-graph privacy | Amended | D-MEM-BLOCK, D-KEY-LINK, metadata budget | M2b-M3 |
| DR-ESCROW | Escrow custody | Amended | D-STD-2, D-STD-3 | M7 |
| DR-DELETION | Deletion | Amended | D-LIFE-1, D-LIFE-3, D-KT-7, D-STD-2 | M2b-M3 |
| DR-SCOPE | v1 scope cut | Amended | D-PARITY, D-CORP-1, OD-2, OD-4 | All |
| DR-MIGRATION | Migration from the current app | Amended | D-LIFE-6, D-MEM-OWN, OD-14 | M1, M8 |
| DR-PQ | Post-quantum suite | New (split from DR-C10) | Stack (crypto row) | M9 |
| DR-MLS | MLS deferral | New | D-GRP-10 | M9 |

Acronyms below: group epoch secret (GES), character encryption key (CEK), character identity key (CIK), device signing key (DSK), account root secret (ARS), device unlock key (DUK), Durable Object (DO), key directory (KT), signed tree head (STH), compare-and-set (CAS), Proof Key for Code Exchange (PKCE).

### Contradiction rulings (DR-C1 to DR-C11)

The four candidate paths disagreed on eleven points. These are the binding rulings, as amended after review.

#### DR-C1 Wrap granularity

- **Decision:** Each GES is wrapped to the keyring-held CEK of each member character, never to devices. Per-device DSKs are certified in each character's sigchain, and a device reaches the keyring through a server-held ARS wrap to its DUK. Tidy-up revoke is server-enforced and never rotates. Compromise revoke needs an account proof and rotates ARS, CIK, CEK and the vault key, retires passkey wraps and marks every group rotationPending.
- **Rejected:** Per-device wraps (members x devices per rotation, and new devices wait for group activity). A user-level encryption key, which links alts. Per-map pseudonym keys, which need cross-map linkage proofs.
- **Rationale:** Linking a device needs no group activity, so new-device unlock stays at one tap. Fan-out stays at one wrap per character. The tidy-up split stops Safari eviction and private windows from causing rotation storms.
- **Revisit when:** Maps must exceed the 1,024-member cap (two-level keys, M9), or the DR-MLS trigger fires.

#### DR-C2 AEAD and key commitment

- **Decision:** WebCrypto AES-256-GCM with per-message encryption and commitment keys from HKDF. The 32-byte salt is generated inside the primitive, never by callers. A full 32-byte commitment tag is checked in constant time before decrypting, and the sender's DSK signature sits inside the ciphertext. Location frames reuse the primitive in a fixed 256-byte frame.
- **Rejected:** XChaCha20-Poly1305 through @noble/ciphers (keys in JavaScript memory, not committing). A zero nonce under a unique key (fails badly on salt reuse). Truncated commitment ids (collision-weak).
- **Rationale:** Native and non-extractable on every floor engine. Per-message keys remove GCM nonce and volume limits. Tag plus signature close the key-commitment gap of multi-recipient AEAD.
- **Revisit when:** WebCrypto ships a native committing AEAD, or a phase's agent review (or a later optional paid audit) asks for a change.

#### DR-C3 Sync semantics

- **Decision:** One server-sequenced total order per room, deterministic versioned reducers and optimistic rebase, with no CRDT. Reducers dedupe on (character, client op id), and datasets are pinned by commit. Reducer upgrades activate through a signed commit at a future sequence number, supporting versions N and N-1. Vault documents use revision CAS; corp buckets use whole-blob CAS.
- **Rejected:** Yjs or last-writer-wins CRDTs (break static claims, stub absorption, jump idempotency and collapse). Per-device ordering as in secsync (not total). Jazz timestamp ordering (client-manipulable).
- **Rationale:** The mapper's invariants assume one serialisable writer, which a DO provides. Maps are capped at 300 systems and 1,000 connections, so replay is cheap. A lint bans Date, Math.random, Intl and localeCompare in reducers.
- **Revisit when:** The M3 replay corpus cannot reach 100% with documented divergences, or Keyhive reaches an audited beta.

#### DR-C4 Standard as an explicit tier

- **Decision:** The tier is fixed in each group's signed, immutable genesis. Standard adds one per-group escrow keypair, a recipient of that group's epochs only. The Steward may rotate Standard groups and re-wrap a recovered member after a 72 h veto window. Sealed-to-Standard is impossible; Standard-to-Sealed is a guided new genesis that shreds the escrow key. Protocol support lands in M3, the Steward in M7, cancellable (OD-4).
- **Rejected:** Escrowing ARS or a personal vault (leaks into every Sealed group). No Standard tier (against the brief). The draft's unscoped "server never starts a key grant", which contradicted Steward rotation and is now scoped to Sealed.
- **Rationale:** One code path, with operator readability explicit and contained to one group. The draft's "leakage removed by construction" is softened: a character tracked in both tiers exposes its location. Sealed maps count every member active in any Standard map, and may forbid cross-tier tracking.
- **Revisit when:** Corp interviews (OQ-3) show recovery matters more than sealing (pull M7 before GA, +6-8 weeks), or nobody wants it (cancel M7).

#### DR-C5 No server ingest in Sealed

- **Decision:** Sealed has no server ESI ingest. Browsers, Tauri or a corp-run bot make every sensitive ESI call with PKCE tokens sealed per character. No live ESI-scoped bearer credential reaches LGI servers (hard rule S8). The only exceptions are two delegated Standard grants, the server tracker and hosted corp agent, labelled LGI-readable.
- **Rejected:** Server ingest-and-seal (protects data at rest only). Attested enclave ingest (a research track).
- **Rationale:** A server holding refresh tokens can always re-fetch. Browser CORS and PKCE against ESI work today (observed 2026-10-05), so browser custody is the only operator-blind route.
- **Revisit when:** CCP closes CORS or PKCE for single-page apps, moving users to Tauri, the bot or Standard.

#### DR-C6 Corp bucket grant authority

- **Decision:** A Director's client, or a corp agent bot with Director-signed delegation, pulls corp data under a CorpSpace lease. It computes grants locally with the ported grant compiler. Bucket keys are wrapped to access-class keys and class keys to members. Manifests are padded to one corp-wide size and writes are signed. A first key needs a KT-verified, non-reset, attested binding, with affiliation checked at CCP.
- **Rejected:** Server authority (exposes roles, bases and holdings, and lets the server mint grants). An attested enclave authority (too heavy for one operator).
- **Rationale:** Corp location metadata never reaches the operator. The Director roles route returns every member's roles, so nothing is self-reported; it needs esi-corporations.read\_corporation\_membership.v1, which the draft recommendation missed. Rotation is nearly free on the cache window.
- **Revisit when:** Beta corps find grant stalls unacceptable, or M0 shows a different role or scope (OQ-14).

#### DR-C7 Browser floor and PRF detection

- **Decision:** Floor is Chrome and Edge 137+, Firefox 130+, Safari and iOS 18.4+. A boot-time probe tests non-extractable Ed25519 and X25519, AES-GCM and a CryptoKey round trip through IndexedDB. PRF is trusted per credential only after create, get and a test unwrap. Keys are never imported as JWK, because of Safari bugs before 26.
- **Rejected:** Trusting browser-compat data or getClientCapabilities, which contradict each other. A WebAssembly crypto floor, moot once crypto is native.
- **Rationale:** Apple's 18.4 X25519 support is the conservative bound. PRF varies by provider, so only an observed ceremony counts, and PRF is never the only unlocker.
- **Revisit when:** Telemetry shows a meaningful share below the floor, or PRF success rates per authenticator model change.

#### DR-C8 Shared ESI rate bucket

- **Decision:** One LGI Data client id and exactly one poller per character. Web Locks serialise tabs; a 30 s UserHub lease serialises devices, and fresher pollers preempt. Tracking uses about 600 of 1,200 character-location tokens per 15 min. The bot and Standard tracker use separate location, ship and online grants, never the vault token, and hold the lease exclusively.
- **Rejected:** Split client ids to multiply limits (policy hazard). Independent pollers (429s, duplicate jump evidence). Giving the bot the vault token (every scope, rotation races).
- **Rationale:** ESI buckets are keyed by group, application and character. One lease holder also serialises refresh-token rotation.
- **Revisit when:** M0 shows one token family per character and client id (fallback: an "LGI Tracker" client id, OQ-10), or CCP changes bucket keying.

#### DR-C9 ACL and log atomicity

- **Decision:** The access list, membership log, wraps and op log share the room DO. An atomic removal unit runs in one transactionSync with no awaits: ACL change, signed remove commit, delivery cutoff and rotationPending. Rotation is a separate commit, accepted by CAS on epoch under a 30 s lease. Neon keeps only a signed ACL mirror and room index.
- **Rejected:** ACL in Neon with the log elsewhere (a removed member can append in between). A Convex co-located ACL (atomic but costly). The draft's single remove-and-rotate commit, impossible for server-signed revokes because the server holds no group keys.
- **Rationale:** A single-threaded actor closes the race if no await reopens its input gate. The split lets the server always remove (hard rule S3) while only members rotate.
- **Revisit when:** The relay moves to relay-node, where Postgres SERIALIZABLE must pass the same conformance suite.

#### DR-C10 KEM suite and non-extractability

- **Decision:** v1 uses native DHKEM-X25519 HPKE through `hpke` 1.1.7, base and PSK modes only. Device authentication, unlock, cache and signing keys are non-extractable everywhere. Keyring private keys and unwrapped GES exist as raw bytes in the crypto worker only during import. The security page says cross-site scripting can still use unlocked keys as an oracle.
- **Rejected:** X-Wing everywhere through @noble/post-quantum (self-audited, raw seeds in JavaScript on Firefox and Safari). A dual native and noble path (doubles the test matrix). HPKE Auth modes (removed from the republished draft).
- **Rationale:** One true statement on every engine. An X25519 wrap of a 32-byte key is about 80 bytes against about 1,168 for X-Wing, which matters for rotation on phones.
- **Revisit when:** See DR-PQ.

#### DR-C11 Invite semantics

- **Decision:** The invite secret travels in the URL fragment. It derives an invite id, a blob key and an Ed25519 invite signing key (ISK). The Manager+-signed blob carries the genesis hash, Owner fingerprints, map name, role, pre-authorised characters, limits and the ISK public key. It never carries the GES. Joins are signed by the ISK and the joiner's DSK, so members verify but cannot forge them. No-link joins require confirming KT-verified Owners before any data is sent.
- **Rejected:** A bearer fragment carrying the GES (stale on rotation, no approval). ACL-only joins (genesis substitution, leaked map name). The draft's MAC under a key every member held, which let any member forge joins.
- **Rationale:** The fragment anchors genesis and Owners, keeps the name private and proves link possession. The ACL makes a leaked link useless to outsiders. Invites die when the inviter is demoted.
- **Revisit when:** Beta corps report join latency that policy tuning cannot fix.

### Platform

#### DR-STACK Stack and repository

- **Decision:** The existing public lgi-tools repo becomes a pnpm 10.34 workspace on the development branch, with pure engine packages. The core is Vite 8, React 19.2.8 and TanStack Router; the shell is Next.js 16.3.4. The edge is Hono 4 on Workers, Neon through Hyperdrive with drizzle-orm 0.45.2, and @simplewebauthn/server 14.x. Better Auth's server-side code exchange, Upstash and sonner are dropped; Convex stays as the v1 relay for sealed frames. Fallow 3.22.0 boundaries apply from the first commit.
- **Rejected:** Next.js static export for the core (inline scripts complicate hash CSP and WEBCAT). Keeping Better Auth's server-side exchange or Upstash. A private repo (attestation needs GitHub Enterprise Cloud).
- **Rationale:** Static output with no inline scripts and hash-pinned assets suits CSP, WEBCAT and self-hosting. Most UI ports by swapping next/link and next/navigation. The current repo's Vite pin is a transitive override, not prior experience.
- **Revisit when:** Stable React lacks ViewTransition parity for the mapper's motion, or SimpleWebAuthn 14 fails the M2a Workers check.

#### DR-RELAY Relay platform

- **Decision:** In v1, Convex is the relay for sealed frames behind the transport interface. The planned migration, if Convex cost or fan-out requires it, is Cloudflare Workers with SQLite DOs (MapRoom, UserHub, CorpSpace, KeyDirectory), hibernatable WebSockets and R2. DOs never use timers, accept() or outgoing sockets. The protocol is platform-neutral with a conformance suite. `eu` is the one hard residency option; other regions are location hints fixed at creation.
- **Rejected:** Convex as the relay at 10k monthly active users ($230-1,050/month, billed per call); it stays the v1 relay until the bill or fan-out says otherwise. Fly Node plus Postgres ($55-115/month, more operations). jazz-run (abandoned, unauthenticated).
- **Rationale:** Single-threaded atomicity, hibernation and the lowest cost: an estimated $10-50/month at 1k and $32-110 at 10k users. The DO path can later adopt unlinkable tokens and carry cover frames almost free. The draft's "US jurisdiction" claim was wrong.
- **Revisit when:** DO pricing or semantics change, M0 S4 misses the location load targets, or corps demand a full self-host stack.

#### DR-FRONTEND Frontend split

- **Decision:** A keyless Next.js shell at lgi.tools serves public pages from public datasets, with no Neon, auth or keys. The static crypto core lives at app.lgi.tools, also the WebAuthn relying-party id. The shell never embeds the core, invites land on the core, and private ids stay in URL fragments.
- **Rejected:** One Next.js app (server rendering and third-party scripts next to keys). An iframe embedding (unnecessary).
- **Rationale:** Less trusted code, no other subdomain can call PRF, and the core is WEBCAT-ready.
- **Revisit when:** Self-host needs Related Origin Requests, or Web Application Integrity, Consistency and Transparency (WAICT) ships.

### Custody and background work

#### DR-ESI-CUSTODY ESI token custody

- **Decision:** One browser PKCE Data grant per character per user. The refresh token is sealed in that character's always-Sealed vault and synced through UserHub with version CAS and a lease. All scopes are requested at once with consent, as today; the only write scope is waypoint, and the Identity app has none. This moves from M5 into M3, because the alpha needs tracking.
- **Rejected:** Per-device grants (N consents, tangled token families). Server custody (not operator-blind). Tokens in a Standard-capable personal vault (leaks).
- **Rationale:** One consent per character, operator-blind custody and serialised rotation. Per-character isolation makes unlink and transfer a clean crypto-shred.
- **Revisit when:** M0 S2 shows refresh rotation with no grace window, or limits on public-client refresh (OQ-1).

#### DR-BACKGROUND Background work without plaintext

- **Decision:** Sealed groups use lazy evaluation and client intents for sweeps, compaction, rotation, corp pulls and net worth. Servers run only metadata TTLs and public pipelines. Location batches flush on frame arrival, never on DO alarms. Tracking stops when no client is open, and the UI says so.
- **Rejected:** Server jobs over plaintext (break the goal). An attested enclave (research track). Per-tick DO alarms, which defeat hibernation (an estimated extra $200/month at 10k users).
- **Rationale:** Honest and cheap. A map nobody opens needs no collapse, because expiry is evaluated at render time.
- **Revisit when:** Users demand alerts and tracking with nobody online at scale, or the M0 S3 hidden-tab polling spike fails.

#### DR-NETWORTH Net worth

- **Decision:** On open, the client values holdings against the public daily price book. It appends to one Padmé-padded sealed series per pilot. Missed days are backfilled from price history and last-known holdings, marked as estimates. Exact nightly values need the user's own always-on device.
- **Rejected:** Gaps only. A server cron over plaintext. An enclave valuation. The draft's Standard nightly revaluation, which would escrow personal data against hard rule S2.
- **Rationale:** Gap-free charts with honest labels and no server plaintext. A per-pilot series makes unlink shredding trivial.
- **Revisit when:** Users judge estimate quality inadequate.

### Membership and trust

#### DR-JOIN Default join policy

- **Decision:** New maps default to strict human approval (OD-1). A Manager+ approves each key after seeing the safety number, KT status, CCP affiliation check, attestation age and any in-game badge. Bulk approve and bot pre-verification handle onboarding. Auto-admit is an opt-in genesis policy and never admits a reset.
- **Rejected:** Auto-admit by default (faster mid-operation joins, but accepts first-login races). Approval without bulk tools (slow corp onboarding).
- **Rationale:** The brief requires admin approval of new member keys. The key directory gives detection, not prevention, so a human check is the only preventive control for first bindings.
- **Revisit when:** Interviews with 5 or more corps before M4 ends (OQ-3) reject the strict default.

#### DR-KT Key directory

- **Decision:** The KeyDirectory DO runs a log-backed sparse Merkle map whose values chain each character's sigchain heads. STHs publish every 2 min and reach Sigsum every 10 min, with signed inclusion promises in between. Retired CCP keys count only from a witnessed JWKS archive, leaves hold salted commitments, lookups are room-scoped, and characters re-attest silently every 14 days.
- **Rejected:** LGI-signed bindings with trust on first use only (silent substitution for dormant characters). A public log of user-level keys (publishes the alt graph). The draft's version, where an LGI-served archive of retired CCP keys could forge first bindings.
- **Rationale:** LGI cannot bind a key to a character that never logged in. Substitution for an active character shows as a reset or red alarm. The published wording is "trust on first login plus transparency detection".
- **Revisit when:** A VRF-indexed private map or IETF key transparency libraries mature, or Sigsum limits break the cadence (OQ-6). Details are in Identity, keys and devices.

#### DR-IDENTITY-PRIVACY Alt-graph privacy

- **Decision:** Peers see only per-character identities, and the KT holds no user-level key. An account block only filters future joins and never emits linking commits. Device certificates are created lazily, non-urgent KT events are jittered by 0-6 h, and compromise rotations are staggered by 0-20 min per character.
- **Rejected:** User-level identity keys (expose alt lists). The draft's per-account block, whose server-side removals showed peers which members shared an account.
- **Rationale:** Alt linkage is core EVE opsec. The disclosure page states that LGI's control plane knows which characters share an account, and that timing correlation is reduced, not eliminated.
- **Revisit when:** Unlinkable relay tokens such as Privacy Pass are built (M9).

### Tiers, lifecycle and scope

#### DR-ESCROW Escrow custody

- **Decision:** Each Standard group has its own X25519 escrow keypair. The private half is wrapped under that month's AWS KMS key and stored in a Neon project with no history. Live keys are re-wrapped monthly. Each month key is deleted after its month, a 30-day backup window and the 7-day KMS wait. Every escrow open writes a CloudTrail record, a Sigsum receipt and a group audit entry.
- **Rejected:** One global escrow key (shredding meaningless). The draft's long-lived KMS key, under which backed-up wraps stay decryptable. Enclave escrow. No escrow.
- **Rationale:** Time-bucketed keys make deletion real: "Standard escrow is unrecoverable within about 70 days of group deletion." Recovery is aligned: a Manager+ re-approves at once, or the Steward re-wraps after 72 h unless an Owner or Manager vetoes.
- **Revisit when:** Standard is cancelled (OD-4), or an attested custody option matures.

#### DR-DELETION Deletion

- **Decision:** Crypto-shred everywhere through idempotent Cloudflare Workflows with a reconciliation sweep. Account deletion first revokes CCP grants from the client where allowed (OQ-1) and signals passkeys as unknown. The server then deletes wraps, keyring, vaults and rows, writes KT tombstones and staggers system revokes over 0-24 h. Room purges delete wraps first, then DO storage, R2 objects and the registry row.
- **Rejected:** Row deletion without key destruction, which leaves backups as good as plaintext.
- **Rationale:** Every store retains deleted data for a while: DO recovery 30 days; Neon 1 day of history on the control project and 7 days of project undelete. Only key destruction makes deletion final. Authored ops in shared maps stay with remaining members, as the UI states.
- **Revisit when:** Cloudflare documents recovery after deleteAll or offers an opt-out (OQ-7).

#### DR-SCOPE v1 scope cut

- **Decision:** v1 (cutover) includes the Sealed mapper, personal vault, industry overlays, corp spaces (OD-2), browser ESI and the self-host static bundle. Later, on demand: the bot, guest links, notes, the five importers, routes, kill feed and the Standard tier (M7). Also deferred: Access Lists, relay-node, Tauri, alliance keys, production WEBCAT, X-Wing, Privacy Pass and MLS. Wormhole observations are dropped; saved plans are kept as personal vault documents.
- **Rejected:** Path A's full scope (14 deployables). An earlier GA without corp, keeping the old corp path as "legacy, LGI-readable" until a dated sunset.
- **Rationale:** Operator burnout kills this product category, so value ships early. Corp spaces gate GA because only then can the old app's plaintext keys be destroyed.
- **Revisit when:** Two or more beta corps ask for Access Lists, or corps request a deferred feature with evidence.

#### DR-MIGRATION Migration from the current app

- **Decision:** M1 hardens the current app: no plaintext Convex tokens, revocable short tokens, key ids, an export route, R2 datasets and a sites export. The core imports exports client-side, mapping owner, admin, editor and viewer to Owner, Manager, Member and Viewer. The old app is frozen now (OD-14) and serves corp and industry until GA. It then stays read-only for 30 days before revoking CCP grants and destroying its tables and keys.
- **Rejected:** Server-side bulk decryption (violates the model). A fresh start with no import. A longer overlap.
- **Rationale:** Users get safer immediately and no plaintext touches the new servers. Migration invites carry a "no reset after issue" condition, so mid-migration key substitution is refused.
- **Revisit when:** The old app's maintenance load blocks the rebuild, or it cannot stay frozen until cutover (around week 10-14).

### Cryptographic roadmap

#### DR-PQ Post-quantum suite

- **Decision:** v1 is classical. Suite 2 is X-Wing (ML-KEM-768 plus X25519, HPKE KEM id 0x647a) through @panva/hpke-noble 1.1.7. The suite id is already bound into wrap and op-frame inputs, so a group switches at its next rotation, at most 30 days later. This record covers key encapsulation only; signatures stay Ed25519.
- **Rejected:** Pure-JavaScript X-Wing now (unaudited library, raw keys on Firefox and Safari, wraps about 15 times larger). Native X-Wing on Chrome only (a security claim split by browser).
- **Rationale:** Harvest-now-decrypt-later matters little for map intel that goes stale in days. Home-system identity, holdings and the server-held ARS wraps last much longer, which is why migrating the ARS wraps first is an open owner question. Only [Chrome 155](https://raw.githubusercontent.com/chromium/chromium/155.0.8059.36/third_party/blink/renderer/platform/runtime_enabled_features.json5) ships native X-Wing by default; Firefox has ML-KEM in Nightly only and Safari 27 has none. X-Wing is still an [Internet-Draft](https://raw.githubusercontent.com/dconnolly/draft-connolly-cfrg-xwing-kem/main/draft-connolly-cfrg-xwing-kem.md) dated 2026-09-23.
- **Revisit when:** A second engine ships native X-Wing, the RFC is published, @noble/post-quantum is independently audited, or quantum timelines shorten.

#### DR-MLS MLS deferral

- **Decision:** v1 does not use Messaging Layer Security (MLS, RFC 9420). Groups use LGI's epoch scheme: one HPKE wrap per member character, signed commits with confirm tags, and ordering by the room DO.
- **Rejected:**
  - ts-mls 1.6.4: unaudited, 2.0 still a release candidate, and an August 2026 [high-severity fix](https://github.com/LukaJCB/ts-mls/security/advisories/GHSA-gwp3-968w-m7gv) where removing a member did not revoke access.
  - OpenMLS 0.9.0 in self-built WebAssembly: no published browser package, and untested WebAssembly targets.
  - Wire core-crypto: GPL-3.0 and about 51 MB, unfit for an MIT project.
  - Keyhive/BeeKEM: pre-alpha.
- **Rationale:** Under the 1,024-member cap, linear wrapping is cheap: an estimated 16-30 KB of signed wraps to rotate a 200-member map. MLS gives new members no history, so snapshots and history would still need a second layer. Its one-commit-per-epoch rule is what the DO already enforces, so a later move keeps the same shape.
- **Revisit when:** An MLS library is audited and stable, alliance maps must exceed 1,024 members (M9), or post-quantum MLS suites get code points.
