// Production scanner-paste boundary. Gate-first registered handlers for paste,
// identify, elimination, selection, watch, and purge. Internals live in lib.
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { findMissingSignatures } from '@/data/maps/signature-lifecycle';
import type { Doc } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import {
  requireMapAccess,
  requireMapAccessForUser,
  tryMapAccess,
  tryMapAccessForUser,
} from './lib/mapAccess';
import { requireLiveConnectionOnMap } from './lib/mapConnectionLookup';
import { eventActor } from './mapAuthoring';
import {
  connectionProvenanceValidator,
  scannedKindValidator,
  sigGroupValidator,
} from './lib/mapEntityContracts';
import {
  purgeExpiredSignatures,
  SIGNATURE_PURGE_BATCH,
} from './lib/mapSignatureCleanup';
import {
  MAP_SIGNATURE_PAGE_SIZE,
  readScanState,
  requireBoundedRows,
} from './lib/mapScanState';
import {
  applyScannedRow,
  identifyScannedSignature,
  liveLifecycleRows,
  requireTrackedSystem,
} from './lib/mapScanApply';
import {
  applyEliminationDeductionBatch,
  applyLinkDeduction,
  collectEliminationEvidence,
} from './lib/mapScanElimination';
import {
  changeSignatureSelection,
  removeConfidentRows,
  type SignatureSelectionMode,
} from './lib/mapScanSelection';

export {
  MAP_ELIMINATION_CONNECTION_LIMIT,
  MAP_SCAN_ROW_LIMIT,
  MAP_SIGNATURE_PAGE_SIZE,
} from './lib/mapScanState';

const eliminationDeductionValidator = v.union(
  v.object({
    signatureId: v.string(),
    typeCode: v.string(),
    provenance: v.literal('assumed'),
  }),
  v.object({
    signatureId: v.string(),
    connectionId: v.id('mapConnections'),
    provenance: v.literal('assumed'),
    expectedTypeCode: v.union(v.string(), v.null()),
  }),
);

const eliminationOutcomeValidator = v.object({
  signatureId: v.string(),
  outcome: v.union(
    v.literal('applied'),
    v.literal('unchanged'),
    v.literal('protected'),
    v.literal('stale'),
  ),
  // The row's stable per-hole observation key, so the caller can log or repair
  // the identification this outcome settled. Null when no live row owns one.
  observationKey: v.union(v.string(), v.null()),
});

const eliminationEvidenceValidator = v.object({
  canEdit: v.boolean(),
  signatures: v.array(
    v.object({
      signatureId: v.string(),
      wormholeTypeCode: v.union(v.string(), v.null()),
      typeProvenance: v.union(connectionProvenanceValidator, v.null()),
      observationKey: v.union(v.string(), v.null()),
    }),
  ),
  connections: v.array(
    v.object({
      connectionId: v.id('mapConnections'),
      wormholeTypeCode: v.union(v.string(), v.null()),
      linkedSignature: v.boolean(),
    }),
  ),
});

const scanRowValidator = v.object({
  signatureId: v.string(),
  kind: scannedKindValidator,
  group: v.union(sigGroupValidator, v.null()),
  name: v.union(v.string(), v.null()),
  signalPct: v.union(v.number(), v.null()),
});

/** A complete empty page for a caller without current map access. */
function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}

function boundedPageOptions(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Math.max(1, Math.min(options.numItems, MAP_SIGNATURE_PAGE_SIZE)),
  };
}

/** Reads bounded live endpoint facts for server-owned signature elimination. */
export const eliminationEvidence = internalQuery({
  args: { userId: v.string(), mapId: v.string(), systemId: v.number() },
  returns: eliminationEvidenceValidator,
  handler: async (ctx, { userId, mapId, systemId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return { canEdit: false as const, signatures: [], connections: [] };
    }
    return await collectEliminationEvidence(ctx, mapId, systemId);
  },
});

/** Atomically revalidates and applies one assumed-tier deduction batch. */
export const applyEliminationDeductions = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    systemId: v.number(),
    deductions: v.array(eliminationDeductionValidator),
  },
  returns: v.array(eliminationOutcomeValidator),
  handler: async (ctx, { userId, mapId, systemId, deductions }) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    return await applyEliminationDeductionBatch(ctx, mapId, systemId, deductions);
  },
});

/**
 * Attaches one unresolved scanned stub to a known incoming hallway the
 * operator picked in Leads to. Reuses the elimination link writer so mass,
 * size, and lifetime carry the same way a deduced link would — without
 * inferring which K162 is incoming from that system. A human pick may
 * replace an occupied mouth and restore the previous signature as a stub.
 */
export const linkStubToResolvedConnection = mutation({
  args: {
    mapId: v.string(),
    stubConnectionId: v.id('mapConnections'),
    resolvedConnectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { mapId, stubConnectionId, resolvedConnectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const stub = await requireLiveConnectionOnMap(ctx, mapId, stubConnectionId);
    const target = await requireLiveConnectionOnMap(
      ctx,
      mapId,
      resolvedConnectionId,
    );
    const signatureId = stub.fromSignatureId;
    if (signatureId === undefined) {
      throw new ConvexError({ code: 'UNKNOWN_SIGNATURE' });
    }
    const outcome = await applyLinkDeduction(
      ctx,
      stub,
      target,
      stub.fromSystemId,
      signatureId,
      stub.wormholeTypeCode ?? null,
      true,
    );
    if (outcome.outcome !== 'applied' && outcome.outcome !== 'unchanged') {
      throw new ConvexError({
        code: 'INVALID_REASSOCIATION',
        detail: `Cannot link stub ${stubConnectionId} onto ${resolvedConnectionId}.`,
      });
    }
    return { outcome: outcome.outcome };
  },
});

/** Applies one parsed scan only to the caller's live tracked map system. */
export const applyScan = mutation({
  args: { mapId: v.string(), systemId: v.number(), rows: v.array(scanRowValidator) },
  handler: async (ctx, { mapId, systemId, rows }) => {
    const principal = await requireMapAccess(ctx, mapId, 'edit');
    await requireTrackedSystem(ctx, mapId, systemId, principal.userId);
    const normalizedRows = requireBoundedRows(rows);
    const state = await readScanState(ctx, mapId, systemId);
    const missingRows = findMissingSignatures(
      liveLifecycleRows(state, systemId),
      normalizedRows,
    );
    const now = Date.now();
    const counts = { inserted: 0, updated: 0, unchanged: 0, migrated: 0, conflicted: 0 };

    for (const row of normalizedRows) {
      const outcome = await applyScannedRow(ctx, state, row, mapId, systemId, now);
      counts[outcome] += 1;
    }

    const confident = await removeConfidentRows(
      ctx,
      state,
      missingRows.map((row) => row.signatureId),
      mapId,
      systemId,
      await eventActor(ctx),
      now,
    );
    return {
      ...counts,
      removedConfident: confident.size,
      missing: missingRows
        .map((row) => row.signatureId)
        .filter((signatureId) => !confident.has(signatureId)),
    };
  },
});

/**
 * Identifies one unresolved list row. Wormhole identification reuses the same
 * signature-to-connection convergence path as scanner paste.
 */
export const identifySignature = mutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: sigGroupValidator,
    wormholeTypeCode: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { mapId, systemId, signatureId, group, wormholeTypeCode }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    return await identifyScannedSignature(
      ctx,
      mapId,
      systemId,
      signatureId,
      group,
      wormholeTypeCode,
    );
  },
});

function signatureSelectionMutation(mode: SignatureSelectionMode) {
  return mutation({
    args: { mapId: v.string(), systemId: v.number(), signatureIds: v.array(v.string()) },
    handler: async (ctx, { mapId, systemId, signatureIds }) => {
      await requireMapAccess(ctx, mapId, 'edit');
      return await changeSignatureSelection(ctx, mapId, systemId, signatureIds, mode);
    },
  });
}

/** Tombstones confirmed signature rows for the canonical 24-hour undo window. */
export const removeSignatures = signatureSelectionMutation('remove');

/** Restores selected signature or unresolved-stub tombstones inside the undo window. */
export const restoreSignatures = signatureSelectionMutation('restore');

/** Watches one access-gated page of active signature-list rows for a map. */
export const watchMapSignatures = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return deniedPage<Doc<'mapSignatures'>>();
    const page = await ctx.db
      .query('mapSignatures')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(boundedPageOptions(paginationOpts));
    return { ...page, page: page.page.filter((row) => !isTombstoned(row)) };
  },
});

/** Drains one bounded batch of expired signature tombstones. */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredSignatures(ctx, Date.now()),
});

/** Re-export of the cleanup owner's batch cap. */
export { SIGNATURE_PURGE_BATCH };
