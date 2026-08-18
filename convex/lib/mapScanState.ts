// Shared scan-boundary primitives used by clipboard apply, identify, elimination,
// and selection. Caps and readers live here so those writers share one bound
// and one ScanState shape.
import { ConvexError } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  absorbDoorLeadsNote,
  doorDestination,
} from '@/data/maps/connection-door-destinations';
import { isScannerSignatureId, type ScannedRow } from '@/data/maps/scan-parse';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { CollapsePilotsPresent } from '../mapAuthoring';
import {
  queryMapSignatureActivity,
  queryMapSignatures,
  takeIndexedOrThrow,
} from './indexedQuery';
import { readTouchingConnections } from './mapConnectionLookup';
import { findSystem, requireSystemId } from './mapSystemLookup';
import { readTrackedPilotSystemIds } from '../mapTracking';

/** Maximum rows accepted or read for one system-level scanner transaction. */
export const MAP_SCAN_ROW_LIMIT = 256;

/** Maximum rows returned by one live signature page. */
export const MAP_SIGNATURE_PAGE_SIZE = 100;

/** Maximum hallway rows touching this system one elimination transaction may inspect. */
export const MAP_ELIMINATION_CONNECTION_LIMIT = 128;

/** One system's signatures, touching connections, and activity companions. */
export interface ScanState {
  readonly signatures: Doc<'mapSignatures'>[];
  readonly connections: Doc<'mapConnections'>[];
  readonly activities: Doc<'mapSignatureActivity'>[];
}

/** Rejects an empty, oversized, invalid, or duplicate clipboard paste. */
export function requireBoundedRows(rows: readonly ScannedRow[]): ScannedRow[] {
  if (rows.length === 0 || rows.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'INVALID_SCAN_SIZE',
      detail: `A scan must contain between 1 and ${MAP_SCAN_ROW_LIMIT} rows.`,
    });
  }
  const normalized = rows.map((row) => ({ ...row, signatureId: row.signatureId.trim() }));
  const ids = new Set<string>();
  for (const row of normalized) {
    if (!isScannerSignatureId(row.signatureId)) {
      throw new ConvexError({
        code: 'INVALID_SIGNATURE_ID',
        detail: `Invalid scanner signature ID "${row.signatureId}".`,
      });
    }
    if (ids.has(row.signatureId)) {
      throw new ConvexError({
        code: 'DUPLICATE_SIGNATURE_ID',
        detail: `Signature ${row.signatureId} appears more than once in one paste.`,
      });
    }
    ids.add(row.signatureId);
  }
  return normalized;
}

/** Rejects an empty, oversized, or invalid selected-id list and de-duplicates it. */
export function requireBoundedSignatureIds(signatureIds: readonly string[]): string[] {
  if (signatureIds.length === 0 || signatureIds.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'INVALID_SIGNATURE_SELECTION',
      detail: `Select between 1 and ${MAP_SCAN_ROW_LIMIT} signatures.`,
    });
  }
  const normalized = [...new Set(signatureIds.map((id) => id.trim()))];
  if (normalized.some((id) => !isScannerSignatureId(id))) {
    throw new ConvexError({ code: 'INVALID_SIGNATURE_ID' });
  }
  return normalized;
}

/** Requires the named system to exist and not be tombstoned on this map. */
export async function requireLiveSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  requireSystemId(systemId);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null || isTombstoned(system)) {
    throw new ConvexError({ code: 'UNKNOWN_SYSTEM' });
  }
}

async function readBoundedSignatureRows<T>(
  query: { take: (limit: number) => Promise<T[]> },
  noun: string,
  systemId: number,
): Promise<T[]> {
  return takeIndexedOrThrow(
    query,
    MAP_SCAN_ROW_LIMIT,
    {
      code: 'MAP_SIGNATURE_SCAN_LIMIT',
      detail: `System ${systemId} exceeds the ${MAP_SCAN_ROW_LIMIT}-${noun} scan bound.`,
    },
  );
}

const readSystemSignatures = (ctx: QueryCtx, mapId: string, systemId: number) =>
  readBoundedSignatureRows(
    queryMapSignatures(ctx, mapId, systemId),
    'signature',
    systemId,
  );

const readSystemActivities = (ctx: QueryCtx, mapId: string, systemId: number) =>
  readBoundedSignatureRows(
    queryMapSignatureActivity(ctx, mapId, systemId),
    'activity',
    systemId,
  );

/** Loads one system's bounded signatures, touching connections, and activities. */
export async function readScanState(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<ScanState> {
  const [signatures, connections, activities] = await Promise.all([
    readSystemSignatures(ctx, mapId, systemId),
    readTouchingConnections(ctx, mapId, systemId),
    readSystemActivities(ctx, mapId, systemId),
  ]);
  return { signatures, connections, activities };
}

/** Indexes rows by scanner signature id. */
export function rowMaps<Row extends { signatureId: string }>(
  rows: readonly Row[],
): Map<string, Row> {
  return new Map(rows.map((row) => [row.signatureId, row]));
}

/** Which stored end of the hallway sits in this system, or null if neither. */
export function endpointSide(
  connection: Doc<'mapConnections'>,
  systemId: number,
): 'from' | 'to' | null {
  if (connection.fromSystemId === systemId) return 'from';
  return connection.toSystemId === systemId ? 'to' : null;
}

/** Keep a mismatched typed Leads-to on the mouth being attached. */
export function leadsNotePatch(
  surviving: Doc<'mapConnections'>,
  stubTyped: number | undefined,
  attachedSide: 'from' | 'to',
): Partial<Doc<'mapConnections'>> {
  const survivingTyped = attachedSide === 'from'
    ? surviving.fromDestinationSystemId
    : surviving.toDestinationSystemId;
  const kept = absorbDoorLeadsNote(
    survivingTyped,
    stubTyped,
    doorDestination(surviving.fromSystemId, surviving.toSystemId, attachedSide),
  );
  if (kept === undefined) return {};
  return attachedSide === 'from'
    ? { fromDestinationSystemId: kept }
    : { toDestinationSystemId: kept };
}

/** Whether the requested tombstone or revive would change this row. */
export function needsTombstoneChange(
  row: { readonly deletedAt?: number | null },
  deletedAt: number | null,
): boolean {
  return deletedAt === null ? isTombstoned(row) : !isTombstoned(row);
}

/** Patches one connection's tombstone pair and deletes its activity on remove. */
export async function tombstoneConnectionRow(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'> | undefined,
  activity: Doc<'mapSignatureActivity'> | undefined,
  deletedAt: number | null,
  purgeAfter: number | null,
): Promise<boolean> {
  if (connection === undefined || !needsTombstoneChange(connection, deletedAt)) return false;
  await ctx.db.patch(connection._id, { deletedAt, purgeAfter });
  if (deletedAt !== null && activity !== undefined) await ctx.db.delete(activity._id);
  return true;
}

/** Memoizes the tracked-pilot presence read across one removal transaction. */
export function trackedPresenceReader(
  ctx: MutationCtx,
  mapId: string,
): () => Promise<CollapsePilotsPresent> {
  let held: CollapsePilotsPresent | undefined;
  return async () => {
    held ??= { trackedInSystemIds: await readTrackedPilotSystemIds(ctx, mapId) };
    return held;
  };
}
