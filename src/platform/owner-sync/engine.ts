import { mapConcurrent } from '@/lib/fan-out';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { corpCredentials } from './credential';
import {
  hasToken,
  type CorpOwnerAxis,
  type EnumeratedOwner,
  type OwnerAxis,
  type OwnerKey,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  type ReadSession,
} from './types';

/** Why an owner's credentials ran out: nobody holds the role, or a token (or a member's roles) could not be had. */
type CredentialsEnd = { kind: 'denied' } | { kind: 'unavailable'; retryable: boolean };

/** The access tokens an owner's refresh may try, in order, and why there are no more. */
type Credentials = AsyncGenerator<string, CredentialsEnd>;

/** Owners (characters or corporations) refreshed at once in one pass; each owner's sections still run in parallel inside it. */
export const OWNER_SYNC_CONCURRENCY = 8;

export async function runOwnerSync<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  userId: string,
): Promise<OwnerSyncResult[]> {
  const owners = await descriptor.enumerate(userId);
  const results: OwnerSyncResult[] = [];
  if (descriptor.characterAxis !== undefined) {
    results.push(...(await runCharacterPass(descriptor, descriptor.characterAxis, owners)));
  }
  if (descriptor.corpAxis !== undefined) {
    results.push(...(await runCorpPass(descriptor, descriptor.corpAxis, userId, owners)));
  }
  return results;
}

async function runCharacterPass<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  axis: OwnerAxis<TOwner>,
  owners: EnumeratedOwner[],
): Promise<OwnerSyncResult[]> {
  return mapConcurrent(
    owners.filter((owner) => axis.eligible(owner)),
    OWNER_SYNC_CONCURRENCY,
    (owner) =>
      syncOwner(descriptor, axis.ownerOf(owner.characterId), () =>
        characterCredentials(descriptor, owner.characterId),
      ),
  );
}

/**
 * The corporations a corp pass syncs, each with the members whose tokens it
 * may try: a corporation counts once some eligible member belongs to it.
 */
export function corporationsOf(
  owners: readonly EnumeratedOwner[],
  eligible: (owner: EnumeratedOwner) => boolean,
): Map<number, EnumeratedOwner[]> {
  const byCorp = new Map<number, EnumeratedOwner[]>();
  for (const owner of owners) {
    if (!eligible(owner) || owner.corporationId === null) continue;
    const members = byCorp.get(owner.corporationId) ?? [];
    members.push(owner);
    byCorp.set(owner.corporationId, members);
  }
  return byCorp;
}

async function runCorpPass<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  axis: CorpOwnerAxis<TOwner>,
  userId: string,
  owners: EnumeratedOwner[],
): Promise<OwnerSyncResult[]> {
  return mapConcurrent(
    [...corporationsOf(owners, (owner) => axis.eligible(owner))],
    OWNER_SYNC_CONCURRENCY,
    ([corporationId, members]) =>
      syncOwner(descriptor, axis.ownerOf(userId, corporationId), () =>
        corpTokens(descriptor, axis, members),
      ),
  );
}

async function syncOwner<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  credentials: () => Credentials,
): Promise<OwnerSyncResult> {
  const target = descriptor.identityOf(owner);
  try {
    if (descriptor.precondition !== undefined && !(await descriptor.precondition(owner))) {
      return { kind: 'failed_permanent', target, code: 'precondition_failed' };
    }
    if (!(await descriptor.isDue(owner))) return { kind: 'succeeded', target };

    const state = await descriptor.readState(owner);
    return await tryCredentials(descriptor, owner, state, credentials(), target);
  } catch (error) {
    if (!(error instanceof EsiBudgetExhaustedError)) throw error;
    // Nothing is queued: the next view asks the engine again.
    return { kind: 'deferred_for_budget', target, error };
  }
}

/** ESI refused one credential the role, settled until the 403's own Expires when it sent one. */
interface RoleRefused {
  readonly refusedUntil: number | null;
}

const isRefused = (outcome: OwnerSyncResult | RoleRefused): outcome is RoleRefused => 'refusedUntil' in outcome;

/** The earlier of two refusal lifetimes, either of which may be unknown (null). */
function earlierRefusal(held: number | null, next: number | null): number | null {
  if (held === null) return next;
  return next === null ? held : Math.min(held, next);
}

/**
 * Tries each credential in turn. A credential ESI refuses the role hands on
 * to the next; only once the roster is spent does the owner record
 * `needs_role`. A roster that yielded nothing reports why. A settled end
 * (`needs_role`, or a character whose grant is lost) is recorded as the
 * owner's answer, so the next views skip it until that answer expires; a
 * transient one (the token service failing for now) records nothing and
 * the next view retries.
 */
async function tryCredentials<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  state: TState | null,
  credentials: Credentials,
  target: OwnerKey,
): Promise<OwnerSyncResult> {
  let tried = false;
  let refusedUntil: number | null = null;
  let next = await credentials.next();
  while (!next.done) {
    tried = true;
    const outcome = await attempt(descriptor, owner, next.value, state, target);
    if (!isRefused(outcome)) return outcome;
    refusedUntil = earlierRefusal(refusedUntil, outcome.refusedUntil);
    next = await credentials.next();
  }
  return tried ? refuseRole(descriptor, owner, refusedUntil, target) : settleUntried(descriptor, owner, next.value, target);
}

/** Every credential tried was refused the role: `needs_role`, recorded until the earliest refusal's Expires. */
async function refuseRole<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  refusedUntil: number | null,
  target: OwnerKey,
): Promise<OwnerSyncResult> {
  await descriptor.saveGateState?.(owner);
  await descriptor.recordRefusal?.(owner, refusedUntil);
  return { kind: 'failed_permanent', target, code: 'needs_role' };
}

/** A roster that yielded no credential: nobody holds the role, the token is gone, or a member could not be judged for now. */
async function settleUntried<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  end: CredentialsEnd,
  target: OwnerKey,
): Promise<OwnerSyncResult> {
  if (end.kind === 'denied') return refuseRole(descriptor, owner, null, target);
  if (end.retryable) return { kind: 'failed_retryable', target, code: 'owner_temporarily_unavailable' };
  await descriptor.recordRefusal?.(owner, null);
  return { kind: 'failed_permanent', target, code: 'token_unavailable' };
}

/**
 * One credential's try. The session's metas are committed only after the
 * owner's write has stood; a skip, a refusal or a throw drops them, so the
 * next view reads again. A refusal means ESI refused this credential the role.
 */
async function attempt<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  accessToken: string,
  state: TState | null,
  target: OwnerKey,
): Promise<OwnerSyncResult | RoleRefused> {
  const session = descriptor.openSession();
  const verdict = await descriptor.fetchAndPlan(owner, accessToken, state, session);
  switch (verdict.kind) {
    case 'skip': {
      const code = verdict.code ?? 'refresh_skipped';
      return code === 'esi_server_error'
        ? { kind: 'failed_retryable', target, code }
        : { kind: 'failed_permanent', target, code };
    }
    case 'needs_role':
      return { refusedUntil: verdict.expiresAt ?? null };
    case 'stamp':
      await descriptor.stampFresh(owner);
      await session.commit();
      return { kind: 'succeeded', target };
    case 'save':
      await descriptor.save(owner, verdict);
      await session.commit();
      return { kind: 'succeeded', target };
  }
}

async function* characterCredentials<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  characterId: number,
): Credentials {
  const vended = await descriptor.vendToken(characterId);
  // A grant that is gone settles until the user relinks; a token service failing for now is retried by the next view.
  if (!hasToken(vended)) return { kind: 'unavailable', retryable: vended.missing === 'unavailable' };
  yield vended;
  return { kind: 'denied' };
}

async function* corpTokens<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  axis: CorpOwnerAxis<TOwner>,
  members: EnumeratedOwner[],
): Credentials {
  const credentials = corpCredentials(
    members.map((member) => member.characterId),
    axis.requiredRoles,
    { vendToken: descriptor.vendToken, readRoles: axis.readRoles },
  );
  let next = await credentials.next();
  while (!next.done) {
    yield next.value.accessToken;
    next = await credentials.next();
  }
  return next.value.kind === 'denied' ? { kind: 'denied' } : { kind: 'unavailable', retryable: true };
}
