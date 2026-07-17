// Corporation-owner descriptor builder. Corp industry jobs and owned structures
// share member enumeration, token/role resolution, target identity, and staleness
// plumbing while retaining genuinely different owner keys and persistence policy.
// This helper owns only the common corporation axis; feature decisions stay local.
import type { EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict } from './types';

/** The common port surface exposed by both current corporation-sync callers. */
export interface CorpSyncBase {
  now(): Date;
  listMembers(userId: string): Promise<EnumeratedOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

/**
 * TOwner may add feature identity (corp jobs include userId), but every owner carries
 * corporationId so the builder can expose one stable OwnerSyncTarget.
 */
export interface CorpDatasetSpec<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
> {
  // The feature's durable owner key. Corp jobs include the viewing user while
  // structures deliberately collapse every viewer onto the corporation alone.
  ownerOf(userId: string, corporationId: number): TOwner;
  // Whether a linked character may contribute a token to this dataset's corp read.
  eligible(owner: EnumeratedOwner): boolean;
  // At least one of these in-game roles must be present on the selected member.
  requiredRoles: readonly string[];
  isStale(lastRefreshedAt: Date | null, now: Date): boolean;
  // Optional feature gate evaluated before state, token, roles, or ESI work.
  precondition?(owner: TOwner): Promise<boolean>;
  readState(owner: TOwner): Promise<TState | null>;
  // The feature keeps projection and error policy; the builder owns only plumbing.
  fetchAndPlan(
    owner: TOwner,
    accessToken: string,
    state: TState | null,
  ): Promise<PersistVerdict<TSave>>;
  save(owner: TOwner, payload: TSave): Promise<void>;
  stampFresh(owner: TOwner): Promise<void>;
  // Corp jobs persist a graceful needs_role state; shared structures omit this so
  // role loss can never destructively replace a catalogue populated by another user.
  saveGateState?(owner: TOwner): Promise<void>;
}

export function makeCorpDescriptor<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
>(base: CorpSyncBase, spec: CorpDatasetSpec<TOwner, TState, TSave>): OwnerSyncDescriptor<TOwner, TState, TSave> {
  const { precondition, saveGateState } = spec;
  return {
    now: () => base.now(),
    enumerate: (userId) => base.listMembers(userId),
    identityOf: (owner) => ({ ownerType: 'corporation', ownerId: owner.corporationId }),
    vendToken: (characterId) => base.vendToken(characterId),
    ...(precondition === undefined ? {} : { precondition: (owner: TOwner) => precondition(owner) }),
    isStale: (state, now) => spec.isStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (userId, corporationId) => spec.ownerOf(userId, corporationId),
      requiredRoles: spec.requiredRoles,
      readRoles: (characterId, accessToken) => base.readRoles(characterId, accessToken),
    },
    readState: (owner) => spec.readState(owner),
    fetchAndPlan: (owner, accessToken, state) => spec.fetchAndPlan(owner, accessToken, state),
    save: (owner, payload) => spec.save(owner, payload),
    stampFresh: (owner) => spec.stampFresh(owner),
    ...(saveGateState === undefined ? {} : { saveGateState: (owner: TOwner) => saveGateState(owner) }),
  };
}
