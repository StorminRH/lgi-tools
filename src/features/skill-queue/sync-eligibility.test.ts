import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncSkillQueue } from './sync-eligibility';

const NEEDED: readonly string[] = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
];

test('canSyncSkillQueue needs the skills and skill queue scopes and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncSkillQueue({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncSkillQueue({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});
