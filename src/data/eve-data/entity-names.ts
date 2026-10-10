import { deferWork } from '@/lib/deferred-work';
import { mapConcurrent } from '@/lib/fan-out';
import {
  readStoredEntityNames,
  storeEntityNames,
  type EntityNameRow,
  type StoredEntityName,
} from './entity-names-store';
import { postUniverseNames, type UniverseNameRow } from './universe-names';

/** How long a stored name is reused before ESI is asked again; pilots and corporations can be renamed. */
const FOUND_NAME_REUSE_MS = 7 * 24 * 60 * 60 * 1000;
/** How long an id ESI could not resolve is left alone before it is tried again. */
const MISSING_NAME_REUSE_MS = 6 * 60 * 60 * 1000;

/** ESI rejects the whole POST (400) for any id outside int32, and allows 1000 unique ids per POST. */
const ESI_ID_MAX = 2_147_483_647;
const NAMES_PER_POST = 1000;

/**
 * One unresolvable id makes ESI answer 404 for its whole batch, and every 4xx
 * spends the shared error budget. Finding the bad ids costs one POST per id,
 * so a single resolution may only spend this many.
 */
const PER_ID_FALLBACK_LIMIT = 25;
const PER_ID_CONCURRENCY = 8;

type FoundName = EntityNameRow & { name: string };

interface EsiNames {
  found: FoundName[];
  /** Ids ESI answered 404 for on their own: worth remembering as unresolvable. */
  missing: number[];
  /** Ids with no answer this time (budget, outage, fallback cap): asked again next time. */
  unresolved: number[];
  failure: unknown;
}

interface Resolution {
  names: Record<string, string>;
  /** Ids that came back without a name, for whatever reason. */
  unnamed: number[];
  failure: unknown;
}

function isResolvableId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= ESI_ID_MAX;
}

function isFresh(stored: StoredEntityName, now: number): boolean {
  const reuseMs = stored.name === null ? MISSING_NAME_REUSE_MS : FOUND_NAME_REUSE_MS;
  return now - stored.resolvedAt.getTime() < reuseMs;
}

function requestFailure(status: number): Error {
  return new Error(`EVE entity name request failed (${status})`);
}

async function readStored(ids: readonly number[]): Promise<Map<number, StoredEntityName>> {
  try {
    return await readStoredEntityNames(ids);
  } catch (err) {
    console.warn('[entity-names] stored names unavailable; asking ESI', err);
    return new Map();
  }
}

/** Asks ESI for each id alone, to tell the unresolvable ids in a 404 batch from the rest. */
async function resolveOneByOne(ids: readonly number[], into: EsiNames): Promise<void> {
  await mapConcurrent(ids, PER_ID_CONCURRENCY, async (id) => {
    try {
      const posted = await postUniverseNames([id]);
      const row = posted.ok ? posted.data.find((candidate) => candidate.id === id && candidate.name.length > 0) : undefined;
      if (row !== undefined) into.found.push({ id, name: row.name, category: row.category });
      else if (!posted.ok && posted.status === 404) into.missing.push(id);
      else {
        into.unresolved.push(id);
        into.failure ??= posted.ok ? new Error(`EVE entity name missing for ${id}`) : requestFailure(posted.status);
      }
    } catch (err) {
      into.unresolved.push(id);
      into.failure ??= err;
    }
  });
}

/** Files a successful batch answer: every asked id either came back named or is left for next time. */
function absorbBatch(chunk: readonly number[], data: readonly UniverseNameRow[], into: EsiNames): void {
  const byId = new Map(data.filter((row) => row.name.length > 0).map((row) => [row.id, row]));
  for (const id of chunk) {
    const row = byId.get(id);
    if (row !== undefined) {
      into.found.push({ id, name: row.name, category: row.category });
    } else {
      into.unresolved.push(id);
      into.failure ??= new Error(`EVE entity name missing for ${id}`);
    }
  }
}

/** Asks ESI for one batch; returns how many one-at-a-time retries it spent. */
async function askChunk(chunk: readonly number[], fallbackLeft: number, into: EsiNames): Promise<number> {
  let posted: Awaited<ReturnType<typeof postUniverseNames>>;
  try {
    posted = await postUniverseNames(chunk);
  } catch (err) {
    into.unresolved.push(...chunk);
    into.failure ??= err;
    return 0;
  }
  if (posted.ok) {
    absorbBatch(chunk, posted.data, into);
    return 0;
  }
  if (posted.status !== 404) {
    into.unresolved.push(...chunk);
    into.failure ??= requestFailure(posted.status);
    return 0;
  }
  if (chunk.length === 1) {
    into.missing.push(chunk[0]!);
    return 0;
  }
  const retry = chunk.slice(0, fallbackLeft);
  into.unresolved.push(...chunk.slice(retry.length));
  await resolveOneByOne(retry, into);
  return retry.length;
}

async function askEsi(ids: readonly number[]): Promise<EsiNames> {
  const result: EsiNames = { found: [], missing: [], unresolved: [], failure: null };
  let fallbackLeft = PER_ID_FALLBACK_LIMIT;
  for (let i = 0; i < ids.length; i += NAMES_PER_POST) {
    fallbackLeft -= await askChunk(ids.slice(i, i + NAMES_PER_POST), fallbackLeft, result);
  }
  return result;
}

/** Records ESI's answers after the response, so the next resolution reads them instead of asking again. */
function remember(answers: EsiNames): Promise<void> {
  const rows: EntityNameRow[] = [
    ...answers.found,
    ...answers.missing.map((id) => ({ id, name: null, category: null })),
  ];
  if (rows.length === 0) return Promise.resolve();
  return deferWork(async () => {
    try {
      await storeEntityNames(rows, new Date());
    } catch (err) {
      console.warn('[entity-names] could not store resolved names', err);
    }
  });
}

async function resolve(ids: readonly number[]): Promise<Resolution> {
  const unique = [...new Set(ids)];
  const resolvable = unique.filter(isResolvableId);
  const names: Record<string, string> = {};
  const unnamed: number[] = unique.filter((id) => !isResolvableId(id));

  const stored = await readStored(resolvable);
  const now = Date.now();
  const toAsk: number[] = [];
  for (const id of resolvable) {
    const hit = stored.get(id);
    if (hit === undefined || !isFresh(hit, now)) toAsk.push(id);
    else if (hit.name === null) unnamed.push(id);
    else names[String(id)] = hit.name;
  }
  if (toAsk.length === 0) return { names, unnamed, failure: null };

  const answers = await askEsi(toAsk);
  for (const row of answers.found) names[String(row.id)] = row.name;
  unnamed.push(...answers.missing, ...answers.unresolved);
  await remember(answers);
  return { names, unnamed, failure: answers.failure };
}

/** Names for the ids ESI can resolve; the rest are left out. */
export async function resolveEntityNames(ids: number[]): Promise<Record<string, string>> {
  return (await resolve(ids)).names;
}

/** Names for every id, or a throw when any id cannot be named right now. */
export async function resolveEntityNamesStrict(ids: number[]): Promise<Record<string, string>> {
  const { names, unnamed, failure } = await resolve(ids);
  if (failure !== null) throw failure;
  if (unnamed.length > 0) throw new Error(`EVE entity name missing for ${unnamed[0]}`);
  return names;
}
