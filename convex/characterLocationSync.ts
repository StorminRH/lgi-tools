// Tracked-location sync action (4.0.4.2.1) — runs on the DEFAULT Convex runtime
// (no "use node"; the shared ESI gate is runtime-portable). One run refreshes
// location for the caller's tracked characters:
//
//   heldState (system + dual etags) → eve-characters (Neon enumeration) →
//   mapTracking.trackedCharacterIds → poll set = registry ∩ enum →
//   per character: eligibility + token + /location (+ /ship on system change)
//   → ONE applySyncResults mutation.
//
// Throw = transient (network, ESI 5xx, Neon 5xx); everything else becomes a
// recorded per-character or run-level error. The engine chains a dispatch on
// clean-yield success (~5s while watched); the 30s scan is the retry/watchdog.
import { v } from 'convex/values';
import type { EveCharactersResponse } from '@/platform/auth/api-contract';
import {
  parseLocationBody,
  parseShipBody,
  type LocationBody,
} from '@/data/location-tracking/esi-projection';
import { canSyncLocation } from '@/data/location-tracking/sync-eligibility';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { readEsiAuthed, type RlSnapshot } from '@/platform/esi/authed-read';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import {
  fetchEnumeratedCharacters,
  requireSyncEnv,
  resolveExpiresAt,
  type SyncEnv,
  vendCharacterToken,
} from './lib/characterSync';

// Fallback when a response carries no parseable Expires — pegged to the
// verified location cache (5s). The header is preferred whenever present.
const FALLBACK_TTL_MS = 5_000;

type SyncCharacter = EveCharactersResponse['characters'][number];

interface HeldState {
  solarSystemId: number | null;
  etagLocation: string | null;
  etagShip: string | null;
}

interface CharacterResult {
  characterId: number;
  solarSystemId: number | null;
  stationId: number | null;
  structureId: number | null;
  shipTypeId: number | null;
  systemChanged: boolean;
  etagLocation: string | null;
  etagShip: string | null;
  expiresAt: number | null;
  error: string | null;
}

type CharacterOutcome =
  | { kind: 'skip' }
  | { kind: 'result'; result: CharacterResult }
  | { kind: 'stop'; runError: string; result: CharacterResult };

/**
 * Runs the authenticated location sync for one user through the shared Convex
 * engine; the engine owns scheduling and persisted run state.
 */
export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();

    const held = await ctx.runQuery(internal.characterLocation.heldState, { userId });
    const heldByCharacter = new Map(
      held.map((h) => [
        h.characterId,
        {
          solarSystemId: h.solarSystemId,
          etagLocation: h.etagLocation,
          etagShip: h.etagShip,
        },
      ]),
    );
    const characters = await fetchEnumeratedCharacters(env, userId);
    const trackedIds = await ctx.runQuery(internal.mapTracking.trackedCharacterIds, {
      userId,
    });
    const tracked = new Set(trackedIds);
    const pollSet = characters.filter((c) => tracked.has(c.characterId));

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    let runError: string | null = null;

    for (const character of pollSet) {
      const heldState = heldByCharacter.get(character.characterId) ?? {
        solarSystemId: null,
        etagLocation: null,
        etagShip: null,
      };
      const outcome = await syncLocationCharacter(env, userId, character, heldState, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') {
        runError = outcome.runError;
        break;
      }
    }

    await ctx.runMutation(internal.characterLocation.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: characters.map((c) => c.characterId),
      trackedCharacterIds: trackedIds,
      results,
      lastError: runError,
      ...rl,
    });
  },
});

async function syncLocationCharacter(
  env: SyncEnv,
  userId: string,
  character: SyncCharacter,
  held: HeldState,
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  const characterId = character.characterId;
  if (!canSyncLocation(character)) {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', held) };
  }

  const vend = await vendCharacterToken(env, userId, characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', held) };
  }
  if (vend.kind === 'unavailable') {
    return { kind: 'result', result: errorResult(characterId, 'token_unavailable', held) };
  }

  try {
    return {
      kind: 'result',
      result: await readLocationCharacter(characterId, vend.accessToken, held, rl),
    };
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) {
      return {
        kind: 'stop',
        runError: `budget_exhausted:${error.reason}`,
        result: errorResult(characterId, 'budget_exhausted', held),
      };
    }
    throw error;
  }
}

async function readLocationCharacter(
  characterId: number,
  accessToken: string,
  held: HeldState,
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const locationRead = await readEsiAuthed(
    `/characters/${characterId}/location`,
    accessToken,
    held.etagLocation,
    rl,
  );
  if (locationRead.kind === 'error') {
    return errorResult(characterId, locationRead.code, held);
  }

  if (locationRead.kind === 'unchanged') {
    const expiresAt = resolveExpiresAt([locationRead.expiresAt], FALLBACK_TTL_MS, Date.now());
    return {
      characterId,
      solarSystemId: null,
      stationId: null,
      structureId: null,
      shipTypeId: null,
      systemChanged: false,
      etagLocation: held.etagLocation,
      etagShip: held.etagShip,
      expiresAt,
      error: null,
    };
  }

  const location = parseLocationBody(locationRead.body);
  if (location === null) return errorResult(characterId, 'contract_error', held);

  return finishWithOptionalShip(
    characterId,
    accessToken,
    held,
    rl,
    location,
    locationRead.etag,
    locationRead.expiresAt,
  );
}

async function finishWithOptionalShip(
  characterId: number,
  accessToken: string,
  held: HeldState,
  rl: RlSnapshot,
  location: LocationBody,
  etagLocation: string | null,
  locationExpiresAt: number | null,
): Promise<CharacterResult> {
  const systemChanged =
    held.solarSystemId === null || held.solarSystemId !== location.solarSystemId;

  if (!systemChanged) {
    const expiresAt = resolveExpiresAt([locationExpiresAt], FALLBACK_TTL_MS, Date.now());
    return {
      characterId,
      solarSystemId: location.solarSystemId,
      stationId: location.stationId,
      structureId: location.structureId,
      shipTypeId: null,
      systemChanged: false,
      etagLocation,
      etagShip: held.etagShip,
      expiresAt,
      error: null,
    };
  }

  const shipRead = await readEsiAuthed(
    `/characters/${characterId}/ship`,
    accessToken,
    held.etagShip,
    rl,
  );
  if (shipRead.kind === 'error') {
    return errorResult(characterId, shipRead.code, held);
  }

  let shipTypeId: number | null = null;
  let etagShip = held.etagShip;
  let shipExpiresAt: number | null = null;

  if (shipRead.kind === 'unchanged') {
    shipExpiresAt = shipRead.expiresAt;
    // shipTypeId stays null — apply reuses the held doc's shipTypeId.
  } else {
    shipTypeId = parseShipBody(shipRead.body);
    if (shipTypeId === null) return errorResult(characterId, 'contract_error', held);
    etagShip = shipRead.etag;
    shipExpiresAt = shipRead.expiresAt;
  }

  const expiresAt = resolveExpiresAt(
    [locationExpiresAt, shipExpiresAt],
    FALLBACK_TTL_MS,
    Date.now(),
  );
  return {
    characterId,
    solarSystemId: location.solarSystemId,
    stationId: location.stationId,
    structureId: location.structureId,
    shipTypeId,
    systemChanged: true,
    etagLocation,
    etagShip,
    expiresAt,
    error: null,
  };
}

function errorResult(characterId: number, code: string, held: HeldState): CharacterResult {
  return {
    characterId,
    solarSystemId: null,
    stationId: null,
    structureId: null,
    shipTypeId: null,
    systemChanged: false,
    etagLocation: held.etagLocation,
    etagShip: held.etagShip,
    expiresAt: null,
    error: code,
  };
}
