import type { NextRequest } from 'next/server';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { capabilityRoute } from '@/app/api/capability-route';
import { codexDataBlockProblems } from '@/composition/codex-sources';
import { publishCodexRevision } from '@/features/codex/publish';
import {
  codexRevisionFormSchema,
  editFromForm,
  pickRevisionForm,
  type CodexRevisionForm,
} from '@/features/codex/api-contract';
import { LEAD_SECTION_ID, PAGE_SCOPE } from '@/features/codex/sections';
import { codexHistoryHref, codexPageHref } from '@/features/codex/subjects';
import { validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { parseFormBody } from '@/transport/route-body';
import { firstPublishTemplate } from '@/app/api/codex/template-seed';

function redirectTo(request: NextRequest, path: string): Response {
  return Response.redirect(new URL(path, request.url), 303);
}

function landing(form: CodexRevisionForm, status: 'published' | 'conflict' | 'invalid'): string {
  if (form.action === 'restore') {
    return status === 'published' ? codexPageHref(form.subject) : codexHistoryHref(form.subject, status);
  }
  const edit = form.sectionId ?? PAGE_SCOPE;
  if (status === 'published') {
    const hash = form.sectionId && form.sectionId !== LEAD_SECTION_ID ? form.sectionId : undefined;
    return codexPageHref(form.subject, { hash });
  }
  return codexPageHref(form.subject, { edit, notice: status, title: form.title });
}

// authz: admin
export const POST = capabilityRoute('admin.codex-publish', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const parsed = await parseFormBody(request, codexRevisionFormSchema, pickRevisionForm, () =>
    validationFailure('invalid_form_field', 'Invalid Codex revision form'),
  );
  if (!parsed.ok) return problemResponse(parsed.failure);
  const form = parsed.data;

  const seed = await firstPublishTemplate(form.subject, form.baseRevisionId);
  if (!seed.ok) return redirectTo(request, landing(form, 'invalid'));
  const { template } = seed;

  if (form.action === 'publish') {
    const problems = await codexDataBlockProblems(form.blocks);
    if (problems.length > 0) {
      console.warn('[admin/codex/revisions] rejected invalid data blocks', problems);
      return redirectTo(request, landing(form, 'invalid'));
    }
  }

  const result = await publishCodexRevision({
    subject: form.subject,
    title: template?.title ?? (form.action === 'publish' ? form.title : null),
    baseRevisionId: form.baseRevisionId,
    template: template?.doc,
    edit: editFromForm(form),
    summary: form.action === 'publish' ? form.summary : null,
    author: { userId: session.user.id, characterId: session.characterId ?? null },
  });
  if (result.status === 'invalid') {
    console.warn('[admin/codex/revisions] rejected an invalid document', result.problems);
  }
  return redirectTo(request, landing(form, result.status));
}
