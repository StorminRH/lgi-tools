import { expect, test, vi } from 'vitest';
import type { AuthorizedMapRow } from '@/data/maps/queries';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);

import { useAuthorityScopedMapDialogs } from './use-authority-scoped-map-dialogs';

const ALPHA: AuthorizedMapRow = {
  id: 'map-alpha',
  name: 'Alpha',
  createdAt: new Date('2026-08-12T12:00:00.000Z'),
  creatorName: 'Mapper',
  role: 'admin',
  provenance: { kind: 'created' },
};
const BRAVO: AuthorizedMapRow = { ...ALPHA, id: 'map-bravo', name: 'Bravo' };

test('an access edit closes only when its own map loses admin, and every dialog closes with the listing and stays closed', () => {
  rt.unmount();
  const render = (maps: readonly AuthorizedMapRow[], listingAvailable = true) =>
    rt.render(useAuthorityScopedMapDialogs, maps, listingAvailable);
  const allOpen = { creationOpen: true, trashOpen: true, editingMapId: ALPHA.id };
  const bothAdmin = [ALPHA, BRAVO];

  const first = render(bothAdmin);
  expect(first.dialogs).toMatchObject({ creationOpen: false, trashOpen: false, editingMapId: null });
  expect(first.editingMap).toBeNull();
  first.setDialogs((current) => ({ ...current, ...allOpen }));
  expect(render(bothAdmin)).toMatchObject({ dialogs: allOpen, editingMap: ALPHA });

  // A refresh that changes another map's role keeps the edit open.
  const bravoDowngraded = [ALPHA, { ...BRAVO, role: 'viewer' as const }];
  expect(render(bravoDowngraded)).toMatchObject({ dialogs: allOpen, editingMap: ALPHA });

  // The edited map losing admin closes the edit in the same render and leaves create and trash open.
  const alphaDowngraded = [{ ...ALPHA, role: 'editor' as const }, BRAVO];
  const editLost = { creationOpen: true, trashOpen: true, editingMapId: null };
  expect(render(alphaDowngraded)).toMatchObject({ dialogs: editLost, editingMap: null });
  // The close was stored, so admin coming back does not reopen the edit.
  expect(render(bothAdmin)).toMatchObject({ dialogs: editLost, editingMap: null });

  render(bothAdmin).setDialogs((current) => ({ ...current, editingMapId: BRAVO.id }));
  expect(render(bothAdmin).editingMap).toBe(BRAVO);
  const closed = { creationOpen: false, trashOpen: false, editingMapId: null };
  expect(render(bothAdmin, false)).toMatchObject({ dialogs: closed, editingMap: null });
  expect(render(bothAdmin)).toMatchObject({ dialogs: closed, editingMap: null });
});
