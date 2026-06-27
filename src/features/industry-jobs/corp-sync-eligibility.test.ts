import { describe, expect, it } from 'vitest';
import {
  canSyncCorpIndustryJobs,
  CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
  CORP_INDUSTRY_JOBS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_INDUSTRY_JOBS_SYNC_SCOPES', () => {
  it('pins the verified corp industry-jobs scope strings', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by the auth feature's own pin
    // test (eve-sso.test.ts) — together the two tests guarantee the sync never
    // demands a scope sign-in doesn't request. (A direct EVE_SCOPES import here
    // would be a feature → feature edge the boundary lint bans.)
    expect([...CORP_INDUSTRY_JOBS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-industry.read_corporation_jobs.v1',
    ]);
  });

  it('requests only read-only scopes', () => {
    for (const scope of CORP_INDUSTRY_JOBS_SYNC_SCOPES) {
      expect(/\.read_/.test(scope), `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('CORP_INDUSTRY_JOBS_REQUIRED_ROLES', () => {
  it('pins the in-game roles that admit the corp-jobs endpoint', () => {
    // The role gate is a SEPARATE axis from scope — Factory_Manager is the
    // documented role; Director holds it implicitly and ESI lists it explicitly.
    expect([...CORP_INDUSTRY_JOBS_REQUIRED_ROLES]).toEqual(['Factory_Manager', 'Director']);
  });
});

describe('canSyncCorpIndustryJobs', () => {
  it('accepts a character with a token and both corp scopes', () => {
    expect(canSyncCorpIndustryJobs({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    // The old-consent case: missing an unrelated scope (a skills read, ∉ the corp
    // set) but still covering both corp reads — the sitewide health says
    // reconnect, the corp-jobs sync works.
    expect(
      canSyncCorpIndustryJobs({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the corp roles scope', () => {
    expect(
      canSyncCorpIndustryJobs({
        hasRefreshToken: true,
        missingScopes: ['esi-characters.read_corporation_roles.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character missing the corp-jobs scope', () => {
    expect(
      canSyncCorpIndustryJobs({
        hasRefreshToken: true,
        missingScopes: ['esi-industry.read_corporation_jobs.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncCorpIndustryJobs({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});
