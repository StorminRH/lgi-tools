import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import type { CodexEdit } from './publish';
import { resolveCodexSubject } from './subjects';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

function parseJsonArray(raw: string): unknown[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const blocksJson = z.string().transform((raw, context) => {
  const blocks = parseJsonArray(raw);
  if (blocks) return blocks;
  context.addIssue({ code: 'custom', message: 'blocks must be a JSON array' });
  return z.NEVER;
});

const revisionRef = z.union([z.literal('').transform(() => null), z.uuid()]);

const target = {
  kind: z.string(),
  key: z.string(),
  baseRevisionId: revisionRef,
};

function withSubject<T extends { kind: string; key: string }>(form: T, context: z.RefinementCtx) {
  const subject = resolveCodexSubject(form.kind, form.key);
  if (!subject) {
    context.addIssue({ code: 'custom', message: 'unknown Codex page' });
    return z.NEVER;
  }
  return { ...form, subject };
}

export const codexRevisionFormSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('publish'),
      ...target,
      sectionId: optionalText(200),
      blocks: blocksJson,
      summary: optionalText(200),
      title: optionalText(120),
    }),
    z.object({ action: z.literal('restore'), ...target, revisionId: z.uuid() }),
  ])
  .transform(withSubject);

export type CodexRevisionForm = z.output<typeof codexRevisionFormSchema>;

export function pickRevisionForm(form: FormData): Record<string, unknown> {
  const field = (name: string) => form.get(name) ?? undefined;
  return Object.fromEntries(
    ['action', 'kind', 'key', 'baseRevisionId', 'sectionId', 'blocks', 'summary', 'title', 'revisionId'].map(
      (name) => [name, field(name)],
    ),
  );
}

export function editFromForm(form: CodexRevisionForm): CodexEdit {
  if (form.action === 'restore') return { kind: 'restore', revisionId: form.revisionId };
  return form.sectionId === null
    ? { kind: 'page', blocks: form.blocks }
    : { kind: 'section', sectionId: form.sectionId, blocks: form.blocks };
}

export const codexProposalFormSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('submit'),
      proposalId: z.uuid(),
      ...target,
      sectionId: z.string().trim().min(1).max(200),
      blocks: blocksJson,
      summary: z.string().max(200).optional(),
      license: z.string().optional(),
    }),
    z.object({ action: z.literal('withdraw'), proposalId: z.uuid() }),
  ])
  .transform((form, context) => (form.action === 'withdraw' ? form : withSubject(form, context)));

export type CodexProposalForm = z.output<typeof codexProposalFormSchema>;

export function pickProposalForm(form: FormData): Record<string, unknown> {
  return Object.fromEntries(
    ['action', 'proposalId', 'kind', 'key', 'baseRevisionId', 'sectionId', 'blocks', 'summary', 'license'].map(
      (name) => [name, form.get(name) ?? undefined],
    ),
  );
}

export const codexQueuePage = z.string().regex(/^[1-9]\d*$/);

export const codexReviewFormSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    proposalId: z.uuid(),
    headRevisionId: revisionRef,
    choices: z.record(z.string().min(1).max(200), z.union([z.enum(['head', 'proposal']), blocksJson])).default({}),
    page: codexQueuePage.optional(),
  }),
  z.object({
    action: z.literal('deny'),
    proposalId: z.uuid(),
    note: z.string().max(1000).optional(),
    page: codexQueuePage.optional(),
  }),
]);

export function pickReviewForm(form: FormData): Record<string, unknown> {
  const choices: Record<string, unknown> = {};
  for (const [name, value] of form) {
    if (!name.startsWith('choice.')) continue;
    const id = name.slice('choice.'.length);
    choices[id] = value === 'edit' ? form.get(`edit.${id}`) : value;
  }
  return {
    action: form.get('action') ?? undefined,
    proposalId: form.get('proposalId') ?? undefined,
    note: form.get('note') ?? undefined,
    headRevisionId: form.get('headRevisionId') ?? '',
    page: form.get('page') || undefined,
    choices,
  };
}

const codexSourceHitSchema = z.object({ key: z.string(), title: z.string(), hint: z.string() });

export type CodexSourceHit = z.infer<typeof codexSourceHitSchema>;

const codexEntitySchema = z.object({
  key: z.string(),
  title: z.string(),
  href: z.string().nullable(),
  values: z.array(z.object({ field: z.string(), label: z.string(), value: z.string() })),
});

export type CodexEntity = z.infer<typeof codexEntitySchema>;

const sourceParam = z.string().max(40);

export const codexSourceSearchEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/codex/sources',
  request: null,
  query: z.object({ source: sourceParam, q: z.string().trim().max(60) }),
  responses: {
    200: jsonBody(z.object({ hits: z.array(codexSourceHitSchema) })),
    400: problem('invalid_query', 'unknown_source'),
    401: problem('unauthenticated'),
  },
});

export const codexSourceEntityEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/codex/sources',
  request: null,
  query: z.object({ source: sourceParam, key: z.string().trim().max(80) }),
  responses: {
    200: jsonBody(z.object({ entity: codexEntitySchema })),
    400: problem('invalid_query', 'unknown_source', 'invalid_key'),
    401: problem('unauthenticated'),
    404: problem('entity_not_found'),
  },
});

export const codexUploadTokenRequestSchema = z.object({
  type: z.literal('blob.generate-client-token'),
  payload: z.looseObject({ pathname: z.string(), clientPayload: z.string().nullable(), multipart: z.boolean() }),
});

export const codexUploadTokenEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/codex/uploads',
  request: codexUploadTokenRequestSchema,
  responses: {
    200: jsonBody(z.object({ type: z.string(), clientToken: z.string() })),
    400: problem('invalid_body', 'invalid_json', 'bad_pathname'),
    401: problem('unauthenticated'),
    403: problem('character_required', 'forbidden'),
    429: problem('rate_limited', 'upload_quota'),
    503: problem('blob_unconfigured'),
  },
});

export const codexUploadFinalizeRequestSchema = z.object({ url: z.url() });

const codexUploadedAssetSchema = z.object({
  id: z.string(),
  stem: z.string(),
  width: z.number(),
  height: z.number(),
});

export type CodexUploadedAsset = z.infer<typeof codexUploadedAssetSchema>;

export const codexUploadFinalizeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/codex/uploads/finalize',
  request: codexUploadFinalizeRequestSchema,
  responses: {
    200: jsonBody(z.object({ asset: codexUploadedAssetSchema })),
    400: problem('invalid_body', 'invalid_json', 'forbidden_key', 'not_an_image', 'too_large', 'too_many_pixels'),
    401: problem('unauthenticated'),
    403: problem('character_required', 'forbidden'),
    404: problem('pending_upload_missing'),
    429: problem('rate_limited', 'upload_quota'),
    503: problem('blob_unconfigured'),
  },
});

export const CODEX_NON_SITE_KINDS = ['guides', 'wormholes', 'classes'] as const;

const codexSearchEntrySchema = z.object({
  kind: z.enum(CODEX_NON_SITE_KINDS),
  key: z.string().max(80),
  title: z.string().max(120),
});

export type CodexSearchEntry = z.infer<typeof codexSearchEntrySchema>;

export const codexIndexEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/codex/index',
  request: null,
  responses: { 200: jsonBody(z.object({ entries: z.array(codexSearchEntrySchema) })) },
});
