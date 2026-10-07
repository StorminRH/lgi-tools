# Encryption plan review: index

The review parts below are walked through in order, one at a time. As each part is settled it is marked agreed in the README.

| Part | Title | Summary | [Proposed] rules | Owner questions |
| --- | --- | --- | --- | --- |
| 01 | [Scope, principles and threat model](01-scope-and-threat-model.md) | Sets the frame: harden the app in place around one sealed Nitro Enclave service, with hard rules and a new threat model. | 14 | 6 |
| 02 | [Data classification and storage shapes](02-data-classification.md) | Fixes the three storage shapes, sealed-row merge and concurrency, and a no-blind-index default. | 10 | 7 |
| 03 | [What stays readable and what it reveals](03-readable-metadata.md) | Lists what readable metadata still reveals and sets the rule that readable is not trusted. | 7 | 6 |
| 04 | [Leaks to close first](04-leaks-to-close-first.md) | Splits the ten known leaks into Phase 0 fixes and fixes that wait for the sealed service. | 12 | 7 |
| 05 | [The sealed service: shape, runtime and availability](05-sealed-service-shape.md) | Defines the EC2 parent plus Nitro Enclave running Node, with sizing, releases and restart behaviour. | 14 | 6 |
| 06 | [Attestation, KMS sealing and the key-release rule](06-attestation-and-kms.md) | Ties the root key to published enclave images through KMS policy and browser-checked attestation. | 9 | 8 |
| 07 | [Reaching the sealed service: transport and request authentication](07-sealed-channel.md) | Relays sealed, session-signed requests through Convex rows with no inbound AWS port. | 15 | 9 |
| 08 | [EVE login, token custody and token-bearing calls](08-eve-login-and-tokens.md) | Moves the EVE code exchange, owner-hash check and every token into the sealed service. | 13 | 6 |
| 09 | [Keys, sealed formats and getting keys back](09-key-hierarchy.md) | Sets the key hierarchy, browser session keys and one bound envelope format for sealed rows. | 14 | 5 |
| 10 | [Optional passkeys and recovery keys](10-passkeys-and-recovery.md) | Adds optional passkey and recovery-key backups of the user key for outages and permanent loss. | 13 | 6 |
| 11 | [Account lifecycle: link, unlink, merge, transfer and deletion](11-account-lifecycle.md) | Keeps today's lifecycle flows, carries keys through merges and crypto-shreds deleted accounts. | 10 | 7 |
| 12 | [Map access lists, auto-admission, blocks and their integrity](12-map-access-and-integrity.md) | Keeps map access as today but has the sealed service sign access-list snapshots that gate keys. | 15 | 5 |
| 13 | [Map keys, rotation, history and map lifecycle](13-map-keys-and-history.md) | Gives each map epoch-numbered keys that rotate on access loss while keeping history and undo. | 14 | 5 |
| 14 | [Character sales: detection, auto-blocks and notices](14-sale-detection-and-notices.md) | Moves sale detection into the sealed service with automatic list removal, blocks and notices. | 15 | 7 |
| 15 | [Where map logic runs: sealed service or browsers](15-mapper-placement.md) | Recommends running today's mapper logic in the sealed service (Option 1) over browser reducers. | 14 | 4 |
| 16 | [Porting map logic and sealing Convex map rows](16-mapper-port-and-sealed-rows.md) | Ports Convex map mutations to enclave workers and seals map rows that only the enclave writes. | 17 | 7 |
| 17 | [Location tracking in the sealed service](17-location-tracking.md) | Moves location polling into the enclave, writing fixed-size sealed rows per map and character. | 16 | 6 |
| 18 | [Personal ESI sync in the sealed service](18-personal-esi-sync.md) | Keeps the sync pipeline but moves the token-holding fetch and save step into enclave workers. | 16 | 5 |
| 19 | [Personal reads: board, character sheet, skills and jobs](19-personal-reads.md) | Has workers prebuild sealed views stored in Neon so page loads never wait on the enclave. | 12 | 6 |
| 20 | [User-authored documents: profiles, custom structures and preferences](20-personal-documents.md) | Seals user-authored documents in the browser under the user key and moves fit parsing there. | 12 | 5 |
| 21 | [Industry planner, jobs and structures](21-industry.md) | Feeds the browser planner from sealed views and whole public tables instead of per-ID lookups. | 11 | 6 |
| 22 | [Assets, valuation and net-worth history](22-assets-and-net-worth.md) | Runs nightly valuation in the enclave and writes sealed net-worth day rows in today's order. | 17 | 4 |
| 23 | [Corp data: structures, holdings, jobs and visibility](23-corp-data.md) | Seals corp data under per-corp keys and seals per-viewer grant-filtered results. | 17 | 6 |
| 24 | [Public data and private-interest lookups](24-public-data.md) | Replaces lookups that reveal private interest with whole versioned public assets. | 13 | 5 |
| 25 | [Infrastructure, environments and cost](25-infrastructure-and-cost.md) | Lists components per environment, gapless enclave deploys, backups and the added AWS cost. | 18 | 7 |
| 26 | [Browser security on lgi.tools: CSP, scripts and key handling](26-browser-security.md) | Tightens script policy, adds Trusted Types and a crypto worker, with nonces only if invisible. | 16 | 4 |
| 27 | [Code integrity: reproducible enclave builds, fingerprints and releases](27-code-integrity-and-releases.md) | Makes enclave images reproducible with published PCR0 fingerprints and gated releases. | 17 | 5 |
| 28 | [Residual risks and adversarial review](28-residual-risks.md) | Tests the design against concrete attacks and sets the per-phase review checklist. | 12 | 6 |
| 29 | [Operations: monitoring, support, admin tools and incidents](29-operations.md) | Sets metadata-only admin tooling, telemetry, monitoring and incident playbooks for one owner. | 13 | 5 |
| 30 | [Shipping in parts: phases and exit criteria](30-phasing.md) | Defines six phases from Phase 0 leak fixes to plaintext retirement, with exit criteria. | 15 | 6 |
| 31 | [Migrating existing data and retiring plaintext](31-data-migration.md) | Covers server-side conversion of existing data and the checklist proving no plaintext remains. | 16 | 4 |
| 32 | [Testing strategy](32-testing.md) | Tests the work under the existing gates with Vitest, Postgres, recorded attestation and Playwright. | 12 | 6 |
