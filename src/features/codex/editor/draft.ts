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

export function peekRawDraft(key: string, store: typeof sessionStore = sessionStore): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

export function dropDraft(key: string, store: typeof sessionStore = sessionStore): void {
  try {
    store().removeItem(key);
  } catch {
    return;
  }
}

export function parseDraft<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    return guard(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function takeJsonDraft<T>(
  key: string,
  restore: boolean,
  guard: (value: unknown) => value is T,
  store: typeof sessionStore = sessionStore,
): T | null {
  const raw = peekRawDraft(key, store);
  dropDraft(key, store);
  return restore ? parseDraft(raw, guard) : null;
}

export function takeCodexDraft(
  key: string,
  restore: boolean,
  store: typeof sessionStore = sessionStore,
): CodexDraft | null {
  return takeJsonDraft(key, restore, isDraft, store);
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

export function keepJsonDraft(key: string, value: unknown, store: typeof sessionStore = sessionStore): boolean {
  try {
    store().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function keepCodexDraft(
  key: string,
  draft: CodexDraft,
  store: typeof sessionStore = sessionStore,
): boolean {
  return keepJsonDraft(key, draft, store);
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
