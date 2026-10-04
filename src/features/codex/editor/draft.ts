import type { CodexSubject } from '../subjects';

export interface CodexDraft {
  readonly blocks: unknown[];
  readonly summary: string;
}

const sessionStore = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => window.sessionStorage;

export function codexDraftKey({ kind, key }: CodexSubject, sectionId: string | null): string {
  return `codex-draft:${kind}/${key}:${sectionId ?? 'page'}`;
}

function isDraft(value: unknown): value is CodexDraft {
  if (typeof value !== 'object' || value === null) return false;
  const { blocks, summary } = value as Record<string, unknown>;
  return Array.isArray(blocks) && typeof summary === 'string';
}

export function takeCodexDraft(
  key: string,
  restore: boolean,
  store: typeof sessionStore = sessionStore,
): CodexDraft | null {
  try {
    const storage = store();
    const raw = storage.getItem(key);
    storage.removeItem(key);
    if (!restore || !raw) return null;
    const draft: unknown = JSON.parse(raw);
    return isDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function takeConflictDraft(
  subject: CodexSubject,
  sectionId: string | null,
  goneSectionId: string | null,
  restore: boolean,
  store: typeof sessionStore = sessionStore,
): CodexDraft | null {
  return takeCodexDraft(codexDraftKey(subject, goneSectionId ?? sectionId), restore, store);
}

export function keepCodexDraft(
  key: string,
  draft: CodexDraft,
  store: typeof sessionStore = sessionStore,
): boolean {
  try {
    store().setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function initialEditorBlocks(
  draft: CodexDraft | null,
  initialBlocks: readonly unknown[],
  draftFromGoneSection = false,
): unknown[] {
  if (draft && draftFromGoneSection) return [...initialBlocks, ...draft.blocks];
  if (draft) return draft.blocks;
  return initialBlocks.length > 0 ? [...initialBlocks] : [{ type: 'paragraph' }];
}
