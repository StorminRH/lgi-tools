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
  // Character owners THEN corp owners, in series at the top level: a character is
  // both a character-owner and a corp member, so running the two passes one after
  // the other avoids vending the same character's token concurrently. WITHIN each
  // pass the owners are independent (own token, own ESI read, own owner-keyed DB
  // write), so they refresh in parallel — the shared ESI gate throttles its own
  // budget, and the staleness gate keeps the common (fresh) path free either way.
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
// its own token — in parallel, since the characters are independent.
async function refreshCharacterOwners(
  port: OwnedBlueprintsPort,
  characters: RefreshCharacter[],
): Promise<void> {
  await Promise.all(
    characters
      .filter((character) => canSyncBlueprints(character))
      .map((character) =>
        refreshOwner(
          port,
          { ownerType: 'character', ownerId: character.characterId },
          `/characters/${character.characterId}/blueprints/`,
          () => port.vendToken(character.characterId),
        ),
      ),
  );
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

  // Corps are independent (distinct owner keys; a character belongs to one corp, so
  // no member token is vended by two corps at once), so refresh them in parallel.
  await Promise.all(
    [...byCorp].map(([corporationId, members]) =>
      refreshOwner(
        port,
        { ownerType: 'corporation', ownerId: corporationId },
        `/corporations/${corporationId}/blueprints/`,
        () => resolveCorpDirectorToken(port, corporationId, members),
      ),
    ),
  );
}

// Vend each member's token, read its corp roles, and pick a Director's token to
// read the corp endpoint with (preferring a role-holder via dedupeCorpDirectors).
// Returns null when no member holds the role — the graceful needs-role skip. The
// members are vended/read in parallel (distinct characters); `Promise.all` preserves
// their order, so `dedupeCorpDirectors` picks the same subject as a serial pass.
async function resolveCorpDirectorToken(
  port: OwnedBlueprintsPort,
  corporationId: number,
  members: RefreshCharacter[],
): Promise<string | null> {
  const resolved = await Promise.all(
    members.map(async (member): Promise<CorpDirectorCandidate | null> => {
      const accessToken = await port.vendToken(member.characterId);
      if (accessToken === null) return null;
      const roles = await port.readRoles(member.characterId, accessToken);
      if (roles === null) return null;
      const hasRole = CORP_BLUEPRINTS_REQUIRED_ROLES.some((role) => roles.includes(role));
      return { corporationId, vendingCharacterId: member.characterId, accessToken, hasRole };
    }),
  );
  const candidates = resolved.filter((c): c is CorpDirectorCandidate => c !== null);
  const [subject] = dedupeCorpDirectors(candidates);
  return subject !== undefined && subject.hasRole ? subject.accessToken : null;
}
