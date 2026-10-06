# LGI.tools Encryption-First Rebuild — Design & Spec

Oct 5, 2026 · @Ryan

## Summary and goals

LGI.tools will be rebuilt inside the existing lgi-tools repository (a pnpm workspace on the development branch) so that its operators cannot read users' maps, locations, assets or corp data. Code from the current app is carried over where it helps and rewritten where it does not. The recommendation, Path A-lean, keeps every key and every EVE token in the user's browser, while a blind relay only orders and stores ciphertext: Convex in v1, behind a transport interface, with Durable Objects as the planned migration if Convex cost or fan-out requires it. The owner, directing Claude Code agents, reaches a sealed mapper alpha around week 6 and cutover around week 10-14 (estimates; phases P0-P5 in Rebuild plan).

**The privacy promise, in the words users will see:** your maps and holdings are encrypted with keys that only you and the people you share with hold. LGI.tools cannot read them, sell them or hand them over. For sealed maps, LGI.tools cannot recover them either.

### Goals

- **Operators can't read stored data.** That covers wormhole maps, signatures, character location, assets, structures and corp holdings.
- **Security on par with self-hosting a mapper**, offered as a hosted service.
- **Low friction.** Returning users unlock with one tap or none. Privacy browsers and incognito windows work.
- **Standard and sealed maps share one code path.** The only difference is whether LGI.tools holds a recovery copy of the map key.
- **Joining a map takes an invite link and a place on the map's access list.**
- **Feature parity with today's app where possible.** Anything sealed mode gives up is listed explicitly.
- **Corps that want full control can host the web client themselves** and point it at the LGI.tools backend.

### Non-goals

- **Hiding all metadata.** Membership, timing and data volume stay visible to the server and are minimized, not eliminated.
- **Stopping a member who leaks what they can already see.** Spies are handled by removing them and rotating keys, as with a self-hosted map.
- **Hiding data from CCP.** ESI is the source of the data.
- **Protecting a user whose own device is compromised.**

### How to read this doc

This tab is the design. Four more tabs back it up: Decision records (DR-… IDs), Reference tables, Detailed spec (D-… IDs, the implementation-level rules), and Sources. Owner decisions (OD-…) and the remaining truth checks are listed near the end of this tab. Milestone IDs M0-M9 in this and the other tabs map to phases P0-P5 as described in Rebuild plan: M0 and M1 are P0, M2a and M2b are P1, M3 is P2, M5 is P3, M6 is P4 and M8 is P5; M4, M7 and M9 are later, on demand. GA means cutover at the end of P5.

## Threat model

The design protects stored data against LGI.tools operators and anyone who breaches the backend. It does not fully protect against a malicious code deploy, which is narrowed by code-integrity measures and the self-hosted client option. It also does not protect against members who leak what they can see, compromised devices, or CCP.

### Adversaries

| Adversary | What they can do | Protected? | How |
| --- | --- | --- | --- |
| Database or backup thief (Neon, Durable Objects, R2, a leaked backup) | Read every stored row | Yes | Only ciphertext and metadata are stored; keys never live on the server |
| Curious or bribed admin with database and env access | Read the database, env vars and logs | Yes for Sealed groups and all personal data; no for Standard groups | Standard groups escrow their epoch keys with LGI by design; nothing else is escrowed |
| Operator deploying modified server code | Log what passes through the servers | Yes for Sealed content | In the Sealed tier the servers never hold EVE tokens, keys or plaintext, so there is nothing to log. Opt-in Standard services are LGI-readable by design |
| Operator shipping modified client JavaScript | Make the browser leak keys or plaintext | Detected for everyone; prevented for self-hosters and WEBCAT users | Isolated static origin, reproducible logged releases, in-app release check, WEBCAT, self-host bundle (see Security engineering) |
| Server lying about identity or membership | Slip its own key in as a member, or swap a member's key | Yes, or detectably | The server never starts a key grant; a member signs every addition. Strict approval with fingerprints is the default, and the key directory makes substitution visible |
| Spy inside a corp or map | Read everything they have access to | No (same as self-hosting) | Removal rotates the key at once, so they lose access to anything new; audit and 30-day revert undo vandalism |
| Removed or suspended member | Keep their local copy, try to read new data | Yes for new data | The epoch key rotates immediately on removal or affiliation loss |
| Character sold to another player | Buyer inherits the seller's access | Yes, within 21 days | Silent re-attestation every 14 days detects the owner change and suspends the character |
| Someone who sees an invite link (in Discord or browser history) | Hold the invite secret | Yes | Invites carry no group key; the server also requires the access list, and a member must admit the joiner |
| Network attacker | Intercept traffic | Yes | TLS plus end-to-end encryption |
| Legal demand | Compel LGI.tools to hand over data | Yes for content | Only ciphertext and metadata exist to hand over |
| Compromised device or malicious browser extension | Read keys and plaintext on the device | No | Out of scope; high-security mode limits zero-tap unlock for key holders |
| CCP | Holds the source data | Out of scope | ESI is the source of truth |

### What the server still sees

- **Identity links.** Which account owns which characters, needed for ESI and access checks.
- **Access lists.** Which characters, corps and alliances can open which map. This reveals that a group uses LGI.tools and has a map, but nothing about its contents.
- **Activity metadata.** When members are online, how often they edit, roughly how much data a map holds, and IP addresses.
- **No ESI data in the Sealed tier**. Browsers call ESI directly and seal the results, so game data never passes through LGI. Only the opt-in Standard tracker and hosted corp agent fetch on LGI's servers, and both are labelled.

All of this is minimized where practical and listed in the public threat model, so users know exactly what remains visible.

## Current system and reuse map

About a third of today's code carries over nearly unchanged:

- the pure mapper domain logic, layout kernel and chain UI
- the industry engines
- the design system
- the public-data pipeline

The data layer, token custody and sync orchestration are rewritten, along with every server-side sweep or lookup that touches private data. Line counts below are approximate, from a read of the current repo on 2026-10-05.

| Area | Port as-is | Port with changes | Rewrite | Drop |
| --- | --- | --- | --- | --- |
| Mapper | Layout kernel, reconciler, chain canvas, fog and motion (\~9k lines); scanner paste parser | Connection and door model (\~1k lines, pure); scan apply, elimination, jump authoring, static claims and collapse (\~8k lines of Convex mutations become client reducers); access-list UI | Location polling, lifetime-expiry cron, purge sweeps, optimistic authoring layer, map notes | Cross-map wormhole telemetry table, Convex test fixtures |
| Industry | Build engine, pricing and fees, structure and rig bonus engine | Planner UI, production profiles, custom structures, jobs, skills, character sheet, owned blueprints (as encrypted per-user documents) | Fit parsing and save-time validation move into the browser | Saved plans (no UI uses them) |
| Assets and corp | Corp roles mirror | Asset sync and holding index (in the browser), corp visibility rules (become key buckets), corp structures and rigs, home board | Nightly net-worth cron, corp context pass | Seeding market prices from users' holdings |
| Identity | Session helpers, scope list | Better Auth config, EVE SSO client, linked characters, owner-hash proof, admin roles, map access lists | Token encryption, token vending, account merge and character transfer | Internal token-vending route, Convex location token leases |
| ESI | Authed read helpers, owner-sync engine, response parsers | ESI gateway (runs in browser and server), dataset registry | Sync orchestration, snapshot encryption | Global per-path rate-limit blocks |
| Public data | Universe assets (system directory, adjacency, wormhole codex), pure wormhole logic, server status | SDE ingest (moves to CI and publishes static files), statics pipeline, search indices, market prices, cost indices | Name resolution (bulk dataset or direct ESI) | — |
| UI and tooling | Design system (\~7.3k lines), design tokens and CSS, transport conventions, content and changelog | App shell, pages, ESLint and Fallow rules (re-derived for the new layout), test harness, CI, Playwright | Most API handlers (they become relay calls or disappear) | Vercel Speed Insights, query-string telemetry |

### Leaks the rebuild must not carry over

- **Plaintext ESI access tokens and live locations stored in Convex.**
- **One environment key that decrypts every user's refresh token.**
- **Per-ID lookups of public data that reveal private interest.** Statics per system, type names, prices and cost indices are fetched by the IDs a user holds or maps. The rebuild ships whole tables instead.
- **Server jobs that read map contents:** the hourly lifetime collapse, the jump resolver and the per-system statics fetch.
- **A cross-map telemetry table fed from private maps.**
- **Market price rows created from what users own.**
- **Server caches of plaintext private rows, and logs that may include payloads.**
- **Telemetry carrying full page paths plus character ID; feedback tickets carrying page paths; third-party scripts on pages that hold keys.**

## Alignment with the current app

The rebuild happens inside the existing lgi-tools repository and keeps the current app's behaviour wherever encryption does not force a change. A code review on 2026-10-06 found about a dozen places where earlier drafts departed from the current implementation without an encryption reason; this section is the correction, and it overrides anything elsewhere in the doc that disagrees.

### Same repository, same workflow

- **No new repo.** lgi-tools is already public and MIT-licensed. It becomes a pnpm workspace on `development`, with new `apps/*` and `packages/*` beside the current app. Git history, CI, Coverage health, the prepare/promote/release skills, the test-runner and repo-mapper agents, the cloud guide and the Fallow zones all carry over. The old "repo visibility" owner decision is gone.
- **Same branch flow.** Work targets `development`, promotes to `staging`, releases to `main`. Each new origin (app, api, relay) gets a staging twin and a local equivalent in the cloud dev stack.
- **Same gates.** `pnpm check` through the test-runner agent before every commit, `pnpm verify` before promote or release, zero Fallow findings. Reproducible-build checks run in CI only, never locally.

### Keep what already works

| Area | Current app | Rebuild keeps |
| --- | --- | --- |
| Relay | Convex already gives a server-sequenced, reactive total order | Convex is the v1 relay for sealed frames, behind the transport interface; Durable Objects are the planned move only if the Convex bill or fan-out says so (see Server components) |
| ESI polling | Online check gates location; ship read only on system change; cadence follows ESI `Expires` with a 5 s floor | The same policy, run in the browser; only relay frames are batched |
| Jump detection | `JUMP_CONTINUITY_MS` 45 s, 10 min capture window, 4 h collapse grace, doorbell retries every 15 s up to 5 times | The same constants, as reducer constants |
| Viewer tracking | Viewers may track (tracking needs view access) | Viewers may track by default |
| Scopes | All 22 scopes requested at once with consent; missing scopes show a reconnect state | All scopes at once, same reconnect state; adds only the waypoint and corp-membership scopes when those features ship |
| Token handling | Rotated refresh token persisted with compare-and-swap; two-strike invalid\_grant with a 5 min grace; retryable 5xx/429 | The same rules, run in the browser against the sealed vault copy |
| ESI client | Forced compatibility date, error-budget floor of 20, Expires-window cache, rate-limit group recording | Ported as a shared ESI client package used by browser and server |
| Transport | Typed endpoint, decode, problem and correlation contracts | Ported to the new API, not rewritten |
| Affiliation | Checked lazily on view against ESI's 1 h cache | The same store and freshness gate; the server only cuts delivery |
| Saved plans | Four account routes | Kept, as personal vault documents |
| Replay | Map replay script and the layout proof corpus | Reused as the reducer replay harness, not rebuilt |

### Not current features

These were listed as parity but do not exist today. They are new work, scheduled after the sealed mapper ships: alliance grants and grant expiry, map caps above today's 128-row collapse bound, CCP's "reliable lifetime" state (today's stages are under 1 day, under 4 hours, under 1 hour and expired), set-waypoint, routes and Thera/Turnur, zKill feed, per-map Discord alerts, a 30-day op log with revert-by-character (today: 7-day event log, 24 h undo), and notes.

### Corrections to the engine port list

Resolution logic lives in the jump resolver and signature elimination modules, tombstones in the Convex tombstone mutations, and the pure helpers include the static-claim, scan-selection and scan-state modules plus signature lifecycle. Scan semantics stay exactly as today: missing signatures are scoped by kind and sent to the user to confirm, and only rows whose latest death time has passed are removed automatically.

### Changes encryption does force

- Better Auth's server-side code exchange goes, because no scoped grant may reach the server. Its reusable pieces stay: JWKS cache, owner-hash claim and reconcile, link intent, merge logic and the synthetic-pilot dev sign-in.
- Location polling moves from the Convex action to the browser, so it can only run while a client is open. Today the server keeps polling for up to 90 minutes while the tab is hidden; this is the one real regression (see Open questions).
- Corp roles move from each member's self-read to a Director's pull, because a granting client cannot trust roles another member reports. That adds one scope for Directors and changes the corp-visibility golden tests on purpose.
- The crypto core is a static app on its own origin for content security policy, WEBCAT and self-hosting. It lives in the same repo and shares the design system.

## Architecture paths

The rebuild takes **Path A-lean**: Path A's blind relay on Cloudflare Durable Objects (DOs), with the scope cut and 17 ideas grafted from the other paths and the reviews. Every reviewer flaw is either fixed or accepted as a stated residual risk. Paths B, C and D were rejected for cost, inherited code and operations load.

### Scorecard

Scores come from the design review panel, out of 10; higher is better.

| Path | Security | Wormhole ops | Feasibility | UX | Operability | Overall | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A Blind relay, browser-first | 6 | 6 | 5 | 5 | 5 | 6 | Chosen as the base (A-lean) |
| B Convex evolution | 4 | 5 | 6 | 4 | 4 | 4.5 | Rejected: per-call billing |
| C Classic Jazz fork | 2.5 | 3 | 3 | 4 | 2 | 2.5 | Rejected: unsafe core, maintenance-only upstream |
| D Attested enclave ingest | 5 | 4 | 3 | 4 | 2 | 3.5 | Not for v1; post-GA research |

The scores grade each path as first written, which is why they are low. A scored highest because every flaw found in it can be fixed without changing its shape.

### Path A: blind relay, browser-first (chosen)

A static crypto core at app.lgi.tools holds every key and all plaintext. It calls EVE SSO and EVE's API (ESI) directly as a PKCE public client. Per-map, per-user and per-corp DOs sequence and relay padded ciphertext, and Neon keeps only the control plane.

Its best idea is a server-ordered op log with deterministic reducers. That keeps the mapper's single-writer invariants without a CRDT. It also has the most honest trust statement and the cheapest stack: an estimated $32-110/month at 10k monthly active users (MAU), $12-43 of it for the relay.

As first written it was not shippable. Reviewers found server-asserted identity binding, Standard escrow reaching Sealed data, alt linkage, snapshot forgery and an oversized scope. A-lean is Path A with those fixed and the scope cut, and the rest of this document specifies it.

### Path B: Convex evolution

B keeps Next.js, Convex, Neon and Better Auth. Convex becomes a blind, account-authenticated store for sealed op logs, snapshots, presence and vaults. Its best idea puts the access check, membership compare-and-set and op append in one serializable transaction.

[Convex bills per function call](https://www.convex.dev/pricing), and every subscriber's query re-run counts. Research puts B at $25-70/month at 1k MAU and $230-1,050/month at 10k MAU, 2-10x the DO path.

Metadata is not the deciding difference, since A also authenticates every call by account. The difference is that the DO path can later move to capability or Privacy Pass tokens and carry cover frames almost free. At the cost table's \~2,250 concurrent clients (10k MAU), one 5 s cover frame each comes to about 1.17B Convex calls a month, roughly $2,300 before fan-out (estimate). Durable Objects bill WebSocket messages at 20 per request, so the same frames cost under $10. Even so, v1 keeps Convex as the relay for sealed frames, because it already provides the ordering and reactivity the design needs and current traffic is small; the Durable Objects relay is the planned move if the bill or fan-out grows (see Alignment with the current app).

### Path C: Classic Jazz fork

C forks classic Jazz 0.20.19 (cojson plus its Rust core) into an LGI-owned stack behind a hardened Node sync server on Fly.io. It was the fastest route to a working end-to-end-encrypted prototype. Its best idea is one data vault per linked character, so a transfer or unlink crypto-shreds that character alone.

Upstream is maintenance-only, and [Jazz v2 trusts the server for access control](https://raw.githubusercontent.com/garden-co/jazz/main/docs/content/blog/what-we-learned-from-classic-jazz.mdx). The core has three flaws: it allows backdated writes, gives invite roles read keys, and reuses session IDs in deterministic nonces. Fixing them means rewriting permissions.ts.

Fallow over cojson finds 169 functions over LGI's thresholds (46 critical) and 22 circular dependencies. The zero-suppression policy cannot absorb that. C saves about 3-5 weeks, then costs an estimated 15-25% of a developer for good, plus wire-format lock-in.

### Path D: attested enclave ingest

D runs a reproducibly built, publicly logged AWS Nitro Enclave ("Warden"). It holds EVE refresh tokens, does all ESI ingest and acts as corp key authority, while maps stay end-to-end encrypted on DOs. Its best idea is phase ordering: the sealed core ships first and stays the permanent fallback.

It adds a third trust tier and the heaviest operations load of any path. The wrapping key lives only in enclave RAM, so a correlated fleet restart loses it. ESI breakage waits about 7 days for a hotfix, because new images sit out a public notice period.

D costs an estimated $250-400/month at 10k MAU, several times A-lean's $32-110, and adds 10-14 weeks of build. Attested ingest stays an M9 research track, limited to corp key authority.

### Grafts adopted

| From path | Idea | Lands as |
| --- | --- | --- |
| B | Access change, membership compare-and-set and append in one serializable transaction | Atomic removal unit in MapRoom (D-GRP-4) |
| B | Invites carry no group key, only genesis hash, Owner fingerprints, name and policy | Signed invites; see Joining in Maps: membership, sync and tiers |
| B | History across epochs, with a forced snapshot at every rotation | History key for Manager+; joiners get only the snapshot (D-GRP-8) |
| B | Encrypted op log kept apart from snapshot cleanup, as audit trail and undo window | 30-day op retention |
| B | Opaque vault tags, HMAC(vault master key, logicalKey), with revision compare-and-set | Personal vault |
| B | Net-worth backfill from the daily price book, with estimated days marked | M5 |
| B | Short-lived tokens with revocation checked on every relay call | 15-min API tokens, 5-min relay capabilities, revocation push to DOs |
| C | Per-character data vaults | Character vaults (M3) |
| C | Non-extractable device key proving possession at socket upgrade and token mint | Device authentication key (Ed25519) |
| C | Corp-run ciphertext mirror and export peer | M9 option; recovery bundle meanwhile |
| C | Truth spikes with failing tests and a go/no-go gate | M0 spikes S1-S9 |
| D | Sealed core first; server conveniences additive and cancellable | Sealed v1, then the Standard Steward (M7) |
| D | Access-class indirection for corp bucket keys | Corp spaces; alliance sub-group keys in M9 |
| D | Verifier shipped as an npx CLI and a public GitHub Action | The public "watch" monitor |
| D | Three honestly named tiers; "Attested" reserved and never marketed as blind | Sealed and Standard ship |
| Reviews | Fingerprint phrase in the public character bio, read from ESI by the approver | "Verified in game" badge (D-KT-11) |
| Reviews | Per-character public identities, with no shared user-level key | Per-character identity and encryption keys; see Identity, keys and devices |

B's original history-key construction encrypted each epoch's secret under the next one. It was replaced: history keys are now a separate access class.

## Recommended architecture

Build Path A-lean: a static crypto core in the browser, an LGI-owned sealed op log on Cloudflare Durable Objects (DOs), and sealed EVE tokens. EVE tokens live only in members' browsers or a corp's own bot, and are stored only sealed. In the Sealed tier, no live credential for EVE's API (ESI) ever reaches LGI servers (rule S8). In v1 the sealed op log runs on Convex behind the transport interface; the Durable Objects named in this doc (MapRoom, UserHub, CorpSpace) are the planned migration if Convex cost or fan-out requires it.

&#91;embedded content: recommended architecture · browser core, public origins, LGI servers, optional bot and Steward\]

The browser talks to CCP directly, so EVE tokens never reach LGI. LGI's servers only order, relay and store ciphertext. The Steward exists only for opt-in Standard groups, and a corp's bot device runs on the corp's own hardware.

### Trust tiers

A group's tier is fixed in its signed genesis and never changes in place. A Standard group becomes Sealed only through a guided new genesis; Sealed to Standard is impossible.

| Tier | Status | Who can read group content | Label shown to users |
| --- | --- | --- | --- |
| **Sealed** | Default; the only tier at launch | Member clients only | "Sealed" |
| **Standard** | Opt-in per group; protocol in M3, Steward in M7 (cancellable, OD-4) | Members plus the Steward, an escrow recipient of that group's epochs only | "Standard: LGI can read and recover this" |
| **Attested** | Reserved name only | Not built; a possible future enclave tier, never marketed as blind | n/a |

### Hard rules

The Sealed rules (D-TRUST-1) bind every component:

- **S1** The server never starts a key grant in a Sealed group. Every addition needs a signature from a member device that verified the recipient.
- **S2** No user-level secret is escrowed in any tier: account root secret, keyring, character keys, recovery-derived keys, EVE tokens, vaults.
- **S3** Removing access is always safe for the server. Adding access always needs a member-side check.
- **S4** Rotation recipients come only from the verified, signed membership log.
- **S5** Every key a client accepts is checked against a signed confirm tag before first use.
- **S6** Browser storage is a cache, never the system of record.
- **S7** Public data is never queried by private IDs through LGI.
- **S8** No live ESI-scoped bearer credential reaches LGI servers.

Standard keeps S2, S6 and S7 unchanged and applies S1, S4 and S5 to members (D-TRUST-2). The Steward is the one privileged escrow member: it may rotate the group and re-wrap a recovered member after a 72 h vetoable delay. S8 relaxes only for two labelled grants, the Standard server tracker and the hosted corp agent.

### The served-JavaScript caveat

Both tiers share one limit, and the security page states it verbatim: "Whoever serves the app code can steal keys on your next load. Self-hosters and WEBCAT users get prevention; everyone else gets detection." Detection (the service-worker release check) and the self-host bundle arrive at general availability (GA, M8). WEBCAT prevention arrives with production enrolment after GA. Until GA, alpha and beta users rely on the public release log and the watch monitor.

The mitigations are an isolated static origin, reproducible Sigsum-logged releases, an in-app release check, [WEBCAT](https://github.com/freedomofpress/webcat) and a self-host bundle (see Code integrity in Security engineering).

### Components and origins

Each origin has one job, and only the browser core and corp-run or Standard components ever hold plaintext. Hosts, storage, milestones, the cookie and CORS rule, and data residency are in Server components and infrastructure.

| Origin or component | Role | Sees plaintext |
| --- | --- | --- |
| lgi.tools | Public shell: landing, sites, market, public industry, docs, security page; never embeds the core | No; public data only |
| app.lgi.tools | Crypto core single-page app (SPA) and WebAuthn relying party | Yes, what the user is entitled to, in the browser |
| api.lgi.tools | Control plane: accounts, devices, sessions, passkeys, wrap rows, room registry, system revokes | No; metadata |
| KeyDirectory DO | Key directory log and map, signed tree heads, Sigsum submission | No; commitments and metadata |
| relay.lgi.tools | MapRoom, UserHub and CorpSpace DOs: sequencing, coarse access gate, wraps, invites, leases, location batching | No; ciphertext and metadata |
| data.lgi.tools | Signed datasets, tree heads, release manifests, JSON Web Key Set (JWKS) snapshots | No; public data only |
| ops.lgi.tools | Operator console | No; metadata |
| watch | Public monitor of releases, tree heads and JWKS | No; public data only |
| Bot | Corp-run headless member principal | Yes, that corp's data, on its hardware |
| Steward | Standard-tier escrow | Yes, Standard groups only |

### Stack

Pin exact versions at kickoff. The existing lgi-tools repo, already public, becomes a pnpm workspace on the development branch and keeps enforcing Fallow boundaries.

| Area | Choice and version |
| --- | --- |
| Monorepo | pnpm 10.34, Fallow 3.22.0, ESLint 9.39, zero suppressions |
| Core UI | Vite 8.x, React 19.2.8, TanStack Router 1.x (hash history), Tailwind 4.3.3, Base UI 1.7.0, @xyflow/react 12.11.6, Comlink 4.x, idb 8.x; no runtime `<style>` injection |
| Shell | Next.js 16.3.4 on Vercel, public routes only |
| Edge | Workers Paid, wrangler 4.x, Hono 4.x, SQLite DOs with hibernatable WebSockets, R2, Workflows, Hyperdrive; partysocket 1.x; no timers in DOs |
| Database | Neon Launch, drizzle-orm 0.45.2, drizzle-kit 0.31.x; history 1 day (main), 0 (key-wrap project) |
| Crypto | WebCrypto Ed25519, X25519, AES-256-GCM, HKDF-SHA256, HMAC-SHA256; `hpke` 1.1.7 (base and PSK modes); @noble/curves 2.4.0 for strict verification; @noble/hashes 2.x |
| Encoding | cborg 4.x strict deterministic CBOR, zod 4.5.x; raw and pkcs8 key formats, never JWK |
| Auth | Native WebAuthn JSON parsers, @simplewebauthn/server 14.x, jose 6.2.x |
| Passphrase KDF | hash-wasm 4.x Argon2id: 64 MiB, t=3, p=1 |
| Testing | Vitest 4.1.11 browser mode, Playwright 1.62.1, @cloudflare/vitest-pool-workers, fast-check 4.x, Tamarin, ProVerif |
| Release | Reproducible build, actions/attest (Sigstore), WEBCAT manifest, Sigsum signing |

### Sealed data flow

1. The browser loads the core from app.lgi.tools as hash-pinned static assets. From M8 a service-worker pin checks each release against its Sigsum entry.
2. A trusted device signs `POST /session` with its device authentication key (DAK). It receives a 15-minute API token and 5-minute relay capabilities.
3. The client fetches its server-side wrap row and unwraps the account root secret (ARS) in the crypto worker, then opens the keyring. A passkey unlock takes one tap instead.
4. The browser runs a Proof Key for Code Exchange (PKCE) login against the LGI Data app registered with CCP Games (CCP), EVE's developer. It seals the refresh token in that character's vault and calls esi.evetech.net directly.
5. To join a map, the joiner submits invite-signed keys. A Manager approves after checking the key directory and CCP affiliation.
6. The approver wraps the group epoch secret (GES) to the joiner's character encryption key with Hybrid Public Key Encryption (HPKE). The wrap is device-signed and checked against the epoch's confirm tag.
7. Each user action becomes a signed intent, sealed into a padded op frame under that epoch's subkey.
8. The MapRoom DO runs coarse checks (member, role class, quota, epoch, lease). It assigns a sequence number, extends the head-hash chain and fans the frame out.
9. Every member verifies, decrypts and applies the op with the same deterministic reducer. Ops stay in R2 for 30 days; snapshots are offered every 200 ops or 256 KiB.
10. Trackers send one 256-byte location frame per tick. The DO forwards one padded batch per socket and never persists location.
11. A removal runs one atomic unit: ACL change, remove commit, delivery cutoff, rotation pending. A separate rotation commit, accepted by compare-and-set (CAS) on epoch, wraps a new GES to recipients from the signed log.

Key and membership details live in Identity, keys and devices and in Maps: membership, sync and tiers.

### Glossary

| Name | Meaning |
| --- | --- |
| AAD | Additional authenticated data: bound to an AEAD ciphertext but not encrypted |
| AAGUID | Authenticator attestation GUID: identifies a passkey authenticator model |
| ARS | Account root secret: 32 random bytes at the root of a user's keyring, stored only as wraps |
| CAS | Compare-and-set: a write accepted only if a stored value still matches |
| CCP | CCP Games, EVE's developer; runs EVE SSO and ESI |
| CDP | Chrome DevTools Protocol: drives the virtual authenticator in tests |
| CIK\_c / CEK\_c,g | Character identity key (signs the sigchain) / character encryption key, generation g (receives group wraps) |
| Confirm tag | HMAC under the epoch secret over the commit hash, carried in the signed commit |
| CSP | Content security policy: browser rules on which scripts and styles may run |
| CU | Neon compute unit |
| DO | Cloudflare Durable Object |
| DSK\_d,c | Device signing key for device d acting as character c; signs ops, wraps and commits |
| DUK / DAK | Device unlock key (X25519, receives ARS wraps) / device authentication key (Ed25519, signs sessions) |
| ESI | EVE's game data API (historically EVE Swagger Interface), run by CCP |
| GA | General availability, reached at M8 |
| GES\_e | Group epoch secret for epoch e; content keys are HKDF subkeys of it |
| Group | Any keyed space: map, personal vault, character vault, CorpSpace or access class |
| HPKE | Hybrid Public Key Encryption (RFC 9180): wraps secrets to an X25519 public key |
| KT / STH | Key directory (key transparency) / its signed tree head, published every 2 min |
| MapRoom, UserHub, CorpSpace | DOs: one per map, one per user, one per corp |
| OPFS | Origin private file system: browser file storage, never used for keys |
| PII | Personally identifiable information |
| PKCE | Proof Key for Code Exchange: OAuth flow for public clients without a secret |
| PRF | Pseudo-random function: the WebAuthn extension that yields a per-passkey secret |
| RK | Recovery key: 256-bit secret on the printed kit; derives recovery wrap and signing keys |
| SDE | Static Data Export: CCP's dump of static game data |
| Sigchain\_c | Hash-chained, CIK-signed log of a character's devices and key generations |
| Sigsum | External transparency log with witness cosignatures |
| Steward | Standard-tier escrow service, M7 |
| VRF | Verifiable random function: planned for a private key directory index in v2 |
| XSS | Cross-site scripting: injected script running in the app's origin |

## Identity, keys and devices

Each user holds one account root secret that only their own unlockers open, and peers see only per-character public keys bound in a witnessed key directory.

&#91;embedded content: key hierarchy · unlockers, root secret, keyring, per-character keys, groups\]

Any one unlocker opens the account root secret, and the root secret opens everything else. Peers and the key directory only ever see the per-character keys, never the account.

### EVE applications and login

LGI registers two CCP applications, both public PKCE clients run in the browser. Staging, dev and each self-host install get their own pair.

| Application | Scopes | Where the token goes | Used for |
| --- | --- | --- | --- |
| LGI Identity | None | To the API, only inside a request signed by the character identity key (CIK) | First binding, compromise revoke, re-attestation |
| LGI Data | All 24 Data scopes registered in M0, requested per feature | Never to LGI while live; refresh token sealed in the character vault | ESI calls (see Personal and corp ESI data, and Location publishing in Mapper engine in the browser) |

A first login runs Identity PKCE, then `POST /bind`. The API verifies the JWT by kid against the CCP JWKS, [as CCP documents](https://docs.esi.evetech.net/docs/sso/validating_eve_jwt.html). It checks both issuer forms, aud, sub, exp, and an iat at most 20 min old. It then consumes the jti, which is single-use across every endpoint.

After that, a trusted device unlocks with zero taps; elsewhere **passkey-as-login** is the normal path. One discoverable, user-verified WebAuthn ceremony both authenticates (SimpleWebAuthn 14.x on Workers) and unlocks through the pseudo-random function (PRF) extension. A new device arrives by synced passkey, QR link or recovery key; there is no bare-JWT login.

### Unlock hierarchy

The **account root secret (ARS)** is 32 random bytes that exist only as wraps. Each **unlocker** wraps ARS, and ARS derives the keyring key. Inputs are CBOR arrays led by a registered label:

```
K_keyring = HKDF(ARS, ['lgi/v1/keyring'])
KEK_prf   = HKDF(PRF(credential, 'lgi.tools/prf/v1'), ['lgi/v1/prf-kek', credentialId])
RKP       = X25519 key from HKDF(RK, ['lgi/v1/recovery-kp'])
RSK       = Ed25519 key from HKDF(RK, ['lgi/v1/recovery-sign'])
RAK_c     = Ed25519 key from HKDF(RK, ['lgi/v1/rak', charId])
```

| Unlocker | Key that receives the ARS wrap | Wrap stored | Taps | Non-device unlocker |
| --- | --- | --- | --- | --- |
| Device unlock key (DUK) | Non-extractable X25519, trusted devices only | Server only, never cached | 0 | No |
| Passkey | Credential unlock key (CUK): X25519 per credential, private half sealed under KEK\_prf | Server | 1 | Yes |
| Recovery key (RK) | Recovery keypair (RKP) public half | Server | Type the kit | Yes |
| Passphrase (optional) | Argon2id KEK, m=64 MiB, t=3, p=1 | Server | Type | Only if generated (6+ diceware words) |

All passkeys share one fixed PRF input, because discoverable sign-in cannot know the user first. Re-keying through evalByCredential is rejected: it adds a tap to every sign-in.

#### Passkey credential rules

- Re-wrap ARS to the remaining unlockers before removing any credential.
- Send no WebAuthn Signal API deletes while a credential still wraps keys.
- Block hybrid enrolment from iOS below 18.4.
- Warn on known-weak providers: Bitwarden-stored passkeys, and Windows Hello before 25H2.

The **recovery key** is 256 bits, printed as 'LGI1-' Crockford base32 with a checksum; a generated passphrase may replace it. It also derives the **recovery signing key (RSK)**, an account proof the server checks. It derives one **recovery anchor key (RAK\_c)** per character too, which peers check.

The ARS wrap goes to the RKP public key, so the kit survives ARS rotations and is reprinted only when RK rotates. It does not survive loss of LGI's database, because the keyring lives in the control plane.

The **recovery bundle** covers database loss. It seals {ARS wrap to RKP, keyring ciphertext, sigchain heads, room list} to RKP, and is offered after every ARS rotation and monthly.

#### Unlock policy

- A recovery secret is mandatory within 24 h, and before EVE tokens or authored data persist (OD-17).
- Owners, Managers, Directors and corp-space key holders need two non-device unlockers: RK plus a passkey.
- **High-security mode** drops the DUK, costing one tap per browser session. It is strongly prompted for those roles (OD-12): zero-tap unlock gives an infostealer the account.
- Unlock needs the network, since wrap rows are never cached. A server-side revoke ends future unlocks.
- Recovery on a new device is RSK-signed. The keyring is released after 48 h (OD-5), or at once if a passkey or trusted device approves; only an account proof can veto.

### Keyring contents

The keyring is an AEAD blob under K\_keyring, in a separate Neon project with a 0-day history window. It holds:

- the **account signing key (ASK)** and the personal **vault master key (VMK)**;
- each linked character's key set;
- the ASK-signed unlocker list, device list and high-water marks (membership heads, vault revisions, keyringVersion);
- contact pins.

Clients refuse to wrap to an unlocker key the ASK has not signed, so the server cannot add one.

### Per-character public identities

Peers never see a user-level key. Each linked character c has three kinds of key:

- a CIK\_c, Ed25519, that signs c's hash-chained sigchain;
- generations of **character encryption keys (CEK\_c,g)**, X25519, that receive group wraps;
- one non-extractable **device signing key (DSK\_d,c)** per device, certified by CIK\_c.

Members verify "op by character c" without learning that c and c′ share a human, so 5 characters get 5 wraps. Linking another character repeats Identity PKCE and `/bind`.

The published limits: peers cannot link characters cryptographically, timing correlation is reduced, not eliminated, and LGI's control plane knows which characters share an account. Full separation needs a second account.

| Correlated event | Mitigation |
| --- | --- |
| Device certificates | Created lazily on first use per character, with no device metadata |
| Non-urgent KT and sigchain updates, RAK\_c registration | Jittered 0-6 h |
| Location ticks | Independent per-character jitter, uniform in \[0, 1.5 s) |
| Reconnect wizard | 30 s-3 min between characters |
| Compromise rotations | Staggered 0-20 min, or up to 24 h on request |
| Deletion revokes | Staggered 0-24 h |

### Key transparency

The **key directory (KT)** is a KeyDirectory Durable Object (DO) holding an append-only Merkle log and a sparse Merkle map. Each leaf value hash-chains that character's sigchain heads, so every device certificate, CEK or CIK change updates the leaf.

```
index = SHA-256(['lgi/v1/kt-index', kind, id])                kind: char | bot
v_n   = H([n, recordKind, sigchainHead, evidenceCommitment, v_{n-1}])
STH   = {treeSize, logRoot, mapRoot, ts, prevSTHHash}
```

Record kinds are first-bind, rotate, compromise-rotate, reset, re-attest, cert-change, tombstone and bot-bind. A first binding is accepted only if all of these hold:

1. The CCP signature verifies under a live kid, or under a kid in a witnessed JWKS snapshot logged before the record's first STH.
2. sub matches the character.
3. The jti is unseen. A user's own client seeing "jti already bound" raises a red alarm, never a retry.
4. The first Sigsum-logged STH that includes the record has a witness timestamp by iat + 35 min. That is 20 min token life, 10 min cadence and 5 min slack; on the hourly fallback the bound is iat + 85 min.

| Item | Interval or limit | Rule |
| --- | --- | --- |
| Signed tree head (STH) | Every 2 min | Published on data.lgi.tools |
| Sigsum submission | Every 10 min; hourly if rate-limited | prevSTHHash chains the STHs between; witness cosignatures checked against pinned keys |
| Inclusion promise | Next STH | Accepted provisionally; a breach is a red alarm and auto-removes the member |
| Peer leaf proof | STH at most 15 min old | Required before wrapping, admitting or accepting a cekGen; lower generations refused |
| JWKS archive | Hourly, by the API and the public watch Action, both LGI-run | Any change logs H(snapshot) to Sigsum |
| Re-attestation | Every 14 days, silent | Evidence iat at most 14 days old and newer than the last accepted; groups suspend at attestation age 14 + 7 days by default |
| Watch-confirmed STH | Amber after 24 h | Every STH used must be consistent with it |
| STH signing key and system-revoke key (CPK) | Yearly | Each key change is logged to Sigsum; the CPK signs removal-only system revokes |

Leaves hold a salted commitment H(salt, JWT), never raw JWTs, names or owner hashes. Identity evidence opens only to the owner and admitting peers; Data evidence only after it expires.

Lookups are rate-limited and need a session plus a MapRoom-signed capability. It names members, pending joiners, invite owners and the requester's own characters.

#### Re-attestation

Re-attestation posts an expired CCP JWT inside a CIK-signed request, so owner-hash changes surface without live tokens reaching LGI. The API rejects evidence whose iat is older than 14 days, or no newer than the iat of the previous accepted attestation. The jti stays single-use.

**Attestation age** is now minus the iat of the last accepted evidence JWT. A seller can stockpile tokens before a sale by refreshing, but none is accepted later than 14 days after the sale. Groups therefore suspend a sold character by day 21, even while it stays in the corp and the hourly affiliation check never fires.

The owner's client checks its own leaf chain on every unlock. The watch Action checks STH linearity, consistency proofs, forks and cadence gaps.

#### JWKS witnesses and the published guarantee

Verifiers fetch CCP's JWKS directly in the browser, since the endpoint allows CORS, and record every kid they see served. A verifier accepts an archived kid only if its own client saw CCP serve it, or an archive LGI does not run logged it.

Both current archivers are LGI-run, and the watch key stays owner-held until a community mirror exists. An operator could log a fabricated snapshot containing its own kid and mint a "CCP" JWT for a dormant corpmate. Only an independent watcher would notice.

The published guarantee is "trust on first login plus transparency detection". Under a live kid, LGI cannot bind a key to a character that never logged in. Under an archived kid, until a community mirror exists, the guarantee is detection only. For an active character, substitution shows as a reset or a red alarm.

### CEK and CIK lifecycle

CEK\_c,1 is created at link. Routine CEK rotation runs every 180 days ± 30 days of jitter; compromise rotation is immediate (see Tidy and compromise revoke). Each new generation is announced in this order:

1. A CIK-signed sigchain entry.
2. A KT leaf update, jittered 0-6 h if non-urgent, immediate if urgent.
3. A DSK-signed `member.cek-update` commit in each room, carrying the KT proof.

Rotators wrap only to the KT-proven head. An old CEK private key is kept until the last epoch wrapped to it is older than the 30-day op retention, then destroyed. After a compromise, old CEKs count as exposed and every group rotates.

Routine CIK rotation is CIK-signed and waits the 24 h announced delay below. Compromise rotation cross-signs the new CIK with the old CIK and RAK\_c, plus a fresh CCP JWT.

### Devices and sessions

Every device holds a non-extractable **device authentication key (DAK)** for the control plane. Its **device cache key (DCK)** encrypts the local ciphertext cache.

| Class | Persistent device keys | Unlock |
| --- | --- | --- |
| Trusted | DAK, DCK, DUK | Zero taps |
| Trusted, high-security | DAK, DCK | One tap per browser session |
| Session | None; expires, never causes rotation | Passkey tap, or a session wrap from a QR link |

There are no cookies. A DAK-signed `POST /session` over {deviceId, ts, nonce} returns a 15-min API token and 5-min relay capabilities bound to the DAK, DPoP-style. Clients re-present capabilities over the socket every 4 min.

On a revocation, the API pushes to UserHub and every affected DO. They close tagged sockets and keep a revocation set until the tokens expire.

#### QR device link

1. New device N generates an ephemeral X25519 key ePK\_N, a 128-bit secret s and a 16-byte linkId. It registers linkId (5-min TTL, single use) and shows QR(v, linkId, ePK\_N, s).
2. Existing device E scans it, opens HPKE in PSK mode (psk = s, psk\_id = linkId) and sends enc through the API mailbox.
3. Both derive directional keys and a short authentication string (SAS) from the HPKE exporter.
4. N sends its DAK and DUK public keys under the N-to-E key. Both screens show a 6-digit SAS, confirmed on E.
5. E registers N with a DAK-signed request and an ASK-signed device-list update, and notifies every device.
6. E wraps ARS to DUK\_N, or sends a session wrap for a session device. ARS never crosses the relay unwrapped.

### Tidy and compromise revoke

An **account proof** is a factor a copied browser profile cannot reproduce: a fresh user-verified WebAuthn assertion, or an RSK signature.

| Action | Authenticated by | Delay | Veto |
| --- | --- | --- | --- |
| Link a device, add a passkey | Device plus SAS or user verification | None, announced | Use compromise revoke |
| Tidy revoke, remove an unlocker, routine CIK rotation | Device | 24 h, announced | Any device or account proof |
| Remove or rotate RK | Account proof | 24 h | Account proof only |
| Compromise revoke | Account proof, fresh CCP JWT per character, RAK\_c signatures | Immediate | None from devices |

If account proofs conflict, unlocker and device changes freeze, and the user is told their factors are in different hands. The only way out is a new identity, with groups re-joined as resets.

**Tidy revoke** is server-enforced: wrap rows deleted, sessions revoked, system cert-revokes appended, no rotation. It suits only wiped or recovered devices. **Compromise revoke** gives the thief no veto:

1. Revoke every device and session not re-confirmed with an account proof.
2. Rotate ARS, retire every CUK, register fresh passkeys and mark the passphrase wrap stale.
3. Per character, cross-sign a new CIK with the old CIK and RAK\_c, create a new CEK generation and append a KT compromise-rotate record.
4. Rotate VMK, re-encrypt the personal vault and set rotationPending on every group.
5. Re-consent Data grants, revoking at CCP through /v2/oauth/revoke if public clients may (truth check 2).

Peers enforce a fork rule: a RAK-signed branch beats a CIK-only one, and a CIK-only reset is contestable for 7 days. Two RAK-signed branches suspend the character until the user starts a new identity.

### ARS rotation

1. Generate ARS′ and re-encrypt the keyring under HKDF(ARS′).
2. Verify the ASK-signed unlocker list and refuse any server-added key.
3. Wrap ARS′ to every live DUK, to RKP and to every unretired CUK.
4. Bump keyringVersion and the ASK-signed high-water marks.
5. Delete old wrap rows and prompt for a new recovery bundle.

Other trusted devices keep zero-tap unlock. The passphrase wrap is re-made at its next entry.

### Merge, transfer and sale

- **Merge:** client-side with both keyrings unlocked. Key sets move and the old account's certificates are revoked; if old devices are out of reach, CIK and CEK rotate instead.
- **Owner-hash change** (seen at re-attest or on invalid\_grant): KT revokes the binding, the character vault is shredded and system revokes reach every group. The buyer's binding is a reset, contestable for 7 days.
- **Biomass** (Doomheim, corp 1000001, or character not found): removal plus a tombstone.
- **Unlink:** the transfer path without alarms.

### Account deletion

Deletion is a crypto-shred, because DO point-in-time recovery keeps 30 days and deleteAll recovery is undocumented (relevant only if the relay moves to Durable Objects).

1. Block if the user is the last key-holding Director, or sole Owner of a shared map, without a handover.
2. Revoke CCP grants client-side, or deep-link to the authorized-apps page.
3. Send signalUnknownCredential for each passkey where supported.
4. Show a checklist to destroy the printed kit and every recovery bundle.

An idempotent server Workflow then deletes unlock wraps first, then the keyring, UserHub, character vaults, R2 blobs and Neon rows. KT tombstones leave only irreversible salted hashes. Ops authored in shared maps stay with the remaining members, as the UI states.

## Maps: membership, sync and tiers

Every map is a keyed group that only its members can extend, ordered by one server-sequenced log that every client reduces to the same state.

### Groups and epochs

A map holds a **group epoch secret (GES)** per epoch, and all content keys are HKDF subkeys of it under registered labels. The GES is HPKE-wrapped (base mode) to each member's character encryption key (CEK), one row per recipient in the map's Durable Object (DO). Devices are never recipients; see Identity, keys and devices.

Epoch 0 is the **genesis**, signed by the creator's device signing key (DSK). It fixes the tier, Sealed or Standard, forever; clients alarm on an escrow recipient in a Sealed genesis. Every epoch, genesis included, carries a **confirm tag**: an HMAC keyed from that epoch's GES over the commit hash, inside the DSK-signed commit.

Each commit names its group, epoch, previous commit, cause, member set and member-set hash, wraps digest, snapshot and actor certificate. The member-set hash covers sorted (charId, role, cekGen, CEK fingerprint) entries. Each wrap binds the suite, genesis, group, epoch, commit, recipient, CEK generation and CEK fingerprint. The byte-exact layouts live in Exact constructions; see Security engineering.

Every key object is DSK-signed by its wrapper, names its commit, and must match that commit's confirm tag before first use. Key objects are epoch wraps, join re-wraps, rewrap repairs, history blobs, guest projection wraps and access-class wraps.

**Recipients come only from the signed membership log.** The rotator reduces the verified log from genesis or a verified checkpoint. It pins each recipient to the CEK generation proven in the key directory (KT). The DO's member list only detects mismatches: a disagreement raises an alarm and is never an input.

Recipients recompute the member-set hash and reject a commit that does not match. A `rewrap` intent lets any member repair a missing or garbage wrap.

### Genesis policy defaults

The genesis fixes these policies; the defaults below apply unless the creator changes them.

| Policy | Default |
| --- | --- |
| tier | Sealed |
| kind | shared or personal |
| join policy | strict (OD-1) |
| noLinkJoin | on |
| historyAccess | managers (OD-3) |
| attestationMaxAge (days) | 21 |
| suspensionGrace (days) | 7 (OD-8) |
| viewerTracking | on (viewers may track, as today) |
| maxTrackedPerAccount (characters per map) | 32 |
| members (cap) | 1,024 |
| live systems (cap) | today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work |
| connections (cap) | within today's 128-row collapse bound; larger caps are new work |
| scan rows (cap) | 256 |
| trackers (cap) | 1,024 |
| destructive ops | Member, with audit, undo and rate limits |
| tick (s) | follows ESI Expires, 5 s floor (as today); relay batches per tick |
| crossTierTracking | warn |
| guestLinks | off |

The 1,024-member cap holds for v1. Two-level corp sub-group keys come in M9.

### Membership log, removal and rotation

Membership commits share the op log and consume a sequence number (seq) in the same total order, so reducers evaluate roles at seq. Their headers are plaintext because the DO needs them for its coarse access check. Removal and rotation are two steps:

1. **Atomic removal unit.** One `transactionSync`, with no awaits inside, applies four things: the access-list change, the remove commit, the delivery cutoff (sockets closed, wrap fetches denied) and `rotationPending`. Validation finishes first, and hashing uses synchronous @noble/hashes.
2. **Rotation commit.** A member takes a **30 s rotation lease**. The DO accepts the commit by compare-and-set (CAS) on epoch plus the lease token, so the first valid rotate wins. An expired lease lets another writer try.

While rotation is pending, the DO refuses appends sealed under the old epoch except the lease holder's rotate. Honest clients re-seal queued intents under the new epoch. Every rotation writes a forced snapshot, and the M3 exit bar is rotation within 60 s.

Triggers are removal, suspension, compromise, a member's CEK compromise and a 30-day timer. **System revokes**, signed by the control-plane key (CPK) pinned in the bundle, can only remove: affiliation loss, biomass, admin block, deletion, transfer and certificate revocation.

**Suspension on affiliation loss rotates immediately.** It runs the removal unit with cause `suspend` and pins a pre-authorisation: the character identity key (CIK) fingerprint and cekGen. If the character re-affiliates within 7 days (OD-8), a member's client verifies that at CCP and re-wraps to the pinned key automatically.

A KT reset or newer CIK in the meantime needs normal approval. If a whole corp drops, delivery stops and the first re-affiliated writer rotates.

### History keys

History is a separate access class. At each rotation the old GES is sealed under a **history key (HK)** whose recipients are Manager+ by default (OD-3; `none` or `members-present` at genesis). Members keep their own epoch wraps for 30 days, new joiners get only the forced snapshot, and guests never get history.

**The HK rotates whenever someone leaves its recipient set.** Removal, demotion out of Manager+ and suspension all count, and a demotion forces a rotation for this purpose. That rotation commit mints a new HK, wraps it to the Manager+ set derived from the log, and binds it to the confirm tag.

The old GES is archived under the HK current at that commit. A removed or demoted Manager therefore cannot open history archived after they left, even with the relay's stored blobs.

### Roles and ownership

Principals are characters, corporations, alliances and bots, and any grant can expire. In-game Access Lists are deferred.

| Role | Rights |
| --- | --- |
| Owner | Everything, plus policies, transfer and delete |
| Manager | Membership, invites, revert, upgrade commits, canonical snapshots |
| Member | Write, destructive ops (audited, undoable, rate-limited), tracking, rotation |
| Viewer | Read only; no tracking and no rotation by default |
| Blocked | No access |

- **Shared maps** cannot leave setup without 2 Owners on **distinct accounts**, or an Owner plus a transfer-capable Manager on another account. The client refuses to count its own alts, and the DO answers yes or no on distinctness. The UI calls this "continuity guidance, not an anti-collusion guarantee".
- **Personal maps** belong to one account with no outside principals and show "only you can recover this" (OD-16). They can be upgraded to shared.
- **Transfer** is a dedicated commit.
- **Succession.** After 30 days with no Owner seen, Managers on k-of-n distinct accounts, k = max(2, ⌈n/2⌉), promote one of them. A lone Manager may self-promote after 60 days, with notices. Both rules trust the relay for distinctness, and say so.

### Bot principal

A **bot principal** is a corp-run headless member whose keys are anchored by a sponsor's signature, and it can only apply logged builds. It ships in M4 and runs on the corp's own hardware.

#### Enrolment

The bot has principal kind `bot`, with its own CIK, CEK, DSKs and vault. Two records enrol it:

1. A membership commit signed by its sponsor: an Owner or Manager for a map, or a Director for a CorpSpace.
2. A KT bot-bind record anchored by that same sponsor.

Members see the badge "Bot sponsored by \<character>".

#### Capabilities

Membership alone grants nothing; each capability needs its own grant.

| Capability | Scope and limits |
| --- | --- |
| Alerts | Webhook secret sealed in the bot's vault; a DO lease dedupes alerts |
| Admission | Only under the auto-admit policy or pre-authorised invites |
| Maintenance | Compaction, attestations and rotations; signing canonical snapshots also needs the Manager role |
| Corp agent | A Director-delegated PKCE grant, run in the Director's browser and sealed to the bot |
| Local read API | Read access for the corp's own tools |

#### Tracking grants

Each consenting character runs a **separate** PKCE grant in their own browser, limited to the location, ship and online scopes. The token is sealed to the bot's CEK, and the bot's per-character DSK is certified by that character's CIK. It is never the character-vault token.

The bot holds the poller lease for that character exclusively. The character can revoke the grant; the UI states that revoking the app at CCP may kill all of the app's tokens for that character.

If M0 shows only one token family per (character, client\_id), the fallback is a dedicated "LGI Tracker" client\_id with those three scopes, used exclusively. That fallback waits on asking CCP (truth check 2).

#### Updates

The bot runs a reproducible OCI image pinned by digest, whose manifest is logged in Sigsum. Before applying an update it checks Sigsum inclusion and witness cosignatures. A corp-chosen cooldown (default 72 h) or manual approval then applies, and an unlogged build is never applied.

#### Rotation and removal triggers

The bot's keys rotate, or the bot is removed, when:

- its sponsor loses the sponsoring role or leaves;
- an Owner or Manager removes the bot;
- an update fails verification;
- the 30-day key rotation comes due.

### Blocks

A **character block** denies access and runs the removal unit plus rotation. An **account block** only filters future joins on the server. It never removes members or emits commits, because that would reveal which characters share an account; the residual oracle (an alt's refused join) is documented.

### Joining

#### Invites

An invite link carries a 32-byte **invite secret (IS)** in the URL fragment, `#/join/{IS}`, so it never reaches a server:

```
invite_id = HKDF(IS, ['lgi/v1/invite-id'])
K_blob    = HKDF(IS, ['lgi/v1/invite-kek'])
ISK       = Ed25519 from HKDF(IS, ['lgi/v1/invite-sign'])   // only ISK_pub enters sealed state
```

1. The inviter seals a blob under K\_blob and signs it with its DSK. It holds roomId, genesisHash, Owner CIK fingerprints, map name, role, pre-authorised charIds with optional CIK pins, maxUses, expiry and ISK\_pub. **It holds no GES.**
2. The DO releases the blob only to authenticated characters that pass the access list or are pre-authorised, rate-limited.
3. The joiner verifies the genesis and the Owners through KT.
4. The joiner submits {charId, CIK, CEK, cekGen, ktLeafHash, inviteId}, signed by the invite signing key (ISK) and by its own DSK.
5. The admitting client checks the joiner's affiliation itself at CCP (POST /characters/affiliation), then wraps the current epoch.

Members can verify the ISK signature but cannot forge it. Reducers reject joins from an inviter below Manager at that seq, and joins on expired or used-up invites. They also reject Blocked subjects, pin mismatches and pre-authorised bindings reset after issue; demoting the inviter kills the invite.

#### No-link joins

An eligible character sees maps shared with its corp or alliance, each listing its Owners. The joiner's browser verifies those Owners through KT and checks their affiliation at CCP. The joiner must **confirm the Owners** before sending any authored data or location frame, and tracking stays off until admission.

#### Admission policy

**Strict human approval is the default, and it is an owner decision (OD-1).** A Manager+ approves each key after seeing the safety number, KT status, the CCP affiliation check, attestation age and any in-game badge. Bulk approve handles onboarding ("approve 23 pending: non-reset, CCP-verified"), and a bot may pre-verify.

Auto-admit is an opt-in genesis policy. Any member device, or a bot with an admit grant, admits a binding that is KT-verified, never reset, attested within policy and affiliation-checked by that client. It is labelled "Trusts LGI's key directory at first login; affiliation verified at CCP; substitution is detectable." Resets are never auto-admitted.

#### Guest links

Guest links ship in M4, off by default. The fragment carries a **guest secret (GS)**, and the relay checks HKDF(GS, \['lgi/v1/guest-cap'\]) against a stored hash, so guests need no EVE account. Guests fetch projection snapshots over HTTP only: no socket, ops, history or location.

The projection key PK\_e = HKDF(GES\_e, \['lgi/v1/guest-proj', groupId, e\]) is one-way and re-wrapped each epoch to every active guest key. Snapshots exclude positions and tracking and refresh every 5-15 min. An Owner, a certified Manager or the bot signs them, chaining to an Owner fingerprint in the link.

Revoking deletes the capability and stops re-wrapping. The revoked guest still holds the current projection key until the next rotation, so revoking can also rotate at once. Sealed maps warn that guest links reveal chain topology.

### Sync model

Each room has a **server-sequenced total order**, deterministic versioned reducers and optimistic client rebase. There is no CRDT. The DO is a single-threaded serialiser, so the mapper's single-writer invariants (static claims, jump idempotency, collapse) carry over.

Each op travels in a CBOR frame with a plaintext header (room, epoch, kind, random 16-byte clientOpId) and an AES-256-GCM body. The body key comes from the epoch subkey plus a fresh 32-byte salt per message. A commit tag is checked in constant time before any decrypt, and the relay chains each accepted frame into a head hash.

The payload names the author character, device certificate, parent seq, seen head, STH hash, reducer version, datasets hash and intent. The author's DSK signs it together with the roomId, genesisHash, epoch, kind and clientOpId. Byte layouts are in Exact constructions; see Security engineering.

Payloads pad to power-of-two buckets from 256 B to 64 KiB. Reducers dedupe on (charId, clientOpId), so replayed frames fail, and re-sealing into another room or epoch fails the signature.

- **Rebase.** Local state is reduce(confirmed, pending). On an ack or foreign op the client advances confirmed and replays pending. Retries reuse the clientOpId.
- **Determinism.** Reducers read only relayTs, with observedAt clamped to \[relayTs − 120 s, relayTs\]. The engine bans Date, Math.random, Intl, localeCompare, I/O and WebCrypto.
- **Authorisation.** The DO checks only membership, role class, quotas, epoch and lease. Reducers check fine roles at seq; an invalid op becomes a deterministic rejection its author sees.
- **Upgrades.** A reducer version activates by a signed Owner or Manager commit at a future seq. Clients support N and N−1.

**Fork detection.** Clients recompute the head chain and compare peers' seenHead. A fork blocks writes in that room only, with a recovery playbook; one peer's bad seenHead flags only that peer. Every 100th seq yields a 4-word **map-head code** that members compare in game or on voice.

**Snapshots.** Writers offer one every 200 ops or 256 KiB, and at every rotation. A snapshot is **canonical** only if a Manager+ signs it or 2 DO-certified distinct accounts attest its stateHash. Otherwise it is provisional and shows an "unverified state" banner; online clients replay-check every snapshot.

**Retention and undo.** R2 keeps 30 days of op ciphertext, independent of snapshots (hourly for 48 h, daily for 30 days, plus Owner pins). This backs the audit view, undo, rollback and a Manager+ "revert ops by character X since T" intent.

**Offline.** Unreceipted intents persist in IndexedDB, show "N unsynced changes", and are re-sealed across epochs. `scan.apply` carries its paste revision, and delete-missing touches only signatures known at paste time.

### Standard tier

Standard is the same code path with one extra recipient: a per-group **escrow principal**. It is labelled everywhere "Standard: LGI can read and recover this". Protocol support lands in M3, including a property test that escrow never joins a Sealed genesis; the **Steward** ships in M7, committed but cancellable (OD-4).

- **Custody.** Each group's X25519 escrow private key is wrapped under that month's AWS Key Management Service (KMS) key, held only by the Steward, an isolated Worker.
- **Shredding.** Live escrow keys are re-wrapped monthly. A month key is deleted after its month, the 30-day backup window and the 7-day KMS wait: "unrecoverable within about 70 days of group deletion."
- **Powers.** The Steward rotates with log-derived recipients. For recovery a Manager+ may re-approve at once; otherwise the Steward re-wraps after 72 h unless an Owner or Manager vetoes. Each escrow open leaves a CloudTrail record and a Sigsum receipt.

| Standard unlocks | Never in Standard |
| --- | --- |
| Server tracker on a separate location-only grant, publishing only into Standard maps | Personal vault, character vaults, keyrings |
| Rotation, sweeps and compaction with no member online | Members' EVE tokens |
| Discord alerts; hosted corp agent | Nightly exact net-worth revaluation |
| Recovery re-wrap after losing every unlocker | Any key for a Sealed group |

**Leak accounting.** A Sealed map's badge counts members active in any Standard map: "N members also appear in LGI-readable maps". Sealed policy may forbid cross-tier tracking, enforced by honest clients and counted by the server.

- Clients warn before one character is tracked in both tiers.
- The server tracker self-declares in every map the character belongs to, Sealed maps included, so members see it.

**Conversion.** Standard to Sealed is a guided new genesis that shreds the escrow key and pre-approves members. Earlier history is declared LGI-readable, and invites and guest links are re-issued. **Sealed to Standard is impossible**, because the genesis tier is immutable.

### Room lifecycle

Room lifecycle ships in M3.

| Step | Who | Effect |
| --- | --- | --- |
| Archive | Any Owner, signed commit | Writes freeze; members notified; export prompt |
| Restore | Any Owner | Within 30 days of archive |
| Purge (automatic) | System | 30 days after archive |
| Purge now | Sole Owner at once; with 2+ Owners, a second signature or a 72 h vetoable wait | Immediate purge |

The purge Workflow deletes wraps first (the crypto-shred), then DO storage, R2 ops and snapshots, and the registry row. Honest clients wipe caches on the purge commit, and invites and guest links die. DO point-in-time recovery keeps only undecryptable ciphertext for up to 30 days; idle rooms are warned at 365 days, never auto-deleted.

## Mapper engine in the browser

Every mapper rule runs in members' browsers, inside **@lgi/engine-map**, so the relay's Durable Objects (DOs) order ciphertext and never compute anything about a chain. The pure TypeScript package turns decrypted ops in relay order plus pinned datasets into map state, a state hash and deterministic rejections. Frames, snapshots and rebase belong to Maps: membership, sync and tiers.

### What ports and what becomes reducers

Pure domain code ports. Convex mutations become reducers over a **MapStateRepo** interface (get, insert, patch, tombstone, ordered reads), with `ctx.db` replaced by the repo.

| Current code | Fate |
| --- | --- |
| src/data/maps: connection-hallway, chain-contract, connection-door-\*, connection-lifetime, movement-classification, chain-collapse, stub-accounting, scan-parse; src/data/eve-data/wormhole-contract.ts | Port; zod replaces Convex validators |
| hole-matching.ts, signature-eliminator.ts | Port; replace `localeCompare` at :148 and :228 |
| src/mapper/chain/reconciler.ts, src/mapper/layout/ | Port to the UI worker, outside reducers (positions are never shared, so floats are fine) |
| convex/lib/mapScanApply.ts, mapScanState.ts, mapScanSelection.ts | scan.apply, scan.confirmMissing, signature intents |
| mapScanElimination.ts, mapStaticClaim.ts | Derived steps inside other reducers |
| convex/mapJumpAuthoring.ts, mapJumpIdentity.ts | jump.observe, jump.confirmIdentity |
| mapAuthoringCollapse.ts, mapAuthoringTombstone.ts, mapAuthoringFields.ts, mapAuthoringHome.ts, mapAuthoringSweep.ts | sever, restore, field setters, setHome, sweep.lifetime |
| optimistic-authoring.ts, src/composition jump and elimination resolvers, wh\_observations, purge crons, Drizzle files | Dropped; resolver cases survive as tests |

### Determinism, IDs and ordering

A lint rule and a Fallow boundary keep reducers closed over their inputs:

- **Banned:** Date, Math.random, Intl, localeCompare, I/O, WebCrypto. The only allowed import is @noble/hashes sha256.
- **Signatures:** the client's verify step checks every signature and device certificate before an op reaches a reducer. Reducers receive the verified signer identity as data.
- **Math and order:** integers only (kg, ms); code-unit string comparison.
- **Time:** relayTs only. observedAt is clamped to \[relayTs − 120 s, relayTs\] for windows and never orders anything.

```
entityId = SHA-256(['lgi/v1/entity-id', clientOpId, intraOpIndex])
ordinal  = (seq, intraOpIndex)        // replaces Convex _creationTime
```

Ordinals replace every hidden use of creation order: firstSeenAt (mapScanApply.ts:264, :290), the seatOrderAt fallback (mapStaticClaim.ts:236) and `.first()` ties (mapConnectionLookup.ts:93-98). The implicit root at mapAuthoringCollapse.ts:116 becomes an explicit `rootSystemId`. The M3 exit needs the replay corpus (about 9.4k test lines) at 100% in three engines under et-EE, sv-SE and tr-TR.

### Pinned datasets and reducer versions

A Manager+ `datasets.pin` commit fixes the manifest hashes of geography, codex, statics and ship mass. Reducers use the pin active at each op's seq, and data.lgi.tools serves pinned versions forever. Each op's datasetsHash lets its author detect skew.

The active **reducerVersion** changes only through a signed Owner or Manager upgrade commit at a future seq. Ops claiming any other version are rejected, so one member cannot stall a room. Clients ship N and N−1; reducerVersion 2 (rV2, M4) adds structures and notes.

### Jump observation and dedupe

The poller numbers jumps locally, so LGI never learns when a character changes system. Each step runs without a per-jump server call.

1. The poller sees a new system; the previous fix must be under 45 s old (`JUMP_CONTINUITY_MS`).
2. It sets **transitionNo** to the pair (leaseEpoch, counter). leaseEpoch comes from the 30 s UserHub poller lease; counter is a local integer that restarts at each new epoch.
3. It sends a jump.observe op to each map where the character is tracked as Member+. Raw evidence travels in a separately sealed attachment.
4. The client's verify step checks the signing device signing key (DSK) signature and certificate. The reducer rejects a charId other than the certified one, then dedupes on (charId, transitionNo).
5. It re-runs classifyMovement and matchJump over the op body and pinned datasets, inside the 10-minute capture window.
6. It writes topology, mass or a "which signature?" prompt, then runs elimination.

```
jump.observe body (30-day log): {charId, from, to, shipTypeId, transitionNo, observedAt}
evidence attachment (R2):       sealed separately, referenced by hash, deleted after 24 h
```

The lease already guarantees one poller per epoch, so UserHub sees only lease changes. Those are disclosed as lease activity (see Metadata budget in Security engineering). Mass counts once per transition across lease handover:

- An op whose leaseEpoch is older than the newest accepted for that character is rejected, which drops a stale holder's late ops.
- A newer epoch's op that repeats the last accepted (from, to) within 45 s is a duplicate.

The body stays in the 30-day op log with every other op, so replay from any retained snapshot matches. An R2 lifecycle rule deletes evidence attachments after 24 h. Reducers never read the attachment, so deleting it cannot change replay.

### Scans, elimination, static claims and collapse

The relay's single order keeps today's serializable semantics.

| Rule | Behaviour at seq |
| --- | --- |
| scan.apply | Carries up to 256 rows and the signature IDs known at paste time; delete-missing touches only those. Rows past their death window go; the rest prompt the author. |
| Paste gate | Becomes a client warning; audit, undo and 30-day revert cover abuse |
| Elimination | Runs after paste, identify, setType and jump; provenance `assumed` |
| Static claims | One placeholder per static code, seated by ordinal; first claimant wins; respawns after tombstone |
| Sever, collapse | decideCollapse keeps components holding rootSystemId or a pilot. Presence unions each tracked character's latest jump.observe with attached signed location bodies under 2 ticks old. |

### Lazy lifetime expiry

Clients render expiry locally, including CCP's "<1 hour" state ([23.01](https://www.eveonline.com/news/view/patch-notes-version-23-01)) and "Reliable Lifetime"/"Expired" ([23.02](https://www.eveonline.com/news/view/patch-notes-version-23-02)). The first editor that sees latestAt plus 4 h pass sends `sweep.lifetime`, proposed at 32 connections per op at most.

The reducer checks deadlines against relayTs and is idempotent per (connectionId, latestAt). Client skew checks cap a relay's forward push at 5 min. Unopened maps need no sweep; snapshots compact tombstones.

### Limits

Caps are **genesis policy**, rejected deterministically. Tombstones no longer count.

| Limit | Today | Default |
| --- | --- | --- |
| Live systems / connections | 128 rows incl. tombstones | today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work |
| Scan rows per paste | 256 | 256 |
| Trackers per map / per account (DO-enforced) | 1,024 / 32 | 1,024 / 32 |
| Destructive ops | editor | Member, audited, undoable, rate-limited |

### Location publishing

**One poller per character:** Web Locks across tabs, a 30 s UserHub lease across devices, and preemption by fresher polls. The [char-location group](https://developers.eveonline.com/docs/services/esi/rate-limiting/) allows 1,200 tokens per 15 min (304 costs 1, 200 costs 2).

| Endpoint | Interval | Tokens per 15 min |
| --- | --- | --- |
| /location (If-None-Match) | Follows ESI Expires, 5 s floor; only while online | 180-360 |
| /ship (on a map) | Only on system change | Low (one read per system change) |
| /online | 60 s | 15-30 |

**Signed frames** are a fixed 256 bytes with a 156-byte padded body: charId, deviceCertId, systemId, location detail, shipTypeId, flags, observedAt and a DSK signature. Sender slots are per room, and frames are never persisted.

**Fan-out is one batch per tick.** Each character jitters uniformly in \[0, 1.5 s) after a relayTs-aligned tick. The DO keeps each sender's latest frame. It flushes one padded batch per socket when last tick's senders have reported or the first frame of the next tick arrives. It uses no timers, so it can hibernate.

The tick adapts: 5 s to 200 trackers, 10 s to 500, 15 s to 1,024. Sockets choose full, lite (15 s) or off.

| Load target (trackers × sockets) | Tick |
| --- | --- |
| 200 × 200 | 5 s |
| 500 × 500 | 10 s |
| 1,024 × 500 | 15 s |

Pass means p99 delivery under 1 s after flush, DO CPU under 50%, full hibernation eligibility and at most 11 KB/s per client at 200 trackers. On failure, the v1 cap drops to the largest passing size.

**Background honesty.** A dedicated worker shows "tracking degraded" and a gap prompt, and installing the progressive web app (PWA) is recommended. Tracking stops when no client is open, and the UI says so; always-on means the bot (M4), Tauri (M9) or the Standard tracker (M7, Standard maps only). M0 S3 is the go/no-go gate.

### Routes, kill feed and EVE-Scout

None of them tells LGI which systems a map watches.

- **Routes (M4):** local Dijkstra over gates, chain holes (filtered by life and mass) and Thera/Turnur. Optional ESI POST /route reveals connections to CCP. Multi-character waypoints use write\_waypoint.
- **Kill feed (M4):** a Worker reads [R2Z2](<https://github.com/zKillboard/zKillboard/wiki/API-(R2Z2)>) each minute into 15-60 s chunks kept 7 days. Clients fetch all (about 15,700 kills a day, estimate) and filter locally.
- **EVE-Scout:** data.lgi.tools mirrors [EVE-Scout](https://github.com/Signal-Cartel/EveScout) every 5 min.

### Importers and export

The LGI importer (M3) replays the old app's export as intents. Pathfinder, Wanderer, Tripwire, Nexum and WormholeSystems follow in M4, parsed in a worker under the caps. Export as encrypted bundle or plaintext JSON works any time.

### Mapper parity matrix

| Feature | Current app | Competitor baseline | Plan |
| --- | --- | --- | --- |
| Paste reconcile, delete-missing | Yes | YAWN, WormholeSystems, Nexum | v1 (M3) |
| Identify, remove/restore with undo | Yes | All | v1 |
| Elimination, static claims | Server resolver | YAWN, Nexum | v1 |
| CCP lifetime states | Stages only (under 1 day, 4 h, 1 h, expired) | New requirement | v1 stages; reliable lifetime is a new feature, later |
| Jump-log mass; rolling calculator | Mass only | WormholeSystems; Nexum | v1 |
| Auto-mapping, signature prompt, inbound K162 | First two | All; YAWN; Nexum | v1 |
| Collapse, lifetime expiry | Server cron | All | v1, lazy |
| Audit, revert, rollback | 7-day event log, 24 h undo | Wanderer | New feature, later: 30-day log with revert-by-character |
| Presence, pilot paths, coverage | Yes | All | v1 |
| Roles with expiry over char/corp/alliance | Char and corp | WormholeSystems, Wanderer | v1 char and corp; expiry and alliance grants are new features, later |
| Viewers untracked | No | Wanderer | Not adopted: viewers may track by default, as today |
| Personal maps, export | Lifecycle only | n/a | v1 |
| Set-waypoint, PWA | No | WormholeSystems | PWA v1; set-waypoint is a new feature, later |
| Command palette | Site search | WormholeSystems | v1 basic, M4 full |
| Routes with Thera/Turnur | No | WormholeSystems, Pathfinder CE | M4 |
| zKill feed, activity charts | No | Nexum, Wanderer | M4 |
| Structures, d-scan, local | No | Wayfinder | M4 |
| Notes (new, a later feature) | Schema only | Pathfinder | M4 |
| Guest links | No | WormholeSystems | M4 |
| Discord alerts | No | Wanderer, Nexum | M4 bot; M7 Steward |
| Five importers | No | Wayfinder | M4 |
| API | No | Wanderer | M4 bot; M9 SDK |
| Named ACLs, in-game Access Lists | No | Wanderer | Later |
| Bookmark templates, non-English paste | No | WormholeSystems, Nexum | Later |
| wh\_observations, server paste gate | Yes | n/a | Dropped |

## Personal and corp ESI data

Every live EVE Swagger Interface (ESI) token is held client-side, in the user's browser or the corp's own bot, and LGI stores only sealed copies, so LGI never fetches or reads personal or corp game data in plaintext. This follows rule S8: no live ESI-scoped bearer credential ever reaches LGI servers. The only exceptions are the two delegated grants in the Standard tier (see Standard tier in Maps: membership, sync and tiers).

### Token custody

Each character gets one Proof Key for Code Exchange (PKCE) Data grant per user, not per device. The refresh token is sealed in that character's **character vault**, a group that is always Sealed. It syncs between the user's devices through the UserHub Durable Object (DO) with version compare-and-set (CAS). Token custody ships in M3, because alpha tracking needs it.

#### Refresh serialization

EVE refresh tokens may rotate, so two parallel refreshes can lose one. Refreshes are serialized in two layers:

1. **Web Locks** serialize refreshes across tabs on one device.
2. A **UserHub lease** per character (30 s time to live) serializes them across devices. Lease health is the age of the last successful poll, and a device with fresher polls preempts the holder.

The lease holder refreshes, persists the newest token to the vault first, then shares the access token through the vault.

Failures use two-strike `invalid_grant` handling, a client-side circuit breaker and jittered backoff. A second strike marks the character disconnected and prompts re-attestation. An owner-hash change starts the transfer flow (see Identity, keys and devices).

#### Keep-alive, reconnect and kill switch

- **Keep-alive.** On every app open, the client refreshes any token older than 14 days. CCP's idle expiry is about 30 days (unconfirmed; M0 spike S2).
- **Reconnect wizard.** It runs the Identity and Data logins back to back for each character. It waits a random 30 s to 3 min between characters, and their key directory appends are jittered, to blunt alt correlation.
- **Kill switch.** The client fetches the kill switch and polling config from api.lgi.tools before any SSO call. The operator can halt or slow all browser ESI traffic, for example at CCP's request, but the switch carries no keys and reads nothing.

### Personal datasets

The browser fetches each dataset when it is stale and seals it per (character, part) in the character vault. Parts follow ESI routes: clones, implants, skills, skill queue, assets with names, wallet, orders, industry jobs, blueprints and roles. Wallet and orders are optional toggles.

- **ETags inside the ciphertext.** The stored record holds the ETag, so any of the user's devices can send `If-None-Match`, but LGI cannot see when data changed. This follows [CCP's ETag guidance](https://developers.eveonline.com/blog/esi-etag-best-practices).
- **Padding.** Large blobs go to R2 with Padmé padding, so sizes reveal little about holdings.
- **Jittered writes.** Non-urgent parts are written 0-10 min after the fetch, so write timing does not mirror play sessions.
- **Freshness config.** The current ESI dataset registry and freshness gates (about 520 source lines and 1,510 test lines) port as the scheduler's config, with their gate tests.

Location, ship and online polling share this scheduler but are owned by Location publishing in Mapper engine in the browser.

### Industry overlays

The industry engines are pure TypeScript and move to the core unchanged: the build tree, ME/TE rounding, fees, margin, market score and structure and rig bonuses. Their public inputs come in bulk from data.lgi.tools: blueprint bundles, modifiers, cost indices, adjusted prices and the daily price book. Bulk loading removes today's per-ID requests, which reveal build systems and blueprint interest.

| Private overlay | Today | New home | Validation |
| --- | --- | --- | --- |
| Production profiles | `industry_profiles` plaintext JSONB | Personal vault doc | Members checked against the keyring's own characters |
| Custom structures | `custom_structures` plaintext | Personal vault doc | Fit parsed in a worker against the SDE dataset |
| Favorites, recents, planner prefs | `preferences` table | Personal vault doc | None needed |
| Corp structure rigs and tax | `validateCorpStructureRigs` on the server | Signed CorpSpace record | Checked against the SDE dataset by the writer and by every reader |
| Skills, team skill levels, slots | Computed on the server | Computed locally from character vaults | n/a |
| Saved plans | `saved_plans` | Personal vault doc (kept) | n/a |

Personal vault docs use per-document revision CAS with field-level last-writer-wins. Their tags are opaque, HMAC(VMK, logicalKey), where VMK is the vault master key. Server-side validation becomes advisory and client-side, because the relay sees only ciphertext. A reader rejects any record that fails validation. P3 (around weeks 6-8) delivers this, with the exit test "no per-ID requests to LGI in the network log".

### Assets and net worth

Assets, planner asset detail and the home board are assembled locally from character vaults. Names come from the names dataset or from browser-direct `/universe/names`.

Net worth is computed **on open**. For each pilot, the client values the latest holdings, implants and optional wallet and orders at that day's price book. It appends the point to that pilot's Padmé-padded series in the pilot's character vault, then sums the series across pilots for display.

For days the app was not opened, it **backfills retroactively**. It values each pilot's last known holdings at each missed day's price book, and those points are marked as estimates in the chart. The price book is immutable per day and kept for 400+ days.

Because each series lives in its character vault, unlinking or selling a pilot shreds that pilot's history with the vault. The global sweep prices every marketable type, so `seedUnpricedTypes` and its ownership leak are gone.

Exact nightly values need the user's own always-on device. There is no Standard option, because personal data is never escrowed (rule S2).

### Lookups

LGI runs no name, structure or price proxies. The browser calls ESI directly for names, structure search, structure info, market history and routes. Structure lookups that tend to return 403 get a negative cache. CCP sees the search terms; LGI does not.

### Corp spaces

Corp spaces are part of v1 and gate GA and cutover (OD-2). They ship in P4 (around weeks 8-10). The exit test is the golden visibility suite plus revocation within one cache window.

#### Authority and pulls

Grant authority is a **Director's client** or a **corp agent bot** holding a Director-signed delegation. The bot's grant is a Director-delegated PKCE grant, run in the Director's browser and sealed to the bot (see Bot principal in Maps: membership, sync and tiers). One puller per dataset per cache window holds a **CorpSpace fetch lease**, so several Directors never pull the same 3,600 s window twice.

- A Director pulls `/corporations/{id}/roles` (scope 18), membertracking, the public HQ, divisions, assets with names, and blueprints.
- A Station\_Manager pulls structures and authors rigs and tax.
- A Factory\_Manager pulls jobs into one jobs bucket.

#### Local placement and grants

The puller runs the ported `placement`/`buildHoldingIndex` and `compileCorpGrant`/`canSeeHolding` locally. The current 378-line corp-visibility suite is the spec. Roles, HQ and bases never leave the puller's browser in plaintext.

#### Keys

A **bucket** is a sealed blob per (root location, division or Deliveries), plus a corp context bucket and the jobs bucket. An **access class** is one distinct eligibility set, such as "Hangar 3 at HQ"; most corps have fewer than 20 (estimate).

```
bucket content key  -> wrapped to each access-class key that grants the bucket
access-class key    -> HPKE-wrapped to each member's CEK_c,g, checked against a signed confirm tag
bucket write        -> signed with the bucket signing key (the DO verifies without knowing roles)
```

Here CEK\_c,g is the character encryption key, generation g. Per-member manifests are padded to one corp-wide size. Buckets use whole-blob CAS under the fetch lease. A member's first key needs a key-directory-verified, non-reset, attested binding, plus affiliation verified at CCP by the granting client. Resets need a Director's approval.

#### Rotation triggers

The next pull mints fresh class keys and re-issues wraps when:

- a member leaves the corp;
- a member's roles or base change;
- sharing is turned off, which is a crypto-shred.

Corp data refreshes every cache window anyway, so rotation costs little.

#### Audit, succession and re-genesis

Signed CorpSpace commits record sharing on or off, key minting, Directors added or removed, and re-genesis. The server keeps only a 90-day metadata log, replacing `corp_access_audit` and its 400-day plaintext retention.

A new Director is added when another key-holding Director verifies the role through `/corporations/{id}/roles`. Authored rigs and tax are mirrored to every Director. The UI warns when only one Director holds keys, or when grants are more than 6 h old.

If no key-holding Director is seen for 14 days, any Director whose client checked its own roles may propose a new genesis. Members accept it only if one of these holds:

1. A key-holding Director co-signs.
2. A fingerprint appears in the public corporation description, which only the CEO and Directors can edit (to be checked when the verified-in-game badge is built). Each member's browser reads it from ESI.
3. Each member confirms manually after an out-of-band check.

Old buckets are re-pulled from ESI, and invites and guest links bound to the old genesis die. Account deletion is blocked while the user is the last key-holding Director without a handover.

#### Stalls, stated honestly

Grants advance only while a Director, role-holder or agent is online. Revocation and new access lag up to about 1 h while a role-holder is online, and longer when none is. Large pulls run on desktop or the agent only, decrypted in a worker with columnar encoding. M0 spike S7 measures the largest-corp fixture on a mid-range phone.

### In-game Access Lists

Access List principals are deferred past GA. Scope 25 is registered in M0 and never requested until the feature ships. The fixed design has a list manager's client or the bot read the list every 300-3,600 s and append a signed `acl.sync` commit. The server mirrors the expansion as disclosed metadata, and lists stale for more than 24 h suspend their derived members.

### Background tasks without plaintext

| Task | Today | Sealed v1 | Plaintext seen by |
| --- | --- | --- | --- |
| Token refresh | `esi_refresh_jobs` drain | Lease holder's browser | The user's browser |
| Personal ESI refresh | Server cron with server tokens | Browser, on open and when stale | The user's browser |
| Net-worth revalue | Nightly cron over all users | On open plus estimated backfill | The user's browser |
| Corp pulls | Director token on the server | Director client or bot under fetch lease | Director or the corp's bot |
| Affiliation re-resolution | Daily server check | Hourly on api, public data only; emits system revokes | Public data |
| Private parts of `daily-batch`, Upstash ESI scoreboard | Server | Dropped | n/a |

Nothing runs when no client is open, except the bot on corp hardware and the opt-in Standard services.

### ESI scope table

All 24 Data scopes are registered on the Data app in M0 S2; the Identity app has none. Scopes are requested incrementally, per feature. Mail, contacts and any write scope except waypoint are never requested.

| # | Scope | Used by | Audience | Requested when |
| --- | --- | --- | --- | --- |
| 1 | none (Identity app) | Login, binding, re-attest | Identity | Always |
| 2 | esi-location.read\_location.v1 | Tracking, auto-mapping | Mapper | First "track" |
| 3 | esi-location.read\_ship\_type.v1 | Mass accounting, presence | Mapper | First "track" |
| 4 | esi-location.read\_online.v1 | Presence, poll gating | Mapper | First "track" |
| 5 | esi-ui.write\_waypoint.v1 | Destinations, multi-character waypoints | Mapper | First use |
| 6 | esi-search.search\_structures.v1 | Structure search, ACL typeahead | Personal | First search |
| 7 | esi-universe.read\_structures.v1 | Player-structure names | Personal | Personal link |
| 8 | esi-clones.read\_clones.v1 | Sheet, jump clones | Personal | Personal link |
| 9 | esi-clones.read\_implants.v1 | Sheet, net worth | Personal | Personal link |
| 10 | esi-skills.read\_skills.v1 | Industry factors, sheet | Personal | Personal link |
| 11 | esi-skills.read\_skillqueue.v1 | Sheet, board | Personal | Personal link |
| 12 | esi-assets.read\_assets.v1 | Assets, net worth, planner | Personal | Personal link |
| 13 | esi-wallet.read\_character\_wallet.v1 | Net worth | Personal, optional | Toggle on |
| 14 | esi-markets.read\_character\_orders.v1 | Net worth, sheet | Personal, optional | Toggle on |
| 15 | esi-industry.read\_character\_jobs.v1 | Jobs, slots | Personal | Personal link |
| 16 | esi-characters.read\_blueprints.v1 | Owned blueprints | Personal | Personal link |
| 17 | esi-characters.read\_corporation\_roles.v1 | Own role detection | Corp member | Enabling corp features |
| 18 | esi-corporations.read\_corporation\_membership.v1 | Grant engine: all members' roles | Director | Corp space setup (role and route: confirm when corp spaces are built) |
| 19 | esi-corporations.track\_members.v1 | Member bases | Director | Corp space setup |
| 20 | esi-corporations.read\_divisions.v1 | Division names | Director | Corp space setup |
| 21 | esi-assets.read\_corporation\_assets.v1 | Holdings, placement | Director | Corp space setup |
| 22 | esi-corporations.read\_structures.v1 | Structures, rigs, tax | Station\_Manager | Role-holder opt-in |
| 23 | esi-industry.read\_corporation\_jobs.v1 | Corp jobs bucket | Factory\_Manager | Role-holder opt-in |
| 24 | esi-corporations.read\_blueprints.v1 | Corp blueprints | Director | Corp space setup |
| 25 | esi-access.read\_lists.v1 | Access List principals | List manager | Deferred; when shipped |

The bot's tracking grant uses rows 2-4 only. Affiliation, names and IDs, routes, character bios, corporation descriptions, system jumps and kills, and market data need no scope.

## Server components and infrastructure

LGI runs seven server components on Cloudflare, Vercel, Neon and, for the M7 Steward, AWS KMS. Six never handle plaintext user content; the Steward, which serves Standard groups only, is the exception. Every component can be rebuilt from the public repo. In v1, Convex is the relay for sealed frames behind the transport interface; the Durable Objects (MapRoom, UserHub, CorpSpace) are the planned migration if Convex cost or fan-out requires it.

### Components

| Component | Host | Responsibilities | Storage | Sees | From |
| --- | --- | --- | --- | --- | --- |
| Shell, lgi.tools | Vercel, Next.js 16.3.4 | Landing, sites, market, public industry pages, changelog, docs, legal, security and disclosure pages, release verifier | None. Reads data.lgi.tools only | Public data | M1 |
| Control-plane API, api.lgi.tools | Worker (Hono 4) plus Neon via Hyperdrive, drizzle-orm 0.45.2 | Accounts, /bind and /attest, devices, sessions and relay capabilities, passkey ceremonies, unlock-wrap rows, room registry and ACL mirror, hourly affiliation re-resolution and system revokes, quotas, kill switch, dataset manifest, feedback, telemetry and CSP endpoints | Two Neon projects | Metadata | M2a |
| KeyDirectory DO | Workers | Key directory (KT) log and map, signed tree head (STH) alarm every 2 min, Sigsum submission, room-scoped lookups | DO SQLite | Commitments, metadata | M2b |
| Relay DOs, relay.lgi.tools | Workers, SQLite Durable Objects (DOs), R2 | MapRoom, UserHub and CorpSpace: sequencing, coarse ACL gate, wraps, invites, leases, location batching | DO SQLite plus R2 | Ciphertext, metadata | M3 |
| Data origin, data.lgi.tools | R2 plus CDN | Immutable signed datasets, STHs and proofs, JWKS snapshots, release manifests, kill-feed chunks, EVE-Scout mirror | Public R2 bucket | Public | M1 |
| Ops console, ops.lgi.tools | Worker behind Cloudflare Access | Metadata-only operator tools | Reads the control plane and Analytics Engine | Metadata | M4 |
| Steward | Isolated Worker (service binding) plus AWS Key Management Service (KMS) | Standard escrow, rotation, sweeps, server tracker, hosted corp agent | Third Neon project | Standard groups only | M7 |

No component sets a shared cookie. Authentication is a bearer token plus a device-key proof (see Identity, keys and devices). The API and relay accept CORS only from app.lgi.tools and from self-host origins registered per account.

### Neon projects and history windows

Neon sets the history window per project. That is why key material lives in its own projects with the window at 0.

| Project | Holds | History window | Notes |
| --- | --- | --- | --- |
| control | Accounts, bindings, device public keys, sessions, passkey public data, room registry, ACL mirror, quotas, kill switch, admin audit, 90-day corp metadata log | 1 day | Launch plan, 0.25-1 CU |
| key-wrap | Account root secret (ARS) wraps, keyring blobs, passkey and passphrase wraps | 0 | Hyperdrive query caching off, so a revoke takes effect on the next unlock |
| steward (M7) | Per-group escrow private keys under monthly KMS keys | 0 | Read only by the Steward Worker |

- A window of 0 [disables instant restore and Time Travel](https://raw.githubusercontent.com/neondatabase/website/main/content/docs/postgres/backup-restore/history-window.md). Losing the key-wrap project is covered by the user's recovery bundle, not by a restore.
- Neon keeps a deleted project recoverable for 7 days. Deletion claims therefore rest on crypto-shredding.
- Staging has its own set of projects with the same settings.
- Pick one Neon region at kickoff. It holds metadata and ciphertext key wraps.

### R2 layout

Object keys use random room, hub and bucket IDs, never EVE IDs. This is the proposed layout.

| Bucket | Prefix | Contents | Retention |
| --- | --- | --- | --- |
| relay (private) | `rooms/{roomId}/snap/` | Padded snapshots | Hourly for 48 h, daily for 30 days, plus Owner-pinned |
|  | `rooms/{roomId}/ops/` | Sealed op ranges | 30 days (lifecycle rule) |
|  | `rooms/{roomId}/guest/` | Guest projection snapshots | Latest per epoch |
|  | `hubs/{hubId}/blobs/` | Padmé-padded personal ESI blobs | Until replaced or deleted |
|  | `corp/{spaceId}/buckets/` | Corp bucket blobs, version CAS | Until re-pulled or shredded |
| relay-eu (`eu` jurisdiction) | Same prefixes | Rooms created with `eu` | Same |
| data (public) | `datasets/{name}/{sha256}`, `manifest/` | Content-addressed datasets, signed manifest | Immutable |
|  | `kt/`, `jwks/`, `releases/` | STHs, Sigsum proofs, witness cosignatures, JWKS snapshots, release manifests | Permanent |
|  | `killfeed/`, `evescout/`, `status/` | Kill chunks, Thera and Turnur mirror, ESI status | 7 days, latest only, latest only |

### Lifecycle Workflows

Cloudflare Workflows run every job that spans several stores. Each step is idempotent, and a daily reconciliation sweep finds orphans.

| Workflow | Trigger | Steps, in order |
| --- | --- | --- |
| Room purge | 30 days after archive, or purge-now (see Room lifecycle in Maps: membership, sync and tiers) | Wraps (the crypto-shred), DO deleteAll, R2 ops and snapshots, Neon registry row |
| Account deletion | Client request, after the client-side CCP revoke | Unlock wraps, keyring, UserHub deleteAll, character vaults, R2 blobs, Neon rows, KT tombstones, system revokes staggered over 0-24 h (step sleeps), socket closes |
| Escrow re-wrap (M7) | Monthly | Re-wrap live escrow keys to the new month's KMS key, then schedule deletion (7-day KMS wait) of every month key whose month ended more than 30 days ago |

### Public data pipelines

Every dataset is published as an immutable object listed in a signed manifest. Maps pin dataset hashes through a datasets.pin commit, so reducers see the same bytes everywhere.

| Dataset | Source and runner | Cadence |
| --- | --- | --- |
| Geography: systems, adjacency, gates, stations, security | SDE, GitHub Actions | On SDE change |
| Wormhole codex and effects | SDE plus curation | On change |
| Wormhole statics | [anoik.is](https://anoik.is/static/static.json) ingest, Pathfinder cross-check, review in ops | On review |
| Ship mass (dogma subset) | SDE | On SDE change |
| Universe and type names | SDE | On change |
| Blueprint bundles, structure and rig modifiers | SDE | On change |
| Cost indices, adjusted prices | ESI public, Worker cron | Daily |
| Daily price book (every marketable type, hub prices) | ESI orders, Fuzzwork fallback | Daily; immutable per day, kept 400+ days |
| System jumps and kills | ESI public | Hourly |
| W-space activity (90 days) | R2Z2 aggregate | Daily |
| Kill-feed chunks | [zKillboard R2Z2](<https://github.com/zKillboard/zKillboard/wiki/API-(R2Z2)>), Worker cron every 1 min | 15-60 s chunks, kept 7 days |
| EVE-Scout Thera and Turnur | [EVE-Scout public API](https://github.com/Signal-Cartel/EveScout) | 5 min |
| Sites catalogue and Sleeper NPC stats | Production export in M1 (drizzle/0006 seed plus production edits), then ops | On edit |
| ESI status | /meta/status | 5 min |

- The R2Z2 poller follows the feed's rules: 15 requests/s per IP, a 6 s wait after a 404, and a non-blank User-Agent. The feed averages about 15,700 kills a day. Clients filter chunks locally, so LGI never learns which systems a group watches.
- The price sweep covers every marketable type. seedUnpricedTypes is deleted.
- The CSP drops api.eve-scout.com; the core reads the mirror.

### Regions and jurisdiction

- Durable Object jurisdictions are `eu` and `fedramp` only. LGI offers `eu` as its one hard residency option, paired with the relay-eu bucket.
- Every other region uses a best-effort [location hint](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/durable-objects/reference/data-location.mdx) picked at room creation. A DO never moves after it is created.
- UserHub and CorpSpace use the default placement, which is near their first caller. Hub and corp blobs stay in the default relay bucket.
- DurableObjectIds are logged outside the jurisdiction. The `eu` promise covers MapRoom storage and the relay-eu bucket only, not UserHub, CorpSpace, KeyDirectory or Neon; the disclosure page says so. An `eu` map's members can therefore have character vaults and corp buckets outside the EU.
- DO point-in-time recovery (PITR) keeps 30 days of history. Whether data removed by deleteAll() can be recovered is undocumented (relevant only if the relay moves to Durable Objects), so deletion means destroying keys.
- Every deploy disconnects every socket, and clients resume from their last seq. The soft limit is 1,000 requests/s per object.

### Observability without content

- **Telemetry**: Workers Analytics Engine counts route templates only, with no characterId, query string or visitor ID.
- **Health metrics**: append rejections by code, rotationPending age, fork and divergence reports by client version, unlock failure classes, lease churn and CSP reports.
- **Logs**: Workers log the error class and route template only. No IP is stored in the API or relay databases, and CSP reports carry no PII.
- **Billing alarms** on every vendor catch hibernation being defeated early.

### Support tooling

- A diagnostics bundle that the user opts into, redacted locally and previewed before sending.
- A local replay CLI that reproduces reducer state from the user's own decrypted log.
- Feedback through api /feedback to Linear, with a preview and the page path excluded by default.
- Ops account lookup, freeze and suspend through system revokes, with no "view as user" and no reassignment of data. Every action is written to an append-only audit.
- Escrow-assisted support exists only for Standard groups, with Owner consent.

### Cost

This is the single cost table. The assumptions are 30% daily active users, about 2,250 concurrent trackers at 10k monthly active users (MAU), hibernation-eligible DOs and 1 KiB padded ops. All figures are estimates until the M0 S4 load spike and the M1 traffic counters measure them.

| Line item | 1k MAU ($/month) | 10k MAU ($/month) |
| --- | --- | --- |
| Workers Paid base | 5 | 5 |
| Relay requests and messages | 0-2 | 5-15 |
| DO duration | 0 | 0-5 |
| DO storage | 0 | 0-10 |
| R2 | 0-2 | 2-8 |
| **Cloudflare subtotal (relay-only)** | **5-9** | **12-43** |
| Neon (control plus key-wrap) | 5-20 | 20-45 |
| Vercel shell (Pro if ads make the site commercial) | 0-20 | 0-20 |
| **Total, Sealed v1** | **10-50** | **32-110** |
| Contingency: hibernation defeated by a bug | +15 | +200 |
| Standard extras (M7): KMS keys and Steward | +5-10 | +5-10 |
| Standard server tracker | 0.01-0.05 per character-month sharded (about 0.8 unsharded) | Same |

One-off costs, all estimates:

| Item | Cost ($) | When |
| --- | --- | --- |
| Device lab hardware | 1,000-2,000 | M0-M2a |
| macOS CI (standard runners on a public repo) | 0 | Ongoing |

## Security engineering

LGI.tools builds every key and ciphertext from native WebCrypto primitives bound to signed commits. The main remaining risk is the served code, which LGI detects for everyone and prevents only for WEBCAT and self-host users.

### Crypto primitives

The browser floor is Chrome/Edge 137, Firefox 130 and Safari/iOS 18.4. Below it, users get the public shell only.

| Purpose | Algorithm | Implementation | Native since |
| --- | --- | --- | --- |
| Signing (every Ed25519 key) | Ed25519 | WebCrypto `sign` | Chrome 137, Firefox 129, Safari 17 |
| Signature verification in engines and Durable Objects (DOs) | Ed25519, RFC 8032 strict | @noble/curves 2.4.0 | Pure JS, any engine |
| Wraps of the group epoch secret (GES) and account root secret (ARS); pre-shared-key (PSK) mode for QR links | Hybrid public key encryption (HPKE): DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM | `hpke` 1.1.7 over native X25519 | Chrome 133, Firefox 130, Safari 18.4 |
| Content, derivation, commit and confirm tags | AES-256-GCM, HKDF-SHA256, HMAC-SHA256 | WebCrypto | All floor engines |
| Synchronous hashing (reducers, DO critical sections) | SHA-256 | @noble/hashes 2.x | Pure JS |
| Passphrase stretching | Argon2id, m = 64 MiB, t = 3, p = 1 | hash-wasm 4.x in a worker | WASM |
| Post-quantum wraps (suite 2, later) | X-Wing (ML-KEM-768 + X25519) | @panva/hpke-noble 1.1.7 | Chrome 155 only |

HPKE Auth modes are never used. Structures are cborg 4.x strict deterministic CBOR, and signatures are verified over the bytes received. Public keys are encoded raw and private keys as pkcs8, never JWK.

### Exact constructions

```
subkey(e, kind) = HKDF(GES_e, salt="", info=['lgi/v1/subkey', groupId, e, kind], L=32)

# Op frame
frame     = [v, suite, kind, roomId, epoch, clientOpId(16), salt(32), nonce(12), commitTag(32), ct]
AAD       = SHA-256(['lgi/v1/op-aad', v, suite, kind, roomId, epoch, clientOpId, salt])
k_enc ‖ k_commit = HKDF(subkey(epoch, kind), salt, ['lgi/v1/aead', AAD], L=64)
commitTag = HMAC-SHA256(k_commit, AAD)                  # constant-time check before decrypt
ct        = AES-256-GCM(k_enc, nonce, pad(payload), AAD) # pad: power of two, 256 B..64 KiB
payload   = {charId, deviceCertId, parentSeq, seenHead, sthHash,
             reducerVersion, datasetsHash, intent, sig}
sig       = Ed25519_DSK(['lgi/v1/op', roomId, genesisHash, epoch, kind, clientOpId, payloadWithoutSig])

# Relay head chain
head_s    = SHA-256(['lgi/v1/head', head_{s-1}, seq, relayTs,
                     SHA-256(['lgi/v1/frame-hash', frame])])

# Epoch commit and key confirmation
C_e       = {groupId, e, prevCommitHash, cause, memberSet, memberSetHash,
             wrapsDigest, snapshotRef, actorCert}
confirm_e = HMAC-SHA256(HKDF(GES_e, ['lgi/v1/confirm', groupId, e]),
                        SHA-256(['lgi/v1/commit-hash', C_e]))
commit    = [C_e, confirm_e, Ed25519_DSK(['lgi/v1/commit', C_e, confirm_e])]
wrapInfo  = ['lgi/v1/wrap', suiteId, genesisHash, groupId, e, commitHash,
             recipientId, cekGen, cekFingerprint]

# Location frame, fixed 256 B, same salted per-message derivation
[header 24 | salt 16 | nonce 12 | commitTag 32 | padded plaintext 156 | GCM tag 16]
sig       = Ed25519_DSK(['lgi/v1/loc', roomId, genesisHash, epoch, tick, body])
```

DSK is the per-device, per-character signing key and CEK the character encryption key (see Identity, keys and devices). `lgi/v1/subkey`, `lgi/v1/commit`, `lgi/v1/commit-hash` and `lgi/v1/frame-hash` are registry entries this section adds.

#### Label encoding rules

- Every KDF info, signature input and top-level hash input is a labelled deterministic CBOR array. A MAC may take a 32-byte digest of one.
- Labels take the form `lgi/v1/<name>`. A changed construction gets a new label; a label is never reused.
- No string concatenation. Integers stay integers; keys, hashes and ids stay byte strings, never hex.
- The HKDF salt is empty unless named. Frame salts are generated inside the primitive, never by callers.
- Key-transparency commitments and values follow the same rule, under `lgi/v1/kt-commit` and `lgi/v1/kt-value` (see Identity, keys and devices).
- The registry lives in the protocol spec; a unit test checks labels are unique and call sites use its constants.

#### Key commitment

AES-GCM is not key-committing: a crafted ciphertext can decrypt validly under two different keys. Frames carry `commitTag`, derived alongside the encryption key and checked first, so a frame opens under exactly one key. The per-message salt also gives each frame a fresh key, so nonce collisions are harmless.

HPKE wraps are committed differently: each is DSK-signed, names its commit, and its GES must reproduce `confirm_e` before first use. This stops a server forging an epoch secret for a joiner.

#### Post-quantum plan

Version 1 uses suite 1 (DHKEM-X25519), and every wrap and frame carries a suite id. X-Wing becomes suite 2, an M9 track, when one of these happens:

- A second engine ships native X-Wing.
- The RFC is published.
- @noble/post-quantum is independently audited.
- Quantum timelines shorten.

Only [Chrome 155](https://raw.githubusercontent.com/chromium/chromium/155.0.8059.36/third_party/blink/renderer/platform/runtime_enabled_features.json5) ships native X-Wing; Firefox has ML-KEM in Nightly only, without X-Wing, and Safari 27 has none. Migration happens at epoch rotation, once a member's sigchain advertises a suite-2 key. Until then, recorded wraps are exposed to harvest-now-decrypt-later.

### Non-extractable keys, per browser

Generated device keys are never exposed to page JavaScript as bytes, but the browser keeps them in the profile. Keyring keys, HKDF-derived seeds and unwrapped GES exist as raw bytes in the crypto worker during import. Non-extractable stops script export; it does not stop a copied profile, or injected code, from using them.

| Engine | Native non-extractable Ed25519/X25519 | Storage durability | Private window | Suite-2 private keys |
| --- | --- | --- | --- | --- |
| Chrome/Edge 137+ | Yes | Evictable unless `persist()` | In memory, about 5% quota | Native from 155 |
| Firefox 130+ | Yes | Evictable unless `persist()` | Encrypted IndexedDB; OPFS file I/O blocked | JS memory |
| Safari/iOS 18.4+ | Yes | Tracking prevention (ITP) wipes storage after 7 days without interaction; Home Screen apps reportedly exempt; `persist()` effect open (truth check 4) | Ephemeral | JS memory |

Keys live only in IndexedDB, never OPFS. Private windows always get the session device class.

#### Safari quirks

- **JWK bugs before Safari 26** broke Edwards-curve JWK import and export, so LGI uses raw and pkcs8 only.
- **Randomized Ed25519.** Safari's [hedged signatures](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SubtleCrypto.json) verify but differ per call. Vectors compare by verification, and no id or dedupe key derives from signature bytes.
- **X25519 arrived in 18.4**, which sets the floor. Hybrid passkey enrolment from iOS 18.0-18.3 is blocked because passkey PRF outputs differed there.

### Code integrity

| Layer | Mechanism | What it gives | When |
| --- | --- | --- | --- |
| L0 | Static core on its own origin and WebAuthn RP ID, app.lgi.tools | Isolation from the shell | M2a |
| L1 | Content security policy (CSP), Trusted Types, subresource integrity (SRI), `Integrity-Policy` (Chrome 138, Firefox 145, Safari 26) | Blocks injected script | M2a |
| L2 | Reproducible build, Sigstore attestation, WEBCAT manifest, Sigsum signature | Public, checkable releases | M2b |
| L3 | [WEBCAT](https://github.com/freedomofpress/webcat) enrolment | Prevention for Firefox users with the extension | Staging M2b; production after GA |
| L4 | Service-worker pin plus a Sigsum-proof check per release | Detection: amber if the log is unreachable, red on a verified mismatch; trust on first use, reset by Safari eviction | M8 |
| L5 | Self-host bundle; Tauri later | Prevention: the user controls updates | GA; Tauri M9 |

The corrected core CSP, byte-identical on every response including 404s:

```
default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' https://images.evetech.net; font-src 'self'; manifest-src 'self'; connect-src 'self' https://api.lgi.tools wss://relay.lgi.tools https://data.lgi.tools https://esi.evetech.net https://login.eveonline.com; worker-src 'self'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types lgi-workers; report-to csp
```

- No nonces or inline code, as [WEBCAT's CSP rules](https://github.com/freedomofpress/webcat-spec/blob/main/csp.md) require. `'wasm-unsafe-eval'` exists for Argon2id.
- The one Trusted Types policy, `lgi-workers`, only creates script URLs for hashed worker assets.
- api.eve-scout.com is dropped; data.lgi.tools mirrors EVE-Scout and serves Sigsum proofs.
- Any CSP or Trusted Types violation fails e2e.

#### Release process

1. CI builds from the public repo with exact pins, vendored dependencies, no install scripts, `SOURCE_DATE_EPOCH` and clamped mtimes. Anyone can rebuild and compare.
2. CI writes a WEBCAT-format manifest: every path's SHA-256, the CSP and WASM hashes.
3. [actions/attest-build-provenance](https://github.com/actions/attest-build-provenance) records Sigstore provenance on the public-good instance, which needs the public repo (lgi-tools is already public).
4. The owner signs the manifest with the Sigsum release key on a hardware token: 1-of-1 with break-glass, then 2-of-N.
5. The Sigsum entry is published before deploy. Only CI holds deploy credentials; the owner's machine has none.
6. The watch Action and clients alarm on any served manifest that is not logged.

Bot images and emergency fixes use the same pipeline. WEBCAT rollback is rehearsed before production enrolment.

### Metadata budget

The server sees who, when and how much: account links, membership, timing, padded sizes and presence. It never sees map content, positions, ESI data or tokens. The full list, including third parties and items not yet built, is the "Metadata the server sees" table in the reference section, which is the single source for the published disclosure page.

### Abuse controls and quotas

The relay cannot read ops, so it enforces only identity, role class, size, rate and count. Content rules move into reducers, which reject deterministically.

| Control | Limit | Enforced by |
| --- | --- | --- |
| Write gate | Session plus device proof, non-revoked member, role class, current epoch, rotation lease | DO |
| Op size | Padded bucket at most 64 KiB; location frame exactly 256 B | DO |
| Tracking | 1 frame per sender per tick; 32 characters per account per map; 1,024 per map | DO |
| Write rate | Per account and device per room; starting values read from the Convex bill and usage logs | DO, Cloudflare Rate Limiting |
| Map caps | today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work | Reducers |
| Destructive ops | Member role, with audit, undo and per-member rate limits | Reducers |
| Unauthenticated paths | Link registration (5 min, single use), guest fetches | Edge, per IP |
| KT lookups, invite blobs | Session plus capability; per-account and per-IP rate limits | API, DO |

Managers can revert a character's ops or roll back a snapshot. Only Manager-signed or twice-attested snapshots are canonical, so junk ops cannot push good ones out. The ops console freezes rooms only through removal-only system revokes.

### Crypto assurance plan

| Activity | Scope | When |
| --- | --- | --- |
| Cross-engine vectors | HPKE across implementations, strict Ed25519, Wycheproof-style X25519 cases, pkcs8 seeds; 3 engines plus real Safari | M0 S6; M2a exit |
| Lifecycle property tests | fast-check key lifecycle against an adversarial server and a thief | M2b onward |
| Deterministic simulator | N clients plus Miniflare DOs; faults, malicious relay and malicious members | M3; alpha exit |
| ProVerif models | Device link and recovery (M2b); join and rotation (M3) | M2b-M3 |
| Tamarin models | Compromise revoke versus a thief plus colluding server, vetoes, fork rule, split view | M2b-M3 |

The models must show forged wraps rejected, stale heads refused, split views detected, no veto deadlock, and no server-started grant. Agent review passes close each phase (see Rebuild plan); a paid external audit is optional later.

## User experience flows

The everyday path costs zero or one tap; friction sits only where a key changes hands: enrolment, new devices, recovery and admission.

Each flow names its **friction** (what the user pays) and **risk** (what can go wrong). Key constructions live in Identity, keys and devices.

### Account and devices

#### First login and securing the account

1. The app probes the browser. Below Chrome/Edge 137, Firefox 130 or Safari/iOS 18.4, the user gets the public site; in-app webviews get an "open in your browser" nudge.
2. "Trust this browser?" Yes makes a trusted device; no makes a session device.
3. EVE SSO login with zero scopes. The browser generates the account keys and binds the character.
4. Passkey offer: create, then one test sign-in that proves unlock works.
5. Recovery kit: save it, then type back 4 groups. It is mandatory within 24 h, and before any EVE token or authored data is stored (OD-17).

Friction: two passkey prompts and the kit; data scopes come later, per feature. Owners, Managers and Directors must hold both a passkey and the kit.

#### Returning login

1. Trusted device: open the app and it unlocks with zero taps. It needs the network, because the wrapped unlock key is fetched each time.
2. Anywhere else: one passkey tap, then an offer to trust the browser.
3. **High-security mode**, strongly prompted for shared-map Owners, Managers and Directors (OD-12): no stored unlock key, one tap per browser session.

Risk: an infostealer that copies a zero-tap profile gets the account, and the toggle says so.

#### New device

1. With a synced passkey, tap it.
2. Without one, choose "Link with QR". The new device shows a code valid for 5 min, once.
3. Scan it on an unlocked device and confirm that both screens show the same 6-digit code.
4. Every device gets "New device linked. Not you? Compromise revoke." This backstops users who confirm without comparing.

#### Incognito and session devices

1. Answer "no" to "Trust this browser?", or use a private window.
2. Unlock by passkey tap or QR link (friction: once per session).
3. Nothing persists. The session expires and never triggers a key rotation.

#### Safari 7-day eviction

[Safari deletes script-writable storage](https://webkit.org/tracking-prevention/) after 7 days of Safari use without a visit. Home Screen web apps are exempt.

1. The app finds its device keys gone and treats the browser as new: passkey tap or QR link.
2. The old device stays in Devices with its last-seen date, for a tidy-up revoke.
3. The code-integrity pin also resets to trust on first use.

The app calls `navigator.storage.persist()` and recommends Add to Home Screen. Whether persist() exempts the origin is unknown until M0 S5 (truth check 4), so the copy promises nothing.

#### Lost passkey, lost devices, lost kit

| Situation | Path back | Delay | What is lost |
| --- | --- | --- | --- |
| One passkey lost | Trusted device adds a new passkey, then removes the old one | None to add; 24 h, announced, to remove | Nothing |
| All devices and passkeys lost, kit in hand | Enter the recovery key | 48 h (OD-5) | Nothing |
| LGI's database also lost | Recovery key plus the latest recovery bundle | None: the bundle opens locally with the recovery key | Keyring changes since the bundle (offered monthly) |
| Every unlocker lost | Start a new identity | n/a | Sealed personal data; data from EVE's API (ESI) is re-fetched; maps re-approve you as a reset |

Type the recovery key only on app.lgi.tools or your corp's signed self-host build. Self-host accounts should recover on their own build, or they lose the prevention described under Self-hosted frontend users. Every device is notified, and only an account proof (passkey or recovery key) can veto.

If theft is suspected, the user runs **compromise revoke** instead: an account proof plus a fresh EVE login per character. It is immediate, devices cannot veto it, and old passkeys are retired.

### Maps and membership

#### Creating a sealed map

1. Pick personal or shared. Personal maps state "Only you can recover this."
2. Defaults: Sealed, strict joins, history for Managers and above, guest links off.
3. Pick a region. `eu` is the one hard residency option; others are best-effort hints, fixed at creation.
4. A shared map cannot leave setup without 2 Owners on distinct accounts, or an Owner plus a Manager with transfer rights.

Friction: step 4 needs a second person. The copy calls it "continuity guidance, not an anti-collusion guarantee".

#### Invite link join

1. A Manager creates `#/join/{secret}` with role, expiry, use count and optional pre-authorised characters. The fragment never reaches LGI.
2. The joiner logs in. The relay releases the invite only to a character on the map's access list or pre-authorised.
3. The joiner's browser checks the Owners in the **key directory (KT)**, then sends a signed join request.
4. On strict maps the request waits for approval. Once admitted, the joiner gets the current snapshot, not history.

Risk: a leaked link alone admits nobody.

#### No-link join

1. An eligible character sees the maps shared with its corp or alliance, with their Owners.
2. Its browser verifies the Owners in KT and checks their affiliation directly at CCP.
3. The joiner confirms the Owners before anything is sent. Tracking stays off until a Manager approves.

#### Admin approval and fingerprint check

1. The pending queue shows each character's safety number, KT status (established, new or reset), CCP affiliation, attestation age and any in-game badge.
2. Bulk approve handles onboarding: "Approve 23 pending: non-reset, CCP-verified."
3. Resets show red, are never auto-admitted, and stay contestable for 7 days.
4. **Verified in game:** the joiner puts a fingerprint phrase in their public character bio, and the approver's browser reads it from ESI. It is the only binding CCP itself anchors, so it is recommended for Owners and Directors (to be checked when the verified-in-game badge is built).
5. Members can compare a 4-word map-head code on voice to catch a forked relay.

ESI caches character bios for up to 24 h and corp descriptions for 1 h. Set the phrase ahead of time, at recruitment; after a key reset, a stale bio can show the old phrase for up to a day. The badge shows the bio's fetch age and is not a mid-op option.

Friction: strict approval slows mid-op joins (OD-1); auto-admit is opt-in.

#### Being removed

1. A Manager removes the character, or the system does after affiliation loss, sale or biomass.
2. Sockets close at once; a new epoch key follows within 60 s (M3 exit target).
3. The user sees the cause and "You keep what you already saw. You cannot read new changes."
4. Rejoining the corp within 7 days of affiliation loss re-admits automatically, to the pinned key only.

#### Corp Director leaving

1. The departure makes the next corp pull mint fresh access keys.
2. Warnings show when only one Director holds keys. The last one cannot delete their account without a handover.
3. After 14 days with no key-holding Director, any Director may propose a new genesis. Members accept it on a co-signature, a fingerprint in the public corporation description, or a manual check.

The corporation-description option lags by up to 1 h, because ESI caches that field for 3,600 s.

#### Standard-to-sealed switch

1. An Owner starts a guided new genesis with members pre-approved.
2. The escrow key is shredded; earlier history stays labelled LGI-readable.
3. Invites are re-issued. Sealed to Standard is impossible.

### Special users

#### Multi-character users and opsec alts

- Each character has its own identity keys, so peers cannot link alts cryptographically.
- Per-character certificates are made on first use; KT updates jitter by 0-6 h and reconnects by 30 s to 3 min.
- A coverage view shows which characters are live; an account tracks at most 32 per map.
- An account block filters only future joins, so the map log never shows linkage.
- Your client never counts your own alts as a second Owner.

Copy discloses that timing correlation is reduced, not eliminated, and that LGI's control plane knows which characters share an account.

#### Self-hosted frontend users

Self-hosting prevents malicious app code only for accounts that never unlock on app.lgi.tools. Any unlock there puts the **account root secret (ARS)** into LGI-served code, and the recovery key would expose every key derived from it.

1. The corp serves the static bundle (Caddy image or tarball, at GA) with its own CCP apps.
2. The corp registers its origin once per install, so LGI's API and relay accept it for every member (see Components and origins).
3. New members enrol directly on the corp origin: first login, passkey and recovery kit all happen there. Devices show as "self-host:\<origin>".
4. Passkeys bind to the corp origin. Further browsers join by passkey or by QR from another device on the same origin.

Accounts that already use app.lgi.tools take a **move to self-host** step:

1. Link a browser on the corp origin by QR from an existing device, then add a passkey there.
2. From the corp origin, rotate ARS, each **character identity key (CIK)** and **character encryption key (CEK)**, and the recovery key; print the new kit.
3. Revoke every app.lgi.tools device and remove its passkeys.

Risk: data sealed before the move stays readable to anyone who captured the old keys. Rotating the recovery key takes the 24 h account-proof delay (see Identity, keys and devices).

Self-hosters who keep off app.lgi.tools get prevention against malicious app code; everyone else gets detection.

#### Tracking degraded and gap prompts

1. Tracking runs only while a client is open, and the map says so.
2. When polls stall, as in a throttled hidden tab, the character shows "tracking degraded".
3. A jump with no known connection raises "Gap detected: which signature?"
4. The app recommends installing the PWA, and offers a bot (M4), the desktop app (M9) or, for Standard maps only, the Standard tracker (M7) for always-on tracking.

Hidden-tab polling under EVE fullscreen is a go/no-go spike (M0 S3).

### Trust-tier badges and copy

Copy states what LGI can do, never "secure". "Attested" is reserved for a possible enclave tier and never shown.

| Badge or banner | Copy | Shown when |
| --- | --- | --- |
| Sealed | "Sealed: LGI stores only ciphertext and metadata, and cannot add itself or anyone else to a group." | Every Sealed map and space |
| Standard | "Standard: LGI can read and recover this." | Every Standard map, wherever it appears |
| Cross-tier | "N members also appear in LGI-readable maps." | Sealed map with Standard-active members |
| Auto-admit | "Trusts LGI's key directory at first login; affiliation verified at CCP; substitution is detectable." | Maps with auto-admit on |
| Bot | "Bot sponsored by \<character>." | Bot members |
| Unverified state | "Unverified state" | Snapshot neither Manager-signed nor attested by 2 distinct accounts |
| Code check | Amber: log unreachable or watch data over 24 h old. Red: verified mismatch. | Code pin or KT check |

## Pressure-test findings

The design went through two adversarial rounds, and every finding now has an answer. All 101 verification items map to a decision in the Detailed spec tab; 4 are deferred with a fixed design, all about Access Lists (D-ACL-1).

The 20 path reviews (4 paths, 5 lenses each) raised 41 fatal flaws and 257 serious issues, folded into the 30 themes below. The 3 verification passes over the panel's first synthesis raised 60 problems and 41 missing items. All 3 concluded "does not hold up" before the fixes.

The worst were two critical crypto problems that the first synthesis missed. A malicious relay could hand a joiner a **group epoch secret (GES)** it chose, because join wraps were unauthenticated. It could also add its own key to a rotation by supplying the recipient list.

Behind those sit the four critical review themes: code delivery as the trust root, server key substitution, Standard leaking into Sealed, and alt-graph exposure.

### Findings and answers

Crypto check, Fact check and Completeness check are the three verification passes; the other lenses come from the path reviews.

| # | Finding | Lens | Severity | How the final design answers it |
| --- | --- | --- | --- | --- |
| 1 | Relay forges a GES for a joiner: join wraps, history blobs and guest keys carry no key confirmation | Crypto check | critical | Signed confirm tag on every epoch, genesis included; every key object is signed by its wrapper and checked before first use (D-GRP-2) |
| 2 | Rotation recipients come from the Durable Object (DO), so the server can insert its own key | Crypto check | critical | Recipients are reduced from the signed membership log only; the DO's list is a mismatch alarm, never an input (D-GRP-3) |
| 3 | Whoever serves app.lgi.tools, or compromises CI, DNS, Cloudflare or npm, can ship key-stealing code | Security | critical | Accepted; integrity layers L0-L5 and published "detection, not prevention" wording (D-INT-1, D-TRUST-3) |
| 4 | LGI-signed bindings let the operator bind its own key to a dormant corpmate | Security | critical | First binding needs a CCP Identity JWT with a single-use jti; Sigsum-witnessed key directory (KT); strict human approval by default (D-KT-4, OD-1) |
| 5 | One member's Standard vault or escrow exposes their tokens and keys to LGI inside Sealed maps | Security, UX | critical | No user-level secret is escrowed in any tier; Standard escrow is per group; Sealed badges count members active in Standard maps (D-TRUST-1 S2, D-STD-6) |
| 6 | User-level keys or a public key log reveal which characters share one owner | EVE ops, Security | critical | Per-character identity keys; KT holds salted commitments only; non-urgent events jittered; control-plane linkage disclosed (D-KT-6) |
| 7 | CCP JWTs bind no key; live JWTs in KT leaves are replayable; LGI anchors retired CCP signing keys | Crypto check | high | No bare-JWT login; Sigsum freshness bound of iat + 35 min; "jti already bound" is a red alarm; witnessed JWKS archive (D-KT-4, D-KT-5) |
| 8 | Device certificates and key rotations sit outside KT, so the server can freeze or roll them back | Crypto check | high | Sigchain head lives in the KT leaf; peers need a proof against a signed tree head no older than 15 min (D-KT-2) |
| 9 | Compromise revoke defeats itself: a thief vetoes during the cooldown, and the recovery key cannot follow a root-secret rotation | Crypto check, Fact check | high | Account proofs with no device veto; the recovery key derives a recovery keypair and per-character recovery anchor keys whose signatures win forks (D-KEY-PROOF, D-KEY-REVOKE) |
| 10 | An infostealer copying a zero-tap profile gets the account | Security | high | High-security mode prompted for Owners, Managers and Directors; compromise revoke rotates every user key and retires passkeys (OD-12) |
| 11 | Per-account Block reveals alts; 2-attestation and 2-Owner rules are Sybil-able | Crypto check, Fact check | high | Account block filters future joins only; distinctness is DO-certified and labelled as relay trust (D-MEM-BLOCK, D-SYNC-6) |
| 12 | Auto-admit trusts LGI's affiliation data; no-link join re-opens genesis substitution | Crypto check | high | Admitting clients check affiliation at CCP; joiners confirm KT-verified Owners before sending any data (D-MEM-ADMIT, D-MEM-NOLINK) |
| 13 | Remove-and-rotate is described both as one atomic step and as two | Fact check | high | Atomic removal unit, then a separate rotation by compare-and-set on epoch under a 30 s lease (D-GRP-4, D-GRP-5) |
| 14 | Reducer nondeterminism (localeCompare, 23 Date.now calls, unpinned datasets) forks replicas | Feasibility | high | Determinism lint; pinned datasets; replay corpus at 100% across 3 engines and 3 locales in M3 (D-SYNC-5) |
| 15 | A malicious relay partitions removals, withholds rotations or skews relay time | Security | high | Hash chain with skew checks; old-epoch appends refused while rotation is pending; map-head codes (D-SYNC-4) |
| 16 | Browser tracking is throttled while EVE runs fullscreen | EVE ops | high | M0 S3 go/no-go on real hardware; bot, Tauri or Standard tracker for always-on (D-LOC-7) |
| 17 | 11-14 deployables are too much for one developer | Operability | high | Phased plan: alpha around week 6, cutover around week 10-14 (estimates); Standard post-GA and cancellable (D-PLAN, OD-4) |
| 18 | Incident response is blind once logic lives in browsers | Operability | high | Content-free health metrics, a redacted diagnostics bundle, a replay CLI, fork-scoped write blocks (D-SYNC-4) |
| 19 | CCP SSO and ESI behaviour is observed, not contractual | Operability | high | M0 S2 spike, a written query to CCP, kill switch fetched before any SSO call (truth check 2) |
| 20 | A novel protocol from one developer has no funded review | Security | high | ProVerif and Tamarin models in P1-P2; agent review passes each phase; paid audit optional later |
| 21 | The scope list omits scopes, including the one the Director grant engine needs | Completeness check | high | 25-row scope table; all 24 Data scopes registered in M0 (D-SCOPE) |
| 22 | Character sale and biomass are never re-checked after first binding | Completeness check | high | Silent re-attestation every 14 days with expired JWTs; suspension after 21 days (D-KT-9) |
| 23 | Access List principals need a private scope the server cannot hold | Completeness check | high | Deferred until 2 or more beta corps ask; design fixed (D-ACL-1) |
| 24 | Device churn and affiliation false positives cause rotation storms | Operability, UX | medium | Session devices and tidy-up revokes never rotate; affiliation loss rotates once, with automatic re-admit to the pinned key within 7 days (D-GRP-7) |
| 25 | Unsigned location frames and per-tick alarms allow spoofing and defeat hibernation | Security, Feasibility | medium | Signed 256-byte frames; no DO timers; adaptive 5/10/15 s tick (D-LOC-4, D-LOC-5) |
| 26 | Awaits inside DO commits interleave and fork the chain | Feasibility | medium | One synchronous transaction, no awaits, synchronous hashing, flood tests (D-GRP-4) |
| 27 | A departed sole Owner or last Director orphans a space | UX, EVE ops | medium | Distinct-account Owners, k-of-n Manager succession, corp re-genesis anchored in the public corp description (D-MEM-OWN, D-CORP-8) |

### Residual risks the owner accepts

- **Code delivery.** Web users without WEBCAT or self-hosting get detection of a malicious build, not prevention.
- **First-login trust.** Key substitution for an active character is detectable as a reset or red alarm, not prevented.
- **Control-plane metadata.** LGI sees account-to-character links, the membership graph and ACL principals (all disclosed in the published metadata budget).
- **Relay trust for distinctness and availability.** The DO certifies distinct accounts and can deny service.
- **Timing correlation.** Jitter reduces alt linkage between characters but does not eliminate it.
- **Unlocked-key misuse.** XSS can use unlocked keys as an oracle, and an infostealer can take a zero-tap profile.
- **Loss and retention.** Removed members keep what they decrypted, and losing every unlocker loses Sealed data.
- **Tracking gaps.** Sealed tracking stops when no client, bot or desktop app is open.

## Rebuild plan

The rebuild is built by the owner with Claude Code agents, in the existing repo, at the pace the current app was built: hundreds of merged pull requests in weeks, not months. The estimate is about 10-13 weeks from kickoff to cutover, with a sealed mapper alpha around week 5-6. The bottleneck is not code: it is real-device passkey testing, Safari, and one or two corps using the alpha.

&#91;embedded content: rebuild timeline · 6 phases, weeks from kickoff (estimates)\]

Each phase promotes to staging and closes with an agent review before the next starts. A 20% buffer moves cutover to around week 12-14.

### Milestones

Each phase ends with a promote to staging and an agent review pass before the next starts. Durations are estimates for one owner directing parallel agents.

| Phase | Scope | Exit criteria | Weeks (est.) | Ends around week |
| --- | --- | --- | --- | --- |
| P0 Checks and hardening | The few truth checks the code cannot answer (below); workspace setup in the repo; remove plaintext Convex token leases; trim telemetry and Speed Insights; stop caching private rows; data export; ship statics and names as whole datasets | `pnpm verify` green; export round-trips; no per-ID public lookups left | 1-1.5 | 1.5 |
| P1 Crypto, identity, devices | Crypto package with cross-browser test vectors; account root secret, passkey and recovery-key unlock; device sessions; per-character keys; key directory with signed tree heads published by the public watch Action | Unlock flows pass e2e on a virtual authenticator; vectors pass in Chromium, Firefox and WebKit; owner tests on real devices | 2 | 3.5 |
| P2 Sealed mapper | Reducers ported from the Convex mutations using the existing replay corpus; sealed frames over Convex; membership, invites, strict approval, rotation; browser ESI polling with the current policy; character vaults; map import | Replay corpus at 100%; one corp maps a real op for a week with no divergence alarm | 2.5 | 6 (alpha) |
| P3 Personal vault and industry | Vault documents (profiles, custom structures, preferences, saved plans); per-character datasets; board; net worth on open with backfill; industry overlays | Planner and board parity; no per-ID requests to LGI | 1.5-2 | 8 |
| P4 Corp spaces | Director pull, local grant engine, access-class keys, buckets, succession | Corp-visibility golden tests match (updated on purpose for Director-sourced roles) | 2 | 10 |
| P5 Integrity and cutover | Service-worker release check; self-host bundle; WEBCAT enrolment on staging; migration of remaining maps; decommission of plaintext stores | All active maps migrated or abandoned; old keys destroyed | 1-2 | 10-12 (cutover) |
| Later, on demand | Standard tier; new features (routes, Thera/Turnur, zKill, Discord alerts, alliance grants, notes, guest links, importers); bot device; Durable Objects relay if Convex cost demands | Each ships when asked for | — | — |

A 20% buffer puts cutover around week 12-14.

### Truth checks the code cannot answer

Most earlier "spikes" are answered by the current code (see Open questions). Four checks remain, each a day or less:

1. **Hidden-tab polling.** Does a browser poller keep a useful cadence with EVE fullscreen on Windows Chrome and Edge, Firefox and macOS Safari? Today's server poller hides this. If it degrades badly, the bot device moves into P2.
2. **Public-client refresh and revoke.** Refresh with client id only from the browser (PKCE public client), and whether revoke accepts a public client.
3. **Browser CORS on the compatibility-date header.** It is a custom header, so it triggers a preflight; confirm ESI allows it.
4. **Passkey PRF on the owner's own devices.** Check which providers return PRF; the recovery key stays mandatory either way.

### Reviews

There is no paid external audit in the plan. Each phase closes with agent reviews: the security-review and code-review skills at the highest level against the phase's diff, plus an adversarial pass that tries to break the key lifecycle (forged wraps, stale keys, server key substitution, stolen-device veto). Property tests and the multi-client simulator run in CI. A paid audit stays an option later if the user base or a corp asks for one.

### Migration and cutover

Migration runs in the browser, so plaintext never reaches the new stores.

1. P0 ships the "export my data" route in the current app.
2. From the alpha, the new core offers an import: the user drops the export in and the browser seals it under new keys.
3. Roles map creator and admin to Owner and Manager, editor to Member, viewer to Viewer; corporation grants become genesis principals; account blocks become the future-joins filter.
4. Both run side by side until cutover; migrated maps are flagged read-only in the old app.
5. At cutover the old app goes read-only for 30 days, then the plaintext stores are destroyed: revoke stored EVE grants, destroy the two server encryption keys, set Neon history to zero and drop the tables, delete Convex map and location tables and backups, purge caches.

### What users get

| When | Who | What |
| --- | --- | --- |
| Week 1-2 | Everyone | Safer current app, data export |
| Week 6 | One or two corps | Sealed mapper alpha with import |
| Week 8-10 | Beta corps | Personal vault, industry, corp spaces |
| Week 10-14 | Everyone | Full sealed product, self-host bundle; old app read-only |

## Open questions and owner decisions

Most of the earlier open questions are answered by the current code, three were dropped with the paid-audit and new-repo plans, and four small truth checks remain (see Rebuild plan). Owner decisions shrink from seventeen to nine.

### Answered by the current code

| Question | Answer from the code | What the rebuild does |
| --- | --- | --- |
| Does EVE rotate refresh tokens, and how are races handled? | Yes, handled: the newest refresh token is persisted with compare-and-swap on the stored ciphertext; a lost race re-reads the winner's token | Same rule in the browser, against the vault copy, under the per-character lease |
| Idle expiry and dead tokens | No idle limit is modelled; a 400 invalid\_grant counts once, a second after a 5 min grace means reauth; 5xx and 429 retry with backoff | Same two-strike rule; reconnect prompt on the second strike |
| Do scope changes invalidate tokens? Incremental scopes? | No: scopes are compared to the list and a missing one shows a reconnect state. All scopes are requested at once with consent | Request all scopes at once; same reconnect state |
| Can a character hold several live token chains? | Yes in practice: re-authorizing overwrites the stored token without revoking the old one, and the code tolerates it | No dedicated tracker client id needed; the bot gets its own grant |
| Is the owner hash per character? | Yes, stored per character and compared on every login to detect transfers and merges | Same comparison at re-attestation |
| How many EVE apps and callbacks? | One client per environment; EVE matches redirect URIs exactly, one per origin | Register the app origin's callback per environment (local, staging, production) |
| Corp roles route and scope | Today each member's own token reads their character roles; the corp-membership scope was never used | Director pull is new; it adds that scope for Directors only |
| Revoke | Calls the revoke endpoint with the client secret, best effort, on purge | Browser revoke with client id is one of the four truth checks; fall back to the authorized-apps link |
| Location cadence and cold-off | Server polls; online gates location; ship only on system change; Expires-driven, 5 s floor; cold 5 min after the last heartbeat, or 90 min after the last visible one | Same policy in the browser |
| Real traffic | No per-map client or op metrics exist; map operations are logged in usage logs; the Convex dashboard shows function calls | Read the Convex bill and usage logs instead of building counters |
| Caps | 1,024 tracked per map, 32 per user per map, 256 scan rows, 128-row collapse and elimination bounds, no maps-per-user cap | Same caps |
| Dataset sizes | Directory, adjacency and codex already ship as immutable versioned assets (roughly 120-150 KB gzip for the directory); statics are fetched per system | Ship statics as one dataset too, ending the per-system leak |
| Deletion and retention | Accounts purge immediately; maps sit 30 days in trash then purge; events kept 7 days; no Neon history or Convex backup settings in code | Same lifecycle, plus crypto-shredding; set Neon history explicitly |
| Discord alerts, bios, invites, alliance grants | None exist for users today | New features, scheduled after the sealed mapper |

### Dropped

- **External reviewers and their cost:** replaced by agent review passes each phase.
- **A second release-key holder and a community mirror:** the owner holds the release key; the public watch Action is the independent check.
- **Repo visibility:** the repo is already public.

### Still open

| Question | How it closes | Blocks |
| --- | --- | --- |
| Does browser polling survive EVE fullscreen and hidden tabs? | Truth check 1 on the owner's machines | Whether the bot device moves into P2 |
| Do refresh and revoke work for a public client? | Truth check 2 | Deletion flow wording |
| Does ESI allow the compatibility-date header cross-origin? | Truth check 3 | Browser ESI client |
| Which passkey providers return PRF for the owner's users? | Truth check 4, then alpha feedback | Passkey messaging only |

### Owner decisions

| ID | Decision | Recommended default |
| --- | --- | --- |
| OD-1 | Default join policy | Strict approval with bulk approve; auto-admit opt-in |
| OD-2 | Do corp spaces gate cutover? | Yes, so all old keys can be destroyed |
| OD-3 | Who sees old map history after rotation | Managers and owners only; never guests |
| OD-4 | Standard tier | Later, only if users ask |
| OD-5 | Recovery-key-only recovery delay | 48 h, skipped if a passkey or trusted device approves |
| OD-8 | Auto re-admit after a short affiliation loss | 7 days, pinned key only |
| OD-12 | High-security mode for owners, managers and directors | Strongly prompted, not enforced |
| OD-16 | One-owner personal maps | Allowed |
| OD-17 | Recovery secret | Mandatory within 24 h |

Sources are listed in the Sources tab.
