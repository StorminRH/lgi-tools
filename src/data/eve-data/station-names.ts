import { and, eq, isNull, sql } from 'drizzle-orm';
import { esiFetch, esiUrl } from '@/lib/esi';
import { eveNpcStations } from './schema';
import type { AnyPgDb } from '@/lib/db-types';


// ESI's /universe/names/ resolves up to 1000 ids per POST.
const NAMES_BATCH = 1000;

// ESI returns the full in-game station name ("Jita IV - Moon 4 - Caldari Navy
// Assembly Plant"), which CCP's SDE record does not carry (it has no celestial
// reference and we ingest neither npcCorporations nor map celestials). We resolve
// it here, through the one ESI gate, and stamp it onto eve_npc_stations.name.
//
// Runs AFTER runIngest commits — so the ESI calls happen with no ingest
// transaction open (the network-outside-a-transaction invariant). Best-effort:
// any failed batch is logged and skipped, leaving those names null; the planner
// falls back to the operation label, so a flaky ESI never fails the pipeline /
// deploy. Only resolves industry-capable stations (the planner's consumers, 2.3k
// of 5.2k → 3 calls) whose name is still null — every row, right after an ingest
// wipe; a no-op otherwise.
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
    // The whole batch (ESI fetch + UPDATE) is best-effort: any failure is logged
    // and skipped so a flaky ESI or transient DB error never fails the pipeline /
    // deploy. The affected names simply stay null and fall back to the operation.
    try {
      const named = await fetchStationNames(batch);
      if (named.length === 0) continue;
      // One UPDATE … FROM (VALUES …) per ESI batch, not per station. The VALUES
      // params arrive untyped (text), so id is cast for the integer join.
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
  // Defensive: keep only station rows (the endpoint echoes a category per id).
  return data
    .filter((d) => d.category === 'station' && typeof d.name === 'string')
    .map((d) => ({ id: d.id, name: d.name }));
}
