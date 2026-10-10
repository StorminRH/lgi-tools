import { deferWork } from '@/lib/deferred-work';
import { int4IdSchema } from '@/lib/id-schemas';
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

/** ESI allows 1000 unique ids per POST, and rejects the whole POST (400) for any id outside int32. */
const NAMES_PER_POST = 1000;

/**
 * One unresolvable id makes ESI answer 404 for its whole batch, and every 4xx
 * spends the shared error budget. A 404 batch is split in halves until its
 * unresolvable ids are found (one bad id among 200 costs about 8 more 404s),
 * and a single resolution may spend at most this many POSTs doing so.
 */
const SPLIT_POST_LIMIT = 25;

type FoundName = EntityNameRow & { name: string };

interface EsiNames {
  found: FoundName[];
  /** Ids ESI answered 404 for on their own: worth remembering as unresolvable. */
  missing: number[];
  /** Ids with no answer this time (budget, outage, split cap): asked again next time. */
  unresolved: number[];
  failure: unknown;
}

interface Resolution {
  names: Record<string, string>;
  /** Ids that came back without a name, for whatever reason. */
  unnamed: number[];
  /** Of those, the ids ESI could not answer for this time and that had no stored name to fall back on. */
  pending: number[];
  failure: unknown;
}

function isResolvableId(id: number): boolean {
  return int4IdSchema.safeParse(id).success;
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

/**
 * Asks ESI for one batch. A 404 batch holds at least one id ESI cannot name, so
 * it is split in halves and each half asked again, down to single ids, which
 * are remembered as unresolvable. Whatever the split budget cannot cover is
 * asked again next time.
 */
async function askBatch(ids: readonly number[], budget: { postsLeft: number }, into: EsiNames): Promise<void> {
  let posted: Awaited<ReturnType<typeof postUniverseNames>>;
  try {
    posted = await postUniverseNames(ids);
  } catch (err) {
    into.unresolved.push(...ids);
    into.failure ??= err;
    return;
  }
  if (posted.ok) {
    absorbBatch(ids, posted.data, into);
    return;
  }
  if (posted.status !== 404) {
    into.unresolved.push(...ids);
    into.failure ??= requestFailure(posted.status);
    return;
  }
  if (ids.length === 1) {
    into.missing.push(ids[0]!);
    return;
  }
  if (budget.postsLeft < 2) {
    into.unresolved.push(...ids);
    return;
  }
  budget.postsLeft -= 2;
  const half = Math.ceil(ids.length / 2);
  await Promise.all([askBatch(ids.slice(0, half), budget, into), askBatch(ids.slice(half), budget, into)]);
}

async function askEsi(ids: readonly number[]): Promise<EsiNames> {
  const result: EsiNames = { found: [], missing: [], unresolved: [], failure: null };
  const budget = { postsLeft: SPLIT_POST_LIMIT };
  for (let i = 0; i < ids.length; i += NAMES_PER_POST) {
    await askBatch(ids.slice(i, i + NAMES_PER_POST), budget, result);
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
  if (toAsk.length === 0) return { names, unnamed, pending: [], failure: null };

  const answers = await askEsi(toAsk);
  for (const row of answers.found) names[String(row.id)] = row.name;
  unnamed.push(...answers.missing);
  // ESI could not answer for these this time: an older stored name (rows are
  // kept 30 days) beats no name, as the per-id cache used to serve stale.
  const pending: number[] = [];
  for (const id of answers.unresolved) {
    const prior = stored.get(id)?.name;
    if (prior != null) names[String(id)] = prior;
    else pending.push(id);
  }
  unnamed.push(...pending);
  await remember(answers);
  return { names, unnamed, pending, failure: answers.failure };
}

/** Names for the ids ESI can resolve; the rest are left out. */
export async function resolveEntityNames(ids: number[]): Promise<Record<string, string>> {
  return (await resolve(ids)).names;
}

/** Names as above, plus the ids ESI could not answer for this time, so a client knows to ask again. */
export async function resolveEntityNamesWithPending(
  ids: number[],
): Promise<{ names: Record<string, string>; pending: number[] }> {
  const { names, pending } = await resolve(ids);
  return { names, pending };
}

/** Names for every id, or a throw when any id cannot be named right now. */
export async function resolveEntityNamesStrict(ids: number[]): Promise<Record<string, string>> {
  const { names, unnamed, failure } = await resolve(ids);
  if (failure !== null) throw failure;
  if (unnamed.length > 0) throw new Error(`EVE entity name missing for ${unnamed[0]}`);
  return names;
}
