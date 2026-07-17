import { cacheLife, cacheTag } from 'next/cache';
import { esiFetch, esiUrl } from '@/lib/esi';

// Resolve EVE entity ids (characters, corporations) → in-game names through the
// one ESI gate (/universe/names). The merged active-jobs board reads these for
// per-job runner attribution (the installer character) and the corp badge (the
// corporation name) — 3.7.3.4. Entity names live neither in Convex nor the SDE,
// so they are resolved here at view time, like the type-name resolver.

/**
 * Per-id remote cache tag. An entity name is identical for every viewer, so the
 * first lookup of an id serves everyone until the entry expires; the tag lets a
 * future explicit refresh bust exactly one id.
 */
export function entityNameTag(id: number): string {
  return `eve-entity-name-${id}`;
}

// Names change far less than prices; a day's stale-while-revalidate window keeps
// the shared per-IP /universe/names budget cold (SA.3) while still picking up the
// rare rename within a day.
const NAME_CACHE_LIFE = 'days';

// Fan-out cap for cold lookups — bounds how many genuine ESI calls a single
// request can trigger when the cache is cold.
const RESOLVE_CONCURRENCY = 8;

// One coalesced name lookup for a single id, shared across serverless instances
// (`'use cache: remote'` — the live-price coalescer's pattern; plain in-memory
// `use cache` would not persist across requests on Vercel). A length-1 POST
// isolates each id: an unknown id 404s only its own lookup, never poisoning a
// batch.
async function fetchEntityName(id: number): Promise<string | null> {
  'use cache: remote';
  cacheTag(entityNameTag(id));
  cacheLife(NAME_CACHE_LIFE);
  const res = await esiFetch(esiUrl('/universe/names/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([id]),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { category: string; id: number; name: string }[];
  const row = data.find((d) => d.id === id);
  return row && typeof row.name === 'string' ? row.name : null;
}

/**
 * Resolve a batch of entity ids → names (keyed as stringified ids, matching the
 * type-name resolver's wire shape). Deduped; cache hits resolve instantly and
 * cold ids fan out at bounded concurrency. An id that can't be resolved (unknown
 * or a flaky lookup) is simply absent — the board falls back to a generic label.
 */
export async function resolveEntityNames(ids: number[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  const names: Record<string, string> = {};
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(RESOLVE_CONCURRENCY, unique.length) },
    async () => {
      while (cursor < unique.length) {
        const id = unique[cursor++]!; // cursor < unique.length checked in the while condition
        try {
          const name = await fetchEntityName(id);
          if (name !== null) names[String(id)] = name;
        } catch {
          // Best-effort: leave this id unresolved.
        }
      }
    },
  );
  await Promise.all(runners);
  return names;
}
