import { z } from 'zod';
import { chunk, dedupe } from '@/lib/array';
import { EsiBudgetExhaustedError, EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { SYNTHETIC_PILOT } from './synthetic-pilot';

const AFFILIATION_BATCH_MAX = 1000;

const affiliationEntrySchema = z.object({
  character_id: z.number(),
  corporation_id: z.number(),
  alliance_id: z.number().optional(),
  faction_id: z.number().optional(),
});
const affiliationResponseSchema = z.array(affiliationEntrySchema);

export interface AffiliationRow {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
}

export interface AffiliationFetchResult {
  readonly rows: AffiliationRow[];
  readonly transientFailure: boolean;
}

type AffiliationEntry = z.infer<typeof affiliationEntrySchema>;

function toAffiliationRow(entry: AffiliationEntry): AffiliationRow {
  return {
    characterId: entry.character_id,
    corporationId: entry.corporation_id,
    allianceId: entry.alliance_id ?? null,
    factionId: entry.faction_id ?? null,
  };
}

function absentAffiliation(characterId: number): AffiliationRow {
  return { characterId, corporationId: null, allianceId: null, factionId: null };
}

function isTransientFetchFailure(error: unknown): boolean {
  return (
    error instanceof EsiBudgetExhaustedError
    || error instanceof EsiServerError
    || error instanceof TypeError
  );
}

async function fetchAffiliationBatch(batch: number[]): Promise<AffiliationFetchResult> {
  let res: Response;
  try {
    res = await esiFetch(esiUrl('/characters/affiliation/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch (error) {
    if (isTransientFetchFailure(error)) {
      return { rows: [], transientFailure: true };
    }
    throw error;
  }
  if (res.status === 404) {
    if (batch.length === 1) {
      return { rows: [absentAffiliation(batch[0]!)], transientFailure: false };
    }
    const mid = Math.ceil(batch.length / 2);
    const left = await fetchAffiliationBatch(batch.slice(0, mid));
    const right = await fetchAffiliationBatch(batch.slice(mid));
    return {
      rows: [...left.rows, ...right.rows],
      transientFailure: left.transientFailure || right.transientFailure,
    };
  }
  if (!res.ok) return { rows: [], transientFailure: true };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { rows: [], transientFailure: true };
  }
  const parsed = affiliationResponseSchema.safeParse(body);
  if (!parsed.success) return { rows: [], transientFailure: true };
  const returned = new Map(parsed.data.map((entry) => [entry.character_id, entry]));
  return {
    rows: batch.map((id) => {
      const entry = returned.get(id);
      return entry ? toAffiliationRow(entry) : absentAffiliation(id);
    }),
    transientFailure: false,
  };
}

export async function fetchAffiliations(
  characterIds: number[],
): Promise<AffiliationFetchResult> {
  const unique =
    process.env.NODE_ENV === 'development'
      ? dedupe(characterIds).filter((id) => id !== SYNTHETIC_PILOT.characterId)
      : dedupe(characterIds);
  if (unique.length === 0) return { rows: [], transientFailure: false };

  const out: AffiliationRow[] = [];
  let transientFailure = false;
  for (const batch of chunk(unique, AFFILIATION_BATCH_MAX)) {
    const outcome = await fetchAffiliationBatch(batch);
    out.push(...outcome.rows);
    transientFailure ||= outcome.transientFailure;
  }
  return { rows: out, transientFailure };
}
