import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { codexDataBlockProblems } from '@/composition/codex-sources';
import { checkSession } from '@/composition/route-guards';
import { codexProposalFormSchema, pickProposalForm, type CodexProposalForm } from '@/features/codex/api-contract';
import { decideCodexProposal, submitCodexProposal, type CodexSubmitter } from '@/features/codex/proposals';
import { codexPageHref, type CodexEditorNotice } from '@/features/codex/subjects';
import { forbiddenFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';
import { firstPublishTemplate } from '@/app/api/codex/template-seed';

type SubmitForm = Extract<CodexProposalForm, { action: 'submit' }>;

function redirectTo(request: NextRequest, path: string): Response {
  return Response.redirect(new URL(path, request.url), 303);
}

async function authorizeSubmitter() {
  const checked = await checkSession();
  if (!checked.ok) return checked;
  const { session } = checked;
  if (session.characterId == null) {
    return { ok: false as const, failure: forbiddenFailure('character_required', 'Sign in with a character to suggest edits') };
  }
  return { ok: true as const, submitter: { userId: session.user.id, characterId: session.characterId } };
}

async function refusal(form: SubmitForm): Promise<CodexEditorNotice | null> {
  if (form.license !== 'accepted') return 'license';
  if (!form.summary?.trim()) return 'summary';
  const problems = await codexDataBlockProblems(form.blocks);
  if (problems.length === 0) return null;
  console.warn('[codex/proposals] rejected invalid data blocks', problems);
  return 'invalid';
}

async function submit(request: NextRequest, submitter: CodexSubmitter, form: SubmitForm): Promise<Response> {
  const backToEditor = (notice: CodexEditorNotice) =>
    redirectTo(request, codexPageHref(form.subject, { edit: form.sectionId, notice }));
  const refused = await refusal(form);
  if (refused) return backToEditor(refused);

  const outcome = await submitCodexProposal(
    {
      proposalId: form.proposalId,
      subject: form.subject,
      sectionId: form.sectionId,
      blocks: form.blocks,
      summary: form.summary!.trim(),
      baseRevisionId: form.baseRevisionId,
      submitter,
    },
    await firstPublishTemplate(form.subject, form.baseRevisionId),
  );
  if (outcome.status === 'submitted' || outcome.status === 'duplicate') {
    return redirectTo(request, '/codex/mine?notice=submitted');
  }
  return backToEditor(outcome.status);
}

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'codex.propose-edit',
    preflight: rateLimitPreflight(request, { name: 'codex-propose', perMinute: 10 }, problemResponse),
    authorize: authorizeSubmitter,
    parse: (incoming) =>
      parseFormBody(incoming, codexProposalFormSchema, pickProposalForm, () =>
        validationFailure('invalid_form_field', 'Invalid Codex suggestion form'),
      ),
    handle: async ({ submitter }, form) => {
      if (form.action === 'submit') return submit(request, submitter, form);
      const outcome = await decideCodexProposal(form.proposalId, 'withdraw', { userId: submitter.userId });
      return redirectTo(request, `/codex/mine?notice=${outcome}`);
    },
  });
}
