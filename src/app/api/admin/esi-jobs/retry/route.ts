import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { retryEsiRefreshJobFormSchema } from '@/data/esi-refresh-jobs/api-contract';
import { requeueDeadLetteredJob } from '@/data/esi-refresh-jobs/queries';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseRange } from '@/composition/admin-period';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { parseFormBody } from '@/transport/route-body';

// authz: admin
export const POST = capabilityRoute('admin.requeue-esi-job', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;

  const parsed = await parseFormBody(
    request,
    retryEsiRefreshJobFormSchema,
    (form) => ({
      jobId: form.get('jobId'),
      range: form.get('range') ?? undefined,
    }),
    () => validationFailure('invalid_form_field', 'Invalid form'),
  );
  if (!parsed.ok) return problemResponse(parsed.failure);

  const result = await requeueDeadLetteredJob(parsed.data.jobId);
  if (result.outcome === 'not_found') {
    return problemResponse(
      notFoundFailure('job_not_found', 'Dead-lettered job not found'),
    );
  }

  void logUsageEvent({
    action: 'admin_esi_job_requeued',
    characterId: gate.session.characterId,
    metadata: { jobId: parsed.data.jobId, outcome: result.outcome },
  }).catch((error) =>
    console.error('[admin/esi-jobs/retry] telemetry write failed', error),
  );

  const destination = new URL('/admin', request.url);
  destination.searchParams.set('range', parseRange(parsed.data.range));
  return Response.redirect(destination, 303);
}
