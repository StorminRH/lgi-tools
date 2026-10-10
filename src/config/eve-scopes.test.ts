import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from './eve-scopes';

describe('EVE_SCOPES', () => {
  it('matches the verified least-privilege EVE scope names', () => {
    expect([...EVE_SCOPES]).toEqual([
      'publicData',
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1',
      'esi-industry.read_character_jobs.v1',
      'esi-characters.read_corporation_roles.v1',
      'esi-industry.read_corporation_jobs.v1',
      'esi-characters.read_blueprints.v1',
      'esi-corporations.read_blueprints.v1',
      'esi-assets.read_assets.v1',
      'esi-assets.read_corporation_assets.v1',
      'esi-location.read_online.v1',
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
      'esi-corporations.read_structures.v1',
      'esi-search.search_structures.v1',
      'esi-wallet.read_character_wallet.v1',
      'esi-clones.read_clones.v1',
      'esi-clones.read_implants.v1',
      'esi-universe.read_structures.v1',
      'esi-markets.read_character_orders.v1',
      'esi-corporations.read_divisions.v1',
      'esi-corporations.track_members.v1',
    ]);
  });

  it('requests ZERO write scope (read-only by construction)', () => {
    // track_members gates only GET /corporations/{id}/membertracking; its name lacks `.read_`.
    const READ_ONLY_EXCEPTIONS = ['esi-corporations.track_members.v1'];
    for (const scope of EVE_SCOPES) {
      const readOnly =
        scope === 'publicData' ||
        /\.read_/.test(scope) ||
        scope === 'esi-search.search_structures.v1' ||
        READ_ONLY_EXCEPTIONS.includes(scope);
      expect(readOnly, `${scope} is not a read-only scope`).toBe(true);
    }
  });
});
