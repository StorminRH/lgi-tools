import { AdminNav, AdminNavFallback } from './admin-nav';
import { ADMIN_NAV_GROUPS, deriveNavBadges, type AdminNavBadges } from './admin-sections';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getStaticsSummaryShared } from './shared-reads';

async function loadNavBadges(): Promise<AdminNavBadges> {
  const staticsPending = await loadSection('admin-nav-badges', getStaticsSummaryShared);
  if (staticsPending === SECTION_LOAD_FAILED) return {};
  return deriveNavBadges({ staticsPending: staticsPending !== null });
}

export async function AdminRail() {
  return <AdminNav groups={ADMIN_NAV_GROUPS} badges={await loadNavBadges()} />;
}

export function AdminRailFallback() {
  return <AdminNavFallback groups={ADMIN_NAV_GROUPS} />;
}
