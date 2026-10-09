import { getWormholeCodex } from '@/data/eve-data/universe-assets';
import type { CodexEntity } from '@/features/codex/api-contract';
import type { CodexDoc } from '@/features/codex/doc';
import type { CodexIndexRow } from '@/features/codex/index-search';
import { listCodexPages } from '@/features/codex/queries';
import {
  CODEX_SUBJECT_KINDS,
  CODEX_SUBJECTS,
  slugify,
  type CodexSubject,
  type CodexSubjectKind,
} from '@/features/codex/subjects';
import { isPublishedWormholeSiteId } from '@/features/wormhole-sites/catalogue-boundary';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';
import { deriveSiteMeta } from '@/features/wormhole-sites/site-meta';
import type { SiteDetail } from '@/features/wormhole-sites/types';
import { CODEX_SOURCES, loadCodexEntity, resolveCodexEntity, type CodexSourceId } from './codex-sources';

export const CODEX_CLASS_SUBJECTS = [
  { key: 'c1', classId: 1, label: 'C1' },
  { key: 'c2', classId: 2, label: 'C2' },
  { key: 'c3', classId: 3, label: 'C3' },
  { key: 'c4', classId: 4, label: 'C4' },
  { key: 'c5', classId: 5, label: 'C5' },
  { key: 'c6', classId: 6, label: 'C6' },
  { key: 'thera', classId: 12, label: 'Thera' },
  { key: 'c13', classId: 13, label: 'Shattered C13' },
  { key: 'sentinel', classId: 14, label: 'Sentinel' },
  { key: 'barbican', classId: 15, label: 'Barbican' },
  { key: 'vidette', classId: 16, label: 'Vidette' },
  { key: 'conflux', classId: 17, label: 'Conflux' },
  { key: 'redoubt', classId: 18, label: 'Redoubt' },
] as const;

export interface CodexIndexEntry {
  readonly key: string;
  readonly title: string;
}

type EntityKind = Exclude<CodexSubjectKind, 'guides'>;

interface EntityPageSpec {
  readonly source: CodexSourceId;
  readonly layout: 'infobox' | 'card';
  readonly sections: readonly string[];
  sourceKey(key: string): string | null;
  entries(): Promise<CodexIndexEntry[]>;
  describe(entity: CodexEntity, row: unknown): string;
}

const byTitle = (a: CodexIndexEntry, b: CodexIndexEntry) => a.title.localeCompare(b.title);

function describeValues({ title, values }: CodexEntity): string {
  return `${title}: ${values
    .slice(0, 3)
    .map((value) => `${value.label} ${value.value}`)
    .join(' · ')}.`;
}

const ENTITY_PAGES: Record<EntityKind, EntityPageSpec> = {
  wormholes: {
    source: 'wormholeType',
    layout: 'infobox',
    sections: ['Overview', 'Where it appears', 'Rolling and mass'],
    sourceKey: (key) => key.toUpperCase(),
    entries: async () => {
      const { types } = await getWormholeCodex();
      const codes = new Set(types.filter((entry) => !entry.farSide).map((entry) => entry.code));
      return [...codes]
        .map((code) => ({ key: code.toLowerCase(), title: code }))
        .filter((entry) => CODEX_SUBJECTS.wormholes.parseKey(entry.key) !== null)
        .sort(byTitle);
    },
    describe: describeValues,
  },
  sites: {
    source: 'site',
    layout: 'card',
    sections: ['Waves', 'Strategy', 'Videos'],
    sourceKey: (key) => key,
    entries: async () => {
      const index = await getSiteSearchIndex();
      return index
        .filter((entry) => isPublishedWormholeSiteId(entry.id))
        .map((entry) => ({ key: String(entry.id), title: entry.name }))
        .sort(byTitle);
    },
    describe: (_entity, row) => deriveSiteMeta(row as SiteDetail).description,
  },
  classes: {
    source: 'wormholeClass',
    layout: 'infobox',
    sections: ['Effects', 'Statics', 'Sites'],
    sourceKey: (key) => {
      const entry = CODEX_CLASS_SUBJECTS.find((candidate) => candidate.key === key);
      return entry ? `C${entry.classId}` : null;
    },
    entries: async () => CODEX_CLASS_SUBJECTS.map(({ key, label }) => ({ key, title: label })),
    describe: describeValues,
  },
};

function entityPage(kind: CodexSubjectKind): EntityPageSpec | null {
  return Object.hasOwn(ENTITY_PAGES, kind) ? ENTITY_PAGES[kind as EntityKind] : null;
}

export interface CodexTemplate {
  readonly title: string;
  readonly description: string;
  readonly doc: CodexDoc;
}

function templateDoc(spec: EntityPageSpec, sourceKey: string): CodexDoc {
  const fields = spec.layout === 'card' ? [] : Object.keys(CODEX_SOURCES[spec.source].fields);
  return {
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [
      { type: 'dataBlock', attrs: { id: 'data', source: spec.source, key: sourceKey, fields, layout: spec.layout }, content: [] },
      ...spec.sections.map((heading) => ({
        type: 'heading' as const,
        attrs: { id: slugify(heading), level: 2 as const },
        content: [{ type: 'text' as const, text: heading, marks: [] }],
      })),
    ],
  };
}

export async function codexTemplate({ kind, key }: CodexSubject): Promise<CodexTemplate | null> {
  const spec = entityPage(kind);
  const sourceKey = spec?.sourceKey(key) ?? null;
  if (spec === null || sourceKey === null) return null;
  const lookup = await resolveCodexEntity(spec.source, sourceKey);
  if (lookup.status !== 'found') return null;
  const row = await loadCodexEntity(spec.source, lookup.entity.key);
  return {
    title: lookup.entity.title,
    description: spec.describe(lookup.entity, row),
    doc: templateDoc(spec, lookup.entity.key),
  };
}

export async function listCodexEntries(kind: CodexSubjectKind): Promise<CodexIndexEntry[]> {
  const spec = entityPage(kind);
  if (spec) return spec.entries();
  const pages = await listCodexPages(kind);
  return pages.map(({ key, title }) => ({ key, title }));
}

export async function listCodexIndex(): Promise<CodexIndexRow[]> {
  const lists = await Promise.all(CODEX_SUBJECT_KINDS.map((kind) => listCodexEntries(kind)));
  return CODEX_SUBJECT_KINDS.flatMap((kind, index) => lists[index]!.map((entry) => ({ kind, ...entry })));
}
