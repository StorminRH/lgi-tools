import { describe, expect, it } from 'vitest';
import { narrowCorpRoles, parseCharacterRolesBody } from './corp-roles';

describe('parseCharacterRolesBody', () => {
  it('keeps the four ESI arrays as sent', () => {
    expect(
      parseCharacterRolesBody({
        roles: ['Director', 'Hangar_Take_1'],
        roles_at_hq: ['Hangar_Query_3'],
        roles_at_base: [],
        roles_at_other: ['Deliveries_Query'],
      }),
    ).toEqual({
      roles: ['Director', 'Hangar_Take_1'],
      rolesAtHq: ['Hangar_Query_3'],
      rolesAtBase: [],
      rolesAtOther: ['Deliveries_Query'],
    });
  });

  it('reads a missing tier array as empty', () => {
    expect(parseCharacterRolesBody({ roles: ['Accountant'] })).toEqual({
      roles: ['Accountant'],
      rolesAtHq: [],
      rolesAtBase: [],
      rolesAtOther: [],
    });
  });

  it('rejects a body whose roles are not strings', () => {
    expect(parseCharacterRolesBody({ roles: [1] })).toBeNull();
    expect(parseCharacterRolesBody(null)).toBeNull();
  });
});

describe('narrowCorpRoles', () => {
  it('drops roles the access model never reads', () => {
    const narrowed = narrowCorpRoles({
      roles: ['Hangar_Take_1', 'Hangar_Query_1', 'Personnel_Manager'],
      rolesAtHq: ['Container_Take_2', 'Hangar_Query_2'],
      rolesAtBase: ['Deliveries_Take'],
      rolesAtOther: ['Trader', 'Hangar_Query_7'],
    });
    expect([...narrowed.global]).toEqual(['Hangar_Query_1']);
    expect([...narrowed.atHq]).toEqual(['Hangar_Query_2']);
    expect([...narrowed.atBase]).toEqual([]);
    expect([...narrowed.atOther]).toEqual(['Trader', 'Hangar_Query_7']);
  });
});
