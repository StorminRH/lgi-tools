import type { SharingCorpView } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/platform/page-settings/controls';

export type CorporationMembershipView = {
  corporationId: number;
  corporationName: string;
  isStationManager: boolean;
  sharingLabel: 'sharing on' | 'sharing off';
  structureCount: number | null;
};

export type CorporationsView = {
  managerCorps: SharingCorpView[];
  memberships: CorporationMembershipView[];
  membershipHint: string;
};

export function settingsNeedsCorpSharing(models: readonly PageControlModel[]): boolean {
  return models.some((m) => m.kind === 'feature' && m.id === 'corp-structure-sharing');
}

export function toManagerCorps(rows: readonly CorpStructurePageView[]): SharingCorpView[] {
  return rows
    .filter((corp) => corp.isStationManager)
    .map((corp) => ({
      corporationId: corp.corporationId,
      corporationName: corp.corporationName,
      sharingEnabled: corp.sharingEnabled,
    }));
}

export function deriveCorporationsView(rows: readonly CorpStructurePageView[]): CorporationsView {
  const memberships = [...rows]
    .sort(
      (a, b) =>
        Number(b.isStationManager) - Number(a.isStationManager) ||
        a.corporationName.localeCompare(b.corporationName),
    )
    .map((corp) => ({
      corporationId: corp.corporationId,
      corporationName: corp.corporationName,
      isStationManager: corp.isStationManager,
      sharingLabel: corp.sharingEnabled ? ('sharing on' as const) : ('sharing off' as const),
      structureCount: corp.sharingEnabled ? corp.structures.length : null,
    }));
  return {
    managerCorps: toManagerCorps(rows),
    memberships,
    membershipHint: `${rows.length} corporation${rows.length === 1 ? '' : 's'}`,
  };
}
