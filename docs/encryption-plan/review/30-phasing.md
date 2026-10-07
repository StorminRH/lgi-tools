# Part 30: Shipping in parts: phases and exit criteria

**Status:** Draft for owner review

## In one paragraph

Decision 2 says the change ships in parts, through normal releases, with no visible change and no cutover day. This part turns that into six phases. Phase 0 closes the leaks that need no sealed service. Phase 1 brings up the sealed service and moves every EVE token into it, including location polling. Phase 2 seals the mapper. Phase 3 seals personal data. Phase 4 seals corp data. Phase 5 destroys any environment key still alive and checks that no plaintext is left. Each phase follows one pattern: add, switch, convert, soak, retire. The part recommends moving polling in Phase 1, one readable switch per feature instead of a flag service, sealing that is one-way per map or document, and exit criteria of zero old-format rows rather than a percentage.

## How it works today

- PRs merge to `development`. Promote carries `development` to `staging`, and release carries `staging` to `main`, each with two review rounds, `pnpm verify` and green Verify and Coverage health, stopping for the owner.
- Only `main` and `staging` deploy. Each deploy runs `convex deploy --cmd 'pnpm build:vercel'`, which applies Neon migrations and builds Next, so all three ship together. A Vercel instant rollback reverts only the app. `convex/schema.ts` uses `defineSchema` with default validation, so a schema push that existing documents do not match fails the whole deploy.
- There is no feature-flag system; server settings are environment variables (`src/lib/env.ts`). There is no version-skew handling: no build id, no reload trigger, nothing in the `syncPresence` heartbeat. Open tabs keep their old bundle.
- Sessions last 7 days and slide (Better Auth's default update age).
- A null or empty `refresh_token` marks a character as needing reconnection in settings, industry and admin (`hasRefreshToken` feeding `deriveCharacterHealth`).
- Verify runs typecheck, lint, static Fallow, the build and Playwright smoke (`smoke.spec.ts`, `home-board.spec.ts`). The e2e session comes from `becomeSyntheticPilot` with no EVE login; the board test stubs `/api/account/board` with plaintext `buildDemoBoard` JSON; `CONSOLE_ALLOW` admits `va.vercel-scripts`. Coverage health runs on every pull request push.
- Corp visibility has unit tests (`corp-visibility.test.ts`, `corp-access.test.ts`, `asset-map.test.ts`) but no end-to-end per-viewer comparison.
- The older plans (01 "Rebuild plan", 02 DR-SCOPE and DR-MIGRATION, 04 §25) used week-based milestones, alpha corps, browser export and import, and a 30-day read-only old app. All superseded.

Files: `.claude/skills/{prepare,promote,release}/SKILL.md`, `src/scripts/vercel-convex-deploy.ts`, `convex/schema.ts`, `src/lib/env.ts`, `src/platform/auth/{auth,linked-characters,scope-health,eve-token-service}.ts`, `src/composition/{synthetic-pilot-store,corp-viewer}.ts`, `src/features/owned-assets/asset-map.ts`, `src/mapper/chain/NoMapAccess.tsx`, `.github/workflows/`, `e2e/`.

## What changes

Nothing visible changes for users beyond the items under "What users see". Behind the scenes: a readable switch per feature, one-way format markers, a build id in the heartbeat, conversion jobs, soaks and written exit criteria. Dropped: the old milestones and weeks, alpha and beta cohorts, export and import, and the read-only old app.

## Design

### Phases

| Phase | Scope (parts) | Prerequisites | Plaintext retired at the end |
|---|---|---|---|
| 0 Leak fixes | Part 04's eight Phase 0 PRs (all but 0-7); drop `saved_plans` (Part 20); build id in the heartbeat | None | `wh_observations`, `saved_plans`, path telemetry, free-text errors |
| 1 Foundation and tokens | Sealed service, attestation, KMS and alerts (05, 06, 25, 27); transport (07); strict CSP, Speed Insights removed (26); login and token custody (08); key records for every account (09, 31); location polling (17); personal sync and corp pulls by the workers (18, 23) | Phase 0; Part 05's instance checks | `characterLocationAccess`, `/api/internal/eve-token`, operator-readable token ciphertext, refresh tokens at Vercel |
| 2 Mapper | Access-list chain (12); map keys (13); sale rule and notices (14); map logic and sealed rows (15, 16); sealed location rows (17). Optional passkeys and recovery keys (10) as their own release | Phase 1 exit; pre-switch sessions ended; Convex backfills (Part 16); PRs 0-3, 0-5, 0-6 (scanner) | Plaintext map and location rows; jump doorbell and signature-elimination routes |
| 3 Personal data | Documents (20), sync documents (18), precomputed views (19), assets and net worth (22), industry inputs (21), one dataset at a time | Phase 2 exit; PRs 0-4, 0-6 (seeding) | Personal ESI tables, plaintext documents, personal ports, personal `'use cache'` wrappers (0-7) |
| 4 Corp data | Corp documents, per-viewer filtering, corp keys (23) | Phase 3 exit; golden outputs captured | `esi_snapshots`, `corp_holding_nodes`, the corp port, corp `'use cache'` wrappers, then `ESI_SNAPSHOT_ENCRYPTION_KEY` |
| 5 Last removal | Destroy any environment key still alive (question 5); outlast Neon history and Convex backups; Part 31's checklist; re-create the staging Neon branch | Phase 4 exit | Everything left |

No phase changes Part 01's limits: AWS signs the attestation and the AWS account owner can change the key-release rule (visible in the published fingerprints); whoever serves lgi.tools could ship code that leaks keys after login; anyone holding a user's EVE login reaches their data. Until its phase ships, a feature's content is as readable to operators as today.

**Why Phase 1 moves every token at once.** Refresh tokens rotate, and each refresh is guarded by compare-and-swap (`eve-token-service.ts`), so two holders would break each other. The release that seals tokens moves every token-bearing job into the workers: polling, personal sync, corp pulls, the daily authorization re-check, character and structure search. Until their phase, the workers write today's tables through temporary plaintext ports (Parts 17, 18, 23). This goes beyond decision 2's per-feature token removal, so it needs sign-off (question 6).

### Release pattern inside a phase

| Step | What ships | Rollback |
|---|---|---|
| Add | New tables and columns, sealed-service code, readers for both formats. Switch off | Forward release reverting code, keeping schema additions |
| Switch | New maps or documents start sealed | Before Convert only: switch back, so nothing new starts sealed. Sealed items stay sealed |
| Convert | Workers convert existing items server-side (Part 31), owner first, everyone the next day. Each item's marker flips atomically with its conversion | Pause the job. Converted items are fixed forward through the sealed path |
| Soak | 7 days on production | Forward fix |
| Retire | Drop plaintext tables, ports, old mutations and the switch. Destructive migrations only here | Roll forward only |

Production conversions and enclave restarts run in Part 25's window (11:15 to 11:50 UTC). A map being converted pauses edits for seconds, like a short sealed-service restart (Part 05).

### Switches, markers and stale tabs

- A Neon table `sealed_rollout` (`feature`, `stage`, `changed_at`, `changed_by`), stages `plaintext` and `sealed`, read with a 60-second cache. It decides only whether conversion runs and whether new items start sealed. The owner changes it through an admin action that logs a usage event and raises an alert (Part 29).
- Each item's own marker decides its format: a readable per-map marker in Convex (Part 16 settles where) and the envelope version on Neon documents (Part 09). Both write paths check it inside the write, so the switch cache cannot cause mixed formats. Today's mutations (`mapScan.ts`, `mapAuthoring*.ts`) refuse writes to a sealed-marked map.
- Sealing is one-way. The sealed service refuses plaintext writes to any item with a key epoch or sealed version, whatever the readable marker says, and browser code from the switch release never takes the plaintext path for it. Editing Neon or Convex cannot downgrade a sealed item; going back needs an enclave release, with a visible fingerprint.
- Phase 0 adds a build id to the `syncPresence` heartbeat and a readable minimum build. Older tabs do a full page load on their next navigation, with no banner.
- No cohorts, client flags or flag service. The retire release deletes the switch.

### Exit criteria and staging proof

Every phase also passes Part 28's checklist and hard rules 10, 11, 16 and 17. For the tests, the dev sealed service issues keys to the synthetic pilot, and a test helper seals the demo board fixtures with the dev key. Once Speed Insights goes, `va.vercel-scripts` leaves `CONSOLE_ALLOW`.

| Phase | Staging must show before release to `main` | Production exit |
|---|---|---|
| 0 | Telemetry rewrite and closed error codes on staging data; a stale tab reloads silently after a deploy | All eight PRs released; no lease survives a cold tab; route-pattern telemetry only; every heartbeat carries a build id |
| 1 | Forged fingerprint refused; policy change and scheduled deletion each alert; owner login with real characters; tracking matching today on a scripted run (cadence, 5-second floor, 5- and 90-minute cold-off, hidden tab in game); the scripted token run | Every non-null `refresh_token` carries the enclave envelope marker; `access_token` and `id_token` null; nothing decrypts under `EVE_TOKEN_ENCRYPTION_KEY`; lease table and route deleted; a key record per account; pre-switch sessions ended |
| 2 | Conversion rehearsed; collapse and chain settle with nobody online; sale rule and lost-access screen; switch flipped while a converted map is edited, with no plaintext write | Every map converted with a chain genesis; plaintext map tables empty; zero dual-read fallbacks for 7 days |
| 3 | Per dataset, views match the plaintext path; 7 nights of net worth match today; page timings before and after cache removal; golden per-viewer outputs captured from today's `corp-viewer.ts` and `visibleCorpAssetInputs` | All personal datasets sealed; no per-ID industry lookups; personal ports removed |
| 4 | Existing corp visibility tests unchanged; sealed path matches the golden outputs | Corp data sealed; corp port and `esi_snapshots` gone; snapshot key destroyed once backups holding them expire |
| 5 | Verification checklist | Remaining keys destroyed; history and backup windows passed; Part 31's checklist clean |

Conversion needs no user action, so "done" means zero old-format rows. The old 90% target existed only because browsers had to import data.

**Rollback limits.** Phase 1's token switch is effectively one-way: pre-switch copies go stale as CCP rotates them. The fallback is Part 08's identity-only Vercel exchange, which re-opens the login leak and is never automatic. So Phase 1 gets a scripted staging token run, not a long soak on an environment only the owner uses: forced repeated refreshes across several characters, enclave restarts mid-refresh, and a check that no grant is revoked.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `sealed_rollout` switches | Yes | No | LGI server; sealed service reads |
| Format markers, conversion cursors, dual-read fallback counts | Yes | No | Sealed service writes (markers one-way); LGI server reads |
| Build id, minimum build | Yes | No | Browser sends; LGI server reads |
| Rows written through Phase 1 plaintext ports | Yes, as today, until their phase | No | Sealed service |
| EVE tokens | No | From Phase 1 | Sealed service |
| Converted content | No | Yes | Sealed service converts; browser decrypts |
| `EVE_TOKEN_ENCRYPTION_KEY`, `ESI_SNAPSHOT_ENCRYPTION_KEY` | Operator-readable until destroyed (question 5) | No | LGI server |

## Hard rules

1. [Agreed] Each phase ships through `development` → `staging` → `main` with no visible change and no in-app messaging about encryption.
2. [Agreed] The order is mapper, then personal data, then corp data. A feature's plaintext tables go once its users are migrated.
3. [Proposed, amends decision 2] All EVE tokens leave Vercel in Phase 1, in one release, ahead of decision 2's per-feature removal. After it, no token exists outside the sealed service.
4. [Fixed by AGENTS.md] `pnpm check` before every commit, `pnpm verify` before every promote and release, zero Fallow findings.
5. [Proposed] Plaintext ports write only tables that exist today and go in their feature's retire release.
6. [Proposed] Each item's marker alone decides its format; both write paths check it inside the write. Readers accept both formats until retire.
7. [Proposed] Sealing is one-way per map or document. The sealed service and post-switch browser code never write plaintext to an item with a key epoch or sealed version. Going back needs an enclave release.
8. [Proposed] Switches decide only conversion and whether new items start sealed. They never gate key release. Switch-back is a rollback only before Convert.
9. [Proposed] Add and switch releases only add schema. Drops ship in a retire release.
10. [Proposed] Rollback is a forward release that reverts code but keeps every Convex schema addition and Neon column until retire, or a switch change before Convert. No Vercel instant rollback. Each phase rehearses one revert on staging.
11. [Proposed] Switch-on and retire releases wait until no heartbeat comes from a pre-switch build. Stale tabs reload silently on navigation.
12. [Proposed] The next phase may be built behind its switch while the current one soaks; switches turn on only in rule 2's order.
13. [Proposed] Phase 2's switch waits until every pre-switch session has ended (question 3).
14. [Proposed] Conversion runs owner first, everyone else the next day.
15. [Proposed] Only the owner changes a switch, with a usage event and an alert; caches hold it at most 60 seconds.
16. [Proposed] Smoke and board assertions stay unchanged and green; each phase stays within Part 32's timing budgets.
17. [Proposed] Each phase soaks 7 days on production with no rollback; the mapper also needs zero dual-read fallbacks for 7 days.
18. [Proposed] Phase 1 passes the scripted staging token run. Part 08's emergency exchange is never automatic.
19. [Proposed] Production conversions and enclave restarts run 11:15 to 11:50 UTC. Emergency fixes may run at any time.

## Assumptions

| Assumption | Check |
|---|---|
| Rotating refresh tokens rule out two holders | `eve-token-service.ts`; Part 08 |
| The owner can complete EVE login on staging | CCP developer portal callbacks |
| Better Auth can stop pre-switch sessions sliding and set a chosen final expiry | Dev session against `auth.ts` |
| Open tabs pick up the Phase 0 build id before Phase 1's switch | Count heartbeats without one |
| Old-path mutations can read the per-map marker in the same write | Convex test on `mapScan.ts` |
| The largest map and owner convert inside the window | Staging rehearsal |
| `daily-batch` stays under 300 seconds | Staging logs |

## What users see

Nothing new except these, each allowed by the README:

| Phase | What | Why |
|---|---|---|
| 1 | Users whose session predates the switch sign in once within 7 days, on today's screen (question 3) | Keys come only from a fresh EVE login |
| 2 | Sale notices to map owners and the corp, through existing toast and notice components (Part 14) | Decision 1 |
| 2, follow-up | Quiet passkey and recovery-key options in settings and at login, no prompts (Part 10) | Decisions 1 and 9 |

A blocked user sees the existing `NoMapAccess.tsx` screen ("You've lost access to this map"), with no new copy. Conversion pauses edits for seconds in the quietest window. A stale tab does one full page load on navigation.

## Questions for the owner

1. **Location polling: Phase 1 or with the mapper?** Waiting means the enclave hands access tokens to Convex until Phase 2, keeping leak 1 open. *Recommended: Phase 1, writing today's plaintext rows until Phase 2 (as Part 04 has it).*
2. **Flag strategy?** (a) Releases only; (b) one readable switch per feature with one-way markers; (c) per-user cohorts. *Recommended: (b), owner first instead of cohorts.*
3. **Sessions created before the Phase 1 switch?** They cannot receive keys without a fresh EVE login. (a) Stop them sliding, so they end within 7 days; (b) wait, though they may never end; (c) send keyless sessions to login on first opening a map. *Recommended: (a), each final expiry set inside 11:15 to 11:50 UTC on a day within the 7, so nobody is signed out mid-task. Phase 2 starts after.*
4. **Soak lengths?** *Recommended: 7 days on production per phase; for Phase 1, the scripted staging token run instead of a 14-day staging soak.*
5. **When to destroy each environment key?** Parts 04 and 25 say Phase 5. *Recommended: the token key at the end of Phase 1, after Part 31's re-seal and one forced refresh per character; the snapshot key at the Phase 4 exit, once backups holding `esi_snapshots` expire. Phase 5 destroys only what is left (amends Parts 04 and 25).*
6. **Move every token in Phase 1?** Decision 2 removes tokens per feature; rotation makes two holders unsafe. *Recommended: approve the amendment.*
