import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkAdmin } from '@/composition/route-guards';
import {
  promoteWhStaticsSnapshot,
  refreshWhStaticsOnDemand,
  rejectWhStaticsSnapshot,
} from '@/composition/wh-statics-refresh';
import { whStaticsAdminFormSchema } from '@/data/wh-statics/api-contract';
import {
  WhStaticsEmptySnapshotError,
  WhStaticsSnapshotStateError,
} from '@/data/wh-statics/queries';
import { conflictFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

function redirectToReview(request: NextRequest, outcome: string): Response {
  const destination = new URL('/admin/statics', request.url);
  destination.searchParams.set('outcome', outcome);
  return Response.redirect(destination, 303);
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
          const result = await refreshWhStaticsOnDemand();
          return redirectToReview(request, result.status);
        }
        if (review.action === 'promote') {
          await promoteWhStaticsSnapshot(review.snapshotId);
          return redirectToReview(request, 'promoted');
        }
        await rejectWhStaticsSnapshot(review.snapshotId);
        return redirectToReview(request, 'rejected');
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
