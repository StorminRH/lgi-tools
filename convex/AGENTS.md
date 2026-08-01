# Convex guidance

Read `docs/CONVEX.md` before changing Convex schema, live sync, authorization,
the ESI gate, or cost and scaling behavior.

## Authority and placement

- Neon is authoritative for durable account, character, and ESI data. Convex
  live projections remain regenerable and never write to Neon. The approved
  mapper's collaborative chain state — systems, connections, signatures, and
  notes, whether user- or automatically authored — is the deliberate
  Convex-native durability exception described in `docs/CONVEX.md`; do not
  generalize that exception to other data.
- Convex trusts Better Auth JWT/JWKS identity. Gate every public map operation
  through the established access owner before reading or mutating map state.
- Use Convex for collaborative live state and ESI data with an upstream cache
  time of at most two minutes. Slower personal datasets belong in Neon with
  stale-gated refresh.
- Store timers and expirations as absolute end timestamps. Do not persist
  client-relative countdown state.
- A new ESI scope requires an explicit batched placement, refresh, cost, and
  authorization decision. Do not add per-row or per-signature ESI calls.

## Schema and query behavior

- Protect the established Convex sync engine as a deep module. Split it only
  when callers or change axes differ.
- Use a non-null assertion only for a locally provable by-construction invariant
  and explain it with a one-line comment. Every exported production surface
  needs a concise `/** */` contract comment; use TSDoc tags only when they add
  information.
- Keep derived projections fully rebuildable from their authoritative inputs.
  Do not make Convex the sole owner of account, character, entitlement, or
  durable ESI truth.
- Use indexed, bounded reads for map-owned collections. Avoid unbounded scans
  and N+1 reads; preserve truthful continuation state for paginated results.

## Local and verification

`pnpm dev:all` starts local Convex on `:3210`; keep its `AUTH_ISSUER_URL` on the
same origin as `BETTER_AUTH_URL` and the EVE callback. Add focused Convex tests
for authorization, map isolation, indexed query behavior, update reconciliation,
and cleanup. Use current Convex documentation or a focused executable probe when
runtime behavior materially affects the implementation.
