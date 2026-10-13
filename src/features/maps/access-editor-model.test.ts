import { describe, expect, it } from 'vitest';
import {
  accessPrincipalKey,
  accessRolesForMode,
  addAccessPrincipal,
  createMapGrantsFromDrafts,
  characterSearchPopupOpen,
  characterSearchView,
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
        role: null,
      },
    ]);
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
    expect(createMapGrantsFromDrafts(added)).toBeNull();
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
    // An Admin draft is a manage-mode role, so it never becomes a create grant.
    expect(createMapGrantsFromDrafts(accepted)).toBeNull();

    expect(characterSearchPopupOpen(false, 3)).toBe(false);
    expect(characterSearchPopupOpen(true, 3)).toBe(true);
    expect(characterSearchPopupOpen(true, 0)).toBe(false);
    expect(grantedCharacterIds([
      { ownerType: 'character', ownerId: 7, name: 'Me', role: 'admin' },
      { ownerType: 'character', ownerId: 8, name: 'Pending', role: null },
      { ownerType: 'corporation', ownerId: 9, name: 'Corp', role: 'viewer' },
    ])).toEqual(new Set([7]));
  });

  it('shows a character search only from the answer to the search the field holds now', () => {
    const pilot = { characterId: 90000001, name: 'Pilot One', portraitUrl: 'https://images.evetech.net/characters/90000001/portrait' };
    const found = { failed: false, mode: 'typeahead', results: [pilot] } as const;
    const idle = { busy: false, failed: false, mode: null, results: [] };

    // Too short to send: nothing to wait for, before or after its null answer.
    expect(characterSearchView('', null)).toEqual(idle);
    expect(characterSearchView('Pi', { query: 'Pi', result: null })).toEqual(idle);
    // Long enough and not answered yet, or answered only for an earlier search: busy, with nothing shown.
    expect(characterSearchView('Pil', { query: 'Pi', result: null })).toEqual({ ...idle, busy: true });
    expect(characterSearchView('Pilot O', { query: 'Pilot', result: found })).toEqual({ ...idle, busy: true });
    // The answer to this search: its mode and results, and the very list it carried.
    const view = characterSearchView('Pilot', { query: 'Pilot', result: found });
    expect(view).toEqual({ busy: false, failed: false, mode: 'typeahead', results: [pilot] });
    expect(view.results).toBe(found.results);
    expect(characterSearchView('Pilot', { query: 'Pilot', result: { failed: true, mode: null, results: [] } }))
      .toEqual({ ...idle, failed: true });
  });
});
