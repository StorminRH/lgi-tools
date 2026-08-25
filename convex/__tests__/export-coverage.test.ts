// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest';

vi.mock('convex/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('convex/server')>();
  return {
    ...actual,
    defineApp: () => ({
      use() {
        return this;
      },
    }),
  };
});

import authConfig from '../auth.config';
import {
  accessLeases,
  applySyncResults,
  clearAccessLease,
  forViewer as locationForViewer,
  heldState,
  purgeForUser as purgeLocationForUser,
  putAccessLease,
} from '../characterLocation';
import { syncUser } from '../characterLocationSync';
import convexApp from '../convex.config';
import crons from '../crons';
import {
  chainDispatch,
  heartbeat,
  leave,
  onSyncComplete,
  scan,
  sweep,
} from '../engine';
import http from '../http';
import { requireSyncEnv } from '../lib/characterSync';
import { MAP_CONNECTION_SIGNATURE_SCAN_LIMIT } from '../lib/mapConnectionLookup';
import {
  CONNECTION_MASS_STATES,
  CONNECTION_PROVENANCES,
  NOTE_TARGET_KINDS,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
} from '../lib/mapEntityContracts';
import { purgeUserClaims, reconcileMapClaims } from '../mapAccessProjection';
import {
  restoreSeveredBranch,
  severConnection,
} from '../mapAuthoringCollapse';
import {
  setConnectionDestination,
  setConnectionDestinationHint,
  setConnectionLifeStage,
  setConnectionMassState,
  setConnectionShipSize,
  setConnectionTypedSide,
  setConnectionWormholeType,
} from '../mapAuthoringFields';
import { addSystemFromNode, setHomeSystem, upsertLiveDestination } from '../mapAuthoringHome';
import {
  CEILING_SWEEP_BATCH,
  CEILING_SWEEP_SCAN,
  collapseExpiredConnections,
} from '../mapAuthoringSweep';
import {
  restoreConnection,
  restoreSystem,
  tombstoneConnection,
  tombstoneSystem,
} from '../mapAuthoringTombstone';
import { purgeExpiredChainTombstones } from '../mapChainCleanup';
import {
  watchMapAccess,
  watchMapConnections,
  watchMapEvents,
  watchMapSystems,
  watchUnresolvedHoles,
} from '../mapChain';
import {
  advanceTrackedLocationFixture,
  clearTrackedCoverage,
  collapseJumpFixture,
  insertConnectionFixture,
  insertNoteFixture,
  placeJumpFixture,
  placeSystemFixture,
  readMapCollection,
  recordSignatureSeen,
  removeConnectionFixture,
  removeSystemFixture,
  seedTrackedLocationFixture,
  setSignatureTombstone,
  upsertSignatureObservation,
  upsertUnresolvedHole,
} from '../mapFixtures';
import {
  confirmJumpIdentity,
  connectionEvidence,
  jumpEvidence,
  reassociateJumpDestination,
  resolveJumpAuthoring,
} from '../mapJump';
import { purgeForMap } from '../mapJumpBookkeeping';
import { purgeMapBatch } from '../mapPurge';
import {
  MAP_ELIMINATION_CONNECTION_LIMIT,
  MAP_SCAN_ROW_LIMIT,
  MAP_SIGNATURE_PAGE_SIZE,
  applyEliminationDeductions,
  applyScan,
  eliminationEvidence,
  identifySignature,
  linkStubToResolvedConnection,
  purgeExpiredSignatureTombstones,
  removeSignatures,
  restoreSignatures,
  watchMapSignatures,
} from '../mapScan';
import {
  coverage,
  forMap,
  setTracking,
  trackedCharacterIds,
} from '../mapTracking';
import {
  forViewer as onlineForViewer,
  purgeForUser as purgeOnlineForUser,
} from '../onlineStatus';

describe('convex runtime exports', () => {
  it('keeps leftover files and named wrappers on the test graph', () => {
    const pinned = [
      authConfig,
      convexApp,
      crons,
      http,
      syncUser,
      accessLeases,
      applySyncResults,
      clearAccessLease,
      locationForViewer,
      heldState,
      purgeLocationForUser,
      putAccessLease,
      chainDispatch,
      heartbeat,
      leave,
      onSyncComplete,
      scan,
      sweep,
      requireSyncEnv,
      MAP_CONNECTION_SIGNATURE_SCAN_LIMIT,
      CONNECTION_MASS_STATES,
      CONNECTION_PROVENANCES,
      NOTE_TARGET_KINDS,
      WORMHOLE_DESTINATION_HINTS,
      WORMHOLE_LIFE_STAGES,
      purgeUserClaims,
      reconcileMapClaims,
      CEILING_SWEEP_BATCH,
      CEILING_SWEEP_SCAN,
      addSystemFromNode,
      collapseExpiredConnections,
      purgeExpiredChainTombstones,
      restoreConnection,
      restoreSeveredBranch,
      restoreSystem,
      setConnectionDestination,
      setConnectionDestinationHint,
      setConnectionLifeStage,
      setConnectionMassState,
      setConnectionShipSize,
      setConnectionTypedSide,
      setConnectionWormholeType,
      setHomeSystem,
      severConnection,
      tombstoneConnection,
      tombstoneSystem,
      upsertLiveDestination,
      watchMapAccess,
      watchMapConnections,
      watchMapEvents,
      watchMapSystems,
      watchUnresolvedHoles,
      advanceTrackedLocationFixture,
      clearTrackedCoverage,
      collapseJumpFixture,
      insertConnectionFixture,
      insertNoteFixture,
      placeJumpFixture,
      placeSystemFixture,
      readMapCollection,
      recordSignatureSeen,
      removeConnectionFixture,
      removeSystemFixture,
      seedTrackedLocationFixture,
      setSignatureTombstone,
      upsertSignatureObservation,
      upsertUnresolvedHole,
      confirmJumpIdentity,
      connectionEvidence,
      jumpEvidence,
      reassociateJumpDestination,
      resolveJumpAuthoring,
      purgeForMap,
      purgeMapBatch,
      MAP_ELIMINATION_CONNECTION_LIMIT,
      MAP_SCAN_ROW_LIMIT,
      MAP_SIGNATURE_PAGE_SIZE,
      applyEliminationDeductions,
      applyScan,
      eliminationEvidence,
      identifySignature,
      linkStubToResolvedConnection,
      purgeExpiredSignatureTombstones,
      removeSignatures,
      restoreSignatures,
      watchMapSignatures,
      coverage,
      forMap,
      setTracking,
      trackedCharacterIds,
      onlineForViewer,
      purgeOnlineForUser,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
