# Part 19: Personal reads: board, character sheet, skills and jobs

**Status:** Draft for owner review

**Carried from the Part 4 review (2026-10-08), private `'use cache'` audit:** today's cached private reads live only in per-instance memory and rarely hit on serverless (Next docs: entries "rarely survive between requests"; no hit-rate metric exists). Tag invalidation is per instance, so a cron save leaves other warm instances serving old 'hours' data (assets, blueprints, structures, holdings, corp snapshot) for up to an hour; the board already bypasses the cache for net worth (`board-view.ts:82-83`). The board reads each character's `character_skills` row twice (queue and skill levels); one query would do. `revalidateTag` on rig saves (`owned-structures/queries.ts:162`) invalidates nothing useful. Private content never moves to `'use cache: remote'`.

**Carried from the Part 07 review (2026-10-09):** there is no latency-budget table and no job inbox; the personal view refresh is scheduled by the enclave from readable state, not enqueued as a job.

## In one paragraph

Once sheets, skills and personal jobs are sealed (Part 18), Vercel can no longer build the home board or answer the skills and jobs routes. This part settles 06 open question 6: where those reads are computed. Recommended: the sealed service's workers build each view after its data changes, seal it under the account's user key and store it in Neon. Vercel serves that ciphertext with the readable parts it already knows, including gaps and section states, and the browser decrypts. The sealed service stays off the page-load path, so pages load as today, even during a restart. Only clock-dependent fields are finished in the browser. Names are resolved in the workers from public tables held in memory. The `'use cache'` wrappers over personal reads go away.

## How it works today

- **Board.** `useBoardLive` fetches `GET /api/account/board` through `useLiveDataset` with a 4, 8, 15, 30, 60 s cold schedule; `now` re-ticks every 30 s. `getBoardForUserOnView` reads each character's sheet, skills, levels, jobs and assets through `'use cache'` wrappers. It resolves names with per-ID Neon queries (`getTypeNames`, `getImplantDogma`, `getNpcStationFacts`, `getSystemFacts`, `getSkillCatalog`) and `'use cache: remote'` ESI `/universe/names` lookups for corp, alliance and nameless station names, then runs the pure `assembleBoard`. Assembly turns each section's `denied` flag and scope health into gaps and `pending`/`reconnect`/`ready` states (`BOARD_GAPS`, `SECTION_GAP`, `canSync*`). Sections depend on each other: `mapAttributes` needs implants; `mapStatus` and `mapClones` need structure names. `after(() => refreshBoardDatasets(userId))` then calls ESI inline behind each freshness gate. `esi_refresh_jobs` holds only budget deferrals (`enqueueBudgetDeferral`), drained daily. The board never prices on view (`valuationTypeIds: []`).
- **Character sheet.** No separate page; sections are fields of each `BoardCharacter` (`CharacterDetail`, `sections/*`).
- **Clock use.** `assembleBoard` uses `now` only in `mapIndustry`. The browser already derives queue progress (`board-view-model.ts`) and job status (`live-derive.ts`).
- **Skills.** `GET /api/industry/team-skill-levels`, `POST /api/industry/skill-levels` and `GET /api/account/industry-slots` read `character_skills.skillLevels` and fire `refreshSkillsOnView` in `after()`. `use-slots-live` re-fetches every 5 s, up to 24 times, while cold.
- **Jobs.** `GET /api/account/industry-jobs` reads each job board through `getLiveDatasetOnView`. `use-jobs-live` uses the default `RECONCILE_ONCE`: one re-fetch after 4 s.
- **Purge.** Tables are removed through `PurgeContributor` entries (tier, claims, `purgeCharacter`/`purgeUser`, merge rules), checked by the data-ownership and table-growth registries.
- Signed-out users get an empty response; the home page shows the demo board.

Files: `src/composition/board/{board-view,board-assemble,name-book,api-contract}.ts`, `src/components/composition/board/{use-board-live,board-view-model}.ts`, `src/components/use-live-dataset.ts`, `src/lib/live-dataset.ts`, `src/composition/sync/{skills-sync,industry-jobs-sync}.ts`, `src/features/{character-sheet,skill-queue,industry-jobs}/queries.ts`, `src/features/industry-jobs/{live-derive,use-jobs-live,use-slots-live}.ts`, `src/data/eve-data/{entity-names,character-facts}.ts`, `src/platform/purge/{types,merge}.ts`, `src/composition/__tests__/{data-ownership-registry,table-growth-registry}.ts`, `src/app/api/account/*/route.ts`, `src/app/api/industry/{skill-levels,team-skill-levels}/route.ts`.

## What changes

Nothing visible to users. Routes return a readable skeleton plus sealed views; a browser decoder produces today's typed responses, so components do not change. Assembly and names move into the workers, the inline `after()` refresh becomes an enqueue, and server caches over these reads go.

## Design

**Three options** (06 open question 6):

| | A. Precomputed sealed views (default) | B. Live sealed-service query | C. Browser decrypt and assemble |
|---|---|---|---|
| Who assembles | Workers, after writes | Enclave, every page load | Browser |
| Page-load path | Vercel and Neon, as today | Adds a Convex round trip (Part 07) | Vercel and Neon, plus name data |
| Enclave down | Pages load; refreshes wait | Board and planner fail | Pages load |
| Names | Enclave | Enclave | Bulk assets or leaky per-ID lookups |

**View kinds.** One sealed row per (account, character, kind).

| Kind | Built from | Content | Served by |
|---|---|---|---|
| `board_card` | Nine sheet-section documents | Sheet content of `BoardCharacter`, names baked in | `/api/account/board` |
| `skills` | `character_skills` only | Queue, levels, `slotCapacity` result, industry subset | `board`, `industry-slots`, `skill-levels`, `team-skill-levels` |
| `jobs` | `character_industry_jobs` only | Job board plus a names map | `board`, `/api/account/industry-jobs` |

The board route attaches the `skills` and `jobs` views and Part 22's sealed history, so only `board_card` combines sources.

**Storage.** New Neon table `personal_views`: readable `user_id`, `character_id`, `kind` (unique together), `version` (compare-and-set counter) and `names_version`; sealed body per Part 09 under the user key. Inside the seal: content, `source_versions` and an enclave-stamped `built_at`. AAD binds table, `user_id`, `character_id`, `kind`, `version` and view schema version. Each sealed body is padded to the next 4 KB, matching Part 18's reason for sealing ETags (an empty jobs board must not show). It is a `PurgeContributor`: tier `cache`, `purgeCharacter` and `purgeUser`, merge rule `discard` (rebuildable), with registry entries.

**Build (optimistic, no transaction).** Part 18 step 6 signals a rebuild after any source write. The worker then:

1. Reads the view's `version` v and every source document.
2. Builds and seals the view with `source_versions` and `built_at`.
3. Writes with `UPDATE ... WHERE version = v` (or insert-if-absent); on a lost race, repeats from step 1.

This suits the Neon HTTP driver, and a concurrent sync cannot leave the card on an old copy.

| Trigger | Rebuilds |
|---|---|
| Sheet section, skills or jobs write (Part 18) | That character's affected kind |
| Character linked | Its views |
| Account merge (Part 11) | Views under the receiving account, written before the merge's `discard` removes the old rows |
| `names_version` change | Lazily: the route serves the old view and enqueues one rebuild |
| Price sweep, scope health change | None |

**Read path.** Each route reads the readable parts: linked characters, portraits, corp and alliance names, scope health, `lastRefreshedAt`, the skill catalog, and each section's `denied` and `refreshedAt` (Part 18 stores these readable; they are metadata like scope health). Vercel computes gaps and section states as today and sends them in the skeleton. It enqueues only stale datasets, replacing the inline `after()` refresh.

**Latency.** The rule 10 budget lets the jobs page's single 4 s re-fetch find the view. Measure on staging before switching routes; if it misses, give `use-jobs-live` the board's longer cold schedule, which users cannot see. Part 07 needs this budget added.

**Browser finish.** `board-assemble.ts` splits. `buildBoardCard(sections, names)` runs in the workers with no clock. `finishBoard(skeleton, cards, skills, jobs, history, now)` runs in the browser: it places decrypted bodies into Vercel's section states and computes industry counts and stored worth (`latestStoredWorth`). `fetchSealedView(endpoint)` replaces `apiFetch` in `useLiveDataset`, `use-slots-live` and `use-planner-profile`.

**Failure handling.** The browser compares the envelope's key ID with its user key. No key or a different key goes to Part 09's recovery flow, never to rebuilds. A missing view, or a decrypt or AAD failure under the right key, shows today's cold state; the rebuild request uses Part 18's dedupe key. The browser ignores a view whose sealed `built_at` is older than one already shown for that (character, kind). No new error text appears.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Linked characters, portraits, corp and alliance names, skill catalog | Yes | | LGI server |
| Scope health, section `denied` and `refreshedAt`, gaps, section states | Yes | | LGI server |
| `lastRefreshedAt`, view `version`, `names_version`, padded size bucket | Yes | | LGI server |
| Sheet sections, skills, levels, slot capacity, job boards, their names | | Yes | Sealed service; browser decrypts and derives job status |
| Industry counts, stored worth per pilot | | Memory only | Browser |
| Net-worth history | Pilot counts per Part 22 | Values | Sealed service (Part 22); browser decrypts |

## Hard rules

1. [Agreed] Users notice nothing: same pages, loading and cold states, no new copy.
2. [Proposed] Sheet, skills and jobs content and its derivatives are never plaintext on Vercel, Neon or Convex. The sealed service assembles; the browser decrypts in Part 26's crypto worker, through one `fetchSealedView` helper, and runs only clock-dependent finishing with existing pure functions.
3. [Proposed] No server cache holds personal reads: remove the wrappers in `character-sheet/queries.ts`, `skill-queue/queries.ts` and the character-jobs functions in `industry-jobs/queries.ts` (Part 04 may ship this early). The corp-jobs wrapper (`getCorpJobs`) is Part 23's.
4. [Proposed] Views are rebuilt after each source write, reading all sources fresh and writing by compare-and-set on `version`. No transaction is assumed.
5. [Proposed] Personal read routes never call the sealed service, keep their auth checks and empty signed-out response, and enqueue only datasets stale under the gates in `src/lib/esi-datasets/entries.ts`.
6. [Proposed] Sealed views hold no clock-dependent field. Gaps and section states stay on Vercel, from readable `denied`, `refreshedAt` and scope health.
7. [Proposed] Views are sealed under the owning account's user key with AAD as above, padded to 4 KB buckets. The browser ignores a view older, by sealed `built_at`, than one already shown in the session.
8. [Proposed] Workers resolve names only from tables loaded whole into memory under Part 24 rule 7: type names, implant dogma, NPC stations, system facts and the skill catalog (Part 24 adds them to its boot list and memory estimate). `names_version` is Part 24's SDE and public-data version; names may lag one lazy rebuild after it changes. Nameless NPC stations go from the enclave to ESI `/universe/names`, never through Vercel's `fetchEntityName`. No per-ID query reaches Neon or Vercel.
9. [Proposed] Corp and alliance names of linked characters stay readable, resolved by Vercel through `'use cache: remote'`.
10. [Proposed] From enqueue to view written, p95 under 3 s for one character's jobs or skills; the enclave gets inbox jobs by Convex push.
11. [Proposed] Key problems go to Part 09 recovery; other decrypt or AAD failures show today's cold state plus at most one rebuild request per view per session.
12. [Agreed] Unlinking, a sale or a purge deletes that character's views with its data, through the `PurgeContributor` registry.
13. [Proposed] No cold gap where today there is data: every user's views are backfilled and checked before routes switch (Part 31), and a merge writes views under the receiving account before discarding the old rows.
14. [Proposed] `buildBoardCard` and `finishBoard` are shared modules built into both the enclave image and the Next.js app, inside Part 05's Fallow zones.
15. [Agreed] `pnpm check` and `pnpm verify` pass with zero Fallow findings.

## Assumptions

- **The board never prices on view.** Checked. If that changes, price refresh becomes a trigger.
- **`mapIndustry` is the only clock use in assembly.** Grep `now` in `board-assemble.ts` before splitting.
- **`denied` is safe as readable metadata.** It records an ESI 403 or missing scope per section. Confirm with Part 18.
- **The browser keeps its user key for the 7-day session** (Part 09). Browsers can evict IndexedDB apart from cookies (Safari's 7-day cap, private windows), and today a valid cookie never forces an EVE login. See What users see.
- **Views decrypt in milliseconds on cheap phones.** Time it in the crypto worker.

## What users see

Nothing new. Board, character detail, planner skills, slots and jobs look and update as today. During a restart, pages load from stored views and refreshes wait, as when ESI is slow today. One possible exception is for Part 09 to decide: if a browser evicts its key storage, the user must get keys back. Options include an automatic EVE SSO round trip that re-wraps keys with no prompt, or a normal login.

## Questions for the owner

1. **Placement: A, B or C?** Recommended: A. B puts the enclave on every page load; C moves assembly and names to the browser.
2. **One view per character per kind, or per account?** Recommended: per character.
3. **Rollback across sessions.** An operator could serve an older view to a fresh session. That causes staleness, not disclosure. Recommended: accept it as a limit; the in-session `built_at` check covers the rest.
4. **Pad views to 4 KB buckets, or accept view size as metadata?** Recommended: pad, consistent with Part 18 sealing ETags.
5. **Keep a browser rebuild-request endpoint?** Recommended: yes, one per view per session; otherwise a corrupt view stays cold until the next sync.
6. **Corp and alliance names: readable or sealed?** Recommended: readable, as metadata (principle 2).
