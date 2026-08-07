# Convex Layer

> Read when working on Convex, live-sync, the sync engine, or the ESI gate.
> `convex/AGENTS.md` keeps scoped invariants concise; this doc is the full layer.
> Do not regress either without raising a conflict.
>
> Binding constraint at scale is Convex **DB I/O**, not function calls. Platform
> limits drift — **verify-live via current Convex docs** (`docs.convex.dev`) at
> design time; figures below are indicative.

## Data model

- **Neon is authoritative; Convex is derived and regenerable.** No Convex → Neon
  write, ever. Enrich Convex by reading Neon; never replicate Neon data. Stores
  share no schema — only `userId`/`characterId` as join keys. Teardown + resync
  must reproduce Convex state. Every new dataset ships a regenerable
  teardown+resync test (template: `onlineStatus`).
- **Sanctioned durability exception:** mapper collaborative chain state
  (systems, connections, signatures, notes, map events) — Convex-native primary
  SoR, backups + CDC export. `mapTracking` rides the same exception (not
  derivable from Neon/ESI, cap-bounded, torn down by access cascade / purge).
  Do not generalize. `mapEvents.actor` denormalizes display name into the ledger
  and rides seven-day self-expiry (`purgeAfter` + chain purge), not per-user
  `/n` teardown — retention-bounded exemption.
- **≤2-min placement rule.** *Convex* iff ESI cache ≤ ~2 min (genuinely live) OR
  app-authored collaborative-realtime needing peer fan-out (mapper):
  presence-gated, reactive. *Neon* iff ESI cache > ~2 min. A time-flip is not a
  reason for Convex. Cache time decides the store — not source, not
  "per-character." Convex cannot freshen slow ESI past the upstream cache wall.
- **Slow data → Neon.** *Global/shared slow* → CRON keeps one shared copy.
  *Personal/per-owner slow* → stale-gated on-view write-behind (`last_refreshed_at`;
  re-view inside window = no ESI; `after()` refresh). No engine.
- **Timer-derived state.** Store absolute end timestamp; derive client-side from
  `end − now` on a tick. Never a server scheduler for progress flips. Refresh
  reconciles existence, not progress.
- **Code layout.** `convex/` = functions; `src/data/convex/` = browser client +
  generated `api`; UIs are ordinary feature slices.

## Reads and writes

- **Client `useQuery` is the default** — keeps pages static. Server
  `preloadQuery`/`fetchQuery` makes a route dynamic (`ƒ`); justify in
  `scripts/route-classification.json`.
- **Fetch is action-only.** Queries/mutations can't `fetch`. Flow: client →
  mutation → action → ONE batched apply mutation → reactive query. No client →
  action; writes batched, never per-row. Sync path uses DEFAULT runtime (no
  `"use node"`) — no `AbortSignal.timeout`/`AbortSignal.any` under the ESI gate
  import chain.

## Cost & I/O discipline

### Reactivity is read-set–precise

A query's **read set** is the exact index ranges + document IDs it touched. On
write, Convex re-runs a subscription only if the write **overlaps that read
set**. Scope every subscription to the narrowest index range that serves the UI:
`withIndex()` is tight; unindexed `.filter()` / `.collect()` records the whole
scanned range and counts filtered-out rows.

- **A read is the WHOLE document** — no field-level read. Read-set precision
  selects *which* docs; those docs are fully re-read.
- **Split at the subscription boundary.** Heavy payload co-read with any
  per-cycle-volatile field → **two subscriptions**: heavy-payload query (no
  volatile fields) + tiny run-state query. Row-split of bookkeeping is necessary
  but not sufficient.
- **Stored shape is a UI projection**, not a verbatim ESI dump — keep watched
  docs small. Convex bills I/O on stored byte size.
- **Any write to a watched doc fans the full payload** to every subscriber —
  changed or not. The write triggers the re-read, not the data delta.
- **Fan-out is the super-linear danger.** One write → every watcher re-reads.
  Big + shared doc (mapper) ⇒ one edit re-sends whole state to all watchers.

### Design rules

1. **Split by change-rate and watcher-set; group by what's read together.**
   Different change-rate OR different watchers → split; else keep together.
   Splitting data read+changed together is false granularity (see Rule 4).
2. **Never write scheduling/bookkeeping onto a row a view subscribes to.**
   Cursors, `nextDueAt`, counters, generation stamps live off the watched
   payload. Apply may stamp *results*; scheduling metadata must not invalidate
   the watched slice. Prefer cold payload subscription (read set excludes
   `syncSubjects`) + tiny hot run-state query.
3. **On no-change, don't write.** Upstream 304 or value-equality ⇒ skip the
   Convex write. No write → no re-read → no fan-out.
4. **Bound every collection read; subscribe to the smallest slice.** Growing
   sets use `.take()` + continuation — never unbounded `.collect()`. **Failure
   mode — over-sharding:** one doc per data point that forces N reads toward the
   call ceiling is wrong. Granular on write/subscribe; bounded/paginated on read.
5. **Per-subject work loops INSIDE one action.** One call loops subjects
   internally — never fan into per-subject dispatches.
6. **Debounce / coalesce high-churn writes.** Location pings, live cursors:
   sane cadence — don't write and fan out on every micro-change.

### Capacity ceilings

Money cannot lift these; design under them. **Verify-live** against
`docs.convex.dev/production/state/limits`. Per **transaction** (nested
`runQuery`/`runMutation` share parent budget): **32,000 docs scanned, 16 MiB
read, 16 MiB written, 16,000 docs written, 4,096 index-range reads (`db.get` +
`db.query`), 1 s user-code time.** Per **document**: ~1 MiB, 1,024 fields,
8,192 array elements, 16 nesting levels. Axes are independent: one indexed range
of 200 items hits the doc-scan ceiling; 200 `db.get`s hit the **4,096-call**
ceiling (what `scan`/`sweep` hit first). Paginate collections (Rule 4); collapse
N+1 into one range read + in-memory join. Distinct from cost ceilings (Free/Pro
I/O), which money lifts.

## OCC & write contention (mapper)

Optimistic MVCC — no locks. Conflict only on overlapping read/write sets;
auto-retry. Persistent OCC errors = real contention on one hot document. Levers,
in order:

1. **Shrink the conflict surface.** Per-map sharding + per-entity docs
   (paginate — never a growing array).
2. **Idempotent + blind patches.** Early-return if already in target state;
   `db.patch` without a preceding read when the old value isn't needed.
3. **Components for true hotspots only.** Shared counter/rate →
   `@convex-dev/sharded-counter` or rate-limiter shard; counts/ranks over a
   large changing set → `@convex-dev/aggregate`. Only once logs show OCC
   retries — never pre-emptively.

Debounce high-churn shared writes (Rule 6).

## The sync engine

Serves live ≤2-min data (`convex/engine.ts`; subject = dataset × userId). One
sanctioned presence/scheduling machinery. Live consumers: `onlineStatus`
(canary) and `characterLocation` (tracked location; `chainOnSuccess` while the
Atlas tab is open — visible or hidden — and a tracked pilot is online in EVE).
Slow per-owner data does **not** join — use Neon on-view. New ≤2-min-live OR
collaborative-realtime data joins via the 4-step seam; nothing else.

- **4-step registration seam:** (1) dataset + cadence floor + **cold window
  (`coldAfterMs`)** + token group in `src/lib/sync-engine.ts` and schema
  `dataset` union — optional `chainOnSuccess` (jitter-free hops at Expires
  after clean yield; apply stamps `coveredCharacterIds`; failed/zero-yield/cold
  → 30s scan) and `rateKeyScope: 'subject'`; omit both for stock scan; (2)
  `syncRef` to the internal sync action; (3) generation-guarded apply stamps
  results onto the subject row (Rule 2: scheduling metadata off watched
  payload); (4) `useSyncSubject` (`src/data/convex/`). Refreshes only while a
  tab holds the view open — the heartbeat runs visible **or hidden** (hidden
  beats arrive browser-throttled ~1/min; size `coldAfterMs` to absorb that),
  bounded by the client AFK flow (1h hidden prompt + 5 min grace, the Atlas
  `AfkGate`) and the server's `HIDDEN_PRESENCE_MAX_MS` (90 min without a
  visible beat) backstop. Still no feature-local presence, scheduler, or
  always-on sync.
- **Presence split** (`syncPresence`): views subscribe to `syncSubjects`, never
  `syncPresence`, so heartbeat `lastSeenAt`/`lastVisibleAt` writes can't
  invalidate watched payload. Load-bearing for the mapper.
- **Three trigger classes:** while-watched (30 s scan), on-view
  (mount/visible heartbeat when stale), on-schedule (feature-local timestamp
  flips — engine schedules refreshes, never flips). On-schedule reserved; no
  current live consumer.
- **Scan + sweep, all bounded.** 30 s scan dispatches due subjects oldest-first.
  15-min Vercel-cron sweep (`POST /sweep`) runs three bounded indexed passes:
  A *overdue* (delete past-retention / retire cold / dispatch hot), B *dropped*
  (re-arm hot idle whose timer was wiped mid-flight), C *abandoned* (delete
  past-retention presence + subject). Each pass `.take()`-capped oldest-first
  (`SCAN_DISPATCH_BATCH` / `SWEEP_DELETE_BATCH`); backlog drains across runs.
  Pass A first so its writes are visible to B/C.
- **Cold / hot lifecycle** (`src/lib/sync-engine.ts`): heartbeat interval,
  per-dataset cold windows (`coldAfterMs` — 60s for a visible-tab dataset,
  5 min for `characterLocation` to absorb hidden-tab throttling; a mixed-
  dataset presence index range must use `MAX_COLD_AFTER_MS` and filter per
  row), the hidden-presence backstop (`HIDDEN_PRESENCE_MAX_MS` off
  `lastVisibleAt`), stale-running (wedged run taken over), retention (sweep
  deletes; returning heartbeat regenerates — regenerable, housekeeping loses
  nothing). Read constants from source; don't hardcode duplicates.
- **Pacing rides the stamped windows, not new machinery.** The location sync's
  online probe (ESI `/online`, ≤1 read per its ~60s cache window, held in the
  unsubscribed `characterLocationOnline` table) stamps the online expiry as an
  offline character's window, so an all-offline subject chains at ~60s and the
  next login resumes the 5s loop — no extra trigger class, no engine field.
- **Orphan-guard pattern.** Schema `dataset` union is a SUPERSET of active
  `SYNC_DATASETS` while retiring: leftover rows outlive the deleted syncer for
  one deploy; engine retires orphans (nulls `nextDueAt`) instead of dispatching
  — never index a missing `syncRef` from a hot+due row. Re-instantiate per
  dataset lifecycle.
- **Durable components + cadence.** Rate Limiter + Workpool (Workpool owns
  retry; no Action Retrier). Stagger off stored ESI cache windows; never poll
  faster than upstream cache validity; proper User-Agent; respect
  Retry-After/420. Errored subjects (including terminal first-run failure)
  re-arm at the cadence floor.
- **No manual refresh on live surfaces.** Load → auto-refresh on mount/visible
  when stale → cadence while watched; errors recover at floor or on
  leave-and-return. `/dev/*` exempt.

## The ESI gate

- **One ESI gate.** Every ESI call routes through `esiFetch` in
  `src/platform/esi/`: shared Upstash Redis budget (legacy error limit + token
  buckets), fail-closed, refuse at ~80% error budget spent, ETag/304 reuse,
  Expires + rate headers to callers, runtime-portable. Per-character held ETags
  live in the owning feature's Convex docs — never the gate's shared cache. No
  second wrapper or budget; Fuzzwork fallback stays inside `market-prices`.
  Lint-enforced (ESI host literal banned outside the slice). Authenticated
  buckets are per-character; per-IP wall applies only to unauthenticated reads.
- **Cache window.** Unauthenticated, ETag-eligible GET with open stored
  `Expires` and cached body in hand → return body with **no ESI dispatch**
  (`x-lgi-esi-cache: window`; `revalidated` for 304 path). `Authorization`
  requests never touch shared cache. Future `Expires` with no body → normal
  conditional dispatch.
- **Scope changes are deliberate and batched.** Enable the scope on the EVE
  dev-app registration (ceiling) **before** code that requests it deploys, or
  sign-in breaks (`invalid_scope`). ESI spec OAuth2 enumeration is authoritative
  — SSO publishes no `scopes_supported`.

## Secrets, env, and deploy

- **Refresh token never leaves Neon.** Convex receives only short-lived
  per-character access tokens from the service-authed Neon-side endpoint.
- **Env split.** `CONVEX_SERVICE_SECRET` in Convex env — EVE credentials never;
  identity/token secrets stay Neon-side. `CONVEX_DEPLOY_KEY` in Vercel. The
  Vercel-only deploy path is
  `pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`
  — never run `pnpm build:vercel` / `next build` locally or before merge (each
  preview gets an isolated Convex deployment). **Retire abandoned previews** —
  each runs the 30s scan and burns calls.
- **CSP:** Convex origin in `connect-src` only — https + wss, exact
  per-deployment origin, never `*.convex.cloud` (`src/proxy.ts`).

## Adding a Convex surface — checklist

1. **Durable SoR?** → Neon; Convex holds a derived projection only (exception:
   mapper collaborative chain state, including map events / `mapTracking`).
2. **Watchers, change-rate, one vs many?** → document split (Rule 1).
3. **Growing collection?** → per-entity docs + bounded/paginated reads (Rule 4);
   estimate worst-case docs-read-per-load against the ~4,096 ceiling.
4. **Bookkeeping on a write?** → split scheduling metadata off watched row
   (Rule 2); split subscriptions if heavy + volatile co-read.
5. **No-change detectable (304 / equality)?** → skip the write (Rule 3).
6. **Needs live cadence?** → new dataset on the existing engine, respect cadence
   floor. No new timer/presence/scheduler.
7. **Doc sized to the subscriber?** → trim unused fields.
8. **State the I/O budget** (bytes-per-watched-hour; worst-case
   docs-read-per-load) in the session SCRATCHPAD. Verify with
   `pnpm test:coverage && FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm fallow`.
