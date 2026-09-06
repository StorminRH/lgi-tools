import { cacheLife, cacheTag } from 'next/cache';
import { postUniverseNames } from './universe-names';

function entityNameTag(id: number): string {
  return `eve-entity-name-${id}`;
}

const NAME_CACHE_LIFE = 'days';

const RESOLVE_CONCURRENCY = 8;

async function fetchEntityName(id: number): Promise<string> {
  'use cache: remote';
  cacheTag(entityNameTag(id));
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
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  const names: Record<string, string> = {};
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(RESOLVE_CONCURRENCY, unique.length) },
    async () => {
      while (cursor < unique.length) {
        const id = unique[cursor++]!;
        const name = await resolveOne(id);
        if (name !== null) names[String(id)] = name;
      }
    },
  );
  await Promise.all(runners);
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
