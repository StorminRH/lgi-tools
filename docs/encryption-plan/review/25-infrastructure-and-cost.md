# Part 25: Infrastructure, environments and cost

**Status:** Draft for owner review

**Carried from the Part 05 and 06 reviews (2026-10-08):** releases are the automated blue/green workflow on push to `staging` and `main` with no approval, no GitHub environments, no EVE-downtime window and no batch-hour ban; the KMS policy holds only the running hash at rest. KMS is about $2/month for two keys.

## In one paragraph

This part lists every component and how it runs in production, staging, local development and cloud sessions. Vercel, Convex, Neon and Upstash stay as they are. Only AWS is new: per environment, one EC2 parent instance with one Nitro Enclave, a KMS key, and CloudTrail alerts. The part covers deploying and restarting the enclave without a gap, regions, what backups hold once content is sealed, and cost. Production adds about $38 a month, and staging adds $5 to $40 depending on question 1. It also sets the guards that keep the dev sealed service out of release builds while letting CI test sealed flows.

## How it works today

- **Vercel:** Hobby plan, pinned to `iad1`. Only `main` and `staging` deploy. Three daily crons run: `daily-batch` and `refresh-gsc` in the 12:00 UTC hour, and `refresh-sde` at 14:00. `daily-batch` runs these steps in one 300-second invocation: map purge, prices, indices, the ESI queue drain, revaluation, weekly statics and housekeeping. `vercel-build` wraps `convex deploy`, which runs migrations, ingest, `next build` and a route check. Speed Insights loads on hosted builds (`src/app/layout.tsx`).
- **Convex:** separate production and staging deployments. Each Vercel environment's deploy key picks its deployment. `LGI_PREVIEW_LINE=staging`, a `staging` git ref or a `staging` target env only adds `--check-build-environment disable` (`src/scripts/vercel-convex-deploy.ts`). Crons run daily purges and an hourly collapse. Auth is one ES256 `customJwt` provider. Location polling runs in Convex and leases EVE access tokens from `/api/internal/eve-token` and `/api/internal/eve-characters`, authorised by `CONVEX_SERVICE_SECRET`, which is set on both Vercel and Convex (`convex/lib/characterSync.ts`, `convex/characterLocationSync.ts`).
- **Neon:** production is the protected default branch (0.25 to 2 CU). Staging is a standing `staging` branch (0.25 to 1 CU) that suspends after 5 minutes. Neither the history window nor the region is set in code, and the plan is not recorded.
- **Upstash:** set up through the Vercel marketplace. It backs the rate limiter used by most API routes (`src/lib/rate-limit.ts`), the ESI scoreboard, the public body cache and refresh hints.
- **Local, CI and cloud sessions:** Postgres 16 runs in Docker (port 5433), alongside `convex dev`. CI's `e2e` job runs `pnpm start` on a production `next build` against a Postgres service container (host `postgres`), with no Convex, and seeds the E2E Pilot by calling `becomeSyntheticPilot` directly. The localhost mint route, gated by `canMintSyntheticPilot`, works only with `NODE_ENV=development`. In cloud sessions, `stack.sh` runs the stack, and `lib.sh` classifies URLs as loopback, hosted (`*.neon.tech`, `*.convex.cloud`, `*.convex.site`) or other, and refuses non-loopback Convex. `convex-staging.sh` writes only when `LGI_ALLOW_STAGING_PUSH=1` is set.
- **Secrets:** `EVE_CLIENT_SECRET`, `EVE_TOKEN_ENCRYPTION_KEY`, `ESI_SNAPSHOT_ENCRYPTION_KEY`, `CONVEX_SERVICE_SECRET`, `CRON_SECRET`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, `GSC_SERVICE_ACCOUNT_JSON`, `LINEAR_API_KEY` and `DISCORD_ALERT_WEBHOOK_URL` are Vercel variables the operator can read.

Files: `vercel.json`, `package.json`, `src/scripts/vercel-convex-deploy.ts`, `src/app/api/cron/daily-batch/route.ts`, `src/app/api/internal/eve-token/route.ts`, `src/app/api/internal/eve-characters/route.ts`, `src/lib/rate-limit.ts`, `convex/convex.config.ts`, `convex/crons.ts`, `convex/auth.config.ts`, `convex/lib/characterSync.ts`, `neon.ts`, `scripts/apply-neon-config.ts`, `docker-compose.yml`, `.env.example`, `src/lib/env.ts`, `src/app/layout.tsx`, `src/platform/auth/synthetic-pilot.ts`, `e2e/auth-seed.ts`, `playwright.config.ts`, `.github/workflows/test.yml`, `.claude/cloud/GUIDE.md`, `.claude/cloud/lib.sh`, `stack.sh`, `convex-staging.sh`.

## What changes

Nothing visible changes for users. The project gains an AWS account with one sealed service per environment, and a dev sealed service process for local work and CI. Some Vercel secrets move into the enclave, and the token-vending routes are deleted. Speed Insights goes with the CSP work (Part 26). Vercel stays on Hobby, and the other plans stay as they are unless the checks below say otherwise.

Dropped from the older docs (01 "Server components and infrastructure", DR-STACK, DR-RELAY, 04 §3, §4, §24): Cloudflare Workers, Durable Objects, R2, Hyperdrive, Workflows, Analytics Engine, the key-wrap and Steward Neon projects, every subdomain, the self-host bundle and the per-MAU cost table.

## Design

### Components per environment

| Component | Production | Staging | Local / cloud session / CI |
| --- | --- | --- | --- |
| Vercel | `main`, `iad1`, Hobby | `staging` environment | `next dev`; CI `pnpm start` |
| Convex | Production deployment | Staging deployment | Anonymous local backend |
| Neon | Default branch | `staging` branch | Local Postgres 16 |
| Upstash | Vercel only | Vercel only | Blank |
| Sealed service | `c7g.large`, 1-year commitment, `us-east-1` | Own instance (question 1) | Dev sealed service |
| KMS key | `alias/lgi-sealed-production` | `alias/lgi-sealed-staging` | Dev stand-in |

The enclave never calls Upstash; it keeps its own ESI scoreboard (Part 18). Upstash therefore comes off Part 05's allowlist.

### AWS layout

| Item | Setting |
| --- | --- |
| Account | One account. Root has MFA and is break-glass only. Each environment has its own roles and KMS key (Part 06) |
| Network | Public subnet with one public IPv4 address. No inbound rules; outbound 443 plus 5432 to Neon. No NAT gateway or load balancer |
| Operator access | SSM Session Manager only, no SSH. The parent holds nothing readable (Part 05) |
| Instance | Amazon Linux 2023 in an Auto Scaling group: desired 1, max 2 (for releases only). `nitro-cli`, `vsock-proxy` and the allocator are pinned. The allocator reserves 1 vCPU and 2,816 MiB, so one instance fits one enclave |
| Images | Enclave image files (EIFs) built in CI (Part 27), stored by hash in a private S3 bucket. The launch template names the EIF hash |
| Infrastructure as code | `infra/aws/` CloudFormation, one stack per environment (question 4) |

### Configuration and secrets

| Item | Where |
| --- | --- |
| Environment profiles (KMS ARN, Convex URL, Neon host) | Baked into the image; the parent picks only the profile name (Part 06) |
| Identity-assertion public key | Never baked into the image. The enclave creates the key pair in bootstrap mode and publishes the public half in the attestation `user_data`; Vercel and Convex pin it at bootstrap (Parts 06 and 08). So bootstrap needs no new image and leaves PCR0 unchanged |
| Enclave's Neon role password | Supplied by the parent. Not secret from the operator; it keeps other parties out |
| EVE client secret, token key, Convex signing key, identity-assertion signing key | Generated or imported inside the enclave and sealed under the service root key. `EVE_CLIENT_SECRET` leaves Vercel with Part 08 |
| `EVE_TOKEN_ENCRYPTION_KEY`, `ESI_SNAPSHOT_ENCRYPTION_KEY` | Vercel until Phase 5, then destroyed (Part 31) |
| `CONVEX_SERVICE_SECRET` | Vercel and Convex. Guards token vending until location polling and ESI sync move to the enclave (Parts 17 and 18). That phase deletes `src/app/api/internal/eve-token` and `eve-characters` and the Convex vending path, then rotates the secret. Only after that does it guard metadata and scheduling alone |
| `BETTER_AUTH_SECRET`, `CRON_SECRET`, KV tokens | Vercel, unchanged; metadata and scheduling only |
| `DATABASE_URL`, `GSC_SERVICE_ACCOUNT_JSON`, `LINEAR_API_KEY`, `DISCORD_ALERT_WEBHOOK_URL` | Vercel, unchanged; metadata, sealed blobs or public data only |

### Limits

Three roles can still defeat the design, and this part assigns them. Whoever holds Vercel deploy rights for lgi.tools could ship JavaScript that leaks a user's keys after login. Whoever holds the AWS root or admin account can change the key policy; the release job and alerts make that visible through the published fingerprints but cannot stop it. AWS signs the attestation. And anyone holding a user's EVE login reaches that user's data (decision 5).

### Deploying and restarting

1. CI builds the EIF reproducibly and records its fingerprint (Part 27).
2. The app deploys with both the old and new fingerprints allowed (Part 06). This always lands before the key-policy change.
3. `sealed-release.yml` runs; production needs the owner's approval. It updates the key policy, then the launch template's EIF hash, then starts an Auto Scaling instance refresh (max 2, minimum healthy 100%).
4. The new instance's parent fetches the EIF by hash, checks the hash, and runs `nitro-cli run-enclave` without debug mode. The new enclave unseals and reports ready.
5. A lifecycle hook tells the old enclave to release the lease. The new enclave takes it at once, and the old instance terminates (Part 05).

The overlap costs cents on demand; the commitment covers whichever instance is running. Logins, key release, polling and map edits see no gap. Planned releases start inside EVE downtime (11:02 to 11:12 UTC, matching Part 05), when SSO and ESI are down anyway, and run an ESI smoke check after Tranquility returns. They never run in the 12:00 UTC batch hour.

Unplanned failures still leave a gap. systemd restarts a crashed enclave with backoff (EIF boot plus KMS unseal, measured on staging). The Auto Scaling group replaces an instance that fails its health checks, which takes several minutes. A stale Convex heartbeat raises an alert (Part 29). SSM Run Command is kept only for an in-place restart of the running image.

**Lease.** The lease is folded into the heartbeat the enclave already writes: one write every 30 seconds, 90-second expiry. Part 05's 10-second figure changes to match. A clean release hands the lease over explicitly, so expiry matters only after a crash.

**Vercel crons** keep their schedules on Hobby. The queue drain step posts sealed `sync` jobs and waits up to 90 seconds for the replies, so it records budget deferrals and attempts as today; unanswered jobs return without using an attempt (Part 18). The revaluation step then posts one `revalue` job and waits up to 60 seconds for its summary (Part 22). Both bounded waits fit inside the 300-second limit alongside today's other steps, and the Vercel side sees only codes and counts. The enclave runs the work in today's order.

### Regions and latency (estimates)

`us-east-1` sits beside Vercel `iad1` and Convex's default region. Each hop among Vercel, Convex and the enclave takes 1 to 5 ms; vsock adds under 1 ms. The enclave reaches Neon in 1 to 15 ms, depending on Neon's region. ESI and EVE SSO take about 70 to 90 ms, the same as from Vercel today.

### Backups and history windows

| Store | Holds after sealing | Rule |
| --- | --- | --- |
| Neon history | Metadata, sealed documents, key records, root-key blob | The only restore path for key records (decision 9: no extra backups). Read the window from the console and record it here; no plan change for it. Crypto-shredding is final only once it passes (Part 11) |
| Neon `staging` branch | May hold a production copy from when it was branched | Re-create it as a schema-only or root branch, seeded by migrations and SDE ingest (`build:vercel` runs both), once production plaintext is retired (Part 31). Once any feature's sealing starts, never branch or reset staging from production |
| Convex backups | Readable and sealed rows | Never kept longer than Neon history |
| KMS | Key material | 30-day deletion wait; no second region |
| CloudWatch Logs | Codes and counts, no content or location identifiers | 30 days |

### Dev sealed service and its guards

`pnpm dev:sealed` runs `sealed-service/runtime/dev.ts`: the same custody and worker code, with stand-ins for the Nitro Security Module and for KMS. `dev:all`, `stack.sh`, the cloud guide and CI's `e2e` job gain it, and the `e2e` job also gains the anonymous local Convex. There is no mode that skips encryption.

| Guard | How |
| --- | --- |
| Dev root kept out of release bundles | The browser imports it only in a development build or when `LGI_E2E_DEV_ATTESTATION=1` is set at build time. Only `test.yml`'s `build` job sets the flag, and its artifact never deploys. A new `scripts/assert-no-dev-attestation.mjs` step in `build:vercel` fails if the flag is set or the dev fingerprint appears in `.next` |
| Dev entry kept out of the image | The esbuild bundle for `runtime/main.ts` fails if it reaches `runtime/dev*` or the stand-ins, and a Fallow boundary blocks other imports of them |
| Only local stores accepted | An allowlist: the dev process starts only if every store URL is loopback (the `lib.sh` loopback class), or the CI `postgres` service host when `GITHUB_ACTIONS=true` and the E2E flag are both set. It also exits if `NODE_ENV=production` without the flag, or if `VERCEL_ENV` is set |
| Fingerprint and keys are distinct | It reports a `dev` profile and a marker fingerprint. Neither is ever on the staging or production lists, and hosted Better Auth and Convex reject its assertion key |
| E2E Pilot | A pilot key release gated on development or the E2E flag, plus the store allowlist above, not on `NODE_ENV=development` alone |
| Demo-board sealing helper | The dev-only helper that seals `home-board.spec.ts`'s demo board as the pilot's view is a sealing oracle (Part 32). It refuses to run under `NODE_ENV=production` without the E2E flag, when `VERCEL_ENV` is set, or when any store URL is hosted (the `lib.sh` hosted class). A Vitest test covers each refusal |

Cloud sessions hold no AWS credentials. `lib.test.sh` covers the new guards.

### Cost (monthly estimates, `us-east-1`)

| Item | Production | Staging |
| --- | --- | --- |
| `c7g.large` | About $32 to $34 (committed); cents for release overlap | $0 to $34 (question 1) |
| Public IPv4, EBS root volume, KMS key | About $6 | About $6 while running |
| CloudTrail, EventBridge, SNS email, CloudWatch, S3 | $0 within free tiers | Shared |
| Data transfer out (well under 10 GB) | $0 within the 100 GB free allowance | $0 |
| **AWS total** | **About $38** | **About $5 to $40** |
| Vercel, Upstash | No change. Speed Insights is removed with Part 26; no cost change on Hobby | |
| Convex | No change expected. Polling leaves Convex. Lease-plus-heartbeat writes add about 86k calls a month per environment, about 173k with an always-on staging enclave, before subscriptions and sealed requests. Check against the team quota on staging | |
| Neon | No change, provided the enclave never keeps a compute awake | |

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Enclave images, fingerprints | Yes (public build) | No | CI |
| Service root key blob | No | Yes (KMS) | Sealed service |
| Instance config, profiles | Yes (operator) | No | AWS |
| Lease, heartbeat, running fingerprint | Yes (Convex) | No | Sealed service writes |
| Neon history, Convex backups | Metadata, versions, timestamps | Sealed documents, rows, key records | LGI server |
| Upstash scoreboard, limiter, public cache | Yes | No | LGI server |
| Enclave logs, CloudTrail | Yes (codes, counts, AWS events) | No | Sealed service, AWS |

## Hard rules

1. [Agreed] Same repo and development → staging → main flow (decision 2).
2. [Proposed] Everything stays on lgi.tools and Convex stays the relay and store (fixed by the brief; one domain is a working note in the README).
3. [Agreed] The sealed service runs on AWS Nitro on a 1-year commitment.
4. [Agreed] The KMS key has a deletion wait and an alert. There is no second-region copy and no extra backup.
5. [Agreed] No infrastructure step shows users anything new (principle 1).
6. [Proposed] AWS hosts only the sealed service and its KMS, alerting, image and log pieces. It serves no pages, uses no subdomain and has no inbound port.
7. [Proposed] Staging and production never share a KMS key, instance, role, Convex deployment or Neon branch.
8. [Proposed] Infrastructure and key-policy changes come only from `sealed-release.yml` applying `infra/aws/`; production changes need the owner's approval. Allowed exceptions: Auto Scaling replacement of a failed instance, systemd restarts, and SSM Run Command restarting the running image.
9. [Proposed] The app deploy that allows a fingerprint ships before the key-policy change.
10. [Proposed] Releases use an instance refresh with minimum healthy 100%; the old enclave hands over the lease only after the new one is ready.
11. [Proposed] The parent fetches the EIF by hash and checks the hash before running it. No SSH on the parent and no debug-mode enclaves.
12. [Proposed] The enclave never calls Upstash, keeps its own ESI scoreboard, never holds an idle Neon connection, and finds work through Convex.
13. [Proposed] Content steps in Vercel crons post sealed jobs and wait only within bounded limits: 90 seconds for the drain (Part 18) and 60 seconds for revaluation (Part 22), inside the 300-second invocation. Vercel stays on Hobby unless the owner approves a change.
14. [Proposed] Planned enclave releases start inside EVE downtime (11:02 to 11:12 UTC) and never in the 12:00 UTC batch hour.
15. [Proposed] The dev sealed service runs the enclave's code, accepts only allowlisted local stores, and never reaches a deployed bundle or image. Its demo-board sealing helper refuses production builds without the E2E flag, Vercel and hosted stores. There is no plaintext mode.
16. [Proposed] Cloud sessions hold no AWS credentials.
17. [Proposed] Read the production Neon history window from the console and record it here; do not change plan for it. Part 11 and this part give the same recommendation.
18. [Proposed] Convex backups are never kept longer than Neon history.
19. [Proposed] Enclave logs carry no content or location identifiers and are kept 30 days.
20. [Proposed] The KMS deletion window is 30 days.
21. [Proposed] Once any feature's sealing starts, staging is never branched or reset from production.
22. [Proposed] `CONVEX_SERVICE_SECRET` is rotated when the token-vending routes are deleted.

## Assumptions

| Assumption | How to check |
| --- | --- |
| Neon and Convex production run in AWS US East | Each console. `us-east-1` still wins if Neon is elsewhere, because edits flow through Convex |
| `c7g.large` runs enclaves at about $32 committed, and Spot works too | Part 05 check 1; boot a test enclave on Spot |
| An instance refresh hands over with no visible gap | Staging release while a test browser edits a map and logs in |
| The `staging` Neon branch came from production | `neon branches list` |
| The Neon plan and history window are known, and Convex backups keep data no longer | Neon and Convex dashboards |
| Lease writes and sealed requests for both environments fit the Convex team quota | A week of staging usage |
| SSM and S3 work with outbound-only rules and no NAT | Staging bring-up |

## What users see

Nothing new. Planned releases overlap two instances, so nothing pauses. After an unplanned crash or instance replacement, logins, key release, polling and map edits wait for a few minutes (measured on staging). Browsers retry pending edits and logins silently, and anything past the request deadline shows only states the app already has (Part 05).

## Questions for the owner

1. **Staging enclave: always on, or started on demand?** Options:
   - always on with a commitment, about $38 a month;
   - always on as Spot capacity, about $20 to $25, where interruptions double as restart tests;
   - started by a workflow and stopped after 4 idle hours, about $5, but staging sign-in fails while it is off.

   *Recommended:* Spot, always on, through Phase 5, because staging is the long-lived test environment. After that, switch to on-demand starts if cost matters.
2. **AWS region?** *Recommended:* `us-east-1`.
3. **Dev-mode guards?** *Recommended:* all six above. Every local stack and CI's `e2e` job run the dev sealed service, with no plaintext mode.
4. **Infrastructure as code?** Options: CloudFormation, AWS CDK or Terraform. *Recommended:* CloudFormation. It adds no npm dependencies and agents can review it.
5. **Neon history window?** Options: keep whatever the current plan gives, or pay for a longer window. *Recommended:* keep the current plan and record the value. It is the only restore path for key records, and it also sets how long deleted data and pre-migration plaintext survive; a shorter window makes crypto-shredding final sooner (Part 11).
6. **One AWS account or two?** *Recommended:* one, with separate roles and keys. A second account under AWS Organizations is free if you want harder separation later.
7. **Releases: overlap or stop-then-start?** *Recommended:* overlap through an instance refresh, for cents per release. Stop-then-start leaves a gap of EIF boot plus unseal on every release.
