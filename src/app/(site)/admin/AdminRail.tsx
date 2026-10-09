import { AdminNav, AdminNavFallback } from './admin-nav';
import { ADMIN_NAV_GROUPS, deriveNavBadges, type AdminNavBadges } from './admin-sections';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getEsiRefreshQueueStatsShared, getStaticsSummaryShared } from './shared-reads';
import { summarizeQueue } from './signals';

async function loadNavBadges(): Promise<AdminNavBadges> {
  const fetched = await loadSection('admin-nav-badges', () =>
    Promise.all([getEsiRefreshQueueStatsShared(), getStaticsSummaryShared()]),
  );
  if (fetched === SECTION_LOAD_FAILED) return {};
  const [queueStats, staticsPending] = fetched;
  return deriveNavBadges({
    deadLettered: summarizeQueue(queueStats, new Date()).deadLettered,
    staticsPending: staticsPending !== null,
  });
}

export async function AdminRail() {
  return <AdminNav groups={ADMIN_NAV_GROUPS} badges={await loadNavBadges()} />;
}

export function AdminRailFallback() {
  return <AdminNavFallback groups={ADMIN_NAV_GROUPS} />;
}
