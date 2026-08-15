// Tracked-location sync action (4.0.4.2.1) — runs on the DEFAULT Convex runtime
// (no "use node"; the shared ESI gate is runtime-portable). One run refreshes
// location for the caller's tracked characters:
//
//   heldState (system + dual etags + held online probe) →
//   mapTracking.trackedCharacterIds → access lease (vend only when missing
//   or past Neon's expiresAt) → per character: online probe (held-reuse
//   inside its ~60s window, else conditional /online) →
//   ONLINE: /location (+ /ship on system change); OFFLINE: no location read,
//   the online expiry becomes the character's window → ONE applySyncResults.
//
// The probe is the pause/resume signal: an all-offline run stamps ~60s
// windows and an EMPTY covered set (no location observed — covered is
// continuity evidence, never probe bookkeeping), so the run is chain-
// ineligible and the 30s scan re-arms the subject at the probe window
// instead of the 5s location floor. The next login's probe resumes the fast
// loop automatically.
//
// Throw = transient (network, ESI 5xx, Neon 5xx); the action completes the
// subject as failed (does not rethrow) and the engine schedules a 5s hop
// while presence is fresh. Everything else becomes a recorded per-character
// or run-level error. Clean-yield success still chains (~5s while watched);
// the 30s scan is the backup if a hop never fires.
import { v } from 'convex/values';
import {
  parseLocationBody,
  parseOnlineBody,
  parseShipBody,
  type LocationBody,
} from '@/data/location-tracking/esi-projection';
import {
  decideOnlineProbe,
  type HeldOnlineState,
} from '@/data/location-tracking/online-probe';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { readEsiAuthed, type RlSnapshot } from '@/platform/esi/authed-read';
import { internal } from './_generated/api';
import { internalAction, type ActionCtx } from './_generated/server';
import {
  requireSyncEnv,
  resolveExpiresAt,
  type SyncEnv,
  vendCharacterToken,
} from './lib/characterSync';

// Fallback when a response carries no parseable Expires — pegged to the
// verified location cache (5s). The header is preferred whenever present.
const FALLBACK_TTL_MS = 5_000;

// Fallback for the /online probe — pegged to its verified ~60s cache. Also
// the offline pacing floor: an offline character's window is its online
// expiry, so the subject re-arms at the probe cadence, never the 5s floor.
const ONLINE_FALLBACK_TTL_MS = 60_000;

interface AccessLease {
  accessToken: string;
  expiresAt: number;
}

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
  // Probe outcome. online null = the probe never resolved (per-character
  // error before/at the probe). onlineExpiresAt non-null = a fresh probe read
  // happened and the apply should upsert the held row; null = held-reuse or
  // error, nothing to store.
  online: boolean | null;
  etagOnline: string | null;
  onlineExpiresAt: number | null;
}

// The location/ship half of a result — the probe wrapper stamps the three
// online fields on top, so the read helpers below stay probe-agnostic.
type LocationReadResult = Omit<CharacterResult, 'online' | 'etagOnline' | 'onlineExpiresAt'>;

// What one character's processing resolves to inside the loop: skipped
// silently (unlinked mid-run), a recorded result, or a run-stopping
// protective state (budget exhaustion) carrying its own result row.
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
    let result: { kind: 'success' } | { kind: 'failed'; error: string };
    try {
      await runLocationSync(ctx, userId, generation);
      result = { kind: 'success' };
    } catch (error) {
      result = {
        kind: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await ctx.runMutation(internal.engine.onSyncComplete, {
      workId: String(generation),
      context: { dataset: 'characterLocation', userId },
      result,
    });
  },
});

async function runLocationSync(
  ctx: ActionCtx,
  userId: string,
  generation: number,
): Promise<void> {
  const env = requireSyncEnv();

  const held = await ctx.runQuery(internal.characterLocation.heldState, { userId });
  // The heldState rows already carry exactly the HeldState / HeldOnlineState
  // shapes (plus the key) — index them as-is.
  const heldByCharacter = new Map(held.locations.map((h) => [h.characterId, h]));
  const heldOnlineByCharacter = new Map(held.online.map((h) => [h.characterId, h]));
  const trackedIds = await ctx.runQuery(internal.mapTracking.trackedCharacterIds, {
    userId,
  });
  const leases = await ctx.runQuery(internal.characterLocation.accessLeases, { userId });
  const leaseByCharacter = new Map(leases.map((row) => [row.characterId, row]));
  const now = Date.now();

  const results: CharacterResult[] = [];
  const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
  let runError: string | null = null;

  for (const characterId of trackedIds) {
    const heldState = heldByCharacter.get(characterId) ?? {
      solarSystemId: null,
      etagLocation: null,
      etagShip: null,
    };
    const heldOnline = heldOnlineByCharacter.get(characterId);
    const lease = leaseByCharacter.get(characterId);
    const outcome = await syncLocationCharacter(
      ctx,
      env,
      userId,
      characterId,
      heldState,
      heldOnline,
      lease,
      now,
      rl,
    );
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
    enumeratedCharacterIds: trackedIds,
    trackedCharacterIds: trackedIds,
    results,
    lastError: runError,
    ...rl,
  });
}

async function syncLocationCharacter(
  ctx: ActionCtx,
  env: SyncEnv,
  userId: string,
  characterId: number,
  held: HeldState,
  heldOnline: HeldOnlineState | undefined,
  lease: AccessLease | undefined,
  now: number,
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  let accessToken: string;
  if (lease !== undefined && now < lease.expiresAt) {
    accessToken = lease.accessToken;
  } else {
    const vend = await vendCharacterToken(env, userId, characterId);
    if (vend.kind === 'skip') return { kind: 'skip' };
    if (vend.kind !== 'token') {
      const code = vend.kind === 'reauth' ? 'reauth_required' : 'token_unavailable';
      return { kind: 'result', result: errorResult(characterId, code, held) };
    }
    accessToken = vend.accessToken;
    await ctx.runMutation(internal.characterLocation.putAccessLease, {
      userId,
      characterId,
      accessToken: vend.accessToken,
      expiresAt: vend.expiresAt,
    });
  }

  try {
    const result = await readProbeThenLocation(characterId, accessToken, held, heldOnline, rl);
    if (result.error === 'esi_401' || result.error === 'esi_403') {
      await ctx.runMutation(internal.characterLocation.clearAccessLease, {
        userId,
        characterId,
      });
    }
    return { kind: 'result', result };
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

// The resolved online answer for one character this run. onlineExpiresAt is
// non-null only when a fresh read happened (the apply's upsert gate);
// windowExpiresAt is always the answer's remaining validity — the offline
// character's pacing window.
interface ProbeResolution {
  online: boolean;
  etagOnline: string | null;
  onlineExpiresAt: number | null;
  windowExpiresAt: number;
}

// Probe first, then location only for a pilot who is actually logged in — an
// offline character costs at most one conditional /online per ~60s window
// and never a location/ship read.
async function readProbeThenLocation(
  characterId: number,
  accessToken: string,
  held: HeldState,
  heldOnline: HeldOnlineState | undefined,
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const probe = await resolveOnlineProbe(characterId, accessToken, heldOnline, rl);
  if (typeof probe === 'string') return errorResult(characterId, probe, held);

  if (!probe.online) {
    return {
      characterId,
      solarSystemId: null,
      stationId: null,
      structureId: null,
      shipTypeId: null,
      systemChanged: false,
      etagLocation: held.etagLocation,
      etagShip: held.etagShip,
      // The online expiry IS the offline window: the subject re-arms at the
      // probe cadence and the next login resumes the fast loop.
      expiresAt: probe.windowExpiresAt,
      error: null,
      online: false,
      etagOnline: probe.etagOnline,
      onlineExpiresAt: probe.onlineExpiresAt,
    };
  }

  const result = await readLocationCharacter(characterId, accessToken, held, rl);
  return {
    ...result,
    online: true,
    etagOnline: probe.etagOnline,
    onlineExpiresAt: probe.onlineExpiresAt,
  };
}

// Resolve the online answer: held-reuse inside the window (zero ESI), else a
// conditional read. Returns an error code string on a non-transient failure.
async function resolveOnlineProbe(
  characterId: number,
  accessToken: string,
  heldOnline: HeldOnlineState | undefined,
  rl: RlSnapshot,
): Promise<ProbeResolution | string> {
  const decision = decideOnlineProbe(heldOnline, Date.now());
  if (decision.kind === 'held') {
    return {
      online: decision.online,
      etagOnline: heldOnline?.etagOnline ?? null,
      onlineExpiresAt: null,
      // heldOnline exists by construction of the 'held' decision.
      windowExpiresAt: heldOnline!.onlineExpiresAt,
    };
  }

  const read = await readEsiAuthed(`/characters/${characterId}/online`, accessToken, decision.etagOnline, rl);
  if (read.kind === 'error') return read.code;

  const windowExpiresAt = resolveExpiresAt([read.expiresAt], ONLINE_FALLBACK_TTL_MS, Date.now());
  if (read.kind === 'unchanged') {
    // A 304 should only arrive when we sent the held ETag; a 304 with no held
    // state is a protocol violation from upstream — record it as a contract
    // error for this character rather than failing the whole run.
    if (heldOnline === undefined) return 'contract_error';
    return {
      online: heldOnline.online,
      etagOnline: heldOnline.etagOnline,
      onlineExpiresAt: windowExpiresAt,
      windowExpiresAt,
    };
  }

  const online = parseOnlineBody(read.body);
  if (online === null) return 'contract_error';
  return { online, etagOnline: read.etag, onlineExpiresAt: windowExpiresAt, windowExpiresAt };
}

async function readLocationCharacter(
  characterId: number,
  accessToken: string,
  held: HeldState,
  rl: RlSnapshot,
): Promise<LocationReadResult> {
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
): Promise<LocationReadResult> {
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
    online: null,
    etagOnline: null,
    onlineExpiresAt: null,
  };
}
