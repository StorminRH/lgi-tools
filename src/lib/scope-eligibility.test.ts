import { expect, test } from 'vitest';
import type { EveScope } from '@/config/eve-scopes';
import { hasScopes, type ScopeHolder, scopeEligibility } from './scope-eligibility';

const SKILLS = 'esi-skills.read_skills.v1';
const QUEUE = 'esi-skills.read_skillqueue.v1';
const JOBS = 'esi-industry.read_character_jobs.v1';

test.each<[string, ScopeHolder, readonly EveScope[], boolean]>([
  ['no token, even with no scopes required', { hasRefreshToken: false, missingScopes: [] }, [], false],
  ['no token, nothing missing', { hasRefreshToken: false, missingScopes: [] }, [SKILLS, QUEUE], false],
  ['a token and no scopes required, whatever is missing', { hasRefreshToken: true, missingScopes: [JOBS] }, [], true],
  ['a token with only an unrelated scope missing', { hasRefreshToken: true, missingScopes: [JOBS] }, [SKILLS, QUEUE], true],
  ['a token with one required scope missing', { hasRefreshToken: true, missingScopes: [QUEUE] }, [SKILLS, QUEUE], false],
  ['a token with a required and an unrelated scope missing', { hasRefreshToken: true, missingScopes: [JOBS, SKILLS] }, [SKILLS, QUEUE], false],
])('hasScopes and scopeEligibility: %s', (_case, holder, scopes, expected) => {
  expect(hasScopes(holder, scopes)).toBe(expected);
  expect(scopeEligibility(scopes)(holder)).toBe(expected);
});
