# Part 05: The sealed service: shape, runtime and availability

**Status:** In owner review

## Owner review outcome (in progress, 2026-10-08)

This section overrides the rest of the part where they disagree.

- **Purchasing:** on demand (pay as you go) during setup and testing, paid largely from the new account's credits, switching to a 1-year EC2 Instance Savings Plan for c7g at full release (no-upfront $34.89/month or all-upfront $391/year, chosen then). Checks 1 to 5 run on demand before the plan is bought. Before buying: the account is on the Paid plan and the on-demand vCPU quota is at least 4.
- **Releases (question 5, replaced): blue/green, fully automated inside the current deployment process.** The owner keeps deploying by merging to `staging` and `main`; Vercel is unchanged. A GitHub Action on the same branches handles the enclave and does nothing unless sealed-service code (or code it bundles) changed, detected by an unchanged reproducible fingerprint. When it changed, the Action builds the image and fingerprint, adds the new fingerprint to the KMS key policy beside the old one, and starts an Auto Scaling instance refresh that launches the new instance before terminating the old (MinHealthyPercentage 100, MaxHealthyPercentage 200) with automatic rollback. The new enclave must boot, unseal, connect to Convex and report healthy; it then takes the lease while the old one drains and stops. If it never becomes healthy, the rollout rolls back and the old instance keeps serving. The old fingerprint is removed from the key policy afterwards. A 15-minute overlap costs about $0.02. The enclave accepts the current and previous protocol version, so a failed Vercel deploy or a failed enclave rollout breaks neither side; a change that needs both sides ships the enclave first in one PR and the app change in a later PR (expand then contract). `staging` updates the staging enclave and `main` production; the staging instance can be stopped when not testing. This replaces release step 5, rule 13 (EVE-downtime window, batch-hour ban, weekly cap) and question 5. Deadlines are set for user experience (Part 07), not sized to a cold boot.
- **Crashes and alert:** automatic restart stays for crashes (systemd polls `nitro-cli describe-enclaves`, since a Node exit ends the enclave; the Auto Scaling group of one replaces a failed instance). The agreed alert is a stale-heartbeat check on Vercel or Convex that posts through the existing Discord path in `src/lib/alerts.ts`; no enclave code is needed for it.
- **Question 1, images:** one image on one c7g.large, accepting that worker code and its dependencies run beside the keys; pinned lockfile and minimal enclave dependencies cover third-party risk (Part 28).
- **Question 2, plaintext caching:** active maps stay decrypted in enclave memory only, evicted after 10 minutes without edits, at once on map key rotation, and at once on any version mismatch the enclave did not cause (then reloaded). No size cap and no purge-bumps-map-version rule (rule 10 simplified accordingly).

**Review notes (2026-10-08):** the owner has created a new AWS account. Vercel runs in `iad1` (AWS us-east-1). Repo examples and test fixtures point Neon at `us-east-2` (Ohio); confirm in the Neon console. Convex's region is unconfirmed (check the deployment settings). Nitro Enclaves carry no extra charge; only the EC2 instance and services used (such as KMS) are billed.

**Verification findings (2026-10-08, to apply as questions are settled):**
- Prices (AWS Price List API, us-east-1, 730 h): c7g.large on demand $0.0725/h ($52.93/month); 1-year EC2 Instance Savings Plan $34.89/month no upfront, $32.56/month all upfront ($391/year); Compute Savings Plan $37.96/month no upfront. m7g.large $59.57 on demand, $39.42 1-year no upfront. c7g.xlarge $69.72 1-year no upfront. Extras: public IPv4 $3.65/month, KMS $1 per key per month plus requests; avoid a NAT gateway ($32.85/month). t4g and other burstable or 1-vCPU types cannot run enclaves; c7g.large is the cheapest supported Graviton parent.
- Blue/green: only one enclave fits on a c7g.large (CPU 0 stays with the parent). Blue/green therefore means a brief second instance (Auto Scaling instance refresh, launch before terminate), billed per second: a 15-minute overlap costs about $0.02. The restart-in-EVE-downtime release model, the release window, the weekly cap and deadlines sized to cold boot conflict with Part 01's agreed blue/green stance and are to be replaced.
- New account: confirm the Paid plan (the Free plan may block commitments), raise the on-demand vCPU quota to at least 4 (default 5, sometimes 1), and note promotional credits cover hourly on-demand charges but not upfront commitment fees.
- Networking: Node has no native vsock, so the in-image forwarder is a native helper (socat or a small Rust/Go relay); the image must bring up loopback; parent `vsock-proxy` defaults to 4 connections per destination, already used up by today's postgres.js pools, so set workers explicitly and run one proxy per destination.
- Boot and time: the enclave's ready signal fires before Node starts, so boot is measured with an app-level ready signal; enclave clocks drift (about 1 s/day reported), so add time sync.
- Regions: Vercel iad1 is us-east-1; Convex is very likely us-east-1; Neon is likely us-east-2 (about 11 to 16 ms per query, the same as Vercel to Neon today). us-east-1 stays the enclave region.
- Code facts corrected: normal ESI syncs run inline in `after()` on page view; `esi_refresh_jobs` is only a daily retry lane for budget-deferred work (at most 5 per drain). The authorization re-check is activity-triggered (each character at most daily, while its user is on the site), not a daily job. Only 4 of 7 batch steps take an advisory lock. Stale-running recovery spends an attempt today, so "an outage never spends an attempt" needs new code.
- Consistency with agreed parts: add the agreed outage alert (stale heartbeat check on Vercel or Convex, existing Discord path); access-list edits stay on today's readable path during an outage (only map-key rotation waits); request-ID replay records and the CI protocol gate are dropped as over-engineering; the 10-second lease becomes a slower enclave-only lease separate from the browser-read status row; one sealed zone instead of five; one Neon driver in the enclave; Upstash leaves the allowlist; set CloudWatch log retention.
- Spot (reference, not chosen): no AWS document restricts enclaves by purchase option (eligibility is per instance type; the only documented conflict is hibernation), so Spot very likely works; confirm with one test launch. c7g.large Spot in us-east-1 ran about $0.019 to $0.033/h in mid-2026 (about $14 to $25/month) versus $34.89 on the Savings Plan, with a 5 to 10% interruption bucket (roughly one interruption a year for one always-on instance; other Graviton large types sit above 20%). An interruption gives 2 minutes' notice and destroys the enclave, so the service would restart on a replacement exactly as after a crash. KMS policies must not pin PCR4 (instance ID). The owner chose on demand during setup and a Savings Plan at release; Spot stays an option to revisit at release.

## In one paragraph

This part fixes what the sealed service physically is and how it runs. It is one EC2 parent instance that only relays encrypted bytes, and one Nitro Enclave inside it with no disk or network of its own. TLS to ESI, EVE SSO, Convex, Neon and KMS ends inside the enclave. The enclave runs Node and reuses today's TypeScript: the ESI client, the owner-sync engine, location sync, map logic, valuation and corp visibility. It settles code layout and Fallow zones, sizing, write ordering, releases and version skew, restart behaviour and the checks to run before buying the 1-year commitment. Attestation is Part 06, transport Part 07, cost Part 25.

## How it works today

There is no sealed service. Server work that reads content runs in two places, and all of it can see plaintext.

- **Deploys.** A merge to `staging` or `main` deploys everything at once (`vercel.json` `deploymentEnabled`). `vercel-build` deploys Convex functions and schema, and `build:vercel` runs Neon migrations before `next build`.
- **Vercel (Node, region `iad1`).** ESI sync jobs are claimed from `esi_refresh_jobs` with a conditional update. Refresh-on-view triggers use Next's `after()`. The daily batch (prices, queue drain, net-worth revaluation, housekeeping and more) runs in one 300-second invocation that Hobby fires anywhere in the 12:00 UTC hour; each batch step runs under its own advisory lock. A job left in `running` for more than 10 minutes is recovered by the next queue drain, which today runs in the daily batch. Failed jobs use up to 5 attempts, then are dead-lettered with a Discord alert.
- **Authorization re-check.** The daily check refreshes each character's token with `forceRefresh`. A character whose failures started more than 24 hours ago is suspended, which removes map access.
- **Convex.** `convex/` holds about 11.3k non-test lines, mostly map logic, in serialisable mutations. Map edits use optimistic updates in the browser. Location polling is a scheduled Convex action per user (`syncUser`) that leases access tokens from `/api/internal/eve-token`: 5-second cadence floor, stop 5 minutes after the last heartbeat, stop 90 minutes after the tab was last visible. Convex crons run the hourly collapse and the daily tombstone purges.
- **ESI client.** About 1.2k lines; rate-limit scoreboard in Upstash Redis; authenticated responses are never body-cached (`isEtagEligible`).
- **Coupling.** Valuation and corp visibility are pure but sit in `features` and `platform/auth`. Five sync files import `next/server`. Several `data` modules import `next/cache`. Some logging prints character IDs and raw error objects.

Files:

- `vercel.json`, `package.json`, `.fallowrc.json`, `src/db/index.ts`
- `src/composition/sync/*`, `src/composition/pipelines/cron-gate.ts`, `src/app/api/cron/daily-batch/route.ts`, `src/data/esi-refresh-jobs/constants.ts`, `src/lib/alerts.ts`
- `src/composition/character-authorization.ts`, `src/platform/auth/authorization-policy.ts`
- `convex/characterLocationSync.ts`, `convex/characterLocationApply.ts`, `convex/crons.ts`, `src/mapper/chain/optimistic-authoring.ts`
- `src/platform/esi/dispatch.ts`, `src/platform/owner-sync/engine.ts`, `src/features/net-worth/valuation.ts`, `src/platform/auth/corp-visibility.ts`
- `src/data/eve-data/queries.ts`, `src/data/market-prices/cache.ts`, `src/data/corp-holdings/queries.ts`

## What changes

Nothing visible changes for users. Behind the scenes: a new AWS component, a `sealed-service/` tree, and pure code moved so it builds into both the app and the enclave. From the older docs this drops Path D's separate public notice period for images and 06's two-image recommendation (see question 1).

## Design

### Components

| Component | Runs | Holds | Network |
| --- | --- | --- | --- |
| Parent instance | Amazon Linux, `nitro-cli`, `vsock-proxy`, log forwarder, systemd | Nothing readable | Outbound only; no inbound port |
| Enclave | One image: Node 24, the bundled code, an AWS helper for the Nitro Security Module | Service root key (after unseal), all other keys, tokens, plaintext caches; memory only | vsock to the parent only |

**Networking.** A forwarder in the image listens on one loopback address per allowed host, and `/etc/hosts` maps each hostname to it. It pipes over vsock to `vsock-proxy` on the parent. TLS and certificate checks run inside the enclave against a baked-in CA bundle. The allowlist (ESI, EVE SSO, Convex, Neon, regional KMS and, if kept, Upstash) is enforced by the forwarder and `/etc/hosts`, which are measured. The parent's `vsock-proxy` allowlist is defence in depth only, since operators control it. Discord is not on the list.

**Logs.** In the image, `console.*` is replaced by a sink that emits only enumerated codes and numeric counts and drops everything else. It streams over vsock to CloudWatch. Dead-letter and budget alerts stay on Vercel, driven by readable job rows (`esi_refresh_jobs.status`, `lastErrorCode`).

### Code moves and Fallow zones

| Today | Move | Imported by |
| --- | --- | --- |
| `features/net-worth/valuation.ts`, `platform/auth/corp-visibility.ts` and its `corp-roles` types | New pure zone `platform/content-logic` | `features`, `platform/auth`, sealed workers |
| `composition/sync/*` runners and `owner-sync-port.ts` | Split each into a pure runner (`platform/owner-sync`) and a thin Next trigger left in `composition` | App and workers |
| `next/cache` reads in `data/eve-data`, `data/market-prices`, `data/corp-holdings` | Behind ports; the app's adapter uses `next/cache`, the enclave's uses memory | App and workers |
| `composition/jump-resolver/resolver.ts` and map logic in `convex/mapAuthoring*`, `mapChain*`, `mapJump*`, `mapScan`, `engine*`, `convex/lib` | Pure logic to `platform/map-logic`; Convex keeps thin sealed-write mutations (opaque row, expected version, request ID) | Workers; Convex imports only shared helpers |
| New: envelope format, row codecs, protocol version | `platform/sealed-envelope` | `mapper`, `app`, `convex`, sealed zones |

Sealed zones: `sealed/runtime` (boot, forwarder, scheduler, cache, dev entry), `sealed/custody` (login exchange, key records, token refresh, attestation), `sealed/custody-api` (the interface workers call), `sealed/workers` (location, sync, map logic, valuation, corp visibility), and `sealed/shared` (enclave-only storage interfaces). Workers may import `sealed/custody-api`, `sealed/shared`, `platform/esi`, `platform/owner-sync`, `platform/content-logic`, `platform/map-logic`, `platform/sealed-envelope`, `data` (port-backed modules only), `lib` and `config`. No existing zone imports a sealed zone.

Custody is reached through `custody-api` as a code-review boundary only. At runtime all code in the image can read all keys. The real mitigation is a pinned lockfile and minimal dependencies in the enclave bundle (Part 28).

**One source, two builds.** The enclave build bundles `sealed-service/runtime/main.ts` with esbuild, resolving `@/`, and fails if it reaches `next/*`, `react`, `server-only` or `@vercel/*`. The bundle goes into an arm64 image from a pinned base-image digest, and `nitro-cli build-enclave` produces the fingerprints (Part 27). The entry is in Fallow's `entry` list, and a lint rule bans `console` and free-text logging in `sealed-service/**`.

### Sizing

| Item | Default |
| --- | --- |
| Instance | `c7g.large` (2 vCPU, 4 GiB), 1-year commitment, about $32/month; `m7g.large` if check 3 fails |
| Enclave / parent | 1 vCPU and about 2.75 GiB / 1 vCPU and about 1.25 GiB |
| Load at 18 users | Tens of characters polling every 5 to 60 seconds; a few owner syncs per drain; peak memory is the largest corp asset sync |

### Write ordering

| Scope | In the enclave | Guard in the store |
| --- | --- | --- |
| Per map | One async queue per `mapId` | Expected map version; Convex rejects a stale one |
| Per owner document | One queue per (owner, dataset) | Compare-and-set on the readable version (Part 02) |
| Per character token | One queue per character | Today's compare-and-swap rotation (Part 08) |
| Whole service | A Convex lease, renewed every 10 seconds | None; it only stops two enclaves polling ESI twice after a replacement |

Staging and production stay apart because each has its own KMS key, and the Convex credential and Neon role are sealed under the matching key.

**Idempotency.** Each sealed write records its request ID in the same Convex mutation; a replay of a recorded ID returns the stored reply. Any version mismatch evicts the cache entry and reloads before retrying.

### Plaintext caching

Active maps stay decrypted in memory, keyed by map and key epoch. An entry is evicted after 10 minutes idle, at once on key rotation, at the size cap, and on Convex tombstone purges (which bump the map version). Access tokens live only in enclave memory, and `characterLocationAccess` is dropped. Documents are decrypted per job and dropped.

### Releases and version skew

1. Every sealed request, reply and sealed row carries a protocol version. The enclave and the Convex sealed-write mutations accept the current and previous version.
2. Neon and Convex changes the enclave touches go expand then contract: add the new shape, release the enclave, drop the old shape in a later release.
3. A CI check fails a `staging` or `main` deploy whose protocol version the published fingerprint (or the one awaiting approval) does not accept.
4. Order: the staging enclave gets a change before staging Vercel uses it, then production likewise.
5. Planned enclave releases go out during EVE downtime (about 11:00 to 11:15 UTC), never in the 12:00 UTC batch hour, batched to at most a few a week.

### Availability and restarts

On boot the enclave unseals the service root key (Part 06), takes the lease, rebuilds the location schedule from heartbeats and picks up pending requests. Request deadlines (Part 07) exceed the measured cold boot plus margin, so a planned restart only delays requests. When the sealed service is unreachable, nothing counts as an authorization failure or uses up a job attempt: jobs go back to queued with `nextAttemptAt` pushed out.

| While the enclave is down | Effect |
| --- | --- |
| Logins and key release | No new session can be created, passkey or not; after the deadline, today's sign-in error. Passkeys and recovery keys cover permanent loss once the service is back or rebuilt |
| Map and access-list edits | Requests wait up to their deadline. The browser keeps each optimistic overlay until the reply or row with that request ID arrives; on expiry it rolls back through existing error handling (Part 16) |
| Location tracking, jump authoring | Pause, then resume from the next heartbeat |
| ESI syncs, revaluation, searches | Jobs stay queued; Vercel drains after recovery and in the daily batch |
| Authorization re-check | Skipped; `authorization*` columns untouched; no suspension |
| Reading maps and personal views | Continue in browsers holding keys |
| Public data and metadata | Unaffected |

systemd restarts the enclave with backoff; an Auto Scaling group of one replaces a failed instance.

### Checks before committing to the instance

1. Enclave support for the type and region; a test enclave boots.
2. Convex, both Neon drivers, ESI and KMS work through the forwarder.
3. Replaying the largest owner and corp datasets peaks under 60% of enclave memory.
4. Cold boot to serving, including the KMS unseal, takes under 60 seconds and under the request deadline.
5. The enclave clock stays within a few seconds of ESI `Date` headers over a day.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Service root key, user, map, corp and token keys | No | Yes (KMS-sealed or wrapped) | Sealed service |
| EVE refresh and access tokens | No | Yes; access tokens memory-only | Sealed service |
| Active map plaintext cache | No | Memory only | Sealed service |
| Statics, universe tables, public prices | Yes | No | Sealed service holds copies |
| Lease, heartbeat, running fingerprint, protocol version | Yes (Convex) | No | Sealed service writes; LGI server reads |
| Map and document versions, recorded request IDs | Yes | No | LGI server checks; sealed service sets |
| Job queue rows and retry state | Yes (Neon) | No | LGI server |
| Enclave logs | Yes (codes and counts) | No | Sealed service emits |

## Hard rules

1. [Agreed] The sealed service runs on AWS Nitro on a 1-year commitment, and location polling runs inside it with today's rules.
2. [Agreed] Changes ship through normal development → staging → main releases (decision 2).
3. [Proposed] Same repo, Convex stays the relay and store, and `pnpm check`/`pnpm verify` cover sealed code with zero Fallow findings. These are fixed by the brief, not README decisions. Everything on lgi.tools is a README working note pending the section review.
4. [Proposed] The parent instance has no inbound port, never holds keys, tokens or content, and never terminates the enclave's TLS.
5. [Proposed] The host allowlist is enforced inside the measured image; the parent's allowlist is defence in depth.
6. [Proposed] Nothing persists inside the enclave. Access tokens stay in enclave memory; `characterLocationAccess` is dropped.
7. [Proposed] One image with the module moves and zones above. Workers call custody only through `custody-api` (a review boundary, not isolation). No existing zone imports a sealed zone. The bundle fails on `next/*`, `react`, `server-only` or `@vercel/*`.
8. [Proposed] Map writes carry the expected map version; document writes use compare-and-set. The Convex lease only prevents double polling. Environments are separated by per-environment KMS keys.
9. [Proposed] Each sealed write records its request ID atomically; replays return the stored reply.
10. [Proposed] Plaintext caches are memory-only, keyed by key epoch, evicted when idle, on rotation, on purge and at the cap.
11. [Proposed] Enclave logs pass through the codes-and-counts sink; `console` is banned in `sealed-service/**`; alerts stay on Vercel.
12. [Proposed] Requests carry a protocol version; the current and previous are accepted; enclave-touched schema changes go expand then contract; CI blocks incompatible deploys.
13. [Proposed] Planned enclave releases ship during EVE downtime, never in the batch hour, at most a few a week.
14. [Proposed] Request deadlines exceed measured cold boot plus margin; a miss shows today's error. Optimistic overlays persist until the matching reply or the deadline.
15. [Proposed] An unreachable sealed service never counts as an authorization failure, never uses up a job attempt and never suspends access.
16. [Proposed] Checks 1 to 5 pass before the 1-year commitment is bought.

## Assumptions

| Assumption | How to check |
| --- | --- |
| A 2-vCPU Graviton instance supports enclaves at about $32/month | Check 1 and pricing |
| Neon and Convex are in `us-east-1`, near Vercel `iad1` | Each console |
| All clients work through the forwarder | Check 2 |
| One vCPU covers polling peaks plus a corp sync | CPU during check 3 |
| Node reaches the Nitro Security Module through an arm64 helper | Spike in check 1 |
| Runners split from `after()`, `next/cache` and `@/db` without behaviour change | Existing sync tests pass on the ported runners |
| The ESI scoreboard can be shared or replaced | Part 18 |

Tests: a 48-hour simulated outage leaves no suspensions and no consumed attempts; a 30-second reply delay shows no flicker; error objects containing IDs leave the sink as codes only; a replayed request applies once; boot-to-serving stays under the deadline.

## What users see

Nothing new. During a restart, logins, edits and tracking pause briefly and catch up, using only states the app already has.

## Questions for the owner

1. **One image or two?** Two need a 4-vCPU instance (about twice the cost) and a second attestation path. *Recommended:* one image, accepting that worker bugs and dependencies run beside the keys (Part 28).
2. **Plaintext caching?** *Recommended:* active maps in memory with 10-minute idle eviction.
3. **Runtime?** *Recommended:* Node 24, esbuild, pinned base image, `nitro-cli`; Bun, Deno or Rust lose the code reuse.
4. **Region and instance?** *Recommended:* `us-east-1`, `c7g.large`.
5. **Release cadence?** *Recommended:* automatic restart, an Auto Scaling group of one, batched releases in EVE downtime.
6. **Decision 1 says backups cover a key-service outage.** Here, logins themselves need the enclave, so backups cover only permanent loss. *Recommended:* accept, and correct the wording in Parts 08 and 10. A Vercel-side fallback login would expose EVE codes and tokens.
