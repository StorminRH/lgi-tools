import { cacheLife } from 'next/cache';
import { mapConcurrent } from '@/lib/fan-out';
import { isPositiveSafeInteger } from '@/lib/id-schemas';
import { postUniverseNames } from './universe-names';

const NAME_CACHE_LIFE = 'days';

const RESOLVE_CONCURRENCY = 8;

async function fetchEntityName(id: number): Promise<string> {
  'use cache: remote';
  cacheLife(NAME_CACHE_LIFE);
  const posted = await postUniverseNames([id]);
  if (!posted.ok) throw new Error(`EVE entity name request failed (${posted.status})`);
  const row = posted.data.find(
    (candidate) => candidate.id === id && candidate.name.length > 0,
  );
  if (row === undefined) throw new Error(`EVE entity name missing for ${id}`);
  return row.name;
}

async function resolveEntityNamesBounded(
  ids: number[],
  resolveOne: (id: number) => Promise<string | null>,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(isPositiveSafeInteger);
  const resolved = await mapConcurrent(
    unique,
    RESOLVE_CONCURRENCY,
    async (id) => [id, await resolveOne(id)] as const,
  );
  const names: Record<string, string> = {};
  for (const [id, name] of resolved) {
    if (name !== null) names[String(id)] = name;
  }
  return names;
}

export async function resolveEntityNames(ids: number[]): Promise<Record<string, string>> {
  return resolveEntityNamesBounded(ids, async (id) => {
    try {
      return await fetchEntityName(id);
    } catch {
      return null;
    }
  });
}

export async function resolveEntityNamesStrict(
  ids: number[],
): Promise<Record<string, string>> {
  return resolveEntityNamesBounded(ids, async (id) => {
    return fetchEntityName(id);
  });
}
