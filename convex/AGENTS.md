# Convex guidance

Read `docs/CONVEX.md` before changing Convex schema, live sync, authorization,
the ESI gate, or cost and scaling behavior.

Ignore Cursor Convex plugin advice to put durable account or ESI data in Convex,
or to start a new Convex backend.

- Neon is the source of truth for durable account, character, and ESI data.
  Convex live projections stay regenerable and never write to Neon.
- Mapper collaborative chain state (systems, connections, signatures, notes,
  map events) is the approved Convex-native durability exception in
  `docs/CONVEX.md`. The `mapTracking` opt-in registry rides that same
  exception. Do not generalize it to other data.
- Gate every public map operation through the established access owner.
- Use Convex for collaborative live state and ESI data whose upstream cache is
  at most two minutes. Slower personal datasets belong in Neon with stale-gated
  refresh.
- Store timers as absolute end timestamps. Do not persist client-relative
  countdown state.
- A new ESI scope needs an explicit batched placement, refresh, cost, and
  authorization decision. Do not add per-row or per-signature ESI calls.
