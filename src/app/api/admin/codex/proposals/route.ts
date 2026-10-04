import type { NextRequest } from 'next/server';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { capabilityRoute } from '@/app/api/capability-route';
import { firstPublishTemplate } from '@/app/api/codex/template-seed';
import { codexReviewFormSchema } from '@/features/codex/api-contract';
import { approveCodexProposal, decideCodexProposal } from '@/features/codex/proposals';
import { validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

const pickReviewForm = (form: FormData) => ({
  proposalId: form.get('proposalId'),
  action: form.get('action'),
  note: form.get('note') ?? undefined,
});

const invalidReviewForm = () => validationFailure('invalid_form_field', 'Invalid Codex review form');

// authz: admin
export const POST = capabilityRoute('admin.codex-review', async (request: NextRequest) => {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;
  const parsed = await parseFormBody(request, codexReviewFormSchema, pickReviewForm, invalidReviewForm);
  if (!parsed.ok) return problemResponse(parsed.failure);

  const { proposalId, action, note } = parsed.data;
  const outcome =
    action === 'approve'
      ? await approveCodexProposal(proposalId, firstPublishTemplate)
      : await decideCodexProposal(proposalId, 'deny', { note });
  const destination = new URL('/admin/codex', request.url);
  destination.searchParams.set('outcome', outcome);
  return Response.redirect(destination, 303);
});
