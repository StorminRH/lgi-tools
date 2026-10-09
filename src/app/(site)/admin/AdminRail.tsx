import { AdminNav, AdminNavFallback } from './admin-nav';
import { ADMIN_NAV_GROUPS, deriveNavBadges, type AdminNavBadges } from './admin-sections';
import { getCodexPendingShared } from './codex-pending-shared';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getEsiRefreshQueueStatsShared } from './queue-stats-shared';
import { summarizeQueue } from './signals';
import { getStaticsReviewShared } from './statics-review-shared';

async function loadNavBadges(): Promise<AdminNavBadges> {
  const fetched = await loadSection('admin-nav-badges', () =>
    Promise.all([getEsiRefreshQueueStatsShared(), getStaticsReviewShared(), getCodexPendingShared()]),
  );
  if (fetched === SECTION_LOAD_FAILED) return {};
  const [queueStats, staticsReview, codexPending] = fetched;
  return deriveNavBadges({
    deadLettered: summarizeQueue(queueStats, new Date()).deadLettered,
    staticsPending: staticsReview !== null,
    codexPending,
  });
}

export async function AdminRail() {
  return <AdminNav groups={ADMIN_NAV_GROUPS} badges={await loadNavBadges()} />;
}

export function AdminRailFallback() {
  return <AdminNavFallback groups={ADMIN_NAV_GROUPS} />;
}
