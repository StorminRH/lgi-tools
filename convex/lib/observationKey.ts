// Shared per-hole observation-key rule for the mutations that stamp identity.

/** A connection's dedupe key plus the patch fragment that mints a first one. */
export interface StampedObservationKey {
  readonly observationKey: string;
  readonly patch: { readonly observationKey?: string };
}

/**
 * Resolves the stable per-hole dedupe key an identified connection logs its
 * observation under. Stamping a type makes a row observation-eligible, so the
 * first identity to land mints the key inside its own transaction and every
 * later identity — machine or human — reuses it, which is what lets a
 * correction rewrite the same corpus row instead of adding a second one.
 * Seeded-PRNG UUIDs are mutation-safe; an OCC retry rolls the whole write back
 * with the key.
 */
export function stampObservationKey(
  existing: string | undefined,
): StampedObservationKey {
  if (existing !== undefined) return { observationKey: existing, patch: {} };
  const observationKey = crypto.randomUUID();
  return { observationKey, patch: { observationKey } };
}
