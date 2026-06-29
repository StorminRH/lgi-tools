import { classifyCorpDirector } from './director';
import type {
  CorpMemberCandidate,
  CorpOwnerAxis,
  EnumeratedOwner,
  OwnerAxis,
  OwnerSyncDescriptor,
} from './types';

// The token-resolution outcome for one owner, before the fetch: a usable token, a
// graceful gate state (no role-holder), or a transient skip.
type TokenOutcome =
  | { kind: 'token'; accessToken: string }
  | { kind: 'needs_role' }
  | { kind: 'skip' };

// Run one user's per-owner sync: the character pass THEN the corp pass, in series at
// the top level (a character is both a char-owner and a corp member, so serialising
// the passes avoids vending the same token concurrently). Within each pass the owners
// are independent and refresh in parallel. Each owner is best-effort — the slice's
// port swallows ESI budget / 5xx to soft outcomes, so one owner's miss never aborts
// the pass. A character-only slice supplies no corpAxis; a corp-only slice supplies
// no characterAxis.
export async function runOwnerSync<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  userId: string,
): Promise<void> {
  const owners = await descriptor.enumerate(userId);
  if (descriptor.characterAxis !== undefined) {
    await runCharacterPass(descriptor, descriptor.characterAxis, owners);
  }
  if (descriptor.corpAxis !== undefined) {
    await runCorpPass(descriptor, descriptor.corpAxis, userId, owners);
  }
}

// Character owners: each scope-eligible character syncs its OWN data with its own
// token — in parallel, since the characters are independent.
async function runCharacterPass<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: OwnerAxis<TOwner>,
  owners: EnumeratedOwner[],
): Promise<void> {
  await Promise.all(
    owners
      .filter((owner) => axis.eligible(owner))
      .map((owner) =>
        syncOwner(descriptor, axis.ownerOf(owner.characterId), () =>
          resolveCharacterToken(descriptor, owner.characterId),
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
): Promise<void> {
  const byCorp = new Map<number, EnumeratedOwner[]>();
  for (const owner of owners) {
    if (!axis.eligible(owner) || owner.corporationId === null) continue;
    const members = byCorp.get(owner.corporationId) ?? [];
    members.push(owner);
    byCorp.set(owner.corporationId, members);
  }

  await Promise.all(
    [...byCorp].map(([corporationId, members]) =>
      syncOwner(descriptor, axis.ownerOf(userId, corporationId), () =>
        resolveCorpToken(descriptor, axis, members),
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
): Promise<void> {
  const state = await descriptor.readState(owner);
  if (!descriptor.isStale(state, descriptor.now())) return;

  const token = await resolveToken();
  if (token.kind === 'skip') return;
  if (token.kind === 'needs_role') {
    await descriptor.saveGateState?.(owner);
    return;
  }

  const verdict = await descriptor.fetchAndPlan(owner, token.accessToken, state);
  switch (verdict.kind) {
    case 'skip':
      return;
    case 'stamp':
      await descriptor.stampFresh(owner);
      return;
    case 'needs_role':
      await descriptor.saveGateState?.(owner);
      return;
    case 'save':
      await descriptor.save(owner, verdict);
      return;
  }
}

async function resolveCharacterToken<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  characterId: number,
): Promise<TokenOutcome> {
  const accessToken = await descriptor.vendToken(characterId);
  return accessToken === null ? { kind: 'skip' } : { kind: 'token', accessToken };
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
  if (resolution.kind === 'unavailable') return { kind: 'skip' };
  if (resolution.kind === 'needs_role') return { kind: 'needs_role' };
  return { kind: 'token', accessToken: resolution.accessToken };
}
