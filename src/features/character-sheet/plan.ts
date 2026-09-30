import { type EsiJournalEntry, parseJournalNewestFirst, parseStructureBody } from './esi-projection';
import type {
  DirectSectionKey,
  DirectSectionSpec,
  JournalDigest,
  JournalSeriesPoint,
  PartEtags,
  SectionEnvelope,
  SectionPlan,
  SectionSyncState,
  SheetEsiRead,
  SheetPart,
  SheetSectionData,
  SheetSectionKey,
  SheetSections,
  StructureName,
} from './types';

const DENIED_CODE = 'esi_403';
const STRUCTURE_HIDDEN_CODES = new Set(['esi_403', 'esi_404']);

const JOURNAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const JOURNAL_SERIES_POINTS = 48;
const JOURNAL_RECENT_ROWS = 20;

function partsOf<K extends DirectSectionKey>(spec: DirectSectionSpec<K>): SheetPart<K>[] {
  return Object.keys(spec.parts) as SheetPart<K>[];
}

function deniedEnvelope<K extends SheetSectionKey>(
  previous: SectionEnvelope<K> | null,
  now: Date,
): SectionEnvelope<K> {
  return {
    data: previous?.data ?? null,
    refreshedAt: now.toISOString(),
    etags: previous?.etags ?? {},
    denied: true,
  };
}

export function planSectionRead<K extends DirectSectionKey>(
  spec: DirectSectionSpec<K>,
  reads: Record<SheetPart<K>, SheetEsiRead>,
  previous: SectionEnvelope<K> | null,
  now: Date,
): SectionPlan<K> {
  const parts = partsOf(spec);
  const errors = parts.flatMap((part) => {
    const read = reads[part];
    return read.kind === 'error' ? [read.code] : [];
  });
  if (errors.includes(DENIED_CODE)) return { kind: 'save', envelope: deniedEnvelope(previous, now) };
  if (errors.length > 0) return { kind: 'skip', code: errors[0] };
  if (spec.key === 'journal' && parts.some((part) => reads[part].kind === 'unchanged')) {
    // Journal reads are unconditional; a bodyless response is a transient upstream failure.
    return { kind: 'skip', code: 'esi_server_error' };
  }
  if (previous?.denied !== true && parts.every((part) => reads[part].kind === 'unchanged')) {
    return { kind: 'stamp' };
  }

  const data: Partial<Record<SheetPart<K>, unknown>> = {};
  const etags: PartEtags<K> = {};
  for (const part of parts) {
    const read = reads[part];
    if (read.kind === 'fresh') {
      const parsed = spec.parts[part].parse(read.body, now);
      if (parsed === null) return { kind: 'skip', code: 'contract_error' };
      data[part] = parsed;
      etags[part] = read.etag;
      continue;
    }
    const carried = previous?.data?.[part];
    if (carried === undefined) return { kind: 'skip', code: 'unchanged_without_previous' };
    data[part] = carried;
    etags[part] = previous?.etags[part] ?? null;
  }
  return {
    kind: 'save',
    envelope: { data: data as SheetSectionData[K], refreshedAt: now.toISOString(), etags },
  };
}

function roundIsk(value: number): number {
  return Math.round(value * 100) / 100;
}

function journalSeries(entries: EsiJournalEntry[], windowStartMs: number, nowMs: number): JournalSeriesPoint[] {
  const bucketMs = Math.max(1, nowMs - windowStartMs) / JOURNAL_SERIES_POINTS;
  const lastPerBucket = new Map<number, JournalSeriesPoint>();
  for (const entry of [...entries].reverse()) {
    if (entry.balance === undefined) continue;
    const t = Date.parse(entry.date);
    if (t < windowStartMs) continue;
    const bucket = Math.min(JOURNAL_SERIES_POINTS - 1, Math.floor((t - windowStartMs) / bucketMs));
    lastPerBucket.set(bucket, { t, balance: entry.balance });
  }
  return [...lastPerBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point);
}

export function digestJournalBody(body: unknown, now: Date): JournalDigest | null {
  const entries = parseJournalNewestFirst(body);
  if (entries === null) return null;
  const nowMs = now.getTime();
  const oldest = entries.at(-1);
  const windowStartMs = Math.max(
    nowMs - JOURNAL_WINDOW_MS,
    oldest === undefined ? Number.NEGATIVE_INFINITY : Date.parse(oldest.date),
  );
  let inflow = 0;
  let outflow = 0;
  for (const entry of entries) {
    if (Date.parse(entry.date) < windowStartMs) continue;
    const amount = entry.amount ?? 0;
    if (amount > 0) inflow += amount;
    else outflow -= amount;
  }
  return {
    windowStart: new Date(windowStartMs).toISOString(),
    inflow: roundIsk(inflow),
    outflow: roundIsk(outflow),
    series: journalSeries(entries, windowStartMs, nowMs),
    recent: entries.slice(0, JOURNAL_RECENT_ROWS).map((entry) => ({
      id: entry.id,
      date: entry.date,
      refType: entry.ref_type,
      amount: entry.amount ?? 0,
      balance: entry.balance ?? null,
      description: entry.description,
    })),
  };
}

export function referencedStructureIds(sheet: SheetSections | null): number[] {
  const ids = new Set<number>();
  const location = sheet?.status?.data?.location;
  if (location?.structureId != null) ids.add(location.structureId);
  const clones = sheet?.clones?.data?.clones;
  if (clones?.home?.locationType === 'structure') ids.add(clones.home.locationId);
  for (const clone of clones?.jumpClones ?? []) {
    if (clone.location.locationType === 'structure') ids.add(clone.location.locationId);
  }
  return [...ids].sort((a, b) => a - b);
}

export function unresolvedStructureIds(sheet: SheetSections | null): number[] {
  const known = sheet?.structures?.data?.names ?? {};
  return referencedStructureIds(sheet).filter((id) => !(String(id) in known));
}

interface StructureResolution {
  readonly name: StructureName | undefined;
  readonly changed: boolean;
  readonly retryCode: string | null;
}

/** One referenced structure's name after its read; null when the body breaks the contract. */
function resolveStructure(
  read: SheetEsiRead | undefined,
  carried: StructureName | undefined,
): StructureResolution | null {
  if (read === undefined) return { name: carried, changed: false, retryCode: null };
  if (read.kind === 'fresh') {
    const parsed = parseStructureBody(read.body);
    return parsed === null ? null : { name: parsed, changed: true, retryCode: null };
  }
  if (read.kind !== 'error') return { name: undefined, changed: false, retryCode: null };
  if (STRUCTURE_HIDDEN_CODES.has(read.code)) {
    return { name: { kind: 'hidden' }, changed: true, retryCode: null };
  }
  return { name: carried, changed: false, retryCode: read.code };
}

interface StructureNames {
  readonly names: Record<string, StructureName>;
  readonly changed: boolean;
  readonly retryCode: string | null;
}

function collectStructureNames(
  referenced: number[],
  previous: SheetSectionData['structures'] | null,
  reads: Map<number, SheetEsiRead>,
): StructureNames | null {
  const names: Record<string, StructureName> = {};
  let changed = false;
  let retryCode: string | null = null;
  for (const id of referenced) {
    const key = String(id);
    const resolved = resolveStructure(reads.get(id), previous?.names[key]);
    if (resolved === null) return null;
    if (resolved.name !== undefined) names[key] = resolved.name;
    changed ||= resolved.changed;
    retryCode = resolved.retryCode ?? retryCode;
  }
  return { names, changed, retryCode };
}

export function planStructures(
  referenced: number[],
  previous: SheetSectionData['structures'] | null,
  reads: Map<number, SheetEsiRead>,
  now: Date,
): SectionPlan<'structures'> {
  const collected = collectStructureNames(referenced, previous, reads);
  if (collected === null) return { kind: 'skip', code: 'contract_error' };
  const { names, changed, retryCode } = collected;
  const pruned = Object.keys(previous?.names ?? {}).some((key) => !(key in names));
  if (!changed && retryCode !== null) return { kind: 'skip', code: retryCode };
  const rowExists = previous !== null;
  const onlyStampNeeded = rowExists && !changed && !pruned;
  if (onlyStampNeeded) return { kind: 'stamp' };
  return { kind: 'save', envelope: { data: { names }, refreshedAt: now.toISOString(), etags: {} } };
}

export function readSectionState<K extends SheetSectionKey>(
  sheet: SheetSections | null,
  key: K,
): SectionSyncState<K> {
  const previous = (sheet?.[key] ?? null) as SectionEnvelope<K> | null;
  const forceStale = key === 'structures' && unresolvedStructureIds(sheet).length > 0;
  return {
    lastRefreshedAt: previous === null || forceStale ? null : new Date(previous.refreshedAt),
    previous,
    heldEtags: previous?.data == null ? {} : previous.etags,
  };
}
