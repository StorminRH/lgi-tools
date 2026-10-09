import type { CodexSubjectKind } from './subjects';

export interface CodexIndexRow {
  readonly kind: CodexSubjectKind;
  readonly key: string;
  readonly title: string;
}

const MAX_RESULTS = 50;

export function filterCodexIndex<Row extends CodexIndexRow>(rows: readonly Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return rows
    .filter((row) => row.title.toLowerCase().includes(needle) || row.key.includes(needle))
    .slice(0, MAX_RESULTS);
}
