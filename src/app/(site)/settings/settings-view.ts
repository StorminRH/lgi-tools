import type { SharingCorpView } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type {
  FeatureControlModel,
  MenuControlModel,
  PageControlModel,
} from '@/platform/page-settings/controls';

export type FeatureSectionView = { id: 'corp-structure-sharing'; corps: SharingCorpView[] };

export type SettingsView = {
  preferenceModels: MenuControlModel[];
  featureSections: FeatureSectionView[];
  isEmpty: boolean;
};

export function settingsNeedsCorpSharing(models: PageControlModel[]): boolean {
  return models.some((m) => m.kind === 'feature' && m.id === 'corp-structure-sharing');
}

export function toManagerCorps(rows: CorpStructurePageView[]): SharingCorpView[] {
  return rows
    .filter((corp) => corp.isStationManager)
    .map((corp) => ({
      corporationId: corp.corporationId,
      corporationName: corp.corporationName,
      sharingEnabled: corp.sharingEnabled,
    }));
}

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

export function deriveSettingsView(
  models: PageControlModel[],
  managerCorps: SharingCorpView[],
): SettingsView {
  const preferenceModels = models.filter(
    (m): m is MenuControlModel =>
      m.kind === 'preference-enum' || m.kind === 'preference-boolean',
  );
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
