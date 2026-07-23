// The corp-affiliation ESI read (3.7.3.2). PUBLIC bulk endpoint — POST a
// character-id array, get each character's corp/alliance/faction back — so it
// goes through the shared gate as a BARE `esiFetch` with no Authorization header
// (NOT readEsi, which forces a Bearer header and bypasses the shared budget).
// Verified against the live ESI swagger: POST /characters/affiliation/, no scope,
// minItems 1 / maxItems 1000, x-cached-seconds 3600.
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

type AffiliationEntry = z.infer<typeof affiliationEntrySchema>;

function toAffiliationRow(entry: AffiliationEntry): AffiliationRow {
  return {
    characterId: entry.character_id,
    corporationId: entry.corporation_id,
    allianceId: entry.alliance_id ?? null,
    factionId: entry.faction_id ?? null,
  };
}

// One bulk POST for up to 1000 ids. Returns [] for any skippable batch failure —
// a non-ok Response (4xx incl. the all-or-nothing 404 ESI returns when ANY id is
// non-existent), a 5xx, a budget refusal, or contract drift — so a bad batch
// never sinks the others; only an unexpected error rethrows.
async function fetchAffiliationBatch(batch: number[]): Promise<AffiliationRow[]> {
  let res: Response;
  try {
    res = await esiFetch(esiUrl('/characters/affiliation/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch (err) {
    if (err instanceof EsiBudgetExhaustedError || err instanceof EsiServerError) return [];
    throw err;
  }
  if (!res.ok) return [];
  const parsed = affiliationResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.map(toAffiliationRow) : [];
}

/**
 * Fetch affiliations for the given characters. Best-effort and resilient: each
 * batch is independent, and a skipped character simply keeps its prior cached
 * value and is retried on the next trigger.
 */
export async function fetchAffiliations(characterIds: number[]): Promise<AffiliationRow[]> {
  const unique = dedupe(characterIds);
  if (unique.length === 0) return [];

  const out: AffiliationRow[] = [];
  for (const batch of chunk(unique, AFFILIATION_BATCH_MAX)) {
    out.push(...(await fetchAffiliationBatch(batch)));
  }
  return out;
}
