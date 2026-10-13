import { expect, test } from 'vitest';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/platform/page-settings/controls';
import {
  deriveCorporationsView,
  settingsNeedsCorpSharing,
} from './corporations-view';

const feature: PageControlModel = { kind: 'feature', id: 'corp-data-sharing' };
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
  structureAccess: 'manage',
  canManageSharing: true,
  sharing: 'on',
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

test('the corporations section gates on the registry feature control and separates Directors from members', () => {
  expect(settingsNeedsCorpSharing([feature])).toBe(true);
  expect(settingsNeedsCorpSharing([preference])).toBe(false);
  expect(settingsNeedsCorpSharing([])).toBe(false);

  const rows = [
    row({ corporationId: 2, corporationName: 'Zeta', structureAccess: 'use', canManageSharing: false, sharing: 'on', structures: [structure(1), structure(2)] }),
    row({ corporationId: 1, corporationName: 'Alpha', canManageSharing: true, sharing: 'off' }),
    row({ corporationId: 4, corporationName: 'Gamma', structureAccess: 'manage', canManageSharing: false, sharing: 'off', structures: [structure(5)] }),
    row({ corporationId: 3, corporationName: 'Beta', canManageSharing: true, sharing: 'on', structures: [structure(9)] }),
    row({ corporationId: 5, corporationName: 'Delta', structureAccess: 'none', canManageSharing: false, sharing: 'off' }),
  ];

  const view = deriveCorporationsView(rows);
  expect(view.directorCorps).toEqual([
    { corporationId: 1, corporationName: 'Alpha', sharingEnabled: false },
    { corporationId: 3, corporationName: 'Beta', sharingEnabled: true },
  ]);
  expect(view.memberCorps).toEqual([
    { corporationId: 2, corporationName: 'Zeta', sharingEnabled: true },
    { corporationId: 4, corporationName: 'Gamma', sharingEnabled: false },
    { corporationId: 5, corporationName: 'Delta', sharingEnabled: false },
  ]);
  expect(view.memberships).toEqual([
    { corporationId: 1, corporationName: 'Alpha', roleLabel: 'Director', sharingLabel: 'Sharing off', structureCount: 0 },
    { corporationId: 3, corporationName: 'Beta', roleLabel: 'Director', sharingLabel: 'Sharing on', structureCount: 1 },
    { corporationId: 4, corporationName: 'Gamma', roleLabel: 'Station Manager', sharingLabel: 'Sharing off', structureCount: 1 },
    { corporationId: 5, corporationName: 'Delta', roleLabel: 'Member', sharingLabel: 'Sharing off', structureCount: null },
    { corporationId: 2, corporationName: 'Zeta', roleLabel: 'Member', sharingLabel: 'Sharing on', structureCount: 2 },
  ]);

  const single = deriveCorporationsView([row({ canManageSharing: false })]);
  expect(single.directorCorps).toEqual([]);

  const empty = deriveCorporationsView([]);
  expect(empty.memberships).toEqual([]);
});
