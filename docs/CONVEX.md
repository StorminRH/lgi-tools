# Convex Layer

> Read this when working on Convex, live-sync, the sync engine, or the ESI gate.
> CLAUDE.md keeps the load-bearing invariants as one-liners; this doc is the full
> layer. Same bar as the CLAUDE.md invariants — don't regress without raising a
> conflict.
>
> This doc also carries the **cost & I/O discipline** distilled from the v3.7
> scaling audit (`docs/SCALING_AUDIT_FINDINGS.md`): the binding constraint at scale
> is Convex **DB I/O**, not function calls. The platform-limit numbers below
> (per-mutation read ceiling, doc size) drift — **verify-live via `ctx7` / current
> Convex docs at design time**; the figures here are correct as of the audit
> (June 2026).

Convex is the reactive store for live per-character state; the ESI gate is the one
door to CCP; the sync engine is the one scheduler.

## Data model

- **Neon is authoritative; Convex is derived and regenerable.** Strictly
  one-directional: no Convex → Neon write, ever. Enrich Convex docs by reading
  Neon, never by replicating its data — the stores share no schema; only
  `userId`/`characterId` are mirrored as join keys. A full teardown + resync must
  reproduce Convex state. **Every new dataset ships a regenerable teardown+resync
  test** (template: the `onlineStatus` regenerable test — the surviving live Convex
  dataset; the corp / skills / jobs datasets moved to Neon in MIGRATE.B).
- **The one sanctioned durability exception** is the v4.0 mapper's *user-authored*
  artifacts (signatures, notes, bookmarks): Convex-native primary SoR, protected by
  backups + CDC export. It is a deliberate, documented exception — never a license
  to make other data Convex-durable.
- **The ≤2-min placement rule (the test for every dataset).** *Convex (live engine)*
  iff the ESI cache is ≤ ~2 min (genuinely live — location ~5 s, online ~60 s) OR the
  data is app-authored collaborative-realtime needing peer fan-out (the mapper):
  presence-gated, reactive. *Neon* iff the ESI cache is > ~2 min, per-owner or shared.
  A time-flip (a job completing) is **not** a reason to keep data in Convex — see
  timer-derived-state below. *Why Convex can't help slow data:* ESI's per-response
  cache (Expires / x-cached-seconds) bounds freshness, so Convex can't make slow ESI
  data fresher than Neon — both wait on the same upstream cache wall. The data's
  source (ESI vs SDE) never decides the store — its cache time does. "Per-character"
  is not the discriminator either: skills are per-character and live in Neon.
- **Refresh by shape (slow data → Neon).** *Global / shared slow* (system kills/jumps,
  sov, incursions) → a CRON keeps one shared copy fresh and every user reads it (the
  pricing model). *Personal / per-owner slow* (skills, jobs, blueprints, affiliation) →
  a stale-gated on-view write-behind: a `last_refreshed_at` gate means a re-view inside
  the window makes no ESI call, and a write-behind `after()` refresh updates Neon (the
  affiliation pattern). No engine.
- **Timer-derived-state (no scheduler for a time-flip).** For data that flips at a known
  time (a job completing), store the absolute end timestamp and derive the state
  client-side from `end − now` on a client tick — never a server-side scheduler. This
  replaced the deleted `markJobReady`/`markReady` flips when the jobs trackers moved to
  Neon in MIGRATE.B; the refresh reconciles existence, not progress.
- **Code layout.** `convex/` holds the functions; `src/data/convex/` is the data
  slice owning the browser client + generated `api`; the account and tracker UIs are
  ordinary feature slices.

## Reads and writes

- **Client `useQuery` is the default** — it keeps pages static. Server-side
  `preloadQuery`/`fetchQuery` makes a route dynamic (`ƒ`) and needs its
  justification in `scripts/route-classification.json`.
- **Fetch is action-only.** Convex queries/mutations can't `fetch`; the flow is
  client → mutation → action → ONE batched apply mutation → reactive query. No
  client → action calls; writes are batched, never per-row. The sync path runs on
  the DEFAULT Convex runtime (no `"use node"`), which lacks
  `AbortSignal.timeout`/`AbortSignal.any` — don't use those statics under the ESI
  gate's import chain.

## Cost & I/O discipline

The audit proved the cost shape; build against it.

### Reactivity is read-set–precise, not table-wide

A query's **read set** is the exact set of index ranges + document IDs it touched
(`db.get` IDs included). On a write, Convex re-runs a subscription ONLY if the write
**overlaps that read set** — a write to a different doc, or to a row outside the index
range the query scanned, does NOT re-run it. So the primary lever for low invalidation
(and low re-read I/O) is to **scope every subscription to the narrowest index range that
serves the UI**: `withIndex()` records a tight read set; an unindexed `.filter()` /
`.collect()` records the whole scanned range AND counts filtered-out rows.

Two corollaries that refine the rules below:

- **A read is still the WHOLE document** (no field-level read). Read-set precision adds
  only *which* docs are in the set — those an index range actually selected. Smaller read
  set → fewer overlaps → rarer, cheaper re-runs.
- **Split at the SUBSCRIPTION boundary, not just the row.** Cost Rule 2 (bookkeeping off
  the watched row) is necessary but NOT sufficient when a view co-reads a heavy payload
  alongside any field that legitimately changes every cycle (run status, "as of" stamp).
  The whole query re-runs on any read-set overlap, so the heavy payload is re-read on
  every status flip / 304 stamp regardless of which row the volatile field sits on. Fix =
  **two subscriptions**: a heavy-payload query whose read set holds no per-cycle-volatile
  field (re-runs only on genuine data change) + a tiny run-state query (re-runs every
  cycle, cheap). It WAS the trackers' SA.5 `forViewer` fix (now migrated to Neon); it
  stays load-bearing for the mapper.

- **DB I/O is the binding constraint — not function calls.** Call count amortizes
  *downward* at scale (the shared Workpool spreads it). I/O is the wall: it bound the
  Free tier at ~2 and the Pro-included tier at ~114 concurrent watchers *before*
  optimization. ESI scopes per-character (no shared app-wide wall); Upstash/Neon are
  cost curves money lifts. I/O is the one to design against.
- **A read is the WHOLE document, every time.** Convex bills I/O on the byte size of
  the doc read from its own store — there is no "read one field." A 10 KB stored blob
  costs 10 KB even if the UI shows 1 KB. **The stored shape is a UI projection, not a
  verbatim ESI dump** — store only what a subscriber needs (keep watched docs small;
  trim fields the UI never renders).
- **A reactive subscription re-reads its ENTIRE payload on ANY write to what it
  watches** — changed or not. The *write* is the trigger, not the data delta. This is
  the whole game: a write to a watched doc fans the full payload back to every
  subscriber.
- **Fan-out is the super-linear danger.** One write → every watcher re-reads. Big +
  shared doc (the mapper) ⇒ one trivial edit re-sends the whole state to everyone
  watching. The rules below keep both the re-read and the write fan-out linear.
- **Worked example (the headline finding — FIXED in SA.5, PR #169):** the skills,
  industry-jobs, and corp-jobs trackers USED TO re-read their full blob on *every* sync
  dispatch, because the dispatch stamped `nextDueAt` onto the very `syncSubjects` row that
  `forViewer` subscribed to, and the 304 `lastSyncedAt` bump landed on the same doc as the
  payload — together ~88% of all DB I/O. ESI's 304 saved the *fetch* but not the *re-read*
  (the re-read was triggered by our bookkeeping write, not by ESI). The fix split each
  tracker into two subscriptions: a cold payload query (its own table per char/corp, re-fires
  only on a genuine data change) + a tiny hot run-state query. Per-cycle stamps and the 304
  bump now touch only the hot side, so the heavy blob is no longer re-read on a dispatch /
  completion / 304 — proven by tests asserting the cold doc is byte-identical (incl.
  `_creationTime`) after each. The row split alone (moving the stamp off the subject row)
  was necessary but insufficient; the subscription split is the fix (see *Reactivity is
  read-set–precise*). **All three trackers then moved to Neon stale-gated on-view reads in
  MIGRATE.B and their Convex tables were wiped in MIGRATE.D.1 — this example is cited as
  history; the engine now serves only the `onlineStatus` canary + the future mapper.**

**Design rules** (these are the audit's levers as standing rules; the engine and ESI
sections below already own one-engine, cadence floors, and ETag/304 — not repeated):

1. **Split by change-rate and watcher-set; group by what's read together.** A small,
   frequently-watched slice goes in its own doc, away from the large, rarely-watched
   bulk (skills: active queue vs full trained list). The test for a split: *different
   change-rate OR different watchers?* → split; else keep together (splitting data
   read+changed together is false granularity — see Rule 4's failure mode).
2. **Never write scheduling/bookkeeping onto a row a view subscribes to.** Cursors,
   `nextDueAt`, `lastFinishedAt`, counters, generation stamps live on a *separate* row
   from the watched payload. This refines the engine seam's "apply stamps results onto
   the subject row": the apply may stamp *results*, but the *scheduling* metadata must
   not sit where it invalidates the watched slice. (FIXED in SA.5 / PR #169: the heavy
   payload now lives on its own cold subscription whose read set excludes the
   `syncSubjects` row entirely, so the per-cycle stamps no longer re-read it — via the
   subscription split in *Reactivity is read-set–precise*, not the row split alone. Run
   state still shares `syncSubjects` with the bookkeeping, but the only view that reads it
   now is the tiny hot query, which pulls small docs — so the residual cost is negligible.)
   Generalizes the 3.5.e1 presence-split.
3. **On no-change, don't write.** Upstream 304 (via the gate) or value-equality ⇒ skip
   the Convex write. No write → no re-read → no fan-out. (The Convex-write corollary of
   the gate's ETag/304 reuse.)
4. **Bound every collection read; subscribe to the smallest slice.** Any query over a
   *growing* set (subjects, signatures, "all X for map/user") uses `.take()` +
   continuation — never unbounded `.collect()` (the per-mutation read ceiling, §below).
   The sync engine follows this rule with indexed, oldest-first batches that drain over
   subsequent runs.
   Views subscribe to the minimal doc, never the whole blob "just in case."
   **Failure mode — over-sharding:** "one doc per data point" is wrong when it makes a
   collection (200 signatures = 200 docs ⇒ "load the map" reads 200 docs toward the
   ceiling). Granular on the **write/subscribe** axis (one edit → one small doc + one
   slice of watchers); **bounded** on the **read** axis (paginate collections).
5. **Per-subject work loops INSIDE one action.** A 3-character sync is one call that
   loops chars internally — per-char cost is 0 marginal *calls* (only more ESI reads +
   a bigger blob = bandwidth). Never fan a per-char loop into per-char dispatches.
6. **Debounce / coalesce high-churn writes.** Streams that change every few seconds
   (player location pings, live cursors) debounce to a sane cadence — don't write, and
   fan out, on every micro-change.

**Capacity ceilings — money cannot lift these; design under them** *(verify-live against
`docs.convex.dev/production/state/limits`).* Per **transaction** (a query or mutation;
nested `runQuery`/`runMutation` share the parent budget): **32,000 documents scanned,
16 MiB read, 16 MiB written, 16,000 documents written, 4,096 index-range reads
(`db.get` + `db.query` calls), 1 s user-code time.** Per **document**: ~1 MiB, 1,024
fields, 8,192 array elements, 16 nesting levels. These are independent axes — know which
one a pattern stresses: a 200-item load is 200 against the 32,000 doc-scan ceiling if it
is ONE indexed range read, but 200 against the **4,096-call** ceiling if it is 200
separate `db.get`s. (The engine's per-row presence read is the latter — that call ceiling,
not the doc ceiling, is what `scan`/`sweep` hit first.) Paginate every collection read
(Rule 4); collapse per-row N+1 point reads into one range read + in-memory join. Distinct
from *cost* ceilings (Free/Pro I/O caps, which money lifts): cost ceilings buy time,
capacity ceilings require correct architecture.

## OCC & write contention (matters at the mapper, not the per-character trackers)

Convex mutations don't lock — optimistic MVCC. On commit, if another transaction wrote
data this one READ, the mutation auto-retries at a new timestamp; conflict happens only
under genuine contention on **overlapping read/write sets**. Write mutations as if they
always succeed; a persistent OCC error in logs = real contention on one hot document.

A non-issue for the per-character trackers (each subject is one user's row, no shared hot
doc). A launch concern for the **mapper**, where one shared map doc has many writers
(auto-map on jump, multiple scouts, signature edits). Levers, in order:

1. **Shrink the conflict surface.** Per-map sharding + per-entity docs (one signature =
   one doc, paginated reads — never a growing array), so two scouts editing different
   signatures never touch the same read/write set.
2. **Idempotent + blind patches.** Early-return if already in target state; `db.patch`
   without a preceding read when the old value isn't needed (no read → nothing to conflict
   on).
3. **Components for true hotspots only.** Shared counter/rate hotspot →
   `@convex-dev/sharded-counter` or the rate-limiter's shard option; counts/ranks over a
   large changing set → `@convex-dev/aggregate`. Reach for these once logs show OCC
   retries — never pre-emptively.

Debounce high-churn shared writes (live cursors, jump pings) to a sane cadence (Cost
Rule 6) so the shared doc isn't a write magnet to begin with.

## The sync engine

**The engine serves the live ≤2-min canary today** (`convex/engine.ts`; subject =
dataset × userId). It is the one sanctioned presence/scheduling machinery for **live
≤2-min reactive data**, and serves a SINGLE live consumer: `onlineStatus`, the canary
that keeps it exercised + proven (MIGRATE.A) — plus the future v4.0 mapper. The three
slow trackers (skills, personal + corp industry jobs) MOVED to Neon stale-gated on-view
reads in MIGRATE.B; slow per-owner data does NOT join the engine (it follows the Neon
on-view template above). New ≤2-min-live OR collaborative-realtime data joins via the
4-step seam; nothing else. The architecture below is documented design — it survives the
trackers' departure so the mapper can rebuild on it.

- **The 4-step registration seam** (the engine's header): (1) dataset + cadence floor +
  token group in `src/lib/sync-engine.ts` and the schema's `dataset` union; (2) a
  `syncRef` pointing at the internal sync action; (3) a generation-guarded apply that
  stamps results onto the subject row (per Cost Rule 2, keep *scheduling* metadata off
  the watched payload); (4) the `useSyncSubject` hook (`src/data/convex/`). A subject
  refreshes only while viewed in a visible tab — no feature ships its own presence
  tracker, scheduler policy, or always-on background sync.
- **Presence is split off the subject row** (`syncPresence`, 3.5.e1): a view subscribes
  to `syncSubjects` but never `syncPresence`, so an interval heartbeat's `lastSeenAt`
  write (3×/min per visible tab) can't invalidate a watched payload through Convex's
  document-granular reactivity. Load-bearing for the mapper.
- **Three trigger classes:** while-watched (the 30 s scan), on-view (mount/visible
  heartbeats dispatching immediately when stale), on-schedule (feature-local timestamp
  flips — the engine schedules refreshes, never flips). The on-schedule class has no live
  consumer since MIGRATE.B retired the jobs trackers' `markReady` flips (timer-derived
  client-side now); it is reserved for a future consumer like the mapper.
- **Scan + sweep, all bounded (SA.6).** The 30 s scan (`convex/crons.ts`) dispatches due
  subjects oldest-first; the 15-min Vercel-cron sweep (`POST /sweep`) runs THREE bounded
  indexed passes — A *overdue* (delete past-retention / retire cold / dispatch hot), B
  *dropped* (re-arm a hot idle row whose timer was wiped mid-flight), C *abandoned*
  (delete a past-retention presence + subject). Each pass is `.take()`-capped oldest-first
  (`SCAN_DISPATCH_BATCH` = 1024 for the scan + passes A/B; `SWEEP_DELETE_BATCH` = 512 for
  pass C), so no single mutation approaches the ~4,096 index-range-read ceiling — a backlog
  drains over subsequent runs. Pass A runs first so its writes are visible to B/C.
- **Cold / hot lifecycle** (`src/lib/sync-engine.ts`): `HEARTBEAT_MS` = 20 s,
  `COLD_AFTER_MS` = 60 s (three missed beats → the scan stops dispatching the subject),
  `STALE_RUNNING_MS` = 3 min (a wedged run is taken over by the next dispatch),
  `RETENTION_MS` = 7 d (the sweep deletes the row; a returning heartbeat regenerates it —
  the state is regenerable, so housekeeping never loses anything).
- **The orphan-guard pattern (dataset-union-as-superset).** The schema's `dataset` union
  is designed to hold a SUPERSET of the active registry (`SYNC_DATASETS`) while a dataset
  is being retired: the schema literal + any leftover subject rows outlive the deleted
  syncer for one deploy, and the engine RETIRES an orphaned subject (nulls `nextDueAt`)
  instead of dispatching it — so a leftover hot+due row can never index a missing `syncRef`
  and crash the shared scan. MIGRATE.B retired skills / jobs / corp jobs that way;
  MIGRATE.D.1 wiped them, leaving `onlineStatus` alone, and removed the now-vacuous guard
  code. The v4.0 mapper re-instantiates this pattern against its own dataset lifecycle
  (the design is kept here, not the transitional code).
- **Durable components + cadence.** Rate Limiter + Workpool — the Workpool owns retry;
  don't add the Action Retrier. Scheduling staggers off the stored ESI cache windows
  (respect the cadence floor: never poll faster than upstream cache validity — Cost Rule
  3's complement), sends the proper User-Agent, and respects Retry-After/420. Errored
  subjects self-retry at the cadence floor — including a first run that fails terminally:
  a failed run always re-arms the scan at the floor.
- **Live-data surfaces ship NO manual refresh controls.** Load the page → data
  refreshes automatically (mount/visible beats dispatch when stale) → cadence timers
  take over while watched; an errored subject recovers at the cadence floor or
  instantly on leave-and-return. `/dev/*` pages are exempt operator tools.

## The ESI gate

- **One ESI gate.** EVERY ESI call — pricing and character alike, future consumers
  including killmails — routes through the single `esiFetch` in `src/lib/esi/`,
  whose budget lives in the shared Upstash Redis scoreboard: both CCP limit systems
  (legacy error limit + token buckets), fail-closed, refusal at ~80% of the error
  budget spent, ETag/304 reuse, Expires + rate headers exposed to callers,
  runtime-portable. Per-character held ETags live in the owning feature's Convex
  docs — never the gate's shared cache. Never a second wrapper or budget; the
  Fuzzwork fallback stays inside `market-prices`. A bypassing consumer doesn't fail
  — it silently burns the shared per-IP budget for everyone. *Lint-enforced* (the
  ESI host literal is banned outside the slice). **Scope note (audit-confirmed):**
  authenticated token buckets are keyed per-character (`<appID>:<charID>`), so the
  authenticated sync load scales per-character with no shared wall; the per-IP wall
  applies only to unauthenticated reads (market, bulk affiliation), which stay
  fixed/batched/cache-gated.
- **The gate serves cached bodies inside ESI's own freshness window.** For an
  unauthenticated, ETag-eligible GET, when the stored `Expires` is still open (small
  clock-skew margin) and the cached body is in hand, `esiFetch` returns that body
  with **no dispatch to ESI** — the conditional round-trip would only return data the
  gate already holds and knows is fresh (marked `x-lgi-esi-cache: window`, vs
  `revalidated` for the 304-reuse path). Any request carrying an `Authorization`
  header never touches the shared cache and dispatches every time; a future
  `Expires` with no cached body falls through to a normal conditional dispatch.
- **A new scope is a deliberate, batched decision — never an incremental add.** The
  ESI spec's OAuth2 enumeration is the authoritative scope list — SSO publishes no
  `scopes_supported`. Enable a scope on the EVE dev-app registration (the scope
  *ceiling*) BEFORE the code that requests it deploys, or sign-in breaks
  (`invalid_scope`).

## Secrets, env, and deploy

- **The refresh token never leaves Neon.** Convex receives only short-lived
  per-character access tokens, vended by the service-authed Neon-side endpoint.
- **Env split.** The service secret (`CONVEX_SERVICE_SECRET`) lives in Convex env —
  EVE credentials never do; identity and token secrets stay on the Neon side.
  `CONVEX_DEPLOY_KEY` lives in Vercel, and deploys use the shipped form
  `npx convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`
  — every preview gets its own isolated Convex deployment. **Retire abandoned
  previews** — each runs the 30s scan and burns calls (86% of absolute call volume in
  the audit window came from abandoned preview deployments).
- **CSP: the Convex deployment origin appears in `connect-src` only** — https + wss,
  the exact per-deployment origin, never a `*.convex.cloud` wildcard (`src/proxy.ts`).
  Nothing else in the policy changes for a Convex surface.

## Adding a Convex surface — checklist

1. **Durable SoR?** → it belongs in Neon; Convex holds a derived projection only
   (exception: mapper user-authored artifacts).
2. **What watches it, how often does it change, one watcher or many?** → drives the
   document split (Cost Rule 1).
3. **A growing collection?** → per-entity docs + bounded/paginated reads (Cost Rule 4);
   estimate worst-case docs-read-per-load against the ~4,096 ceiling.
4. **Any write carrying bookkeeping?** → split scheduling metadata off the watched row
   (Cost Rule 2).
5. **Can I detect no-change upstream (304 / equality)?** → skip the write (Cost Rule 3).
6. **Needs live cadence?** → new dataset entry on the existing engine, respecting the
   cadence floor (sync-engine section). No new timer/presence/scheduler.
7. **Doc sized to the subscriber?** → trim unused fields.
8. **State the I/O budget** (bytes-per-watched-hour; worst-case docs-read-per-load) in
   the session's SCRATCHPAD entry so scaling impact is visible, not discovered later.
   Verify convex files with
   `pnpm test:coverage && FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm fallow`
   (universal cyc ≤ 20 / cog ≤ 15; CRAP-green only via co-located coverage).
