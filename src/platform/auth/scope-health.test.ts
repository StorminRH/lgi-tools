import { expect, test } from 'vitest';
import { EVE_SCOPES } from './eve-sso';
import { deriveCharacterHealth, deriveScopeHealth, listGrantedScopes } from './scope-health';

const ALL_COMMA = [...EVE_SCOPES].join(',');
const ALL_SPACE = [...EVE_SCOPES].join(' ');
const SKILLS = 'esi-skills.read_skills.v1';
const QUEUE = 'esi-skills.read_skillqueue.v1';
const JOBS = 'esi-industry.read_character_jobs.v1';

test('deriveScopeHealth reports only the required missing scopes and treats space like comma', () => {
  expect(
    deriveScopeHealth({ scope: `publicData,${SKILLS},${QUEUE}`, hasRefreshToken: true }, [JOBS]),
  ).toEqual({ needsReconnect: true, missingScopes: [JOBS] });
  expect(
    deriveScopeHealth({ scope: `publicData,${SKILLS},${QUEUE}`, hasRefreshToken: true }, [
      SKILLS,
      QUEUE,
    ]),
  ).toEqual({ needsReconnect: false, missingScopes: [] });
  expect(
    deriveScopeHealth({ scope: `${SKILLS},${QUEUE}`, hasRefreshToken: false }, [SKILLS]),
  ).toEqual({ needsReconnect: true, missingScopes: [] });
  expect(deriveScopeHealth({ scope: null, hasRefreshToken: true }, [SKILLS, JOBS])).toEqual({
    needsReconnect: true,
    missingScopes: [SKILLS, JOBS],
  });
  expect(
    deriveScopeHealth({ scope: `${SKILLS} ${JOBS}`, hasRefreshToken: true }, [SKILLS, JOBS]),
  ).toEqual(deriveScopeHealth({ scope: `${SKILLS},${JOBS}`, hasRefreshToken: true }, [SKILLS, JOBS]));
});

test('deriveCharacterHealth flags missing required scopes, a gone refresh token, and empty grants', () => {
  expect(deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: true })).toEqual({
    needsReconnect: false,
    missingScopes: [],
  });
  expect(deriveCharacterHealth({ scope: ALL_SPACE, hasRefreshToken: true })).toEqual({
    needsReconnect: false,
    missingScopes: [],
  });

  const missing = EVE_SCOPES[1];
  const partial = EVE_SCOPES.filter((s) => s !== missing).join(',');
  const result = deriveCharacterHealth({ scope: partial, hasRefreshToken: true });
  expect(result.needsReconnect).toBe(true);
  expect(result.missingScopes).toEqual([missing]);

  expect(deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: false })).toEqual({
    needsReconnect: true,
    missingScopes: [],
  });
  expect(deriveCharacterHealth({ scope: null, hasRefreshToken: true })).toEqual({
    needsReconnect: true,
    missingScopes: [...EVE_SCOPES],
  });
  expect(deriveCharacterHealth({ scope: '', hasRefreshToken: true }).missingScopes).toEqual([
    ...EVE_SCOPES,
  ]);
});

test('listGrantedScopes orders active then legacy, glosses known ids, and treats space like comma', () => {
  const active = listGrantedScopes([...EVE_SCOPES].join(','));
  expect(active.map((s) => s.id)).toEqual([...EVE_SCOPES]);
  expect(active.every((s) => s.status === 'active')).toBe(true);
  expect(listGrantedScopes([...EVE_SCOPES].reverse().join(' ')).map((s) => s.id)).toEqual([
    ...EVE_SCOPES,
  ]);
  expect(listGrantedScopes(ALL_SPACE)).toEqual(listGrantedScopes(ALL_COMMA));

  expect(listGrantedScopes('esi-skills.read_skills.v1')).toEqual([
    { id: 'esi-skills.read_skills.v1', gloss: 'Read your trained skills', status: 'active' },
  ]);

  const grant =
    'esi-clones.read_clones.v1,publicData,esi-characters.read_standings.v1,esi-skills.read_skills.v1';
  expect(listGrantedScopes(grant).map((s) => ({ id: s.id, status: s.status }))).toEqual([
    { id: 'publicData', status: 'active' },
    { id: 'esi-skills.read_skills.v1', status: 'active' },
    { id: 'esi-clones.read_clones.v1', status: 'legacy' },
    { id: 'esi-characters.read_standings.v1', status: 'legacy' },
  ]);

  expect(listGrantedScopes(null)).toEqual([]);
  expect(listGrantedScopes(undefined)).toEqual([]);
  expect(listGrantedScopes('')).toEqual([]);
  expect(listGrantedScopes('publicData,publicData').map((s) => s.id)).toEqual(['publicData']);

  expect(listGrantedScopes('esi-made.up.v1')).toEqual([{ id: 'esi-made.up.v1', status: 'legacy' }]);
  expect(listGrantedScopes('esi-clones.read_clones.v1')).toEqual([
    { id: 'esi-clones.read_clones.v1', gloss: 'Read your jump clones', status: 'legacy' },
  ]);
  expect(listGrantedScopes('esi-made.up.v1,esi-characters.read_standings.v1')).toEqual([
    { id: 'esi-made.up.v1', status: 'legacy' },
    { id: 'esi-characters.read_standings.v1', gloss: 'Read your standings', status: 'legacy' },
  ]);
});
