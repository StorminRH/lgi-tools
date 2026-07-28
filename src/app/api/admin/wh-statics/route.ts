import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import {
  promoteWhStaticsSnapshot,
  refreshWhStaticsOnDemand,
  rejectWhStaticsSnapshot,
} from '@/composition/wh-statics-refresh';
import { whStaticsAdminFormSchema } from '@/data/wh-statics/api-contract';
import { WhStaticsSnapshotStateError } from '@/data/wh-statics/queries';
import { conflictFailure, validationFailure } from '@/lib/failure';
import { checkAdmin } from '@/platform/auth/route-guards';
import { requireSameOrigin } from '@/platform/auth/same-origin';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

function redirectToReview(request: NextRequest, outcome: string): Response {
  const destination = new URL('/admin/statics', request.url);
  destination.searchParams.set('outcome', outcome);
  return Response.redirect(destination, 303);
}

/**
 * Admin-only statics refresh and review action. Every submitted form is gated,
 * same-origin checked, slice-validated, and redirected back to the review page.
 */
// authz: admin
export const POST = capabilityRoute('admin.wh-statics-review', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await checkAdmin();
  if (!gate.ok) return problemResponse(gate.failure);
  const originCheck = requireSameOrigin(request);
  if (!originCheck.ok) return problemResponse(originCheck.failure);

  const parsed = await parseFormBody(
    request,
    whStaticsAdminFormSchema,
    (form) => ({
      action: form.get('action'),
      snapshotId: form.get('snapshotId') ?? undefined,
    }),
    () => validationFailure('invalid_form_field', 'Invalid statics review form'),
  );
  if (!parsed.ok) return problemResponse(parsed.failure);

  try {
    if (parsed.data.action === 'refresh') {
      const result = await refreshWhStaticsOnDemand();
      return redirectToReview(request, result.status);
    }
    if (parsed.data.action === 'promote') {
      await promoteWhStaticsSnapshot(parsed.data.snapshotId);
      return redirectToReview(request, 'promoted');
    }
    await rejectWhStaticsSnapshot(parsed.data.snapshotId);
    return redirectToReview(request, 'rejected');
  } catch (error) {
    if (error instanceof WhStaticsSnapshotStateError) {
      return problemResponse(
        conflictFailure('snapshot_not_pending', error.message),
      );
    }
    throw error;
  }
}
