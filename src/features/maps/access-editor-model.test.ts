import { describe, expect, it } from 'vitest';
import {
  accessDraftsComplete,
  accessPrincipalKey,
  accessRolesForMode,
  addAccessPrincipal,
  createMapGrantsFromDrafts,
  characterSearchPopupOpen,
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

    expect(prepareMapCreation('   ', [], 80)).toEqual({
      ok: false,
      message: 'Enter a map name up to 80 characters.',
    });
    expect(
      prepareMapCreation(
        'Home',
        [{ ownerType: 'character', ownerId: 42, name: 'Scout', role: null }],
        80,
      ),
    ).toEqual({
      ok: false,
      message: 'Choose Read-only or Write for every selected principal.',
    });
    expect(prepareMapCreation('  Home  ', [], 80)).toEqual({
      ok: true,
      input: { name: 'Home', grants: [] },
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
  });
});
