import { z } from 'zod';
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

const target = {
  kind: z.string(),
  key: z.string(),
  baseRevisionId: z.union([z.literal('').transform(() => null), z.uuid()]),
};

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
  .transform((form, context) => {
    const subject = resolveCodexSubject(form.kind, form.key);
    if (!subject) {
      context.addIssue({ code: 'custom', message: 'unknown Codex page' });
      return z.NEVER;
    }
    return { ...form, subject };
  });

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
