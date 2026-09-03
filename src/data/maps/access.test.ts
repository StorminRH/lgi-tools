import { describe, expect, it } from 'vitest';
import { roleAllows, rolesAllow } from './access-contract';
import {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  resolveMapRole,
  resolveMatchedMapRoles,
  type MapGrant,
} from './access';
import type { MapRole } from './schema';

const EMPTY_PRINCIPALS = { characterIds: [], corporationIds: [] } as const;

function grant(
  ownerType: MapGrant['ownerType'],
  ownerId: number,
  role: MapRole,
): MapGrant {
  return { ownerType, ownerId, role };
}

describe('resolveMapRole', () => {
  it('grants creator ownership independently of delegated principals', () => {
    expect(
      resolveMapRole({
        isCreator: true,
        grants: [],
        principals: EMPTY_PRINCIPALS,
      }),
    ).toEqual({ role: 'admin', canView: true, canEdit: true });
  });

  it.each([
    {
      label: 'character editor',
      grants: [grant('character', 42, 'editor')],
      principals: { characterIds: [42], corporationIds: [] },
      expected: { role: 'editor', canView: true, canEdit: true },
    },
    {
      label: 'corporation viewer',
      grants: [grant('corporation', 99, 'viewer')],
      principals: { characterIds: [], corporationIds: [99] },
      expected: { role: 'viewer', canView: true, canEdit: false },
    },
  ])('grants an independently matching $label principal', ({ grants, principals, expected }) => {
    expect(resolveMapRole({ isCreator: false, grants, principals })).toEqual(expected);
  });

  it.each([
    {
      label: 'character grant against only a corporation principal',
      grants: [grant('character', 42, 'editor')],
      principals: { characterIds: [], corporationIds: [42] },
    },
    {
      label: 'corporation grant against only a character principal',
      grants: [grant('corporation', 99, 'viewer')],
      principals: { characterIds: [99], corporationIds: [] },
    },
    {
      label: 'delegated grants against an empty principal set',
      grants: [grant('character', 42, 'admin'), grant('corporation', 99, 'editor')],
      principals: EMPTY_PRINCIPALS,
    },
  ])('denies $label', ({ grants, principals }) => {
    expect(resolveMapRole({ isCreator: false, grants, principals })).toEqual({
      role: null,
      canView: false,
      canEdit: false,
    });
  });

  it('unions capabilities and reports the highest-precedence matched role', () => {
    expect(
      resolveMapRole({
        isCreator: false,
        grants: [
          grant('character', 42, 'viewer'),
          grant('corporation', 99, 'editor'),
        ],
        principals: { characterIds: [42], corporationIds: [99] },
      }),
    ).toEqual({ role: 'editor', canView: true, canEdit: true });
  });

  it('capability record admits a non-linear role without rank comparisons', () => {

    const capabilities = MAP_ROLE_CAPABILITIES as Record<
      string,
      { canView: boolean; canEdit: boolean }
    >;
    const precedence = MAP_ROLE_PRECEDENCE as unknown as string[];
    capabilities.access_manager = { canView: true, canEdit: false };
    precedence.splice(1, 0, 'access_manager');

    try {
      expect(
        resolveMapRole({
          isCreator: false,
          grants: [grant('character', 42, 'access_manager' as MapRole)],
          principals: { characterIds: [42], corporationIds: [] },
        }),
      ).toEqual({
        role: 'access_manager',
        canView: true,
        canEdit: false,
      });
    } finally {
      delete capabilities.access_manager;
      precedence.splice(precedence.indexOf('access_manager'), 1);
    }
  });
});

describe('resolveMatchedMapRoles', () => {
  it('returns every matched role in precedence order', () => {

    expect(
      resolveMatchedMapRoles({
        isCreator: false,
        grants: [
          grant('corporation', 99, 'viewer'),
          grant('character', 42, 'editor'),
        ],
        principals: { characterIds: [42], corporationIds: [99] },
      }),
    ).toEqual(['editor', 'viewer']);
  });

  it('de-duplicates a role matched through several principals', () => {
    expect(
      resolveMatchedMapRoles({
        isCreator: false,
        grants: [
          grant('character', 42, 'editor'),
          grant('corporation', 99, 'editor'),
        ],
        principals: { characterIds: [42], corporationIds: [99] },
      }),
    ).toEqual(['editor']);
  });

  it.each([
    { label: 'the creator', isCreator: true, expected: ['admin'] },
    { label: 'no match', isCreator: false, expected: [] },
  ])('resolves $label', ({ isCreator, expected }) => {
    expect(
      resolveMatchedMapRoles({ isCreator, grants: [], principals: EMPTY_PRINCIPALS }),
    ).toEqual(expected);
  });
});

describe('capability predicates', () => {
  it.each([
    { role: 'viewer', capability: 'view', expected: true },
    { role: 'viewer', capability: 'edit', expected: false },
    { role: 'editor', capability: 'edit', expected: true },
    { role: 'admin', capability: 'edit', expected: true },
  ] as const)('$role $capability is $expected', ({ role, capability, expected }) => {
    expect(roleAllows(role, capability)).toBe(expected);
  });

  it('denies unknown or empty role sets and unions capabilities across a set', () => {
    expect(roleAllows('ghost' as MapRole, 'view')).toBe(false);
    expect(rolesAllow(['viewer', 'editor'], 'edit')).toBe(true);
    expect(rolesAllow(['viewer'], 'edit')).toBe(false);
    expect(rolesAllow([], 'view')).toBe(false);
  });
});
