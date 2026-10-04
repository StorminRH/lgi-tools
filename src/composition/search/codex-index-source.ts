import { codexIndexEndpoint, type CodexSearchEntry } from '@/features/codex/api-contract';
import { filterCodexIndex } from '@/features/codex/index-search';
import { CODEX_SUBJECTS, codexPageHref } from '@/features/codex/subjects';
import type { SearchSource } from '@/platform/search';
import { apiFetch } from '@/transport/api-client';

let indexPromise: Promise<CodexSearchEntry[]> | null = null;

function loadIndex(): Promise<CodexSearchEntry[]> {
  indexPromise ??= apiFetch(codexIndexEndpoint)
    .then((result) => {
      if (!result.ok) throw new Error(`codex index ${'status' in result ? result.status : result.kind}`);
      return result.data.entries;
    })
    .catch((err: unknown) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

export const codexIndexSource: SearchSource = {
  id: 'codex',
  name: 'Codex',
  limit: 6,
  async search(query, ctx) {
    if (query.trim() === '') return [];
    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];
    return filterCodexIndex(index, query).map(({ kind, key, title }) => ({
      kind: 'codex',
      id: `codex:${kind}/${key}`,
      label: title,
      sub: CODEX_SUBJECTS[kind].singular,
      href: codexPageHref({ kind, key }),
      iconText: 'CX',
      iconTone: CODEX_SUBJECTS[kind].tone,
    }));
  },
};
