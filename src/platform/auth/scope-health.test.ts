import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { deriveLinkedCharacterStatus, deriveScopeHealth, scopeHolderOf } from './scope-health';

const ALL_COMMA = [...EVE_SCOPES].join(',');
const ALL_SPACE = [...EVE_SCOPES].join(' ');
const SKILLS = 'esi-skills.read_skills.v1';
const QUEUE = 'esi-skills.read_skillqueue.v1';
const JOBS = 'esi-industry.read_character_jobs.v1';

/** The scopes a row lists, read as the settings page does. */
const listGrantedScopes = (scope: string | null) =>
  deriveLinkedCharacterStatus({ scope, hasRefreshToken: true }).scopes;

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

test('a linked character needs a reconnect for a missing required scope, a gone refresh token, or an empty grant', () => {
  const needsReconnect = (input: { scope: string | null; hasRefreshToken: boolean }) =>
    deriveLinkedCharacterStatus(input).needsReconnect;
  expect(needsReconnect({ scope: ALL_COMMA, hasRefreshToken: true })).toBe(false);
  expect(needsReconnect({ scope: ALL_SPACE, hasRefreshToken: true })).toBe(false);

  const missing = EVE_SCOPES[1];
  const partial = { scope: EVE_SCOPES.filter((s) => s !== missing).join(','), hasRefreshToken: true };
  expect(needsReconnect(partial)).toBe(true);
  expect(scopeHolderOf(partial).missingScopes).toEqual([missing]);

  expect(needsReconnect({ scope: ALL_COMMA, hasRefreshToken: false })).toBe(true);
  expect(needsReconnect({ scope: null, hasRefreshToken: true })).toBe(true);
  expect(scopeHolderOf({ scope: '', hasRefreshToken: true }).missingScopes).toEqual([...EVE_SCOPES]);
});

test('deriveLinkedCharacterStatus labels healthy, disconnected, and missing-scope characters', () => {
  const healthy = deriveLinkedCharacterStatus({
    scope: [...EVE_SCOPES].reverse().join(','),
    hasRefreshToken: true,
  });
  expect(healthy.needsReconnect).toBe(false);
  expect(healthy.healthLabel).toBeNull();
  expect(healthy.scopes.length).toBeGreaterThan(0);

  const disconnected = deriveLinkedCharacterStatus({
    scope: 'publicData',
    hasRefreshToken: false,
  });
  expect(disconnected.needsReconnect).toBe(true);
  expect(disconnected.healthLabel).toBe('Disconnected');

  const missingScopes = deriveLinkedCharacterStatus({
    scope: 'publicData',
    hasRefreshToken: true,
  });
  expect(missingScopes.needsReconnect).toBe(true);
  expect(missingScopes.healthLabel).toBe('Missing scopes');
});

test('delayed verification does not request reconnect and clears when authorization recovers', () => {
  const character = { scope: EVE_SCOPES.join(' '), hasRefreshToken: true };
  expect(deriveLinkedCharacterStatus({ ...character, authorizationDelayed: true })).toMatchObject({
    needsReconnect: false,
    healthLabel: 'Verification delayed',
    authorizationDelayed: true,
  });
  expect(deriveLinkedCharacterStatus({ ...character, authorizationDelayed: false })).toMatchObject({
    needsReconnect: false,
    healthLabel: null,
    authorizationDelayed: false,
  });
  expect(deriveLinkedCharacterStatus({ ...character, authorizationDelayed: true, hasRefreshToken: false })).toMatchObject({
    needsReconnect: true,
    healthLabel: 'Disconnected',
    authorizationDelayed: false,
  });
});

test('scopeHolderOf keeps the refresh token, lists the requested scopes the grant lacks, and drops the rest of the row', () => {
  const row = { characterId: 90001, name: 'Pilot Alpha', scope: `publicData ${SKILLS}`, hasRefreshToken: true };
  const holder = scopeHolderOf(row);
  expect(holder).toEqual({
    hasRefreshToken: true,
    missingScopes: EVE_SCOPES.filter((scope) => scope !== 'publicData' && scope !== SKILLS),
  });
  expect(holder.missingScopes).toContain(QUEUE);

  expect(scopeHolderOf({ scope: ALL_SPACE, hasRefreshToken: false })).toEqual({
    hasRefreshToken: false,
    missingScopes: [],
  });
  expect(scopeHolderOf({ scope: null, hasRefreshToken: true }).missingScopes).toEqual([...EVE_SCOPES]);
});

test('listGrantedScopes orders active then legacy, glosses every requested and legacy id, and treats space like comma', () => {
  const active = listGrantedScopes([...EVE_SCOPES].join(','));
  expect(active.map((s) => s.id)).toEqual([...EVE_SCOPES]);
  expect(active.every((s) => s.status === 'active')).toBe(true);
  expect(active.filter((s) => !s.gloss).map((s) => s.id)).toEqual([]);
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
    { id: 'esi-clones.read_clones.v1', status: 'active' },
    { id: 'esi-characters.read_standings.v1', status: 'legacy' },
  ]);

  expect(listGrantedScopes(null)).toEqual([]);
  expect(listGrantedScopes('')).toEqual([]);
  expect(listGrantedScopes('publicData,publicData').map((s) => s.id)).toEqual(['publicData']);

  expect(listGrantedScopes('esi-made.up.v1')).toEqual([{ id: 'esi-made.up.v1', status: 'legacy' }]);
  expect(listGrantedScopes('esi-planets.manage_planets.v1,esi-skills.read_skills.v1')).toEqual([
    { id: 'esi-skills.read_skills.v1', gloss: 'Read your trained skills', status: 'active' },
    { id: 'esi-planets.manage_planets.v1', gloss: 'Manage your planetary colonies', status: 'legacy' },
  ]);
  expect(listGrantedScopes('esi-wallet.read_character_wallet.v1')).toEqual([
    { id: 'esi-wallet.read_character_wallet.v1', gloss: 'Read your wallet balance and journal', status: 'active' },
  ]);
  expect(listGrantedScopes('esi-markets.read_character_orders.v1')).toEqual([
    { id: 'esi-markets.read_character_orders.v1', gloss: 'Read your open market orders', status: 'active' },
  ]);
  expect(listGrantedScopes('esi-corporations.read_divisions.v1,esi-corporations.track_members.v1')).toEqual([
    {
      id: 'esi-corporations.read_divisions.v1',
      gloss: "Read your corporation's hangar division names",
      status: 'active',
    },
    {
      id: 'esi-corporations.track_members.v1',
      gloss: "Read your corporation members' home stations",
      status: 'active',
    },
  ]);
  expect(listGrantedScopes('esi-made.up.v1,esi-characters.read_standings.v1')).toEqual([
    { id: 'esi-made.up.v1', status: 'legacy' },
    { id: 'esi-characters.read_standings.v1', gloss: 'Read your standings', status: 'legacy' },
  ]);
});
