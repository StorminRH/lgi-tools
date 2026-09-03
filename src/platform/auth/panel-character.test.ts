import { expect, test } from 'vitest';
import { toPanelCharacter } from './panel-character';

const base = { characterId: 90001, name: 'Pilot Alpha', portraitUrl: 'https://img/1.jpg' };

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
