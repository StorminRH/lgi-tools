import { describe, expect, it } from 'vitest';
import {
  canSyncCorpBlueprints,
  CORP_BLUEPRINTS_REQUIRED_ROLES,
  CORP_BLUEPRINTS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_BLUEPRINTS_SYNC_SCOPES', () => {
  it('pins the verified corp blueprints scope strings', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by eve-sso.test.ts. The roles
    // read is shared with corp industry jobs; the corp-blueprints read lives under
    // `esi-corporations`, not `esi-characters`.
    expect([...CORP_BLUEPRINTS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-corporations.read_blueprints.v1',
    ]);
  });

  it('requests only read-only scopes', () => {
    for (const scope of CORP_BLUEPRINTS_SYNC_SCOPES) {
      expect(/\.read_/.test(scope), `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('CORP_BLUEPRINTS_REQUIRED_ROLES', () => {
  it('pins Director as the sole admitting role (narrower than corp jobs)', () => {
    expect([...CORP_BLUEPRINTS_REQUIRED_ROLES]).toEqual(['Director']);
  });
});

describe('canSyncCorpBlueprints', () => {
  it('accepts a character with a token and both corp scopes', () => {
    expect(canSyncCorpBlueprints({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    expect(
      canSyncCorpBlueprints({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the corp roles scope', () => {
    expect(
      canSyncCorpBlueprints({
        hasRefreshToken: true,
        missingScopes: ['esi-characters.read_corporation_roles.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character missing the corp-blueprints scope', () => {
    expect(
      canSyncCorpBlueprints({
        hasRefreshToken: true,
        missingScopes: ['esi-corporations.read_blueprints.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncCorpBlueprints({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});
