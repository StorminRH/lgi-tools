# Part 05: The sealed service: shape, runtime and availability

**Status:** Draft for owner review

## In one paragraph

This part fixes what the sealed service physically is and how it runs. It is one EC2 parent instance that only relays encrypted bytes, and one Nitro Enclave inside it with no disk or network of its own. TLS to ESI, EVE SSO, Convex, Neon and KMS ends inside the enclave. The enclave runs Node and reuses today's TypeScript: the ESI client, the owner-sync engine, location sync, map logic, valuation and corp visibility. It settles code layout and Fallow zones, sizing, write serialisation, restart behaviour and the checks to run before buying the 1-year commitment. Attestation is Part 06, transport Part 07, cost Part 25.

## How it works today

There is no sealed service. Server work that reads content runs in two places, and all of it can see plaintext.

- **Vercel (Node, region `iad1`).** ESI sync jobs are claimed from `esi_refresh_jobs` with a conditional update. Refresh-on-view triggers use Next's `after()`. The daily batch (prices, queue drain, net-worth revaluation, housekeeping and more) runs in one 300-second invocation under a Postgres advisory lock. A job stuck in `running` is recovered after 10 minutes.
- **Convex.** `convex/` holds about 11.3k non-test lines, mostly map logic. Mutations are serialisable transactions, so map writes never interleave. Location polling is a scheduled Convex action per user (`syncUser`) that leases access tokens from `/api/internal/eve-token`. It uses a 5-second cadence floor, stops 5 minutes after the last heartbeat, and stops 90 minutes after the tab was last visible. Convex crons run the hourly collapse and daily purges.
- **ESI client.** About 1.2k lines. The rate-limit scoreboard lives in Upstash Redis, with an in-memory fallback. Authenticated responses are never body-cached (`isEtagEligible`).
- **Reusable pure code.** The owner-sync engine (about 500 lines) imports only the ESI client. Valuation (160 lines) and corp visibility (174 lines) are pure. `src/data/maps` (about 4.2k lines) mixes pure helpers with Neon-bound access code.
- **Coupling.** Five sync files import from `next/server`; sync runners read Neon through `@/db` (Neon HTTP driver and `postgres`). CI uses Node 24.

Files:

- `vercel.json`, `.fallowrc.json`, `src/db/index.ts`
- `src/composition/sync/esi-refresh-worker.ts`, `live-dataset-view.ts`; `src/app/api/cron/daily-batch/route.ts`; `src/data/esi-refresh-jobs/queries.ts`
- `convex/characterLocationSync.ts`, `convex/crons.ts`, `src/lib/sync-engine.ts`
- `src/platform/esi/dispatch.ts`, `scoreboard/redis.ts`; `src/platform/owner-sync/engine.ts`
- `src/features/net-worth/valuation.ts`, `src/platform/auth/corp-visibility.ts`

## What changes

Nothing visible changes for users. Behind the scenes there is a new AWS component and a new `sealed-service/` tree, and the sync code is split so its pure parts build into both the app and the enclave. From the older docs this drops Path D's separate public notice period for images and 06's two-image recommendation (see question 1).

## Design

### Components

| Component | Runs | Holds | Network |
| --- | --- | --- | --- |
| Parent instance | Amazon Linux, `nitro-cli`, AWS `vsock-proxy`, a log forwarder, systemd units | Nothing readable: no keys, tokens or content | Outbound to an allowlist of hosts; no inbound port |
| Enclave | One image: Node 24 and the bundled app code, plus an AWS helper for the Nitro Security Module | Service root key (after unseal), user, map, corp and token keys, tokens, plaintext caches; all in memory only | None of its own; vsock to the parent only |

**Networking inside the enclave.** A small forwarder listens on one loopback address per allowed host (for example `127.0.0.3:5432` for Neon), and `/etc/hosts` in the image maps each hostname to it. The forwarder pipes connections over vsock to `vsock-proxy` on the parent, which may only dial that host. Every client (`fetch`, Convex, the Neon driver, `postgres`) works unchanged, with TLS and certificate checks inside the enclave against a baked-in CA bundle. The allowlist: ESI, EVE SSO, Convex, Neon, regional KMS and, if kept, Upstash.

**Logs.** Codes and counts only, over a vsock stream to the parent and on to CloudWatch.

### Code layout and Fallow zones

| Zone | Path | May import |
| --- | --- | --- |
| `sealed/runtime` | `sealed-service/runtime/**` (boot, forwarder, scheduler, locks, cache, dev entry) | `sealed/custody`, `sealed/custody-api`, `sealed/workers`, `sealed/shared`, `lib`, `config` |
| `sealed/custody` | `sealed-service/custody/**` (login exchange, key records, token refresh, attestation) | `sealed/shared`, `lib`, `config` |
| `sealed/custody-api` | `sealed-service/custody-api/**` (the narrow interface workers call) | `sealed/custody` |
| `sealed/workers` | `sealed-service/workers/**` (location, sync, map logic, valuation, corp visibility) | `sealed/custody-api`, `sealed/shared`, `platform/esi`, `platform/owner-sync`, `data`, `lib`, `config` |
| `sealed/shared` | `sealed-service/shared/**` (envelope format, storage interfaces) | `lib` |

No existing zone may import a sealed zone. Workers reach keys and tokens only through the custody API ("access token for character X", "open this row with map key epoch N") and never see the token key or service root key.

**One source, two builds.** The app keeps importing shared modules through `@/`. The enclave build bundles `sealed-service/runtime/main.ts` with esbuild, resolving the same alias, and fails if it reaches `next/*`, `react`, `server-only` or `@vercel/*`. Next triggers stay in the app; pure runners sit behind ports both sides implement. The bundle goes into an arm64 image from a pinned base-image digest, and `nitro-cli build-enclave` produces the fingerprints (reproducibility is Part 27). The entry is added to Fallow's `entry` list, so typecheck, tests and `pnpm check` cover the tree.

### Sizing

| Item | Default |
| --- | --- |
| Instance | `c7g.large` (Graviton, 2 vCPU, 4 GiB) on a 1-year commitment, about $32/month; `m7g.large` (8 GiB) if the memory check fails |
| Enclave share | 1 vCPU, about 2.75 GiB, including the in-memory image |
| Parent share | 1 vCPU, about 1.25 GiB |
| Expected load at 18 users | Tens of tracked characters polling every 5 to 60 seconds; a few owner syncs per drain; kilobyte-sized maps. Peak memory is likely the largest corp asset sync |

### Serialising writes

| Scope | In the enclave | Guard in the store |
| --- | --- | --- |
| Per map | One async queue per `mapId`: edits, sweeps and jump authoring run one at a time | Every sealed write carries the expected map version; Convex rejects a stale one |
| Per owner document | One queue per (owner, dataset) | Compare-and-set on the readable document version (Part 02) |
| Per character token | One queue per character for refresh | Today's compare-and-swap rotation (Part 08) |
| Whole service | A leader lease row in Convex, renewed every 10 seconds | Each write carries the lease's fencing number; writes with an old number are rejected |

So an instance that boots before the old one dies, or a misconfigured staging enclave, cannot write production rows.

### Plaintext caching

Active maps stay decrypted in enclave memory, keyed by map and key epoch. An entry is evicted after 10 minutes with no edit or sweep, at once when the map's key rotates, and when the cache reaches its size cap (least recently used first). Access tokens stay in memory until they expire, which replaces the leases in Convex. Personal and corp documents are decrypted per job and dropped afterwards. Nothing is ever written to disk.

### Availability and restarts

A restart loses only caches. On boot the enclave unseals the service root key (Part 06), takes the lease, rebuilds the location schedule from readable heartbeats and picks up pending sealed requests. Stuck refresh jobs return through today's 10-minute recovery.

| While the enclave is down or restarting | Effect |
| --- | --- |
| Logins and new key release | Wait until the request times out, then show today's sign-in error |
| Map edits and access-list edits | Requests wait in Convex up to their deadline (Part 07), so a short restart only delays them |
| Location tracking and jump authoring | Pause, then resume from the next heartbeat |
| ESI syncs, revaluation, structure and character search | Jobs stay queued or retry; revaluation runs late |
| Reading maps and personal views | Continue in browsers that already hold keys; existing sessions stay signed in |
| Public data and metadata pages | Unaffected |

systemd restarts the enclave with backoff; an Auto Scaling group of one replaces a failed instance. Planned releases go out just after EVE's daily 11:00 UTC downtime, when nobody is in game.

### Checks before committing to the instance

1. `aws ec2 describe-instance-types` reports enclave support for the type and region, and a test enclave boots.
2. Inside it, Convex, the Neon HTTP driver and `postgres` connect through the forwarder, and ESI and KMS calls succeed.
3. Replaying the largest current owner and corp datasets peaks under 60% of the enclave's memory.
4. Cold boot to serving, including the KMS unseal, takes under 60 seconds.
5. The enclave clock stays within a few seconds of ESI `Date` headers over a day.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Service root key, user, map, corp and token keys | No | Yes (KMS-sealed or wrapped) | Sealed service |
| EVE refresh and access tokens | No | Yes; access tokens memory-only | Sealed service |
| Active map plaintext cache | No | Memory only, never stored | Sealed service |
| Statics and universe tables, public prices | Yes (public data) | No | Sealed service holds copies in memory |
| Leader lease, fencing number, heartbeat, running fingerprint, boot time | Yes (Convex) | No | Sealed service writes; LGI server reads |
| Map and document versions | Yes | No | LGI server checks; sealed service sets |
| Job queue rows and retry state | Yes (Neon) | No | LGI server |
| Enclave logs and metrics | Yes (codes and counts only) | No | Sealed service emits; parent forwards |

## Hard rules

1. [Agreed] The sealed service runs on AWS Nitro on a 1-year commitment, and location polling runs inside it with today's rules.
2. [Agreed] Same repo and branch flow, everything on lgi.tools, Convex stays the relay and store; `pnpm check` and `pnpm verify` cover sealed-service code with zero Fallow findings.
3. [Proposed] The parent instance never holds keys, tokens or content, and never terminates TLS for the enclave's connections.
4. [Proposed] The enclave connects outbound only, to an explicit host allowlist.
5. [Proposed] Nothing persists inside the enclave; durable state lives in Convex or Neon.
6. [Proposed] One image with the zones above; workers reach custody only through `sealed-service/custody-api/`; no existing zone imports sealed-service code; the bundle fails on `next/*`, `react`, `server-only` or `@vercel/*`.
7. [Proposed] Every map write runs in its per-map queue with the expected map version and fencing number; every owner-document write carries the expected version.
8. [Proposed] One active enclave per environment, enforced by the leader lease.
9. [Proposed] Plaintext caches are memory-only, keyed by key epoch, evicted when idle, on rotation and at the cap.
10. [Proposed] Logs leaving the enclave are codes and counts only.
11. [Proposed] Every request has a deadline; a miss shows today's existing error state.
12. [Proposed] The image is arm64, from a pinned base-image digest, built with esbuild and `nitro-cli`; planned releases ship just after EVE's daily downtime.

## Assumptions

| Assumption | How to check |
| --- | --- |
| A 2-vCPU Graviton instance supports enclaves at about $32/month committed | Check 1 and current pricing |
| Neon and Convex are in AWS `us-east-1`, near Vercel `iad1` | Each console; if Neon is elsewhere, still pick `us-east-1`, since edits flow through Convex |
| All clients work through the forwarder | Check 2 |
| One vCPU covers polling peaks plus a corp sync | Measure CPU during check 3 |
| Node reaches the Nitro Security Module through an arm64 AWS helper | Spike during check 1 |
| Sync runners split from `after()` and `@/db` without behaviour change | Existing sync tests pass on the ported runners |
| The ESI scoreboard can be shared or replaced | Part 18 |

## What users see

Nothing new. During a restart, logins, edits and tracking pause briefly and catch up, using only states the app already has.

## Questions for the owner

1. **One image or two?** 06 suggested two. Two keep custody code stable but need a 4-vCPU instance (about twice the cost) and a second attestation path. *Recommended:* one image with Fallow zones, accepting that worker bugs run beside the keys (Part 28).
2. **Plaintext caching?** *Recommended:* keep active maps in memory with 10-minute idle eviction; decrypting per call adds latency for little gain, since the enclave holds the keys anyway.
3. **Runtime and tooling?** *Recommended:* Node 24, esbuild, pinned base image, `nitro-cli`. Bun, Deno or a Rust custody core lose the code reuse.
4. **Region and instance?** *Recommended:* `us-east-1`, `c7g.large`; `m7g.large` only if check 3 fails.
5. **Restart behaviour?** *Recommended:* automatic restart, an Auto Scaling group of one, releases after EVE downtime, and request deadlines that ride out a normal restart.
