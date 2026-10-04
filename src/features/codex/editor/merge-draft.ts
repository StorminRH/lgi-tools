export type CodexMergeChoice = 'head' | 'proposal' | { readonly blocks: unknown[] };

export interface CodexMergeDraft {
  readonly headRevisionId: string | null;
  readonly choices: Record<string, CodexMergeChoice>;
}

export function codexMergeDraftKey(proposalId: string): string {
  return `codex-merge:${proposalId}`;
}

function isChoice(value: unknown): value is CodexMergeChoice {
  if (value === 'head' || value === 'proposal') return true;
  return typeof value === 'object' && value !== null && Array.isArray((value as { blocks?: unknown }).blocks);
}

export function isMergeDraft(value: unknown): value is CodexMergeDraft {
  if (typeof value !== 'object' || value === null) return false;
  const { headRevisionId, choices } = value as Record<string, unknown>;
  if (headRevisionId !== null && typeof headRevisionId !== 'string') return false;
  return typeof choices === 'object' && choices !== null && Object.values(choices).every(isChoice);
}

export function restoreMergeDraft(
  draft: CodexMergeDraft | null,
  headRevisionId: string | null,
): Record<string, CodexMergeChoice> {
  if (!draft) return {};
  const sameHead = draft.headRevisionId === headRevisionId;
  return Object.fromEntries(
    Object.entries(draft.choices).filter(([, choice]) => typeof choice === 'object' || sameHead),
  );
}
