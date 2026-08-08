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
import type { ConnectionDetail } from '../chain/use-map-chain';
import { isAdoptedPopupOpen, MapWindow } from '../windows/MapWindow';
import {
  createEdgeFollower,
  type NodeFollowerStore,
} from '../windows/follower-model';
import {
  MapWindowLeader,
  type MapWindowLeaderHandle,
} from '../windows/MapWindowLeader';
import {
  isOutsideClickGesture,
  keydownAction,
  outsideDismissAction,
} from '../windows/window-model';
import {
  ConnectionFields,
  type ConnectionFieldSetters,
  type ConnectionResolutionControls,
} from './connection-fields';

/** Props for the edge-anchored connection details card. */
export interface ConnectionDetailsCardProps {
  readonly connection: ConnectionDetail;
  readonly setters: ConnectionFieldSetters;
  readonly onClose: () => void;
  readonly now: number;
  readonly mode: 'edit' | 'restore';
  /** Present while this row's assumed auto-link is still answerable. */
  readonly resolutionControls?: ConnectionResolutionControls;
  readonly onSever: () => void;
  readonly onRestore: () => void;
}

function useWormholeCodexState(code: string | null): {
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly codexReady: boolean;
} {
  const [codex, setCodex] = useState<Awaited<
    ReturnType<typeof loadWormholeCodex>
  > | null>(null);

  useEffect(() => {
    if (codex !== null) return;
    let alive = true;
    // The memoized loader clears itself on failure, so this effect re-attempts
    // on the next code change instead of wedging on one failed fetch.
    loadWormholeCodex()
      .then((loaded) => {
        if (alive) setCodex(loaded);
      })
      .catch(() => {
        // Degraded: no suggestions or codex panel; the type field falls back
        // to lenient syntactic parsing and the server stays the authority.
      });
    return () => {
      alive = false;
    };
  }, [codex, code]);

  // Derived during render: a code switch can never show the prior code's facts.
  return {
    codes: codex?.codes() ?? [],
    entry: codex === null || code === null ? null : codex.byCode(code),
    codexReady: codex !== null,
  };
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
  resolutionControls,
  onSever,
  onRestore,
}: ConnectionDetailsCardProps) {
  const store = useStoreApi<ChainNode>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const leaderRef = useRef<MapWindowLeaderHandle | null>(null);
  const { codes, entry, codexReady } = useWormholeCodexState(
    connection.wormholeTypeCode,
  );
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
      element,
      (payload) => {
        const leader = leaderRef.current;
        if (leader !== null) {
          leader.apply(element, payload);
          return;
        }
        element.style.setProperty('--map-window-transform', payload.transform);
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

  // Dismiss only on a true outside click (down+up, little movement). Pan/drag
  // on the map must leave the connection card open.
  useEffect(() => {
    let down: {
      readonly x: number;
      readonly y: number;
      readonly pointerId: number;
    } | null = null;

    const clearDown = () => {
      down = null;
    };

    const containment = (target: EventTarget | null) => {
      const card = cardRef.current;
      return {
        insideCard:
          card !== null && target instanceof Node && card.contains(target),
        insideOpenPopup:
          target instanceof Element && target.closest('[data-open]') !== null,
        popupOpen: isAdoptedPopupOpen(),
      };
    };

    const handlePointerDown = (event: PointerEvent) => {
      // Arm only when a click here would be eligible to dismiss — ignore starts
      // on the card or an open popup so we never close on a later up elsewhere.
      const action = outsideDismissAction({
        ...containment(event.target),
        isClick: true,
      });
      if (action !== 'dismiss-card') {
        clearDown();
        return;
      }
      down = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (down === null || event.pointerId !== down.pointerId) return;
      const start = down;
      clearDown();
      const action = outsideDismissAction({
        ...containment(event.target),
        isClick: isOutsideClickGesture(start, {
          x: event.clientX,
          y: event.clientY,
        }),
      });
      if (action === 'dismiss-card') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', clearDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', clearDown);
    };
  }, [onClose]);

  return (
    <div
      data-map-connection-details
      data-map-connection-mode={mode}
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindowLeader ref={leaderRef} />
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
        showCloseButton={false}
        onActivate={() => undefined}
      >
        <ConnectionFields
          connection={connection}
          codes={codes}
          codexReady={codexReady}
          entry={entry}
          setters={setters}
          now={now}
          mode={mode}
          resolutionControls={resolutionControls}
          onSever={onSever}
          onRestore={onRestore}
        />
      </MapWindow>
    </div>
  );
}
