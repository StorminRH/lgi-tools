import { describe, expect, it } from 'vitest';
import type { SharingCorpView } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/page-settings/controls';
import { deriveSettingsView, settingsNeedsCorpSharing, toManagerCorps } from './settings-view';

const preference = (key: string): PageControlModel => ({
  kind: 'preference',
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

describe('settingsNeedsCorpSharing', () => {
  it('is true only when a corp-structure-sharing feature control is present', () => {
    expect(settingsNeedsCorpSharing([feature])).toBe(true);
    expect(settingsNeedsCorpSharing([preference('sites.detailMode')])).toBe(false);
    expect(settingsNeedsCorpSharing([])).toBe(false);
  });
});

describe('toManagerCorps', () => {
  it('keeps only station-manager corps and maps to the sharing view shape', () => {
    expect(
      toManagerCorps([
        row({ corporationId: 1, corporationName: 'A', isStationManager: true, sharingEnabled: true }),
        row({ corporationId: 2, corporationName: 'B', isStationManager: false, sharingEnabled: false }),
      ]),
    ).toEqual([{ corporationId: 1, corporationName: 'A', sharingEnabled: true }]);
  });
});

describe('deriveSettingsView', () => {
  it('flags empty when nothing resolves', () => {
    const view = deriveSettingsView([], []);
    expect(view.preferenceModels).toEqual([]);
    expect(view.featureSections).toEqual([]);
    expect(view.isEmpty).toBe(true);
  });

  it('collects preference models and is not empty when present', () => {
    const pref = preference('sites.detailMode');
    const view = deriveSettingsView([pref], []);
    expect(view.preferenceModels).toEqual([pref]);
    expect(view.featureSections).toEqual([]);
    expect(view.isEmpty).toBe(false);
  });

  it('renders the corp-sharing section only when there are manager corps', () => {
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
