import { describe, expect, it } from 'vitest';
import type { SharingCorpView } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/platform/page-settings/controls';
import { deriveSettingsView, settingsNeedsCorpSharing, toManagerCorps } from './settings-view';

const preference = (key: string): PageControlModel => ({
  kind: 'preference-enum',
  key,
  label: key,
  options: ['a', 'b'],
  def: {} as never,
});

const feature: PageControlModel = { kind: 'feature', id: 'corp-structure-sharing' };

const corp = (over: Partial<SharingCorpView> = {}): SharingCorpView => ({
  corporationId: 1,
  corporationName: 'Corp',
  sharingEnabled: false,
  ...over,
});

const row = (over: Partial<CorpStructurePageView> = {}): CorpStructurePageView => ({
  corporationId: 42,
  corporationName: 'Test Corp',
  isStationManager: true,
  sharingEnabled: true,
  structures: [],
  lastRefreshedAt: null,
  ...over,
});

describe('settings view derivation', () => {
  it('gates corp sharing, maps managers, and derives empty/populated page sections', () => {
    expect(settingsNeedsCorpSharing([feature])).toBe(true);
    expect(settingsNeedsCorpSharing([preference('sites.detailMode')])).toBe(false);
    expect(settingsNeedsCorpSharing([])).toBe(false);

    expect(
      toManagerCorps([
        row({ corporationId: 1, corporationName: 'A', isStationManager: true, sharingEnabled: true }),
        row({ corporationId: 2, corporationName: 'B', isStationManager: false, sharingEnabled: false }),
      ]),
    ).toEqual([{ corporationId: 1, corporationName: 'A', sharingEnabled: true }]);

    const empty = deriveSettingsView([], []);
    expect(empty.preferenceModels).toEqual([]);
    expect(empty.featureSections).toEqual([]);
    expect(empty.isEmpty).toBe(true);

    const pref = preference('sites.detailMode');
    const withPref = deriveSettingsView([pref], []);
    expect(withPref.preferenceModels).toEqual([pref]);
    expect(withPref.featureSections).toEqual([]);
    expect(withPref.isEmpty).toBe(false);

    const managerCorps = [corp({ corporationId: 7 })];
    const withCorps = deriveSettingsView([feature], managerCorps);
    expect(withCorps.featureSections).toEqual([
      { id: 'corp-structure-sharing', corps: managerCorps },
    ]);
    expect(withCorps.isEmpty).toBe(false);

    const withoutCorps = deriveSettingsView([feature], []);
    expect(withoutCorps.featureSections).toEqual([]);
    expect(withoutCorps.isEmpty).toBe(true);
  });
});
