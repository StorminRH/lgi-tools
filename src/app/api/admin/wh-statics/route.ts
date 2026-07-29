import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
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
import { conflictFailure, validationFailure } from '@/lib/failure';
import { checkAdminMutation } from '@/platform/auth/route-guards';
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
  const gate = await checkAdminMutation(request);
  if (!gate.ok) return problemResponse(gate.failure);
  return handleAuthorizedPost(request);
}

async function handleAuthorizedPost(request: NextRequest): Promise<Response> {
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
}
