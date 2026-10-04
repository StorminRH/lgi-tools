import { listCodexIndex } from '@/composition/codex-templates';
import { CODEX_NON_SITE_KINDS, codexIndexEndpoint, type CodexSearchEntry } from '@/features/codex/api-contract';
import type { CodexIndexRow } from '@/features/codex/index-search';
import { apiResponse } from '@/transport/api-response';

const SEARCH_KINDS: ReadonlySet<string> = new Set(CODEX_NON_SITE_KINDS);

const isSearchEntry = (row: CodexIndexRow): row is CodexIndexRow & CodexSearchEntry => SEARCH_KINDS.has(row.kind);

// authz: public
// input: none
export async function GET(): Promise<Response> {
  const entries = (await listCodexIndex())
    .filter(isSearchEntry)
    .map(({ kind, key, title }) => ({ kind, key, title }));
  return apiResponse(codexIndexEndpoint, 200, { entries });
}
