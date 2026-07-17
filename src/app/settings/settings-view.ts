import type { SharingCorpView } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type {
  FeatureControlModel,
  MenuControlModel,
  PageControlModel,
} from '@/page-settings/controls';

// The pure decision logic behind the account settings page, split from the
// request-time shell so it is tested here rather than by eye. React-free: it
// turns resolved control models (and the fetched manager corps) into what the
// page renders.

/**
 * A feature-owned section to render, resolved to its component props. A
 * discriminated union keyed by the feature control id, so a new feature control
 * is a compile error in the switch below (the exhaustiveness guard).
 */
export type FeatureSectionView = { id: 'corp-structure-sharing'; corps: SharingCorpView[] };

export type SettingsView = {
  preferenceModels: MenuControlModel[];
  featureSections: FeatureSectionView[];
  isEmpty: boolean;
};

/**
 * Does the page need the corp-structures read? Only when a corp-structure-sharing
 * feature control is on the page — the fetch is gated on this so a viewer with no
 * such control never pays for the ESI-backed read.
 */
export function settingsNeedsCorpSharing(models: PageControlModel[]): boolean {
  return models.some((m) => m.kind === 'feature' && m.id === 'corp-structure-sharing');
}

/**
 * The corps a Station_Manager may configure, mapped to the sharing view shape.
 * Fail-closed: a non-Station_Manager corp drops out entirely, never shown disabled.
 */
export function toManagerCorps(rows: CorpStructurePageView[]): SharingCorpView[] {
  return rows
    .filter((corp) => corp.isStationManager)
    .map((corp) => ({
      corporationId: corp.corporationId,
      corporationName: corp.corporationName,
      sharingEnabled: corp.sharingEnabled,
    }));
}

// The feature control's section descriptor, or null when the viewer has nothing
// to configure (fail-closed: a non-Station_Manager sees no sharing section at
// all, never a disabled tease).
function featureSectionView(
  model: FeatureControlModel,
  managerCorps: SharingCorpView[],
): FeatureSectionView | null {
  switch (model.id) {
    case 'corp-structure-sharing':
      return managerCorps.length > 0 ? { id: model.id, corps: managerCorps } : null;
    default: {
      const unmapped: never = model.id;
      return unmapped;
    }
  }
}

/**
 * Split the resolved controls into the preferences card's models and the feature
 * sections that actually render, and flag when the page has nothing to show.
 */
export function deriveSettingsView(
  models: PageControlModel[],
  managerCorps: SharingCorpView[],
): SettingsView {
  const preferenceModels = models.filter((m): m is MenuControlModel => m.kind === 'preference');
  const featureSections = models
    .filter((m): m is FeatureControlModel => m.kind === 'feature')
    .map((m) => featureSectionView(m, managerCorps))
    .filter((section): section is FeatureSectionView => section !== null);
  return {
    preferenceModels,
    featureSections,
    isEmpty: preferenceModels.length === 0 && featureSections.length === 0,
  };
}
