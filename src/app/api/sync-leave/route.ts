import { runMutationRoute } from '@/app/api/mutation-route';
import { leaveSyncEndpoint, leaveSyncRequestSchema } from '@/data/convex/api-contract';
import { LeaveSyncDoorError, postLeaveSync } from '@/data/convex/leave-door';
import { dependencyUnavailableFailure } from '@/lib/failure';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse, problemResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'sync.leave-location',
    preflight: async () => {
      const limit = await checkRateLimit(request, {
        name: 'sync-leave',
        perMinute: 30,
      });
      return limit.ok ? null : problemResponse(limit.failure);
    },
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, leaveSyncRequestSchema),
    handle: async ({ userId }, body) => {
      try {
        await postLeaveSync({
          userId,
          dataset: body.dataset,
          tabId: body.tabId,
        });
      } catch (cause) {
        if (!(cause instanceof LeaveSyncDoorError)) throw cause;
        return apiResponse(
          leaveSyncEndpoint,
          503,
          dependencyUnavailableFailure('leave_sync_unavailable', 503, { cause }),
        );
      }
      return apiResponse(leaveSyncEndpoint, 204);
    },
  });
}
