import type { NextRequest } from 'next/server';
import { retryEsiRefreshJobFormSchema } from '@/data/esi-refresh-jobs/api-contract';
import { requeueDeadLetteredJob } from '@/data/esi-refresh-jobs/queries';
import { logUsageEvent } from '@/data/telemetry/queries';
import { parseRange } from '@/app/admin/period';
import { requireAdmin } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { parseFormBody } from '@/lib/route-body';

/**
 * Admin-only form POST. Re-enqueues a dead-lettered refresh through the normal
 * worker path; the query layer absorbs an already-live replacement as an
 * idempotent superseded outcome.
 */
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);

  const parsed = await parseFormBody(
    request,
    retryEsiRefreshJobFormSchema,
    (form) => ({
      jobId: form.get('jobId'),
      range: form.get('range') ?? undefined,
    }),
    () => new Response('Invalid form', { status: 400 }),
  );
  if (!parsed.ok) return parsed.response;

  const result = await requeueDeadLetteredJob(parsed.data.jobId);
  if (result.outcome === 'not_found') {
    return new Response('Dead-lettered job not found', { status: 404 });
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
