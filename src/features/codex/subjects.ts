interface CodexSubjectSpec {
  readonly label: string;
  readonly singular: string;
  parseKey(raw: string): string | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSlug(raw: string): string | null {
  return raw.length <= 80 && SLUG.test(raw) ? raw : null;
}

export const CODEX_SUBJECTS = {
  guides: { label: 'Guides', singular: 'Guide', parseKey: parseSlug },
} as const satisfies Record<string, CodexSubjectSpec>;

export type CodexSubjectKind = keyof typeof CODEX_SUBJECTS;

export interface CodexSubject {
  readonly kind: CodexSubjectKind;
  readonly key: string;
}

export function resolveCodexSubject(kind: string, rawKey: string): CodexSubject | null {
  if (!Object.hasOwn(CODEX_SUBJECTS, kind)) return null;
  const subjectKind = kind as CodexSubjectKind;
  const key = CODEX_SUBJECTS[subjectKind].parseKey(rawKey);
  return key === null ? null : { kind: subjectKind, key };
}
