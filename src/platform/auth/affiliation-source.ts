import { z } from 'zod';
import { chunk, dedupe } from '@/lib/array';
import { EsiBudgetExhaustedError, EsiServerError, esiFetch, esiUrl } from '@/platform/esi';

const AFFILIATION_BATCH_MAX = 1000;

const LOCAL_SYNTHETIC_CHARACTER_ID = 9_000_001;

const affiliationEntrySchema = z.object({
  character_id: z.number(),
  corporation_id: z.number(),
  alliance_id: z.number().optional(),
  faction_id: z.number().optional(),
});
const affiliationResponseSchema = z.array(affiliationEntrySchema);

export interface AffiliationRow {
  characterId: number;
  corporationId: number;
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

type BatchOutcome =
  | { kind: 'ok'; rows: AffiliationRow[] }
  | { kind: 'completedWithOmissions' }
  | { kind: 'transientFailure' };

function mergeBatchOutcomes(left: BatchOutcome, right: BatchOutcome): BatchOutcome {
  if (left.kind === 'transientFailure' || right.kind === 'transientFailure') {
    return { kind: 'transientFailure' };
  }
  const rows = [
    ...(left.kind === 'ok' ? left.rows : []),
    ...(right.kind === 'ok' ? right.rows : []),
  ];
  if (rows.length > 0) return { kind: 'ok', rows };
  return { kind: 'completedWithOmissions' };
}

async function fetchAffiliationBatch(batch: number[]): Promise<BatchOutcome> {
  let res: Response;
  try {
    res = await esiFetch(esiUrl('/characters/affiliation/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch (err) {
    if (err instanceof EsiBudgetExhaustedError || err instanceof EsiServerError) {
      return { kind: 'transientFailure' };
    }
    throw err;
  }
  if (res.status === 404) {
    if (batch.length <= 1) return { kind: 'completedWithOmissions' };
    const mid = Math.ceil(batch.length / 2);
    const left = await fetchAffiliationBatch(batch.slice(0, mid));
    const right = await fetchAffiliationBatch(batch.slice(mid));
    return mergeBatchOutcomes(left, right);
  }
  if (!res.ok) return { kind: 'transientFailure' };
  const parsed = affiliationResponseSchema.safeParse(await res.json());
  if (!parsed.success) return { kind: 'transientFailure' };
  return { kind: 'ok', rows: parsed.data.map(toAffiliationRow) };
}

export async function fetchAffiliations(
  characterIds: number[],
): Promise<AffiliationFetchResult> {
  const unique =
    process.env.NODE_ENV === 'development'
      ? dedupe(characterIds).filter((id) => id !== LOCAL_SYNTHETIC_CHARACTER_ID)
      : dedupe(characterIds);
  if (unique.length === 0) return { rows: [], transientFailure: false };

  const out: AffiliationRow[] = [];
  let transientFailure = false;
  for (const batch of chunk(unique, AFFILIATION_BATCH_MAX)) {
    const outcome = await fetchAffiliationBatch(batch);
    if (outcome.kind === 'ok') {
      out.push(...outcome.rows);
    } else if (outcome.kind === 'transientFailure') {
      transientFailure = true;
    }
  }
  return { rows: out, transientFailure };
}
