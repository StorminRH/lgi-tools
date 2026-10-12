import { EsiBudgetExhaustedError } from '@/platform/esi';
import { corpCredentials } from './credential';
import type {
  CorpOwnerAxis,
  EnumeratedOwner,
  OwnerAxis,
  OwnerKey,
  OwnerSyncDescriptor,
  OwnerSyncResult,
  ReadSession,
} from './types';

/** Why an owner's credentials ran out: nobody holds the role, or a token (or a member's roles) could not be had. */
type CredentialsEnd = { kind: 'denied' } | { kind: 'unavailable'; retryable: boolean };

/** The access tokens an owner's refresh may try, in order, and why there are no more. */
type Credentials = AsyncGenerator<string, CredentialsEnd>;

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
  return Promise.all(
    owners
      .filter((owner) => axis.eligible(owner))
      .map((owner) =>
        syncOwner(descriptor, axis.ownerOf(owner.characterId), () =>
          characterCredentials(descriptor, owner.characterId),
        ),
      ),
  );
}

async function runCorpPass<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  axis: CorpOwnerAxis<TOwner>,
  userId: string,
  owners: EnumeratedOwner[],
): Promise<OwnerSyncResult[]> {
  const byCorp = new Map<number, EnumeratedOwner[]>();
  for (const owner of owners) {
    if (!axis.eligible(owner) || owner.corporationId === null) continue;
    const members = byCorp.get(owner.corporationId) ?? [];
    members.push(owner);
    byCorp.set(owner.corporationId, members);
  }

  return Promise.all(
    [...byCorp].map(([corporationId, members]) =>
      syncOwner(descriptor, axis.ownerOf(userId, corporationId), () =>
        corpTokens(descriptor, axis, members),
      ),
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

/**
 * Tries each credential in turn. A credential ESI refuses the role hands on
 * to the next; only once the roster is spent does the owner record
 * `needs_role`. A roster that yielded nothing reports why.
 */
async function tryCredentials<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  state: TState | null,
  credentials: Credentials,
  target: OwnerKey,
): Promise<OwnerSyncResult> {
  let tried = false;
  let next = await credentials.next();
  while (!next.done) {
    tried = true;
    const outcome = await attempt(descriptor, owner, next.value, state, target);
    if (outcome !== null) return outcome;
    next = await credentials.next();
  }
  if (!tried && next.value.kind === 'unavailable') {
    return next.value.retryable
      ? { kind: 'failed_retryable', target, code: 'owner_temporarily_unavailable' }
      : { kind: 'failed_permanent', target, code: 'token_unavailable' };
  }
  await descriptor.saveGateState?.(owner);
  return { kind: 'failed_permanent', target, code: 'needs_role' };
}

/**
 * One credential's try. The session's metas are committed only after the
 * owner's write has stood; a skip, a refusal or a throw drops them, so the
 * next view reads again. Null means ESI refused this credential the role.
 */
async function attempt<TOwner, TState, TSave, TSession extends ReadSession>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  owner: TOwner,
  accessToken: string,
  state: TState | null,
  target: OwnerKey,
): Promise<OwnerSyncResult | null> {
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
      return null;
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
  const accessToken = await descriptor.vendToken(characterId);
  if (accessToken === null) return { kind: 'unavailable', retryable: false };
  yield accessToken;
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
