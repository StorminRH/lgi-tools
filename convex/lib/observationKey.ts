export interface StampedObservationKey {
  readonly observationKey: string;
  readonly patch: { readonly observationKey?: string };
}

export function stampObservationKey(
  existing: string | undefined,
): StampedObservationKey {
  if (existing !== undefined) return { observationKey: existing, patch: {} };
  const observationKey = crypto.randomUUID();
  return { observationKey, patch: { observationKey } };
}
