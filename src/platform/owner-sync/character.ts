// The character-owner dataset descriptor builder (Family-1 generalization). The
// per-character live trackers (personal industry jobs, skill queue) are structural
// twins on the refresh side: both enumerate a user's linked characters (no corp axis),
// stale-gate per character, and persist a bespoke verdict. This factors the identical
// OwnerSyncDescriptor scaffold (now / enumerate / vendToken / staleness gate / the
// identity ownerOf / readState / stampFresh) into one builder; each slice supplies its
// staleness + eligibility predicates, its own fetch→plan (single vs dual endpoint), and
// its save. It lives in src/platform/owner-sync beside the engine, so a slice's
// refresh.ts stays boundary-legal (feature → platform capability) and its
// fake-port tests pass unchanged.
import type { EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict } from './types';

/**
 * The common port surface both character slices expose (their full ports add the
 * endpoint-specific read/save the spec closes over). TState is the slice's per-character
 * sync state; it carries the staleness stamp the gate reads.
 */
export interface CharacterSyncBase<TState> {
  now(): Date;
  // The user's linked characters with scope health (no corp id — character-only).
  listCharacters(userId: string): Promise<Array<Omit<EnumeratedOwner, 'corporationId'>>>;
  vendToken(characterId: number): Promise<string | null>;
  readSyncState(characterId: number): Promise<TState | null>;
  stampFresh(characterId: number): Promise<void>;
}

/** The per-dataset knobs — everything that genuinely differs between the twins. */
export interface CharacterDatasetSpec<TState, TSave> {
  // The staleness gate, closing over the slice's TTL.
  isStale(lastRefreshedAt: Date | null, now: Date): boolean;
  // Whether a character may sync this dataset (refresh token + scopes).
  eligible(owner: EnumeratedOwner): boolean;
  // Conditional fetch + per-feature plan → a persist verdict. Single-endpoint (jobs) or
  // dual-endpoint (skills) and the projection all live here (the slice's plan fn).
  fetchAndPlan(
    characterId: number,
    accessToken: string,
    state: TState | null,
  ): Promise<PersistVerdict<TSave>>;
  // Write-behind: persist the projected payload + new etag(s), revalidate.
  save(characterId: number, payload: TSave): Promise<void>;
}

/**
 * Builds the owner-sync descriptor for a character-keyed dataset, including eligibility,
 * freshness, queue, and telemetry ownership.
 */
export function makeCharacterDescriptor<TState extends { lastRefreshedAt: Date | null }, TSave>(
  base: CharacterSyncBase<TState>,
  spec: CharacterDatasetSpec<TState, TSave>,
): OwnerSyncDescriptor<number, TState, TSave> {
  return {
    now: () => base.now(),
    // Character-only slices have no corp axis, so corporationId is unused — map it null.
    enumerate: async (userId) =>
      (await base.listCharacters(userId)).map((character) => ({ ...character, corporationId: null })),
    identityOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    vendToken: (characterId) => base.vendToken(characterId),
    isStale: (state, now) => spec.isStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (characterId) => characterId,
    },
    readState: (characterId) => base.readSyncState(characterId),
    fetchAndPlan: (characterId, accessToken, state) => spec.fetchAndPlan(characterId, accessToken, state),
    save: (characterId, payload) => spec.save(characterId, payload),
    stampFresh: (characterId) => base.stampFresh(characterId),
  };
}
