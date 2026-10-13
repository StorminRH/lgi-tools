import { describe, expect, it } from 'vitest';
import { eveTag, holderTag, routeDeclaration, routeDeclarations } from './routes';

describe('routeDeclarations', () => {
  it('lists every dataset that declares a route, in registry order', () => {
    expect(routeDeclarations('/characters/{character_id}/location/').map((declared) => declared.dataset)).toEqual([
      'character_sheet_live',
      'character_location',
    ]);
    expect(routeDeclarations('/characters/{character_id}/skills/').map((declared) => declared.dataset)).toEqual(['skills']);
    expect(routeDeclarations('/nowhere/')).toEqual([]);
  });
});

describe('routeDeclaration', () => {
  it('prefers the stored declaration of a route the map tracker also reads', () => {
    expect(routeDeclaration('/characters/{character_id}/location/')).toEqual({
      route: '/characters/{character_id}/location/',
      method: 'GET',
      holder: 'character',
      specCacheSeconds: 5,
    });
  });

  it('returns the pass-through declaration of a lookup route', () => {
    expect(routeDeclaration('/universe/structures/{structure_id}/').mode).toBe('pass-through');
  });

  it('throws for a route the registry does not declare', () => {
    expect(() => routeDeclaration('/nowhere/' as never)).toThrow('Undeclared ESI route: /nowhere/');
  });
});

describe('eveTag', () => {
  it('derives eve:<dataset>[:<holder>] from the dataset and holder', () => {
    expect(eveTag('market_prices')).toBe('eve:market_prices');
    expect(eveTag('eve_status', { kind: 'global' })).toBe('eve:eve_status');
    expect(eveTag('skills', { kind: 'character', id: 91 })).toBe('eve:skills:character:91');
    expect(eveTag('owned_assets', { kind: 'corporation', id: 98 })).toBe('eve:owned_assets:corporation:98');
    expect(eveTag('corporation_industry_jobs', { kind: 'user-corporation', id: 98, userId: 'u1' })).toBe(
      'eve:corporation_industry_jobs:user-corporation:u1:98',
    );
  });

  it('keeps a global holder tagless', () => {
    expect(holderTag({ kind: 'global' })).toBeNull();
  });

  it('refuses a tag Next would silently drop', () => {
    const userId = 'u'.repeat(240);
    expect(() => eveTag('corporation_industry_jobs', { kind: 'user-corporation', id: 98, userId })).toThrow(
      'ESI cache tag exceeds 256 characters',
    );
    expect(eveTag('corporation_industry_jobs', { kind: 'user-corporation', id: 98, userId: 'u'.repeat(200) })).toHaveLength(250);
  });
});
