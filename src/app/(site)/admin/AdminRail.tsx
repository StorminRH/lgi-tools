import { getFullSession } from '@/composition/session';
import { AdminNav, AdminNavFrame } from './admin-nav';
import { ADMIN_NAV_GROUPS, deriveNavBadges, type AdminNavBadges } from './admin-sections';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getEsiRefreshQueueStatsShared } from './queue-stats-shared';
import { summarizeQueue } from './signals';
import { getStaticsReviewShared } from './statics-review-shared';

async function loadNavBadges(): Promise<AdminNavBadges> {
  const fetched = await loadSection('admin-nav-badges', () =>
    Promise.all([getEsiRefreshQueueStatsShared(), getStaticsReviewShared()]),
  );
  if (fetched === SECTION_LOAD_FAILED) return {};
  const [queueStats, staticsReview] = fetched;
  return deriveNavBadges({
    deadLettered: summarizeQueue(queueStats, new Date()).deadLettered,
    staticsPending: staticsReview !== null,
  });
}

// Badges reveal operational state, so only an admin session loads them;
// each page still runs its own admin gate.
export async function AdminRail() {
  const session = await getFullSession();
  const badges = session?.isAdmin ? await loadNavBadges() : {};
  return <AdminNav groups={ADMIN_NAV_GROUPS} badges={badges} />;
}

export function AdminRailFallback() {
  return <AdminNavFrame groups={ADMIN_NAV_GROUPS} active={null} badges={{}} range={null} />;
}
