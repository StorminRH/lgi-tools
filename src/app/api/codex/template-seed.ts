import { codexTemplate } from '@/composition/codex-templates';
import type { CodexTemplateSeed } from '@/features/codex/publish';
import { CODEX_SUBJECTS, type CodexSubject } from '@/features/codex/subjects';

export async function firstPublishTemplate(
  subject: CodexSubject,
  baseRevisionId: string | null,
): Promise<CodexTemplateSeed> {
  if (!CODEX_SUBJECTS[subject.kind].entity || baseRevisionId !== null) return { ok: true, template: null };
  const template = await codexTemplate(subject);
  return template ? { ok: true, template } : { ok: false };
}
