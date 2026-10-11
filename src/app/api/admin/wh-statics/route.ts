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
  type WhStaticsReviewOutcome,
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
import { seeOther } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

const REVIEW_PAGE = '/admin/statics';

/** Refresh outcomes that report a failure through the review page's notice. */
const REFRESH_FAILURES: Partial<Record<WhStaticsRefreshResult['status'], AppFailure>> = {
  'feed-unavailable': dependencyUnavailableFailure('wh_statics_feed_unavailable'),
  busy: conflictFailure('wh_statics_refresh_busy'),
};

/** Back to the review page with the notice for `outcome`, recording `failure` when it is one. */
function backToReview(request: Request, outcome: WhStaticsReviewOutcome, failure?: AppFailure): Response {
  return seeOther(request, REVIEW_PAGE, { query: { outcome }, failure });
}

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
          return backToReview(request, status, REFRESH_FAILURES[status]);
        }
        if (review.action === 'promote') {
          await promoteWhStaticsSnapshot(review.snapshotId);
          return backToReview(request, 'promoted');
        }
        await rejectWhStaticsSnapshot(review.snapshotId);
        return backToReview(request, 'rejected');
      } catch (error) {
        // The review form posts natively, so an empty or no-longer-pending
        // snapshot (a double-submitted promote, say) gets a notice, not JSON.
        if (error instanceof WhStaticsEmptySnapshotError) {
          return backToReview(
            request,
            'snapshot-empty',
            conflictFailure('snapshot_empty', error.message),
          );
        }
        if (error instanceof WhStaticsSnapshotStateError) {
          return backToReview(
            request,
            'snapshot-not-pending',
            conflictFailure('snapshot_not_pending', error.message),
          );
        }
        throw error;
      }
    },
  });
}
