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
  clearAccessLease,
  putAccessLease,
} from '../characterLocationAccess';
import { applySyncResults, JUMP_CONTINUITY_MS } from '../characterLocationApply';
import { purgeForUser as purgeLocationForUser } from '../characterLocationPurge';
import {
  forViewer as locationForViewer,
  heldState,
} from '../characterLocationReads';
import { syncUser } from '../characterLocationSync';
import convexApp from '../convex.config';
import crons from '../crons';
import {
  chainDispatch as engineChainDispatch,
  heartbeat,
  onSyncComplete as engineOnSyncComplete,
} from '../engine';
import { chainDispatch, onSyncComplete } from '../engineComplete';
import { leave } from '../engineLeave';
import { scan } from '../engineScan';
import { sweep } from '../engineSweep';
import http from '../http';
import { purgeOnline, sweep as httpSweep } from '../httpEngine';
import { jumpEvidence as httpJumpEvidence, resolveJump, signatureElimination } from '../httpJump';
import { leaveSync, purgeLocationTracking } from '../httpLocation';
import { projectMapAccess, purgeMapAccess, purgeMapChain } from '../httpMapAccess';
import { authorizedAction, authorizedJsonAction } from '../lib/httpAuth';
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
import { watchMapAccess } from '../mapChainAccess';
import {
  watchMapConnections,
  watchUnresolvedHoles,
} from '../mapChainConnections';
import { watchMapEvents } from '../mapChainEvents';
import { watchMapSystems } from '../mapChainSystems';
import { upsertUnresolvedHole } from '../mapFixtureHoles';
import { insertNoteFixture } from '../mapFixtureNotes';
import {
  insertConnectionFixture,
  placeJumpFixture,
  placeSystemFixture,
} from '../mapFixturePlace';
import {
  collapseJumpFixture,
  removeConnectionFixture,
  removeSystemFixture,
} from '../mapFixtureRemove';
import {
  recordSignatureSeen,
  setSignatureTombstone,
  upsertSignatureObservation,
} from '../mapFixtureSignatures';
import {
  advanceTrackedLocationFixture,
  clearTrackedCoverage,
  seedTrackedLocationFixture,
} from '../mapFixtureTracking';
import { readMapCollection } from '../mapFixtures';
import { resolveJumpAuthoring } from '../mapJumpAuthoring';
import { connectionEvidence, jumpEvidence } from '../mapJumpEvidence';
import {
  confirmJumpIdentity,
  reassociateJumpDestination,
} from '../mapJumpIdentity';
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
import { trackedCharacterIds } from '../mapTrackingIds';
import { coverage, forMap } from '../mapTrackingLive';
import { setTracking } from '../mapTrackingOptIn';
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
      httpSweep,
      purgeOnline,
      httpJumpEvidence,
      resolveJump,
      signatureElimination,
      leaveSync,
      purgeLocationTracking,
      projectMapAccess,
      purgeMapAccess,
      purgeMapChain,
      authorizedAction,
      authorizedJsonAction,
      JUMP_CONTINUITY_MS,
      syncUser,
      accessLeases,
      applySyncResults,
      clearAccessLease,
      locationForViewer,
      heldState,
      purgeLocationForUser,
      putAccessLease,
      chainDispatch,
      engineChainDispatch,
      heartbeat,
      engineOnSyncComplete,
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
