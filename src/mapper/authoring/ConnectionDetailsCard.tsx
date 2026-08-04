'use client';

import { useStoreApi } from '@xyflow/react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadWormholeCodex } from '@/data/eve-data/universe-assets-client';
import type { ChainNode } from '../canvas/SystemNode';
import { SYSTEM_DISC_RADIUS } from '../canvas/SystemNode';
import type { ConnectionDetail } from '../chain/use-map-chain';
import { isAdoptedPopupOpen, MapWindow } from '../windows/MapWindow';
import {
  createEdgeFollower,
  type NodeFollowerStore,
} from '../windows/follower-model';
import { keydownAction } from '../windows/window-model';
import {
  ConnectionFields,
  type ConnectionFieldSetters,
} from './connection-fields';

/** Props for the edge-anchored connection details card. */
export interface ConnectionDetailsCardProps {
  readonly connection: ConnectionDetail;
  readonly setters: ConnectionFieldSetters;
  readonly onClose: () => void;
}

function useWormholeTypeCodes(): readonly string[] {
  const [codes, setCodes] = useState<readonly string[]>([]);
  useEffect(() => {
    let alive = true;
    loadWormholeCodex()
      .then((codex) => {
        if (alive) setCodes(codex.codes());
      })
      .catch(() => {
        // Null-degradation: empty suggestions until the memoized loader heals.
      });
    return () => {
      alive = false;
    };
  }, []);
  return codes;
}

/**
 * Edge-anchored card shell: follower + MapWindow around {@link ConnectionFields}.
 * Type search uses the session wormhole codex as vocabulary only — no auto-fill.
 */
export function ConnectionDetailsCard({
  connection,
  setters,
  onClose,
}: ConnectionDetailsCardProps) {
  const store = useStoreApi<ChainNode>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const codes = useWormholeTypeCodes();
  const followerStore = useMemo<NodeFollowerStore>(
    () => ({
      getState: () => store.getState(),
      subscribe: (listener) => store.subscribe(listener),
    }),
    [store],
  );

  useLayoutEffect(() => {
    const element = cardRef.current;
    if (element === null) return;
    return createEdgeFollower(
      followerStore,
      String(connection.fromSystemId),
      String(connection.toSystemId),
      SYSTEM_DISC_RADIUS,
      (transform) => {
        element.style.setProperty('--map-window-transform', transform);
      },
    );
  }, [connection.fromSystemId, connection.toSystemId, followerStore]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const action = keydownAction({
        key: event.key,
        surfaceKind: 'card',
        popupOpen: isAdoptedPopupOpen(),
        defaultPrevented: event.defaultPrevented,
      });
      if (action === 'dismiss-card') onClose();
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [onClose]);

  return (
    <div
      data-map-connection-details
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindow
        ref={cardRef}
        windowId="connection-details"
        title="Connection"
        placement={{
          kind: 'edge-anchored',
          fromSystemId: connection.fromSystemId,
          toSystemId: connection.toSystemId,
        }}
        stackIndex={3}
        onClose={onClose}
        onActivate={() => undefined}
      >
        <ConnectionFields
          connection={connection}
          codes={codes}
          setters={setters}
        />
      </MapWindow>
    </div>
  );
}
