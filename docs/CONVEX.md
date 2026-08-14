# Convex Layer

Read when working on Convex, live-sync, the sync engine, or the ESI gate.
`convex/AGENTS.md` keeps scoped invariants concise; this doc is the rest.
Verify live platform limits at `docs.convex.dev` — do not copy them here.

Binding constraint at scale is Convex **DB I/O**, not function calls.

## Data model

- **Neon is authoritative; Convex is derived and regenerable.** No Convex → Neon
  write. Enrich Convex by reading Neon; never replicate Neon data. Stores share
  no schema — only `userId`/`characterId` as join keys. Teardown + resync must
  reproduce Convex state. Every new dataset ships a regenerable teardown+resync
  test (template: `onlineStatus`).
- **Sanctioned durability exception:** mapper collaborative chain state
  (systems, connections, signatures, notes, map events) — Convex-native primary
  store, with backups and CDC export. `mapTracking` rides the same exception
  (not derivable from Neon/ESI, cap-bounded, torn down by access cascade /
  purge). Do not generalize. `mapEvents.actor` denormalizes display name into
  the ledger and rides seven-day self-expiry (`purgeAfter` + chain purge), not
  per-user `/n` teardown.
- **≤2-min placement rule.** Convex if ESI cache is ≤ ~2 min (genuinely live)
  **or** app-authored collaborative realtime that needs peer fan-out (mapper).
  Neon if ESI cache is > ~2 min. A time-flip is not a reason for Convex. Cache
  time decides the store — not source, not "per-character."
- **Slow data → Neon.** Global/shared slow → CRON keeps one shared copy.
  Personal/per-owner slow → stale-gated on-view write-behind
  (`last_refreshed_at`; re-view inside the window = no ESI; `after()` refresh).
- **Timer-derived state.** Store an absolute end timestamp; derive the client
  countdown from `end − now`. Never a server scheduler for progress flips.
- **Code layout.** `convex/` = functions; `src/data/convex/` = browser client +
  generated `api`; UIs are ordinary feature slices.

## Reads and writes

- **Client `useQuery` is the default** — keeps pages static. Server
  `preloadQuery`/`fetchQuery` makes a route dynamic; justify that in
  `scripts/route-classification.json`.
- **Fetch is action-only.** Flow: client → mutation → action → one batched
  apply mutation → reactive query. No client → action. Writes are batched,
  never per-row. Sync path uses the default runtime (no `"use node"`).

## Cost and I/O

A query's **read set** is the index ranges and document IDs it touched. A write
re-runs a subscription only if it overlaps that read set. A read is the whole
document — there is no field-level read.

1. Split by change-rate and watcher-set; group what is read together.
2. Never write scheduling or bookkeeping onto a row a view subscribes to.
   Cursors, `nextDueAt`, counters, and generation stamps live off the watched
   payload.
3. On no-change, do not write. Upstream 304 or value-equality skips the Convex
   write, so there is no fan-out.
4. Bound every collection read. Growing sets use `.take()` plus continuation —
   never unbounded `.collect()`. Do not over-shard into one doc per data point
   if that forces N reads toward the call ceiling.
5. Per-subject work loops inside one action. Never fan into per-subject
   dispatches.
6. Debounce high-churn writes (location pings, live cursors).

Mapper writes use optimistic concurrency. Shrink the conflict surface; patch
without a preceding read when the old value is not needed. Add sharded-counter
or aggregate components only after logs show real OCC retries.

## The sync engine

Live ≤2-min data joins the existing engine (`convex/engine.ts`;
`src/lib/sync-engine.ts`) through the 4-step registration seam: dataset +
cadence in the schema union, `syncRef` to the internal sync action,
generation-guarded apply, `useSyncSubject`. No feature-local presence,
scheduler, or always-on sync. Heartbeats must not invalidate watched payload
(`syncPresence` vs `syncSubjects`). Read constants from source; do not
hardcode duplicates.

## Secrets, env, and deploy

- **Refresh token never leaves Neon.** Convex receives only short-lived
  per-character access tokens from the service-authed Neon-side endpoint and
  holds each as a lease until Neon's `expiresAt`, then vends once. Public
  Convex queries never read the lease table. Unlink / reassign / user-delete /
  owner-hash transfer POST `/purge-location-tracking` (same door as account
  purge). Untrack is a toggle (`mapTracking` only) and does not teardown
  location or the lease. ESI 401/403 drops the held lease so the next run
  re-vends instead of replaying a dead token until `expiresAt`.
- **Website JWT is mint-once.** Better Auth's Convex-facing JWT matches the
  session lifetime (7 days). The browser reuses it until `exp` or logout
  (`clearAuth`). `/token` does not re-prove login through a Neon heartbeat
  (`resolveActiveCharacter` stays off this path; JWKS is process-cached).
- **Env split.** `CONVEX_SERVICE_SECRET` in Convex env — never EVE credentials.
  Identity and token secrets stay Neon-side. `CONVEX_DEPLOY_KEY` in Vercel.
- **CSP:** Convex origin in `connect-src` only — https + wss, exact
  per-deployment origin, never `*.convex.cloud` (`src/proxy.ts`).

## Adding a Convex surface

1. Durable source of truth? → Neon. Convex holds a derived projection only
   (exception: mapper chain state, including map events / `mapTracking`).
2. Watchers and change-rate? → split documents (rule 1).
3. Growing collection? → per-entity docs + bounded reads.
4. Bookkeeping on a write? → split scheduling metadata off the watched row.
5. No-change detectable? → skip the write.
6. Needs live cadence? → new dataset on the existing engine. No new timer.
7. Doc sized to the subscriber? → trim unused fields.
8. State the I/O budget in the session as-built Successor notes, or for
   ordinary work in the delivering PR Notes.
