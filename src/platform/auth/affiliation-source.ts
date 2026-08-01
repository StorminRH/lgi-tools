// The corp-affiliation ESI read (3.7.3.2). PUBLIC bulk endpoint — POST a
// character-id array, get each character's corp/alliance/faction back — so it
// goes through the shared gate as a BARE `esiFetch` with no Authorization header
// (NOT readEsi, which forces a Bearer header and bypasses the shared budget).
// Verified against the live ESI swagger: POST /characters/affiliation/, no scope,
// minItems 1 / maxItems 1000, x-client-cache-ttl 3600.
//
// POST is not ETag/window-cacheable in the gate (isEtagEligible is GET-only), so
// each call dispatches — but the gate still enforces the shared per-IP budget,
// and the Neon affiliation cache (TTL ≈ 1h) is what actually absorbs reads, so
// these calls stay rare. Versionless via esiUrl(path) + the gate's pinned
// X-Compatibility-Date header.
import { z } from 'zod';
import { chunk, dedupe } from '@/lib/array';
import { EsiBudgetExhaustedError, EsiServerError, esiFetch, esiUrl } from '@/platform/esi';

// ESI's per-request id cap (maxItems). One bulk call covers up to 1000 chars.
const AFFILIATION_BATCH_MAX = 1000;

// Boundary schema — corp id is required, alliance/faction are present only when
// the corp is in an alliance/militia. z.object ignores unknown keys, so an
// upstream field addition can't break parsing.
const affiliationEntrySchema = z.object({
  character_id: z.number(),
  corporation_id: z.number(),
  alliance_id: z.number().optional(),
  faction_id: z.number().optional(),
});
const affiliationResponseSchema = z.array(affiliationEntrySchema);

/**
 * Display-ready affiliation row produced by auth; values retain their domain units and require no
 * additional query by the renderer.
 */
export interface AffiliationRow {
  characterId: number;
  corporationId: number;
  allianceId: number | null;
  factionId: number | null;
}

/**
 * Aggregate ESI affiliation fetch outcome. A single-id 404 is definitive (the
 * character no longer exists). Multi-id 404s are bisected so live characters in
 * the same batch still refresh; thrown/5xx/budget refusals and unreadable bodies
 * are transient.
 */
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

// One bulk POST for up to 1000 ids. Classifies ESI outcomes so callers can tell
// a definitive deleted-id 404 from a retryable outage. ESI 404s the whole batch
// when ANY id is deleted — bisect until single-id omissions are isolated.
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

/**
 * Fetch affiliations for the given characters. Each batch is independent: a
 * definitive deleted-id 404 contributes no row for that id (and is bisected out
 * of mixed batches) without marking the aggregate transient; a 5xx/budget
 * refusal or unreadable body sets `transientFailure` so projection can refuse
 * to converge on a silently shrunken set.
 */
export async function fetchAffiliations(
  characterIds: number[],
): Promise<AffiliationFetchResult> {
  const unique = dedupe(characterIds);
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
