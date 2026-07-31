import { describe, expect, it } from 'vitest';
import {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  resolveMatchedMapRoles,
  resolveMapRole,
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
    ).toEqual({ role: 'owner', canView: true, canEdit: true });
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
      grants: [grant('character', 42, 'owner'), grant('corporation', 99, 'editor')],
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
    const input = {
      isCreator: false,
      grants: [
        grant('character', 42, 'viewer'),
        grant('corporation', 99, 'editor'),
        grant('corporation', 99, 'editor'),
      ],
      principals: { characterIds: [42], corporationIds: [99] },
    };
    expect(resolveMatchedMapRoles(input)).toEqual(['editor', 'viewer']);
    expect(resolveMapRole(input)).toEqual({
      role: 'editor',
      canView: true,
      canEdit: true,
    });
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
