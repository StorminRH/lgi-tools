# Part 03: What stays readable and what it reveals

**Status:** Draft for owner review

## In one paragraph

Principle 2 keeps metadata readable on LGI's servers and seals content. This part lists what an operator, or someone who steals a database or backup, can still learn once content is sealed. It covers accounts and alts, owner hashes, corporations, maps and their names, access lists, blocks, roles, presence, tracking selections, activity timing, row counts and sizes, sync timestamps, IPs, user agents and telemetry. It sets one rule: readable is not trusted. Every readable field that decides who gets a key is checked again by the sealed service. It also asks the owner to accept three timing and size leaks, to decide where (if anywhere) the list is published, and to keep today's retention for readable metadata.

## How it works today

Today operators can read everything. The fields below stay readable after this plan.

- **Accounts and characters.** `account` links each EVE character (`accountId`) to an LGI account (`userId`), so alts are visible. It holds `ownerHash`, `scope` and the authorization health counters. `characters` holds name, corp, alliance, faction, `affiliationRefreshedAt` and `lastLoginAt`.
- **Sessions.** `session` stores `ipAddress` and `userAgent`. Sessions last 7 days (`expiresIn` in `auth.ts`) and are pruned 1 day after expiry (`SESSION_RETENTION_DAYS = 1`). Upstash keys some rate limits by IP for short windows (`src/lib/rate-limit.ts`).
- **Maps.** `maps` holds owner, `name` and lifecycle timestamps. `map_access` holds character or corporation grants with role `viewer`, `editor` or `admin` and `grantedAt`. `map_blocks` and `map_block_accounts` record blocked characters, who blocked them, when, and every account kept off. Convex `mapAccess` projects user, roles and trackable characters per map.
- **Corp roles.** `corp_member_roles` stores each character's ESI corp roles. `corp_access_audit` logs each corp access decision with user, character, corp, outcome and reason, kept 400 days.
- **Presence.** Convex `syncPresence` gets a heartbeat every 60 seconds per open tab (`HEARTBEAT_MS`), with `lastSeenAt` and `lastVisibleAt`. Rows are swept 7 days after the last heartbeat (`RETENTION_MS`, `convex/engineSweep.ts`).
- **Tracking.** Convex `mapTracking` records which character is tracked on which map, with no timestamps. `locationSync.coveredCharacterIds` shows who is online in game right now.
- **Map activity.** `mapEvents` keeps `at`, `kind` and `actor` readable beside the payload, for 7 days (`MAP_EVENT_RETENTION_MS`).
- **Sync state.** Sync tables and `esi_refresh_jobs` record when each character's data was pulled. Jobs are kept 7 days, dead letters 30.
- **Telemetry.** `usage_logs` stores `characterId`, `action` and metadata for 180 days. Page views store the full `path`, `search` and a `visitor_id` (`page-view-metadata.ts`). Feedback stores the page path in `usage_logs` and sends it to Linear.

Files: `src/db/auth-schema.ts`, `src/platform/auth/auth.ts`, `src/platform/auth/constants.ts`, `src/data/maps/schema.ts`, `src/data/maps/access-contract.ts`, `src/data/maps/chain-events.ts`, `convex/schema.ts`, `convex/engineSweep.ts`, `src/lib/sync-engine.ts`, `src/data/telemetry/schema.ts`, `src/data/telemetry/constants.ts`, `src/components/telemetry/page-view-metadata.ts`, `src/app/api/feedback/route.ts`, `src/composition/pipelines/housekeeping.ts`, `src/lib/rate-limit.ts`.

## What changes

Nothing visible to users. Readable metadata keeps its current shape and retention. Two things change behind the scenes. First, the sealed service stops trusting readable fields when it decides who gets keys or data. Second, Part 04 cleans telemetry and logs so they carry route patterns and codes, not IDs from content.

## Design

**What stays readable and what it reveals**

| Item | Where | What an operator or thief learns | Accepted? |
|---|---|---|---|
| Account-to-character links | Neon `account` | Which characters are alts of one person | Yes (principle 2) |
| Owner hash per character | Neon `account.ownerHash` | When a character changes hands | Yes |
| Names, corp, alliance, faction | Neon `characters` | Which corps and alliances use LGI (public at CCP) | Yes |
| Corp roles and sharing opt-in | Neon `corp_member_roles`, `corp_structure_sharing` | Who holds director-level roles; which corps share data | Yes |
| Maps and names | Neon `maps` | That a map exists, its name, owner, created and archived times | Yes (principle 2) |
| Access lists and blocks | Neon `map_access`, `map_blocks`, `map_block_accounts`; Convex `mapAccess` | Who may open which map, with what role; who was blocked and by whom | Yes |
| Tracking selections | Convex `mapTracking` | Which characters are tracked on which map (not where they are) | Yes |
| Presence heartbeats | Convex `syncPresence` | When each user has LGI open, to the minute | Yes, if the owner agrees |
| Location write timing | Convex sealed location rows | When a tracked character jumps, docks or changes ship | Yes, if the owner agrees (06 open question 5) |
| Map row counts and edit timing | Convex row counts, `_creationTime`, `mapEvents.at`, `kind`, `actor` | Rough map size; who edits which map, when, and what kind of edit | Yes, if the owner agrees |
| Sealed document sizes | Neon sealed documents | Rough volume of assets, jobs or holdings | Reduced by padding (below) |
| Sync timestamps | Sync tables, `esi_refresh_jobs` | When each character's data refreshed, which hints at page views | Yes |
| IP and user agent | Neon `session`, Upstash keys, Vercel logs | Where and on what device users log in | Yes, with today's retention |
| Telemetry | Neon `usage_logs` | Which character used which route and when | Yes, after Part 04 strips IDs from paths |
| Feedback | Neon `usage_logs`, Linear | Page pattern and what the user chose to write | Yes |

**What no longer leaks** once Parts 04, 17, 22 and 24 land: `coveredCharacterIds` and `characterLocationOnline` (online in game), location ETags, the `wh_observations` link from wormhole sightings back to maps, IDs in telemetry paths and error text, and market rows seeded from holdings.

**Size padding.** A sealed signature row whose length tracks `typeName` could reveal the site type. A sealed asset document's length tracks how many stacks someone owns. The design pads plaintext before sealing: map rows to a fixed size per table, and per-owner documents to the next power of two from 1 KiB. Part 09 fixes this in the envelope format; Part 16 sets the per-table sizes. Users see nothing.

**Readable is not trusted.** These readable fields decide who gets keys or content. An operator who edits them could admit their own character. The sealed service must not release a key on the readable value alone.

| Readable field | Sealed decision it gates | How the sealed service checks it | Part |
|---|---|---|---|
| Character links (`account.userId`) | Whose user key and data a login reaches; merges | Its own record of character links, written only from EVE logins it verified | 08, 11 |
| Owner hash (`account.ownerHash`) | Sale detection before key release | Compares the JWT's owner hash with its own stored record | 08, 14 |
| Affiliation (`characters.corporationId`) | Corp grants on maps; corp data | Fetches affiliation from ESI itself (one-hour cache) | 12, 23 |
| Corp roles (`corp_member_roles`) | Corp data visibility | Re-reads roles from ESI before release (Part 23 decides) | 23 |
| Access lists (`map_access`, `mapAccess`) | Map key release | Verifies the signed hash chain of accepted versions (default; Part 12 decides) | 12 |
| Blocks (`map_blocks`, `map_block_accounts`) | Map key release | Part of the same signed chain; LGI's own sale blocks accepted unsigned | 12, 14 |
| Tracking selections (`mapTracking`) | Which map a character's sealed location is written to | Accepts only opt-ins it received over the user's browser session key, and only for members | 17 |
| Presence (`syncPresence`) | Whether polling runs | Heartbeats tied to the browser session key, or accepted as low risk | 17 |

Removals that only take access away (sale, affiliation loss, deletion) can be accepted unsigned. A forged removal can deny access but cannot leak content.

**Disclosure.** Decision 2 rules out in-app messaging. The default is one page in the public repo (`docs/what-lgi-can-see.md`), generated from this part's first table. It is not linked from the app. The owner can link it from a forum post.

**Retention.** Readable metadata keeps today's values. Nothing is shortened or extended.

| Item | Retention today |
|---|---|
| Sessions (IP, user agent) | 7-day session, deleted 1 day after expiry |
| OAuth state (`verification`) | 1 day after expiry |
| Presence (`syncPresence`) | 7 days after last heartbeat |
| Map event log (`at`, `kind`, `actor`) | 7 days |
| Account-merge tracking receipts | 90 days |
| ESI refresh jobs / dead letters | 7 / 30 days |
| Telemetry (`usage_logs`) | 180 days |
| Domain events, corp access audit, GSC | 400 days |
| Accounts, characters, maps, access lists, blocks | Until deleted by the user or purge, as today |

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Account links, owner hash, scope, auth health | Yes | No | LGI server; sealed service keeps its own copy of links and owner hashes |
| Affiliation and corp roles | Yes | No | LGI server; sealed service re-reads from ESI when they gate a release |
| Maps, names, lifecycle | Yes | No | LGI server |
| Access lists, blocks, `mapAccess` | Yes, with a signed chain | No | LGI server stores; sealed service signs and verifies |
| `mapTracking`, `syncPresence` | Yes | No | LGI server stores; sealed service checks tracking before writing |
| `locationSync.coveredCharacterIds` | No (dropped) | Inside the sealed location row | Sealed service |
| Map row counts, `mapId`, retention timestamps | Yes | Row bodies sealed and padded | LGI server schedules; sealed service writes |
| `mapEvents.at`, `kind`, `actor` | Yes | `payload` | Sealed service writes; LGI server purges |
| Sync timestamps, large-body ETags | Yes | Small-body ETags | LGI server |
| Session IP and user agent | Yes | No | LGI server |
| `usage_logs` with route patterns | Yes | No | LGI server |

## Hard rules

1. [Agreed] Metadata listed in principle 2 stays readable: users, corporations, that maps exist, map names, membership and access lists.
2. [Agreed] Nothing about what stays readable is shown in the app (decision 2).
3. [Proposed] The sealed service never releases a key or content on a readable field alone. Each field in the "Readable is not trusted" table is checked by the part named there.
4. [Proposed] Readable changes that only remove access may be accepted unsigned. Changes that add access must pass the sealed service's check.
5. [Proposed] No new readable field may be added to a sealed table without updating this part's table and the public disclosure page in the same pull request.
6. [Proposed] Readable fields hold IDs, timestamps, counts and codes only. No free text from ESI responses, no content IDs (systems, structures, locations, types) in readable columns, logs, telemetry or URLs.
7. [Proposed] Sealed plaintext is padded before encryption: map rows to a fixed size per table, per-owner documents to the next power of two from 1 KiB.
8. [Proposed] Retention for readable metadata stays at today's values. Changing any value is an owner decision.
9. [Proposed] The disclosure page is generated from, or checked against, this part's table so the two cannot drift.

## Assumptions

- **The repo is public.** The disclosure page relies on it. Check the GitHub repository visibility.
- **Operators can see Convex `_creationTime` and write times.** If so, edit timing leaks whatever the row shape. Check in the Convex dashboard.
- **Better Auth fills `session.ipAddress` and `userAgent`.** Check rows on staging.
- **Padding cost is small.** Maps are capped near 128 systems, so padded rows add kilobytes. Check Convex storage on staging after Part 16's conversion.
- **Vercel request logs keep paths for a short window.** Check the plan's log retention; Part 04 removes IDs from paths either way.

## What users see

Nothing new. No disclosure banner, no settings, no copy changes. The disclosure page lives only in the repo.

## Questions for the owner

1. **Which timing and size leaks are accepted?** Map size from row counts, jump and dock times from location writes, and site-use time from heartbeats. Recommended: accept all three. Hiding them needs constant-rate writes (roughly 20 to 40 Convex writes per second at 200 tracked pilots) or dummy rows, for little gain.
2. **Pad sealed rows and documents?** Recommended: yes, as in rule 7. It closes the site-type and asset-volume leaks at almost no cost and no visible change.
3. **Where is what stays readable disclosed?** Recommended: one page in the public repo, not linked from the app, which the owner can cite in a forum post.
4. **Retention for readable metadata?** Recommended: today's values, as in the retention table.
5. **Should tracking selections and heartbeats be checked by the sealed service?** Recommended: yes for tracking selections (a forged one would publish a victim's location to a map), decided in Part 17. Heartbeats can stay unchecked if Part 17 finds tying them to the browser session key costly.
