'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/data/convex/api';
import type { Doc } from '@/data/convex/data-model';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import { useLiveValue } from '@/data/convex/use-live-value';
import { chainTombstoneState } from '@/data/maps/chain-contract';
import { doorHint } from '@/data/maps/connection-hallway';
import {
  destinationClassIdForCode,
  useSystemStaticSlots,
} from '../signatures/use-system-statics';
import { filterLivePages } from './chain-signature';
import {
  connectionDetailsFromRows,
  unresolvedHolesFromRows,
} from './connection-detail';
import { planStubNodes } from './nodes';
import { accountedStubLayoutRows, stubLayoutRows } from './stub-layout';

const PAGE_SIZE = 100;
const EMPTY_MAP_EVENTS: readonly Doc<'mapEvents'>[] = [];
const TOMBSTONE_TICK_MS = 60_000;

export type MapAccessState = boolean | undefined;

export interface NormalizedMapAccess {
  readonly access: MapAccessState;
  readonly canEdit: boolean | undefined;
}

export function normalizeMapAccess(
  result: { readonly granted: boolean; readonly canEdit: boolean } | undefined,
): NormalizedMapAccess {
  if (result === undefined) return { access: undefined, canEdit: undefined };
  return { access: result.granted, canEdit: result.canEdit };
}

function mapSubscriptionArgs(mapId: string | null): 'skip' | { mapId: string } {
  if (mapId === null) return 'skip';
  return { mapId };
}

export function useMapChainPages(mapId: string | null) {
  const args = mapSubscriptionArgs(mapId);
  const accessResult = useLiveValue(api.mapChainAccess.watchMapAccess, args);
  const { access, canEdit } = normalizeMapAccess(accessResult);

  const subscribedSystems = useDrainedPages(
    api.mapChainSystems.watchMapSystems,
    args,
    PAGE_SIZE,
  );
  const subscribedConnections = useDrainedPages(
    api.mapChainConnections.watchMapConnections,
    args,
    PAGE_SIZE,
  );
  const subscribedUnresolved = useDrainedPages(
    api.mapChainConnections.watchUnresolvedHoles,
    args,
    PAGE_SIZE,
  );
  const subscribedEvents = useLiveValue(api.mapChainEvents.watchMapEvents, args);
  const systems = useMemo(
    () =>
      filterLivePages({
        rows: subscribedSystems.rows,
        complete: subscribedSystems.complete,
      }),
    [subscribedSystems.rows, subscribedSystems.complete],
  );
  const connections = subscribedConnections;
  const events = subscribedEvents ?? EMPTY_MAP_EVENTS;
  const connectionDetails = useMemo(
    () => connectionDetailsFromRows(connections.rows),
    [connections.rows],
  );
  const unresolvedHoles = useMemo(
    () => unresolvedHolesFromRows(subscribedUnresolved.rows),
    [subscribedUnresolved.rows],
  );
  const scannedStubLayout = useMemo(
    () => stubLayoutRows(unresolvedHoles, systems.rows, connections.rows),
    [unresolvedHoles, systems.rows, connections.rows],
  );
  const authoredKey = systems.rows.map((row) => row.systemId).join(',');
  const staticSlots = useSystemStaticSlots(authoredKey);
  const plannedStubs = useMemo(
    () => planStubNodes({
      systemIds: systems.rows.map((row) => row.systemId),
      signatures: scannedStubLayout.flatMap((row) => {
        const signatureId = row.from.signatureId;
        if (signatureId === null) return [];
        return [{
          connectionId: row.connectionId,
          fromSystemId: row.fromSystemId,
          signatureId,
          wormholeTypeCode: row.from.typeCode,
          destinationHint: doorHint(row.from),
          whClassId: row.from.typeCode === null
            ? null
            : destinationClassIdForCode(row.from.typeCode, staticSlots.codex),
        }];
      }),
      connections: connections.rows,
      staticsBySystem: staticSlots.bySystem,
      rootSystemId: systems.rows[0]?.systemId ?? null,
    }),
    [systems.rows, scannedStubLayout, connections.rows, staticSlots],
  );
  const stubLayout = useMemo(
    () => accountedStubLayoutRows(plannedStubs, scannedStubLayout),
    [plannedStubs, scannedStubLayout],
  );

  return {
    access,
    authoredKey,
    canEdit,
    connectionDetails,
    connections,
    events,
    stubLayout,
    systems,
    unresolvedHoles,
  };
}

export type MapChainPages = ReturnType<typeof useMapChainPages>;

export function useConnectionPresentationNow(
  connections: MapChainPages['connections'],
) {
  const [connectionPresentationNow, setConnectionPresentationNow] = useState(
    () => Date.now(),
  );
  const hasDyingConnection = connections.rows.some(
    (row) => chainTombstoneState(row, connectionPresentationNow) === 'dying',
  );

  useEffect(() => {
    if (!hasDyingConnection) return;
    const timer = window.setInterval(
      () => setConnectionPresentationNow(Date.now()),
      TOMBSTONE_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [hasDyingConnection]);

  return connectionPresentationNow;
}
