import { describe, expect, it } from 'vitest';
import { canonicalParams, holderColumns, identityText, resolvePath, rowIdentity } from './key';

describe('canonicalParams', () => {
  it('sorts by name and encodes names and values, so spelling order never changes a key', () => {
    expect(canonicalParams({ type_id: 34, order_type: 'all' })).toBe('order_type=all&type_id=34');
    expect(canonicalParams({ order_type: 'all', type_id: 34 })).toBe('order_type=all&type_id=34');
    expect(canonicalParams({ q: 'a b&c' })).toBe('q=a%20b%26c');
    expect(canonicalParams(undefined)).toBe('');
    expect(canonicalParams({})).toBe('');
  });
});

describe('holderColumns', () => {
  it('maps each holder onto the row columns, with user-corporation as a corporation row plus user_id', () => {
    expect(holderColumns({ kind: 'global' })).toEqual({ holderType: 'global', holderId: 0, userId: '' });
    expect(holderColumns({ kind: 'character', id: 91 })).toEqual({ holderType: 'character', holderId: 91, userId: '' });
    expect(holderColumns({ kind: 'corporation', id: 98 })).toEqual({ holderType: 'corporation', holderId: 98, userId: '' });
    expect(holderColumns({ kind: 'user-corporation', id: 98, userId: 'u1' })).toEqual({
      holderType: 'corporation',
      holderId: 98,
      userId: 'u1',
    });
  });
});

describe('rowIdentity and identityText', () => {
  it('joins the route, holder columns and canonical params into one identity', () => {
    const identity = rowIdentity({
      route: '/markets/{region_id}/orders/',
      holder: { kind: 'global' },
      params: { type_id: 34, region_id: 10000002 },
    });
    expect(identity).toEqual({
      route: '/markets/{region_id}/orders/',
      holderType: 'global',
      holderId: 0,
      userId: '',
      params: 'region_id=10000002&type_id=34',
    });
    expect(identityText(identity)).toBe('/markets/{region_id}/orders/|global|0||region_id=10000002&type_id=34');
  });
});

describe('resolvePath', () => {
  it('fills the owner placeholder from the holder', () => {
    expect(resolvePath({ route: '/characters/{character_id}/skills/', holder: { kind: 'character', id: 91 } })).toBe(
      '/characters/91/skills/',
    );
    expect(
      resolvePath({ route: '/corporations/{corporation_id}/industry/jobs/', holder: { kind: 'user-corporation', id: 98, userId: 'u1' } }),
    ).toBe('/corporations/98/industry/jobs/');
  });

  it('fills other placeholders from params and appends the rest as the sorted query', () => {
    expect(
      resolvePath({
        route: '/markets/{region_id}/orders/',
        holder: { kind: 'global' },
        params: { type_id: 34, region_id: 10000002, order_type: 'all' },
      }),
    ).toBe('/markets/10000002/orders/?order_type=all&type_id=34');
    expect(resolvePath({ route: '/status/', holder: { kind: 'global' } })).toBe('/status/');
  });

  it('throws when nothing fills a placeholder', () => {
    expect(() => resolvePath({ route: '/universe/structures/{structure_id}/', holder: { kind: 'global' } })).toThrow(
      'ESI route /universe/structures/{structure_id}/ is missing {structure_id}',
    );
  });
});
