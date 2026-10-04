import type { NextRequest } from 'next/server';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { capabilityRoute } from '@/app/api/capability-route';
import { firstPublishTemplate } from '@/app/api/codex/template-seed';
import { codexDataBlockProblems } from '@/composition/codex-sources';
import { codexReviewFormSchema, pickReviewForm } from '@/features/codex/api-contract';
import { approveCodexProposal, decideCodexProposal, type ReviewOutcome } from '@/features/codex/proposals';
import { validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';

const REVIEW_PAGE_OUTCOMES: ReadonlySet<ReviewOutcome> = new Set(['conflict', 'moved', 'invalid']);

const invalidReviewForm = () => validationFailure('invalid_form_field', 'Invalid Codex review form');

function landing(
  request: NextRequest,
  { proposalId, page }: { proposalId: string; page?: string },
  outcome: ReviewOutcome,
): Response {
  const destination = REVIEW_PAGE_OUTCOMES.has(outcome)
    ? new URL(`/admin/codex/${proposalId}?notice=${outcome}`, request.url)
    : new URL(`/admin/codex?outcome=${outcome}`, request.url);
  if (page !== undefined) destination.searchParams.set('page', page);
  return Response.redirect(destination, 303);
}

// authz: admin
export const POST = capabilityRoute('admin.codex-review', async (request: NextRequest) => {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;
  const parsed = await parseFormBody(request, codexReviewFormSchema, pickReviewForm, invalidReviewForm);
  if (!parsed.ok) return problemResponse(parsed.failure);
  const form = parsed.data;

  if (form.action === 'deny') {
    return landing(request, form, await decideCodexProposal(form.proposalId, 'deny', { note: form.note }));
  }
  const edits = Object.values(form.choices).filter((choice) => Array.isArray(choice));
  const problems = (await Promise.all(edits.map((blocks) => codexDataBlockProblems(blocks)))).flat();
  if (problems.length > 0) {
    console.warn('[admin/codex/proposals] rejected invalid data blocks', problems);
    return landing(request, form, 'invalid');
  }
  const outcome = await approveCodexProposal(form.proposalId, firstPublishTemplate, {
    headRevisionId: form.headRevisionId,
    choices: form.choices,
  });
  return landing(request, form, outcome);
});
