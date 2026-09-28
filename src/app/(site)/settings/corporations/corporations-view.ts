import type { CorpStructurePageView } from '@/features/owned-structures/types';
import type { PageControlModel } from '@/platform/page-settings/controls';

export type CorporationRoleLabel = 'Director' | 'Station Manager' | 'Member';

export type CorporationMembershipView = {
  corporationId: number;
  corporationName: string;
  roleLabel: CorporationRoleLabel;
  sharingLabel: 'sharing on' | 'sharing off';
  structureCount: number | null;
};

export type SharingCorpView = {
  corporationId: number;
  corporationName: string;
  sharingEnabled: boolean;
};

export type CorporationsView = {
  directorCorps: SharingCorpView[];
  memberCorps: SharingCorpView[];
  memberships: CorporationMembershipView[];
  membershipHint: string;
};

export function settingsNeedsCorpSharing(models: readonly PageControlModel[]): boolean {
  return models.some((m) => m.kind === 'feature' && m.id === 'corp-data-sharing');
}

const ROLE_ORDER: readonly CorporationRoleLabel[] = ['Director', 'Station Manager', 'Member'];

function roleLabelOf(corp: CorpStructurePageView): CorporationRoleLabel {
  if (corp.canManageSharing) return 'Director';
  return corp.structureAccess === 'manage' ? 'Station Manager' : 'Member';
}

function toSharingCorp(corp: CorpStructurePageView): SharingCorpView {
  return {
    corporationId: corp.corporationId,
    corporationName: corp.corporationName,
    sharingEnabled: corp.sharing === 'on',
  };
}

function toMembership(corp: CorpStructurePageView): CorporationMembershipView {
  return {
    corporationId: corp.corporationId,
    corporationName: corp.corporationName,
    roleLabel: roleLabelOf(corp),
    sharingLabel: corp.sharing === 'on' ? 'sharing on' : 'sharing off',
    structureCount: corp.structureAccess === 'none' ? null : corp.structures.length,
  };
}

function byRoleThenName(a: CorporationMembershipView, b: CorporationMembershipView): number {
  return (
    ROLE_ORDER.indexOf(a.roleLabel) - ROLE_ORDER.indexOf(b.roleLabel) ||
    a.corporationName.localeCompare(b.corporationName)
  );
}

export function deriveCorporationsView(rows: readonly CorpStructurePageView[]): CorporationsView {
  return {
    directorCorps: rows.filter((corp) => corp.canManageSharing).map(toSharingCorp),
    memberCorps: rows.filter((corp) => !corp.canManageSharing).map(toSharingCorp),
    memberships: rows.map(toMembership).sort(byRoleThenName),
    membershipHint: `${rows.length} corporation${rows.length === 1 ? '' : 's'}`,
  };
}
