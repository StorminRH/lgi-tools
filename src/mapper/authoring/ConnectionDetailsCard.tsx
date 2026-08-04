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
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
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
  readonly now: number;
  readonly mode: 'edit' | 'restore';
  readonly onSever: () => void;
  readonly onRestore: () => void;
}

function useWormholeCodexState(code: string | null): {
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
} {
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [entry, setEntry] = useState<WormholeCodexEntry | null>(null);

  useEffect(() => {
    let alive = true;
    loadWormholeCodex()
      .then((codex) => {
        if (!alive) return;
        setCodes(codex.codes());
        setEntry(code === null ? null : codex.byCode(code));
      })
      .catch(() => {
        // Null-degradation: empty suggestions / no panel until the loader heals.
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return { codes, entry };
}

/**
 * Edge-anchored card shell: follower + MapWindow around {@link ConnectionFields}.
 * Typed codes resolve through the session wormhole codex for auto-fill and locks.
 */
export function ConnectionDetailsCard({
  connection,
  setters,
  onClose,
  now,
  mode,
  onSever,
  onRestore,
}: ConnectionDetailsCardProps) {
  const store = useStoreApi<ChainNode>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { codes, entry } = useWormholeCodexState(connection.wormholeTypeCode);
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
      data-map-connection-mode={mode}
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindow
        ref={cardRef}
        windowId="connection-details"
        title={mode === 'restore' ? 'Connection · restore' : 'Connection'}
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
          entry={entry}
          setters={setters}
          now={now}
          mode={mode}
          onSever={onSever}
          onRestore={onRestore}
        />
      </MapWindow>
    </div>
  );
}
