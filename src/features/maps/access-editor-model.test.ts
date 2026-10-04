import { describe, expect, it } from 'vitest';
import {
  accessDraftsComplete,
  accessPrincipalKey,
  accessRolesForMode,
  addAccessPrincipal,
  createMapGrantsFromDrafts,
  characterSearchPopupOpen,
  grantedCharacterIds,
  initialCreationAccessDrafts,
  mapRoleLabel,
  prepareMapCreation,
  removeAccessPrincipal,
  setAccessDraftRole,
} from './access-editor-model';

const CORPORATION = {
  corporationId: 99,
  name: 'Signal Cartel',
};

describe('map access editor model', () => {
  it('builds create drafts from one corp, stays private otherwise, and prepares named grants', () => {
    const drafts = initialCreationAccessDrafts([CORPORATION]);
    expect(drafts).toEqual([
      {
        ownerType: 'corporation',
        ownerId: 99,
        name: 'Signal Cartel',
        imageUrl: undefined,
        role: null,
      },
    ]);
    expect(accessDraftsComplete('create', drafts)).toBe(false);
    expect(createMapGrantsFromDrafts(drafts)).toBeNull();

    const explicit = setAccessDraftRole('create', drafts, drafts[0]!, 'viewer');
    expect(createMapGrantsFromDrafts(explicit)).toEqual([
      { ownerType: 'corporation', ownerId: 99, role: 'viewer' },
    ]);

    expect(initialCreationAccessDrafts([])).toEqual([]);
    expect(
      initialCreationAccessDrafts([
        CORPORATION,
        { corporationId: 100, name: 'Other Corp' },
      ]),
    ).toEqual([]);
    expect(createMapGrantsFromDrafts([])).toEqual([]);

    expect(prepareMapCreation('   ', [7], [], 80)).toEqual({
      ok: false,
      message: 'Enter a map name up to 80 characters.',
    });
    expect(prepareMapCreation('Home', [], [], 80)).toEqual({
      ok: false,
      message: 'Choose at least one of your characters.',
    });
    expect(
      prepareMapCreation(
        'Home',
        [7],
        [{ ownerType: 'character', ownerId: 42, name: 'Scout', role: null }],
        80,
      ),
    ).toEqual({
      ok: false,
      message: 'Choose Read-only or Write for every selected principal.',
    });
    expect(prepareMapCreation('  Home  ', [7], [], 80)).toEqual({
      ok: true,
      input: { name: 'Home', creatorCharacterIds: [7], grants: [] },
    });
    expect(
      prepareMapCreation(
        'Home',
        [7],
        [
          { ownerType: 'character', ownerId: 7, name: 'Me', role: null },
          { ownerType: 'character', ownerId: 42, name: 'Scout', role: 'viewer' },
        ],
        80,
      ),
    ).toEqual({
      ok: true,
      input: {
        name: 'Home',
        creatorCharacterIds: [7],
        grants: [{ ownerType: 'character', ownerId: 42, role: 'viewer' }],
      },
    });
  });

  it('deduplicates principals, gates admin to manage mode, and keeps dismiss closed with results', () => {
    const character = {
      ownerType: 'character' as const,
      ownerId: 42,
      name: 'Scout',
    };
    const added = addAccessPrincipal([], character);
    const duplicate = addAccessPrincipal(added, { ...character, name: 'Renamed Scout' });

    expect(duplicate).toEqual(added);
    expect(accessPrincipalKey(character)).toBe('character:42');
    expect(accessDraftsComplete('create', added)).toBe(false);
    expect(removeAccessPrincipal(added, character)).toEqual([]);

    const principal = {
      ownerType: 'character' as const,
      ownerId: 42,
      name: 'Scout',
      role: null,
    };
    const refused = setAccessDraftRole('create', [principal], principal, 'admin');
    const accepted = setAccessDraftRole('manage', [principal], principal, 'admin');

    expect(accessRolesForMode('create')).toEqual(['viewer', 'editor']);
    expect(accessRolesForMode('manage')).toEqual(['viewer', 'editor', 'admin']);
    expect(
      (['viewer', 'editor', 'admin'] as const).map((role) => mapRoleLabel(role)),
    ).toEqual(['Read-only', 'Write', 'Admin']);
    expect(refused[0]?.role).toBeNull();
    expect(accepted[0]?.role).toBe('admin');
    expect(accessDraftsComplete('manage', accepted)).toBe(true);

    expect(characterSearchPopupOpen(false, 3)).toBe(false);
    expect(characterSearchPopupOpen(true, 3)).toBe(true);
    expect(characterSearchPopupOpen(true, 0)).toBe(false);
    expect(grantedCharacterIds([
      { ownerType: 'character', ownerId: 7, name: 'Me', role: 'admin' },
      { ownerType: 'character', ownerId: 8, name: 'Pending', role: null },
      { ownerType: 'corporation', ownerId: 9, name: 'Corp', role: 'viewer' },
    ])).toEqual(new Set([7]));
  });
});
