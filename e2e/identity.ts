import { randomInt, randomUUID } from 'node:crypto';

export const E2E_CHARACTER_NAME = 'E2E Pilot';
export const FIXTURE_ROLES = ['owner', 'editor', 'viewer', 'unauthorized'] as const;
export type FixtureRole = typeof FIXTURE_ROLES[number];

export function createFixtureIdentity(runId: string, role: FixtureRole) {
  return {
    role,
    userId: `e2e-${runId}-${role}-${randomUUID()}`,
    characterId: randomInt(1_000_000_000_000, 2_000_000_000_000),
    name: `${E2E_CHARACTER_NAME} ${role}`,
  };
}

export type FixtureIdentity = ReturnType<typeof createFixtureIdentity>;
