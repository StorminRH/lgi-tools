import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkAdmin } from '@/composition/route-guards';
import {
  promoteWhStaticsSnapshot,
  refreshWhStaticsOnDemand,
  rejectWhStaticsSnapshot,
} from '@/composition/wh-statics-refresh';
import {
  whStaticsAdminFormSchema,
  type WhStaticsRefreshResult,
} from '@/data/wh-statics/api-contract';
import {
  WhStaticsEmptySnapshotError,
  WhStaticsSnapshotStateError,
} from '@/data/wh-statics/queries';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  type AppFailure,
} from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

const REVIEW_PAGE = '/admin/statics';

/** Refresh outcomes that report a failure through the review page's notice. */
const REFRESH_FAILURES: Partial<Record<WhStaticsRefreshResult['status'], AppFailure>> = {
  'feed-unavailable': dependencyUnavailableFailure('wh_statics_feed_unavailable'),
  busy: conflictFailure('wh_statics_refresh_busy'),
};

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.wh-statics-review',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, whStaticsAdminFormSchema, ['action', 'snapshotId']),
    handle: async (_authorization, review) => {
      try {
        if (review.action === 'refresh') {
          const { status } = await refreshWhStaticsOnDemand();
          return seeOther(request, REVIEW_PAGE, {
            query: { outcome: status },
            failure: REFRESH_FAILURES[status],
          });
        }
        if (review.action === 'promote') {
          await promoteWhStaticsSnapshot(review.snapshotId);
          return seeOther(request, REVIEW_PAGE, { query: { outcome: 'promoted' } });
        }
        await rejectWhStaticsSnapshot(review.snapshotId);
        return seeOther(request, REVIEW_PAGE, { query: { outcome: 'rejected' } });
      } catch (error) {
        if (error instanceof WhStaticsEmptySnapshotError) {
          return problemResponse(
            conflictFailure('snapshot_empty', error.message),
          );
        }
        if (error instanceof WhStaticsSnapshotStateError) {
          return problemResponse(
            conflictFailure('snapshot_not_pending', error.message),
          );
        }
        throw error;
      }
    },
  });
}
