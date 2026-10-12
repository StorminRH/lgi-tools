import { z } from 'zod';
import { postStoredBatch, type EsiAnswerStamp, type StoredBatchAnswer } from '@/data/esi-store';
import { chunk, dedupe } from '@/lib/array';
import { isTimeoutError } from '@/lib/error-chain';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { AFFILIATION_ROUTE } from './affiliation-key';
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

/** One batch's answer and the characters it covered, so each one's key takes the batch's expiry. */
export interface AffiliationAnswer {
  readonly characterIds: readonly number[];
  readonly stamp: EsiAnswerStamp;
}

export interface AffiliationFetchResult {
  readonly rows: AffiliationRow[];
  readonly transientFailure: boolean;
  readonly answers: readonly AffiliationAnswer[];
}

const NOTHING: AffiliationFetchResult = { rows: [], transientFailure: false, answers: [] };
const TRANSIENT: AffiliationFetchResult = { rows: [], transientFailure: true, answers: [] };

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
    || isTimeoutError(error)
  );
}

function merge(left: AffiliationFetchResult, right: AffiliationFetchResult): AffiliationFetchResult {
  return {
    rows: [...left.rows, ...right.rows],
    transientFailure: left.transientFailure || right.transientFailure,
    answers: [...left.answers, ...right.answers],
  };
}

/** A 200's rows for every id in the batch, under the answer's stamp; a body ESI did not promise is transient. */
async function answeredBatch(batch: number[], answer: StoredBatchAnswer): Promise<AffiliationFetchResult> {
  let body: unknown;
  try {
    body = await answer.res.json();
  } catch {
    return TRANSIENT;
  }
  const parsed = affiliationResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[auth/affiliation-source] ESI contract drift treated as transient');
    return TRANSIENT;
  }
  if (parsed.data.length === 0 && batch.length > 0) return TRANSIENT;
  const returned = new Map(parsed.data.map((entry) => [entry.character_id, entry]));
  return {
    rows: batch.map((id) => {
      const entry = returned.get(id);
      return entry ? toAffiliationRow(entry) : absentAffiliation(id);
    }),
    transientFailure: false,
    answers: [{ characterIds: batch, stamp: answer.stamp }],
  };
}

async function fetchAffiliationBatch(batch: number[]): Promise<AffiliationFetchResult> {
  let answer: StoredBatchAnswer;
  try {
    answer = await postStoredBatch(AFFILIATION_ROUTE, batch);
  } catch (error) {
    if (isTransientFetchFailure(error)) return TRANSIENT;
    throw error;
  }
  const { res } = answer;
  if (res.status === 404) {
    if (batch.length === 1) {
      // A character that does not exist is an answer too: it takes the route's cache time, like any answer with no Expires.
      return { rows: [absentAffiliation(batch[0]!)], transientFailure: false, answers: [{ characterIds: batch, stamp: answer.stamp }] };
    }
    const mid = Math.ceil(batch.length / 2);
    // Halves run in sequence so concurrent 404s cannot overshoot the ESI error floor.
    const left = await fetchAffiliationBatch(batch.slice(0, mid));
    return merge(left, await fetchAffiliationBatch(batch.slice(mid)));
  }
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      console.error('[auth/affiliation-source] ESI client error treated as transient', res.status);
    }
    return TRANSIENT;
  }
  return answeredBatch(batch, answer);
}

export async function fetchAffiliations(
  characterIds: number[],
): Promise<AffiliationFetchResult> {
  const unique =
    process.env.NODE_ENV === 'development'
      ? dedupe(characterIds).filter((id) => id !== SYNTHETIC_PILOT.characterId)
      : dedupe(characterIds);
  if (unique.length === 0) return NOTHING;

  let result = NOTHING;
  for (const batch of chunk(unique, AFFILIATION_BATCH_MAX)) {
    result = merge(result, await fetchAffiliationBatch(batch));
  }
  return result;
}
