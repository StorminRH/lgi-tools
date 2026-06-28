import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from './eve-sso';
import { deriveCharacterHealth, deriveScopeHealth, listGrantedScopes } from './scope-health';

const ALL_COMMA = [...EVE_SCOPES].join(',');
const ALL_SPACE = [...EVE_SCOPES].join(' ');

describe('deriveScopeHealth (per-feature)', () => {
  // Models a feature requiring its own scope subset. Literal scope strings only
  // — a feature's real scope set lives in its own slice (the feature⊥feature
  // import is banned), so these stand in for "what a feature would pass".
  const SKILLS = 'esi-skills.read_skills.v1';
  const QUEUE = 'esi-skills.read_skillqueue.v1';
  const JOBS = 'esi-industry.read_character_jobs.v1';

  it('reports only the required scopes a character is missing', () => {
    // Granted skills but not the jobs scope; a jobs-only feature is degraded.
    const result = deriveScopeHealth(
      { scope: `publicData,${SKILLS},${QUEUE}`, hasRefreshToken: true },
      [JOBS],
    );
    expect(result).toEqual({ needsReconnect: true, missingScopes: [JOBS] });
  });

  it('is healthy when an UNRELATED scope is absent but the required set is granted', () => {
    // The character lacks the jobs scope, but a skills feature only needs skills
    // — degradation is scoped to the required set, not the full grant.
    const result = deriveScopeHealth(
      { scope: `publicData,${SKILLS},${QUEUE}`, hasRefreshToken: true },
      [SKILLS, QUEUE],
    );
    expect(result).toEqual({ needsReconnect: false, missingScopes: [] });
  });

  it('needs reconnect when the refresh token is gone, even with the required scopes', () => {
    const result = deriveScopeHealth(
      { scope: `${SKILLS},${QUEUE}`, hasRefreshToken: false },
      [SKILLS],
    );
    expect(result).toEqual({ needsReconnect: true, missingScopes: [] });
  });

  it('treats a null scope as the whole required set missing', () => {
    expect(deriveScopeHealth({ scope: null, hasRefreshToken: true }, [SKILLS, JOBS])).toEqual({
      needsReconnect: true,
      missingScopes: [SKILLS, JOBS],
    });
  });

  it('parses a space-delimited grant the same as comma-delimited', () => {
    const required = [SKILLS, JOBS];
    expect(
      deriveScopeHealth({ scope: `${SKILLS} ${JOBS}`, hasRefreshToken: true }, required),
    ).toEqual(deriveScopeHealth({ scope: `${SKILLS},${JOBS}`, hasRefreshToken: true }, required));
  });
});

describe('deriveCharacterHealth', () => {
  it('is healthy when every required scope is granted and a refresh token exists', () => {
    expect(deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: true })).toEqual({
      needsReconnect: false,
      missingScopes: [],
    });
  });

  it('parses a space-delimited scope string the same as comma-delimited', () => {
    expect(deriveCharacterHealth({ scope: ALL_SPACE, hasRefreshToken: true })).toEqual({
      needsReconnect: false,
      missingScopes: [],
    });
  });

  it('flags the specific missing scopes when one is absent', () => {
    const missing = EVE_SCOPES[1];
    const partial = EVE_SCOPES.filter((s) => s !== missing).join(',');
    const result = deriveCharacterHealth({ scope: partial, hasRefreshToken: true });
    expect(result.needsReconnect).toBe(true);
    expect(result.missingScopes).toEqual([missing]);
  });

  it('needs reconnect when the refresh token is gone, even with full scopes', () => {
    const result = deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: false });
    expect(result.needsReconnect).toBe(true);
    expect(result.missingScopes).toEqual([]);
  });

  it('treats a null/empty scope as fully missing', () => {
    expect(deriveCharacterHealth({ scope: null, hasRefreshToken: true })).toEqual({
      needsReconnect: true,
      missingScopes: [...EVE_SCOPES],
    });
    expect(deriveCharacterHealth({ scope: '', hasRefreshToken: true }).missingScopes).toEqual([
      ...EVE_SCOPES,
    ]);
  });
});

describe('listGrantedScopes', () => {
  it('marks every currently-requested scope active, in EVE_SCOPES order', () => {
    const result = listGrantedScopes([...EVE_SCOPES].join(','));
    expect(result.map((s) => s.id)).toEqual([...EVE_SCOPES]);
    expect(result.every((s) => s.status === 'active')).toBe(true);
  });

  it('attaches a human gloss to a known scope', () => {
    expect(listGrantedScopes('esi-skills.read_skills.v1')).toEqual([
      { id: 'esi-skills.read_skills.v1', gloss: 'Read your trained skills', status: 'active' },
    ]);
  });

  it('orders active scopes by EVE_SCOPES, not by grant order', () => {
    const shuffled = [...EVE_SCOPES].reverse().join(' ');
    expect(listGrantedScopes(shuffled).map((s) => s.id)).toEqual([...EVE_SCOPES]);
  });

  it('lists legacy (no-longer-requested) scopes after active ones, in grant order', () => {
    const grant =
      'esi-clones.read_clones.v1,publicData,esi-location.read_location.v1,esi-skills.read_skills.v1';
    expect(listGrantedScopes(grant).map((s) => ({ id: s.id, status: s.status }))).toEqual([
      { id: 'publicData', status: 'active' },
      { id: 'esi-skills.read_skills.v1', status: 'active' },
      { id: 'esi-clones.read_clones.v1', status: 'legacy' },
      { id: 'esi-location.read_location.v1', status: 'legacy' },
    ]);
  });

  it('returns an empty list for null / undefined / empty', () => {
    expect(listGrantedScopes(null)).toEqual([]);
    expect(listGrantedScopes(undefined)).toEqual([]);
    expect(listGrantedScopes('')).toEqual([]);
  });

  it('deduplicates a repeated scope', () => {
    expect(listGrantedScopes('publicData,publicData').map((s) => s.id)).toEqual(['publicData']);
  });

  it('parses a space-delimited grant the same as comma-delimited', () => {
    const ids = [...EVE_SCOPES];
    expect(listGrantedScopes(ids.join(' '))).toEqual(listGrantedScopes(ids.join(',')));
  });

  it('flags an unknown scope as legacy with no gloss', () => {
    expect(listGrantedScopes('esi-made.up.v1')).toEqual([
      { id: 'esi-made.up.v1', status: 'legacy' },
    ]);
  });

  it('glosses a known-but-pruned legacy scope', () => {
    expect(listGrantedScopes('esi-clones.read_clones.v1')).toEqual([
      { id: 'esi-clones.read_clones.v1', gloss: 'Read your jump clones', status: 'legacy' },
    ]);
  });

  it('keeps both known and unknown legacy scopes, glossing only the known one', () => {
    expect(listGrantedScopes('esi-made.up.v1,esi-characters.read_standings.v1')).toEqual([
      { id: 'esi-made.up.v1', status: 'legacy' },
      { id: 'esi-characters.read_standings.v1', gloss: 'Read your standings', status: 'legacy' },
    ]);
  });
});
