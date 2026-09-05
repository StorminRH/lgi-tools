import { expect, test } from 'vitest';
import { toAccountCharacter, toPanelCharacter } from './panel-character';

const base = { characterId: 90001, name: 'Pilot Alpha', portraitUrl: 'https://img/1.jpg' };
const SKILLS = 'esi-skills.read_skills.v1';
const QUEUE = 'esi-skills.read_skillqueue.v1';

test('projects client-safe fields, never the granted scope, and wires needsReconnect from the tracker', () => {
  const panel = toPanelCharacter(
    { ...base, scope: 'esi-skills.read_skills.v1', hasRefreshToken: true },
    () => true,
  );
  expect(panel).toEqual({
    characterId: 90001,
    name: 'Pilot Alpha',
    portraitUrl: 'https://img/1.jpg',
    needsReconnect: false,
  });
  expect(panel).not.toHaveProperty('scope');

  const syncable = { ...base, scope: '', hasRefreshToken: true };
  expect(toPanelCharacter(syncable, () => true).needsReconnect).toBe(false);
  expect(toPanelCharacter(syncable, () => false).needsReconnect).toBe(true);

  let seen: { hasRefreshToken: boolean; missingScopes: string[] } | undefined;
  toPanelCharacter({ ...base, scope: '', hasRefreshToken: false }, (eligibility) => {
    seen = eligibility;
    return eligibility.hasRefreshToken;
  });
  expect(seen?.hasRefreshToken).toBe(false);
  expect(seen?.missingScopes.length ?? 0).toBeGreaterThan(0);
});

test('toAccountCharacter splits skill-queue reconnect from location tracking reconnect', () => {
  const gates = {
    skillQueue: (eligibility: { hasRefreshToken: boolean; missingScopes: string[] }) =>
      eligibility.hasRefreshToken &&
      !eligibility.missingScopes.includes('esi-skills.read_skills.v1'),
    location: (eligibility: { hasRefreshToken: boolean; missingScopes: string[] }) =>
      eligibility.hasRefreshToken &&
      !eligibility.missingScopes.includes('esi-location.read_location.v1'),
  };

  expect(
    toAccountCharacter({ ...base, scope: `${SKILLS},${QUEUE}`, hasRefreshToken: true }, gates),
  ).toEqual({
    characterId: 90001,
    name: 'Pilot Alpha',
    portraitUrl: 'https://img/1.jpg',
    needsReconnect: false,
    needsLocationReconnect: true,
  });
  expect(
    toAccountCharacter(
      {
        ...base,
        scope: 'esi-location.read_location.v1,esi-location.read_ship_type.v1,esi-location.read_online.v1',
        hasRefreshToken: true,
      },
      gates,
    ),
  ).toMatchObject({ needsReconnect: true, needsLocationReconnect: false });
  expect(
    toAccountCharacter(
      { ...base, scope: `${SKILLS},${QUEUE}`, hasRefreshToken: false },
      gates,
    ),
  ).toMatchObject({ needsReconnect: true, needsLocationReconnect: true });
});
