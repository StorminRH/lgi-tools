import { and, eq, isNull, sql } from 'drizzle-orm';
import { esiFetch, esiUrl } from '@/platform/esi';
import { eveNpcStations } from './schema';
import type { AnyPgDb } from '@/lib/db-types';

// ESI's /universe/names/ resolves up to 1000 ids per POST.
const NAMES_BATCH = 1000;

export async function resolveNpcStationNames(db: AnyPgDb): Promise<{ resolved: number }> {
  const rows = await db
    .select({ id: eveNpcStations.id })
    .from(eveNpcStations)
    .where(and(eq(eveNpcStations.industryCapable, true), isNull(eveNpcStations.name)));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { resolved: 0 };

  let resolved = 0;
  for (let i = 0; i < ids.length; i += NAMES_BATCH) {
    const batch = ids.slice(i, i + NAMES_BATCH);

    try {
      const named = await fetchStationNames(batch);
      if (named.length === 0) continue;
      // One UPDATE … FROM (VALUES …) per ESI batch, not per station. The VALUES

      const values = sql.join(
        named.map((n) => sql`(${n.id}, ${n.name})`),
        sql`, `,
      );
      await db.execute(sql`
        UPDATE ${eveNpcStations} AS s
        SET name = v.name
        FROM (VALUES ${values}) AS v(id, name)
        WHERE s.id = v.id::integer
      `);
      resolved += named.length;
    } catch (err) {
      console.warn(
        `Station-name resolution skipped a batch of ${batch.length}: ${String(err)}`,
      );
    }
  }
  return { resolved };
}

async function fetchStationNames(ids: number[]): Promise<{ id: number; name: string }[]> {
  const res = await esiFetch(esiUrl('/universe/names/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ids),
  });
  if (!res.ok) throw new Error(`ESI /universe/names/ ${res.status}`);
  const data = (await res.json()) as { category: string; id: number; name: string }[];

  return data
    .filter((d) => d.category === 'station' && typeof d.name === 'string')
    .map((d) => ({ id: d.id, name: d.name }));
}
