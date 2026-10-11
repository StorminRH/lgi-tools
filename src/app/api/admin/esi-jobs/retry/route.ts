import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkAdmin } from '@/composition/route-guards';
import { retryEsiRefreshJobFormSchema } from '@/data/esi-refresh-jobs/api-contract';
import { requeueDeadLetteredJob } from '@/data/esi-refresh-jobs/queries';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.requeue-esi-job',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, retryEsiRefreshJobFormSchema, ['jobId']),
    handle: async ({ session }, { jobId }) => {
      const result = await requeueDeadLetteredJob(jobId);
      if (result.outcome === 'not_found') {
        return problemResponse(
          notFoundFailure('job_not_found', 'Dead-lettered job not found'),
        );
      }

      void logUsageEvent({
        action: 'admin_esi_job_requeued',
        characterId: session.characterId,
        metadata: { jobId, outcome: result.outcome },
      }).catch((error) =>
        console.error('[admin/esi-jobs/retry] telemetry write failed', error),
      );

      return seeOther(request, '/admin/queue');
    },
  });
}
