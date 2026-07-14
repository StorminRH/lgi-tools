import { EsiBudgetExhaustedError } from '@/lib/esi';
import { classifyCorpDirector } from './director';
import type {
  CorpMemberCandidate,
  CorpOwnerAxis,
  EnumeratedOwner,
  OwnerAxis,
  OwnerSyncDescriptor,
  OwnerSyncResult,
  OwnerSyncRunOptions,
  OwnerSyncTarget,
} from './types';

// The token-resolution outcome for one owner, before the fetch: a usable token, a
// graceful gate state (no role-holder), or a transient skip.
type TokenOutcome =
  | { kind: 'token'; accessToken: string }
  | { kind: 'needs_role' }
  | { kind: 'skip'; retryable: boolean };

// Run one user's per-owner sync: the character pass THEN the corp pass, in series at
// the top level (a character is both a char-owner and a corp member, so serialising
// the passes avoids vending the same token concurrently). Within each pass the owners
// are independent and refresh in parallel. Each owner reports a structured outcome;
// budget deferrals may additionally enqueue through the optional callback. A
// character-only slice supplies no corpAxis; a corp-only slice supplies no characterAxis.
export async function runOwnerSync<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  userId: string,
  options: OwnerSyncRunOptions = {},
): Promise<OwnerSyncResult[]> {
  const owners = await descriptor.enumerate(userId);
  const results: OwnerSyncResult[] = [];
  if (descriptor.characterAxis !== undefined) {
    results.push(
      ...(await runCharacterPass(descriptor, descriptor.characterAxis, owners, options)),
    );
  }
  if (descriptor.corpAxis !== undefined) {
    results.push(
      ...(await runCorpPass(descriptor, descriptor.corpAxis, userId, owners, options)),
    );
  }
  return results;
}

function targetMatches(candidate: OwnerSyncTarget, requested: OwnerSyncTarget | undefined): boolean {
  return (
    requested === undefined ||
    (candidate.ownerType === requested.ownerType && candidate.ownerId === requested.ownerId)
  );
}

// Character owners: each scope-eligible character syncs its OWN data with its own
// token — in parallel, since the characters are independent.
async function runCharacterPass<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: OwnerAxis<TOwner>,
  owners: EnumeratedOwner[],
  options: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return Promise.all(
    owners
      .filter((owner) => axis.eligible(owner))
      .map((owner) => ({ owner, key: axis.ownerOf(owner.characterId) }))
      .filter(({ key }) => targetMatches(descriptor.identityOf(key), options.target))
      .map(({ owner, key }) =>
        syncOwner(
          descriptor,
          key,
          () => resolveCharacterToken(descriptor, owner.characterId),
          options,
        ),
      ),
  );
}

// Corporation owners: group the user's corp-eligible characters by their cached corp
// and sync each corp ONCE. Corps are independent (a character belongs to one corp, so
// no member token is vended by two corps at once), so they refresh in parallel.
async function runCorpPass<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: CorpOwnerAxis<TOwner>,
  userId: string,
  owners: EnumeratedOwner[],
  options: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  const byCorp = new Map<number, EnumeratedOwner[]>();
  for (const owner of owners) {
    if (!axis.eligible(owner) || owner.corporationId === null) continue;
    const members = byCorp.get(owner.corporationId) ?? [];
    members.push(owner);
    byCorp.set(owner.corporationId, members);
  }

  return Promise.all(
    [...byCorp]
      .map(([corporationId, members]) => ({
        members,
        key: axis.ownerOf(userId, corporationId),
      }))
      .filter(({ key }) => targetMatches(descriptor.identityOf(key), options.target))
      .map(({ key, members }) =>
        syncOwner(
          descriptor,
          key,
          () => resolveCorpToken(descriptor, axis, members),
          options,
        ),
      ),
  );
}

// One owner, gated by staleness. resolveToken (a character's own vend, or a corp
// Director resolution) runs ONLY when the owner is stale — so a fresh owner never
// vends a token or hits ESI. The whole sequence is best-effort per owner.
async function syncOwner<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  owner: TOwner,
  resolveToken: () => Promise<TokenOutcome>,
  options: OwnerSyncRunOptions,
): Promise<OwnerSyncResult> {
  const target = descriptor.identityOf(owner);
  try {
    // Consent gate, FIRST — before the state read, the staleness check, and any vend.
    // A descriptor that opts out (returns false) is skipped with zero I/O: no readState,
    // no token vend, no roles read, no fetch. Absent ⇒ always proceed (every other slice).
    if (descriptor.precondition !== undefined && !(await descriptor.precondition(owner))) {
      return { kind: 'failed_permanent', target, code: 'precondition_failed' };
    }

    const state = await descriptor.readState(owner);
    if (!descriptor.isStale(state, descriptor.now())) {
      return { kind: 'succeeded', target };
    }

    const token = await resolveToken();
    if (token.kind === 'skip') {
      return token.retryable
        ? { kind: 'failed_retryable', target, code: 'owner_temporarily_unavailable' }
        : { kind: 'failed_permanent', target, code: 'token_unavailable' };
    }
    if (token.kind === 'needs_role') {
      await descriptor.saveGateState?.(owner);
      return { kind: 'failed_permanent', target, code: 'needs_role' };
    }

    const verdict = await descriptor.fetchAndPlan(owner, token.accessToken, state);
    switch (verdict.kind) {
      case 'skip': {
        const code = verdict.code ?? 'refresh_skipped';
        return code === 'esi_server_error'
          ? { kind: 'failed_retryable', target, code }
          : { kind: 'failed_permanent', target, code };
      }
      case 'stamp':
        await descriptor.stampFresh(owner);
        return { kind: 'succeeded', target };
      case 'needs_role':
        await descriptor.saveGateState?.(owner);
        return { kind: 'failed_permanent', target, code: 'needs_role' };
      case 'save':
        await descriptor.save(owner, verdict);
        return { kind: 'succeeded', target };
    }
  } catch (error) {
    if (!(error instanceof EsiBudgetExhaustedError)) throw error;
    await options.onBudgetDeferred?.(target, error);
    return { kind: 'deferred_for_budget', target, error };
  }
}

async function resolveCharacterToken<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  characterId: number,
): Promise<TokenOutcome> {
  const accessToken = await descriptor.vendToken(characterId);
  return accessToken === null
    ? { kind: 'skip', retryable: false }
    : { kind: 'token', accessToken };
}

// Vend each member's token and read its in-game roles (in parallel — distinct
// characters), build candidates, then pick + classify a Director. A member that
// can't be vended or whose roles can't be read contributes no candidate; no
// candidates at all → skip (transient), candidates but no role-holder → needs_role,
// a role-holder → its token.
async function resolveCorpToken<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: CorpOwnerAxis<TOwner>,
  members: EnumeratedOwner[],
): Promise<TokenOutcome> {
  const resolved = await Promise.all(
    members.map(async (member): Promise<CorpMemberCandidate | null> => {
      const accessToken = await descriptor.vendToken(member.characterId);
      if (accessToken === null) return null;
      const roles = await axis.readRoles(member.characterId, accessToken);
      if (roles === null) return null;
      const hasRole = axis.requiredRoles.some((role) => roles.includes(role));
      return { vendingCharacterId: member.characterId, accessToken, hasRole };
    }),
  );
  const candidates = resolved.filter((candidate): candidate is CorpMemberCandidate => candidate !== null);
  const resolution = classifyCorpDirector(candidates);
  if (resolution.kind === 'unavailable') return { kind: 'skip', retryable: true };
  if (resolution.kind === 'needs_role') return { kind: 'needs_role' };
  return { kind: 'token', accessToken: resolution.accessToken };
}
