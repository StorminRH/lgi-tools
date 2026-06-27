// The on-view owned-blueprints refresh (MIGRATE.0) — the stale-gated write-behind
// that mirrors the affiliation refresh, adapted for an AUTHED, paginated, per-
// owner read. PURE orchestration over an injected port (types.ts): it imports no
// auth and no DB, so it stays inside the feature boundary and is unit-tested with
// a fake port. The real port is wired in src/db/owned-blueprints-sync.ts.
//
// The staleness gate is checked BEFORE any token vend or ESI call, so a fresh
// owner does zero work — no vend, no roles read, no fetch. That single property
// is what makes a re-view inside the 1h window cost nothing, for both the
// character and corporation paths (which share refreshOwner; only the token
// source differs — a character's own token vs a resolved Director's).
import { CORP_BLUEPRINTS_REQUIRED_ROLES, canSyncCorpBlueprints } from './corp-sync-eligibility';
import { type CorpDirectorCandidate, dedupeCorpDirectors } from './director-resolution';
import { parseBlueprintsBody } from './esi-projection';
import { isBlueprintsStale } from './staleness';
import { canSyncBlueprints } from './sync-eligibility';
import type { OwnedBlueprintsPort, OwnerKey, RefreshCharacter } from './types';

export async function refreshOwnedBlueprintsForUser(
  port: OwnedBlueprintsPort,
  userId: string,
): Promise<void> {
  const characters = await port.listCharacters(userId);
  await refreshCharacterOwners(port, characters);
  await refreshCorpOwners(port, characters);
}

// One owner, gated by staleness. `getToken` is invoked ONLY when the owner is
// stale — so a fresh owner never vends a token or hits ESI. Best-effort: a vend
// miss, an ESI error, or a contract mismatch skips this owner without touching
// the stored set (the next view retries).
async function refreshOwner(
  port: OwnedBlueprintsPort,
  owner: OwnerKey,
  basePath: string,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const state = await port.readSyncState(owner);
  if (!isBlueprintsStale(state?.lastRefreshedAt ?? null, port.now())) return;

  const accessToken = await getToken();
  if (accessToken === null) return;

  const read = await port.readBlueprints(basePath, accessToken, state?.pageEtags ?? []);
  if (read.kind === 'unchanged') {
    await port.stampFresh(owner);
    return;
  }
  if (read.kind === 'error') return;

  const parsed = parseBlueprintsBody(read.items);
  if (parsed === null) return; // contract mismatch — keep the existing rows
  await port.saveBlueprints(owner, parsed, read.etags);
}

// Character owners: each scope-eligible character syncs its OWN blueprints with
// its own token.
async function refreshCharacterOwners(
  port: OwnedBlueprintsPort,
  characters: RefreshCharacter[],
): Promise<void> {
  for (const character of characters) {
    if (!canSyncBlueprints(character)) continue;
    const owner: OwnerKey = { ownerType: 'character', ownerId: character.characterId };
    await refreshOwner(port, owner, `/characters/${character.characterId}/blueprints/`, () =>
      port.vendToken(character.characterId),
    );
  }
}

// Corporation owners: group the user's corp-eligible characters by their cached
// corp, sync each corp ONCE. The token source resolves a Director among the
// member characters — and because refreshOwner gates on staleness first, a fresh
// corp does no role reads at all.
async function refreshCorpOwners(
  port: OwnedBlueprintsPort,
  characters: RefreshCharacter[],
): Promise<void> {
  const byCorp = new Map<number, RefreshCharacter[]>();
  for (const character of characters) {
    if (!canSyncCorpBlueprints(character) || character.corporationId === null) continue;
    const members = byCorp.get(character.corporationId) ?? [];
    members.push(character);
    byCorp.set(character.corporationId, members);
  }

  for (const [corporationId, members] of byCorp) {
    const owner: OwnerKey = { ownerType: 'corporation', ownerId: corporationId };
    await refreshOwner(port, owner, `/corporations/${corporationId}/blueprints/`, () =>
      resolveCorpDirectorToken(port, corporationId, members),
    );
  }
}

// Vend each member's token, read its corp roles, and pick a Director's token to
// read the corp endpoint with (preferring a role-holder via dedupeCorpDirectors).
// Returns null when no member holds the role — the graceful needs-role skip.
async function resolveCorpDirectorToken(
  port: OwnedBlueprintsPort,
  corporationId: number,
  members: RefreshCharacter[],
): Promise<string | null> {
  const candidates: CorpDirectorCandidate[] = [];
  for (const member of members) {
    const accessToken = await port.vendToken(member.characterId);
    if (accessToken === null) continue;
    const roles = await port.readRoles(member.characterId, accessToken);
    if (roles === null) continue;
    const hasRole = CORP_BLUEPRINTS_REQUIRED_ROLES.some((role) => roles.includes(role));
    candidates.push({ corporationId, vendingCharacterId: member.characterId, accessToken, hasRole });
  }
  const [subject] = dedupeCorpDirectors(candidates);
  return subject !== undefined && subject.hasRole ? subject.accessToken : null;
}
