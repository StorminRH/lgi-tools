import type { PillTone } from '@/components/ui/pill';

interface CodexSubjectSpec {
  readonly label: string;
  readonly singular: string;
  readonly nouns: readonly [string, string];
  readonly blurb: string;
  readonly tone: PillTone;
  readonly entity: boolean;
  parseKey(raw: string): string | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSlug(raw: string): string | null {
  return raw.length <= 80 && SLUG.test(raw) ? raw : null;
}

export const CODEX_CLASS_KEYS = [
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'thera',
  'c13',
  'sentinel',
  'barbican',
  'vidette',
  'conflux',
  'redoubt',
] as const;

const CLASS_KEYS: ReadonlySet<string> = new Set(CODEX_CLASS_KEYS);

export const CODEX_SUBJECTS = {
  wormholes: {
    label: 'Wormholes',
    singular: 'Wormhole type',
    nouns: ['type', 'types'],
    blurb: 'Mass, lifetime, and where each one leads.',
    tone: 'blue',
    entity: true,
    parseKey: (raw) => (/^[a-z]\d{3}$/.test(raw) && raw !== 'k162' ? raw : null),
  },
  sites: {
    label: 'Sites',
    singular: 'Site',
    nouns: ['site', 'sites'],
    blurb: 'Waves, loot, and how to run them.',
    tone: 'red-soft',
    entity: true,
    parseKey: (raw) => (/^[1-9]\d{0,9}$/.test(raw) ? raw : null),
  },
  classes: {
    label: 'Classes',
    singular: 'Wormhole class',
    nouns: ['class', 'classes'],
    blurb: 'C1 to C6, Thera, shattered, and drifter space.',
    tone: 'purple',
    entity: true,
    parseKey: (raw) => (CLASS_KEYS.has(raw) ? raw : null),
  },
  guides: {
    label: 'Guides',
    singular: 'Guide',
    nouns: ['guide', 'guides'],
    blurb: 'Rolling, scanning, and living in a hole.',
    tone: 'green',
    entity: false,
    parseKey: parseSlug,
  },
} as const satisfies Record<string, CodexSubjectSpec>;

export type CodexSubjectKind = keyof typeof CODEX_SUBJECTS;

export interface CodexSubject {
  readonly kind: CodexSubjectKind;
  readonly key: string;
}

export const CODEX_SUBJECT_KINDS = Object.keys(CODEX_SUBJECTS) as CodexSubjectKind[];

export function isCodexSubjectKind(kind: string): kind is CodexSubjectKind {
  return Object.hasOwn(CODEX_SUBJECTS, kind);
}

export function resolveCodexSubject(kind: string, rawKey: string): CodexSubject | null {
  if (!isCodexSubjectKind(kind)) return null;
  const key = CODEX_SUBJECTS[kind].parseKey(rawKey);
  return key === null ? null : { kind, key };
}

const CODEX_EDITOR_NOTICES = ['conflict', 'invalid', 'license', 'summary', 'daily-limit', 'page-limit'] as const;

export type CodexEditorNotice = (typeof CODEX_EDITOR_NOTICES)[number];

export function isCodexEditorNotice(value: string | null): value is CodexEditorNotice {
  return (CODEX_EDITOR_NOTICES as readonly (string | null)[]).includes(value);
}

export function codexPageHref(
  subject: CodexSubject,
  options: { edit?: string; notice?: CodexEditorNotice; title?: string | null; hash?: string } = {},
): string {
  const params = new URLSearchParams();
  if (options.edit) params.set('edit', options.edit);
  if (options.notice) params.set('notice', options.notice);
  if (options.title) params.set('title', options.title);
  const query = params.size > 0 ? `?${params}` : '';
  return `/codex/${subject.kind}/${subject.key}${query}${options.hash ? `#${options.hash}` : ''}`;
}

export const codexKindHref = (kind: CodexSubjectKind) => `/codex/${kind}`;

export function codexHistoryHref(subject: CodexSubject, notice?: CodexEditorNotice): string {
  return `/codex/${subject.kind}/${subject.key}/history${notice ? `?notice=${notice}` : ''}`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
}
