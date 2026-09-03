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

const FALLBACK_TTL_MS = 5_000;

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
  online: boolean | null;
  etagOnline: string | null;
  onlineExpiresAt: number | null;
}

type LocationReadResult = Omit<CharacterResult, 'online' | 'etagOnline' | 'onlineExpiresAt'>;

type CharacterOutcome =
  | { kind: 'skip' }
  | { kind: 'result'; result: CharacterResult }
  | { kind: 'stop'; runError: string; result: CharacterResult };

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
    await ctx.runMutation(internal.engineComplete.onSyncComplete, {
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

  const held = await ctx.runQuery(internal.characterLocationReads.heldState, { userId });
  const heldByCharacter = new Map(held.locations.map((h) => [h.characterId, h]));
  const heldOnlineByCharacter = new Map(held.online.map((h) => [h.characterId, h]));
  const trackedIds = await ctx.runQuery(internal.mapTrackingIds.trackedCharacterIds, {
    userId,
  });
  const leases = await ctx.runQuery(internal.characterLocationAccess.accessLeases, { userId });
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

  await ctx.runMutation(internal.characterLocationApply.applySyncResults, {
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
    await ctx.runMutation(internal.characterLocationAccess.putAccessLease, {
      userId,
      characterId,
      accessToken: vend.accessToken,
      expiresAt: vend.expiresAt,
    });
  }

  try {
    const result = await readProbeThenLocation(characterId, accessToken, held, heldOnline, rl);
    if (result.error === 'esi_401' || result.error === 'esi_403') {
      await ctx.runMutation(internal.characterLocationAccess.clearAccessLease, {
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

interface ProbeResolution {
  online: boolean;
  etagOnline: string | null;
  onlineExpiresAt: number | null;
  windowExpiresAt: number;
}

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
      windowExpiresAt: heldOnline!.onlineExpiresAt,
    };
  }

  const read = await readEsiAuthed(`/characters/${characterId}/online`, accessToken, decision.etagOnline, rl);
  if (read.kind === 'error') return read.code;

  const windowExpiresAt = resolveExpiresAt([read.expiresAt], ONLINE_FALLBACK_TTL_MS, Date.now());
  if (read.kind === 'unchanged') {
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
