import { expect, test } from 'vitest';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/platform/page-settings/controls';
import {
  deriveCorporationsView,
  settingsNeedsCorpSharing,
  toManagerCorps,
} from './corporations-view';

const feature: PageControlModel = { kind: 'feature', id: 'corp-structure-sharing' };
const preference: PageControlModel = {
  kind: 'preference-enum',
  key: 'sites.detailMode',
  label: 'Detail mode',
  options: ['a', 'b'],
  def: {} as never,
};

const row = (over: Partial<CorpStructurePageView> = {}): CorpStructurePageView => ({
  corporationId: 42,
  corporationName: 'Test Corp',
  isStationManager: true,
  sharingEnabled: true,
  structures: [],
  lastRefreshedAt: null,
  ...over,
});

const structure = (structureId: number): CorpStructurePageView['structures'][number] => ({
  structureId,
  typeId: 35832,
  systemId: 30000142,
  securityClass: 'high',
  name: null,
  rigTypeIds: [],
  taxPct: null,
});

test('the corporations section gates on the registry feature control and separates managers from members', () => {
  expect(settingsNeedsCorpSharing([feature])).toBe(true);
  expect(settingsNeedsCorpSharing([preference])).toBe(false);
  expect(settingsNeedsCorpSharing([])).toBe(false);

  const rows = [
    row({ corporationId: 2, corporationName: 'Zeta', isStationManager: false, sharingEnabled: true, structures: [structure(1), structure(2)] }),
    row({ corporationId: 1, corporationName: 'Alpha', isStationManager: true, sharingEnabled: false }),
    row({ corporationId: 3, corporationName: 'Beta', isStationManager: true, sharingEnabled: true, structures: [structure(9)] }),
  ];

  expect(toManagerCorps(rows)).toEqual([
    { corporationId: 1, corporationName: 'Alpha', sharingEnabled: false },
    { corporationId: 3, corporationName: 'Beta', sharingEnabled: true },
  ]);

  const view = deriveCorporationsView(rows);
  expect(view.managerCorps.map((c) => c.corporationId)).toEqual([1, 3]);
  expect(view.memberships.map((m) => m.corporationName)).toEqual(['Alpha', 'Beta', 'Zeta']);
  expect(view.memberships[0]).toEqual({
    corporationId: 1,
    corporationName: 'Alpha',
    isStationManager: true,
    sharingLabel: 'sharing off',
    structureCount: null,
  });
  expect(view.memberships[2]).toMatchObject({ isStationManager: false, sharingLabel: 'sharing on', structureCount: 2 });
  expect(view.membershipHint).toBe('3 corporations');

  const single = deriveCorporationsView([row({ isStationManager: false })]);
  expect(single.managerCorps).toEqual([]);
  expect(single.membershipHint).toBe('1 corporation');

  const empty = deriveCorporationsView([]);
  expect(empty.memberships).toEqual([]);
  expect(empty.membershipHint).toBe('0 corporations');
});
