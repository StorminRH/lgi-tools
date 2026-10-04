import { cacheLife, cacheTag } from 'next/cache';
import { cache } from 'react';
import { BLUEPRINT_STRUCTURE_TAG } from '@/data/eve-data/constants';
import { getTypeLabels, getTypesByIds, searchPublishedTypesByName } from '@/data/eve-data/queries';
import {
  getSystemDirectory,
  getWormholeCodex,
  type TypedWormholeCodexEntry,
  type WormholeCodexEntry,
} from '@/data/eve-data/universe-assets';
import { systemClassText } from '@/data/eve-data/system-identity';
import { WORMHOLE_EFFECT_NAME } from '@/data/eve-data/wormhole-contract';
import { getSystemStatics } from '@/data/wh-statics/queries';
import type { CodexEntity, CodexSourceHit } from '@/features/codex/api-contract';
import type {
  CodexDataBlockView,
  CodexSourceCatalogue,
  CodexSourceIcon,
} from '@/features/codex/components/CodexDataView';
import { findUntrustedNodes } from '@/features/codex/doc';
import type { CodexDataLayout } from '@/features/codex/nodes';
import { isPublishedWormholeSiteId } from '@/features/wormhole-sites/catalogue-boundary';
import { SITE_TYPE_LABEL } from '@/features/wormhole-sites/components/wormhole-styles';
import { formatIskHeader } from '@/features/wormhole-sites/format';
import { siteClassLabel } from '@/features/wormhole-sites/gas-classes';
import { getPricedSiteDetail, getSiteSearchIndex } from '@/features/wormhole-sites/queries';
import type { SiteDetail } from '@/features/wormhole-sites/types';
import { formatQuantity } from '@/lib/format/number';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { fuzzyMatch } from '@/platform/search/match';

export type CodexSourceId = 'wormholeType' | 'site' | 'wormholeClass' | 'eveType';

interface CodexField<Row> {
  readonly label: string;
  readonly format: (row: Row) => string;
}

interface CodexSource<Row> {
  readonly label: string;
  readonly provenance: string;
  readonly icon: CodexSourceIcon;
  readonly layouts: readonly CodexDataLayout[];
  readonly parseKey: (raw: string) => string | null;
  readonly search: (query: string) => Promise<CodexSourceHit[]>;
  readonly load: (key: string) => Promise<Row | null>;
  readonly title: (row: Row) => string;
  readonly href?: (row: Row) => string;
  readonly fields: Readonly<Record<string, CodexField<Row>>>;
  readonly defaultFields: readonly string[];
}

const HIT_LIMIT = 8;
const DESCRIPTION_LIMIT = 280;
const BLOCK_LAYOUTS = ['infobox', 'table', 'inline'] as const;

const CLASS_LABEL: Readonly<Record<number, string>> = {
  7: 'High-sec',
  8: 'Low-sec',
  9: 'Null-sec',
  12: 'Thera',
  13: 'Shattered C13',
  14: 'Sentinel',
  15: 'Barbican',
  16: 'Vidette',
  17: 'Conflux',
  18: 'Redoubt',
  25: 'Pochven',
};

const SIZE_LABEL: Readonly<Record<string, string>> = {
  S: 'Small · frigates',
  M: 'Medium · up to battlecruisers',
  L: 'Large · up to battleships',
  XL: 'Extra large · capitals',
};

const classLabel = (classId: number) => CLASS_LABEL[classId] ?? systemClassText(classId) ?? `Class ${classId}`;
const sizeLabel = (size: string) => SIZE_LABEL[size] ?? size;
const kg = (mass: number) => `${formatQuantity(mass)} kg`;
const orDash = <T,>(value: T | null, format: (value: T) => string) => (value === null ? '—' : format(value));
const listOrNone = (items: readonly string[], separator: string) => (items.length > 0 ? items.join(separator) : 'None');

function hours(minutes: number): string {
  const value = minutes / 60;
  return `${value} ${value === 1 ? 'hour' : 'hours'}`;
}

function cleanDescription(raw: string): string {
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT).trimEnd()}…` : text;
}

const MAX_INT4 = 2_147_483_647;

const numericKey = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) && Number(raw) <= MAX_INT4 ? raw : null);

const publishedSiteKey = (raw: string) =>
  numericKey(raw) !== null && isPublishedWormholeSiteId(Number(raw)) ? raw : null;

const isTyped = (entry: WormholeCodexEntry): entry is TypedWormholeCodexEntry => !entry.farSide;

async function loadWormholeType(code: string): Promise<TypedWormholeCodexEntry | null> {
  const { types } = await getWormholeCodex();
  return types.filter(isTyped).find((entry) => entry.code === code) ?? null;
}

interface WormholeClassRow {
  readonly classId: number;
  readonly effects: readonly string[];
  readonly inbound: readonly { code: string; size: string }[];
  readonly systemCount: number;
  readonly staticMix: readonly { label: string; count: number }[];
}

function tally(labels: readonly string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function loadWormholeClass(key: string): Promise<WormholeClassRow> {
  const classId = Number(key.slice(1));
  const [codex, directory, statics] = await Promise.all([
    getWormholeCodex(),
    getSystemDirectory(),
    getSystemStatics(),
  ]);
  const types = codex.types.filter(isTyped);
  const targetOf = new Map(types.map((entry) => [entry.code, entry.targetClass]));
  const systems = directory.systems.filter((system) => system.whClassId === classId);
  const systemIds = new Set(systems.map((system) => system.id));
  const effects = [...new Set(systems.flatMap((system) => (system.effect ? [WORMHOLE_EFFECT_NAME[system.effect]] : [])))];
  const staticTargets = statics.systems
    .filter((system) => systemIds.has(system.systemId))
    .flatMap((system) => system.codes.flatMap((code) => {
      const target = targetOf.get(code);
      return target === undefined ? [] : [classLabel(target)];
    }));
  return {
    classId,
    effects: effects.sort(),
    inbound: types
      .filter((entry) => entry.targetClass === classId)
      .map((entry) => ({ code: entry.code, size: entry.sizeClass }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    systemCount: systems.length,
    staticMix: tally(staticTargets),
  };
}

interface EveTypeRow {
  readonly id: number;
  readonly name: string;
  readonly groupName: string;
  readonly mass: number | null;
  readonly volume: number | null;
  readonly description: string | null;
}

// Only the item reader is uncached, so only it gets an entry here. Wrapping a reader that already owns a
// tagged entry breaks refreshes: after revalidateTag(tag, 'max') the outer entry regenerates in the
// background, reads the inner entry while it is still stale, and stores the old value as fresh.
async function loadEveType(key: string): Promise<EveTypeRow | null> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  const id = Number(key);
  const [labels, [type]] = await withColdStartRetry(() => Promise.all([getTypeLabels([id]), getTypesByIds([id])]));
  const label = labels.get(id);
  if (!label || !type) return null;
  return {
    id,
    name: label.name,
    groupName: label.groupName,
    mass: type.mass,
    volume: type.volume,
    description: type.description,
  };
}

const CLASS_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18];

const wormholeType: CodexSource<TypedWormholeCodexEntry> = {
  label: 'Wormhole type',
  provenance: 'SDE',
  icon: 'wormhole',
  layouts: BLOCK_LAYOUTS,
  parseKey: (raw) => {
    const code = raw.toUpperCase();
    return /^[A-Z]\d{3}$/.test(code) && code !== 'K162' ? code : null;
  },
  search: async (query) => {
    const needle = query.toUpperCase();
    const { types } = await getWormholeCodex();
    return types
      .filter(isTyped)
      .filter((entry) => entry.code.includes(needle))
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, HIT_LIMIT)
      .map((entry) => ({
        key: entry.code,
        title: entry.code,
        hint: `Leads to ${classLabel(entry.targetClass)} · ${sizeLabel(entry.sizeClass).split(' · ')[0]}`,
      }));
  },
  load: loadWormholeType,
  title: (row) => row.code,
  fields: {
    targetClass: { label: 'Leads to', format: (row) => classLabel(row.targetClass) },
    totalMass: { label: 'Total mass', format: (row) => kg(row.totalMass) },
    maxJumpMass: { label: 'Max jump mass', format: (row) => kg(row.maxJumpMass) },
    lifetimeMinutes: { label: 'Lifetime', format: (row) => hours(row.lifetimeMinutes) },
    massRegen: { label: 'Mass regeneration', format: (row) => (row.massRegen === 0 ? 'None' : `${kg(row.massRegen)} / day`) },
    sizeClass: { label: 'Size class', format: (row) => sizeLabel(row.sizeClass) },
  },
  defaultFields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes'],
};

const site: CodexSource<SiteDetail> = {
  label: 'Site',
  provenance: 'SDE · Prices',
  icon: 'site',
  layouts: [...BLOCK_LAYOUTS, 'card'],
  parseKey: publishedSiteKey,
  search: async (query) => {
    const index = await getSiteSearchIndex();
    return index
      .filter((entry) => isPublishedWormholeSiteId(entry.id))
      .flatMap((entry) => {
        const match = fuzzyMatch(query, entry.name);
        return match ? [{ entry, score: match.score }] : [];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, HIT_LIMIT)
      .map(({ entry }) => ({
        key: String(entry.id),
        title: entry.name,
        hint: `${siteClassLabel(entry) ?? '—'} · ${SITE_TYPE_LABEL[entry.siteType]}`,
      }));
  },
  load: (key) => getPricedSiteDetail(Number(key)),
  title: (row) => row.name,
  href: (row) => `/sites/${row.id}`,
  fields: {
    wormholeClass: { label: 'Class', format: (row) => siteClassLabel(row) ?? '—' },
    siteType: { label: 'Type', format: (row) => SITE_TYPE_LABEL[row.siteType] },
    waves: { label: 'Waves', format: (row) => String(row.waves.length) },
    blueLootIsk: { label: 'Blue loot', format: (row) => formatIskHeader(row.blueLootIsk) },
    resourceValueIsk: { label: 'Resources', format: (row) => formatIskHeader(row.resourceValueIsk) },
  },
  defaultFields: ['wormholeClass', 'siteType', 'blueLootIsk'],
};

const wormholeClass: CodexSource<WormholeClassRow> = {
  label: 'Wormhole class',
  provenance: 'SDE',
  icon: 'class',
  layouts: BLOCK_LAYOUTS,
  parseKey: (raw) => (/^C([1-9]|1[2-8])$/i.test(raw) ? raw.toUpperCase() : null),
  search: async (query) => {
    const needle = query.toLowerCase();
    return CLASS_KEYS.map((classId) => ({ key: `C${classId}`, title: classLabel(classId), hint: `Class ${classId}` }))
      .filter((hit) => hit.key.toLowerCase().includes(needle) || hit.title.toLowerCase().includes(needle))
      .slice(0, HIT_LIMIT);
  },
  load: loadWormholeClass,
  title: (row) => classLabel(row.classId),
  fields: {
    effects: { label: 'Effects', format: (row) => listOrNone(row.effects, ', ') },
    inbound: { label: 'Leads in', format: (row) => listOrNone(row.inbound.map(({ code, size }) => `${code}\u00a0(${size})`), ', ') },
    systemCount: { label: 'Systems', format: (row) => String(row.systemCount) },
    staticMix: {
      label: 'Static targets',
      format: (row) =>
        listOrNone(row.staticMix.map(({ label, count }) => `${label.replace('-', '\u2011')}\u00a0×${count}`), '\u00a0· '),
    },
  },
  defaultFields: ['effects', 'inbound', 'systemCount'],
};

const eveType: CodexSource<EveTypeRow> = {
  label: 'Item',
  provenance: 'SDE',
  icon: 'data',
  layouts: BLOCK_LAYOUTS,
  parseKey: numericKey,
  search: async (query) => {
    if (query.length < 2) return [];
    const hits = await searchPublishedTypesByName(query, HIT_LIMIT);
    return hits.map((hit) => ({ key: String(hit.id), title: hit.name, hint: hit.groupName }));
  },
  load: loadEveType,
  title: (row) => row.name,
  fields: {
    name: { label: 'Name', format: (row) => row.name },
    group: { label: 'Group', format: (row) => row.groupName },
    mass: { label: 'Mass', format: (row) => orDash(row.mass, kg) },
    volume: {
      label: 'Volume',
      format: (row) => orDash(row.volume, (volume) => `${volume.toLocaleString('en-US', { maximumFractionDigits: 2 })} m³`),
    },
    description: { label: 'Description', format: (row) => orDash(row.description, cleanDescription) },
  },
  defaultFields: ['name', 'group', 'mass', 'volume'],
};

export const CODEX_SOURCES = { wormholeType, site, wormholeClass, eveType } satisfies Record<CodexSourceId, unknown>;

type AnySource = CodexSource<unknown>;

function sourceOf(id: CodexSourceId): AnySource {
  return CODEX_SOURCES[id] as unknown as AnySource;
}

function isSourceId(id: string): id is CodexSourceId {
  return Object.hasOwn(CODEX_SOURCES, id);
}

export const loadCodexEntity = cache((source: CodexSourceId, key: string) => sourceOf(source).load(key));

export interface CodexDataBlockAttrs {
  readonly source: string;
  readonly key: string;
  readonly fields: readonly string[];
  readonly layout: CodexDataLayout;
}

export type DataBlockResolution =
  | {
      ok: true;
      source: CodexSourceId;
      key: string;
      layout: CodexDataLayout;
      fields: string[];
      dropped: string[];
      canonicalKey: boolean;
    }
  | { ok: false; reason: 'unknown-source' | 'bad-key' | 'layout-not-offered' | 'no-fields' };

export function resolveDataBlock(attrs: CodexDataBlockAttrs): DataBlockResolution {
  if (!isSourceId(attrs.source)) return { ok: false, reason: 'unknown-source' };
  const source = sourceOf(attrs.source);
  const key = source.parseKey(attrs.key);
  if (key === null) return { ok: false, reason: 'bad-key' };
  if (!source.layouts.includes(attrs.layout)) return { ok: false, reason: 'layout-not-offered' };
  const fields = attrs.fields.filter((field) => Object.hasOwn(source.fields, field));
  if (fields.length === 0 && attrs.layout !== 'card') return { ok: false, reason: 'no-fields' };
  return {
    ok: true,
    source: attrs.source,
    key,
    layout: attrs.layout,
    fields,
    dropped: attrs.fields.filter((field) => !Object.hasOwn(source.fields, field)),
    canonicalKey: key === attrs.key,
  };
}

function viewOf(sourceId: CodexSourceId, fields: readonly string[], row: unknown): CodexDataBlockView {
  const source = sourceOf(sourceId);
  return {
    source: sourceId,
    sourceLabel: source.label,
    provenance: source.provenance,
    icon: source.icon,
    title: source.title(row),
    href: source.href?.(row) ?? null,
    rows: fields.map((field) => {
      const spec = source.fields[field]!;
      return { field, label: spec.label, value: spec.format(row) };
    }),
  };
}

export function formatDataBlock(
  resolution: Extract<DataBlockResolution, { ok: true }>,
  row: unknown,
): CodexDataBlockView {
  return viewOf(resolution.source, resolution.fields, row);
}

export function codexSourceCatalogue(): CodexSourceCatalogue {
  return {
    sources: (Object.keys(CODEX_SOURCES) as CodexSourceId[]).map((id) => {
      const source = sourceOf(id);
      return {
        id,
        label: source.label,
        provenance: source.provenance,
        icon: source.icon,
        layouts: [...source.layouts],
        defaultFields: [...source.defaultFields],
        fields: Object.entries(source.fields).map(([field, spec]) => ({ id: field, label: spec.label })),
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DATA_NODE_TYPES = new Set(['dataBlock', 'dataInline']);

function dataNodeAttrs(node: Record<string, unknown>): CodexDataBlockAttrs | null {
  if (!isRecord(node.attrs)) return null;
  const { source, key, fields = [] } = node.attrs;
  const layout = node.type === 'dataInline' ? 'inline' : node.attrs.layout;
  const strings = typeof source === 'string' && typeof key === 'string' && typeof layout === 'string';
  if (!strings || !Array.isArray(fields) || !fields.every((field) => typeof field === 'string')) return null;
  return { source, key, fields, layout: layout as CodexDataLayout };
}

interface DataNodeAt {
  readonly path: string;
  readonly type: string;
  readonly attrs: CodexDataBlockAttrs;
}

function collectDataNodesFromUntrustedJson(blocks: readonly unknown[]): DataNodeAt[] {
  return findUntrustedNodes(blocks, DATA_NODE_TYPES).flatMap(({ path, node }) => {
    const attrs = dataNodeAttrs(node);
    return attrs ? [{ path, type: node.type, attrs }] : [];
  });
}

async function blockProblems(attrs: CodexDataBlockAttrs): Promise<string[]> {
  const resolution = resolveDataBlock(attrs);
  if (!resolution.ok && resolution.reason === 'unknown-source') {
    return [`source ${JSON.stringify(attrs.source)} is not a Codex data source`];
  }
  const source = sourceOf(attrs.source as CodexSourceId);
  if (!resolution.ok && resolution.reason === 'bad-key') {
    return [`key ${JSON.stringify(attrs.key)} is not a valid ${source.label} key`];
  }
  if (!resolution.ok && resolution.reason === 'layout-not-offered') {
    return [`layout ${JSON.stringify(attrs.layout)} is not offered by ${source.label}`];
  }
  const problems = attrs.fields
    .filter((field) => !Object.hasOwn(source.fields, field))
    .map((field) => `field ${JSON.stringify(field)} is not offered by ${source.label}`);
  if (!resolution.ok) return [...problems, 'no fields were chosen'];
  if (!resolution.canonicalKey) return [`key ${JSON.stringify(attrs.key)} is not a valid ${source.label} key`];
  if (problems.length > 0) return problems;
  const entity = await loadCodexEntity(resolution.source, resolution.key);
  return entity === null ? [`no entity ${JSON.stringify(resolution.key)} in ${source.label}`] : [];
}

export async function codexDataBlockProblems(blocks: readonly unknown[]): Promise<string[]> {
  const perNode = await Promise.all(
    collectDataNodesFromUntrustedJson(blocks).map(async ({ path, type, attrs }) =>
      (await blockProblems(attrs)).map((problem) => `${path} (${type}): ${problem}`),
    ),
  );
  return perNode.flat();
}

export async function searchCodexSource(source: string, query: string): Promise<CodexSourceHit[] | null> {
  if (!isSourceId(source)) return null;
  return query === '' ? [] : sourceOf(source).search(query);
}

export type CodexEntityLookup =
  | { status: 'unknown-source' | 'bad-key' | 'missing' }
  | { status: 'found'; entity: CodexEntity };

export async function resolveCodexEntity(sourceId: string, rawKey: string): Promise<CodexEntityLookup> {
  if (!isSourceId(sourceId)) return { status: 'unknown-source' };
  const source = sourceOf(sourceId);
  const key = source.parseKey(rawKey);
  if (key === null) return { status: 'bad-key' };
  const row = await loadCodexEntity(sourceId, key);
  if (row === null) return { status: 'missing' };
  const view = viewOf(sourceId, Object.keys(source.fields), row);
  return { status: 'found', entity: { key, title: view.title, href: view.href, values: [...view.rows] } };
}
