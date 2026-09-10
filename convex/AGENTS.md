# Convex

Landmines that lint, Fallow, and nearby tests do not catch.

- Durable account, character, SDE, and ESI data stays in Neon. Convex
  holds Atlas collaborative chain state.
- Public map operations go through `requireMapAccess`.
- Persist timers as absolute end timestamps, not client-relative
  countdown state.
