'use client';

import { useStore, useStoreApi } from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChainNode } from '../canvas/SystemNode';
import { createNodeFollower, type NodeFollowerStore } from './follower-model';
import { isAdoptedPopupOpen, MapWindow } from './MapWindow';
import {
  MapWindowLeader,
  type MapWindowLeaderHandle,
} from './MapWindowLeader';
import {
  bringToFront,
  deriveSurfaces,
  keydownAction,
  reconcileStack,
  type MapWindowId,
} from './window-model';
import { useNodeDataString } from './node-fields';
import {
  SystemIntelligenceBody,
  SystemTitleAccessory,
} from './SystemIntelligenceBody';

const subscribeMounted = () => () => undefined;
const clientMountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

function sameStack(a: readonly MapWindowId[], b: readonly MapWindowId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameSelectedIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Selected system ids — equality-stable across position-only node updates. */
function useSelectedSystemIds(): readonly number[] {
  return useStore(
    (state) =>
      state.nodes
        .filter((node) => node.selected)
        .map((node) => Number(node.id)),
    sameSelectedIds,
  );
}

/** One node's display name; position-only updates leave the string identity stable. */
function useNodeName(systemId: number | null): string | undefined {
  return useNodeDataString(systemId, 'name') ?? undefined;
}

function useSurfacePresence(input: {
  readonly dockSystemId: number | null;
  readonly boxSelectActive: boolean;
  readonly selectedIds: readonly number[];
}) {
  const derivation = deriveSurfaces({
    dockSystemId: input.dockSystemId,
    selectedIds: input.selectedIds,
    boxSelectActive: input.boxSelectActive,
  });

  return {
    liveIds: derivation.surfaces,
    summarySystemId: derivation.summarySystemId,
  };
}

function useWindowStack(liveIds: readonly MapWindowId[]) {
  const [stack, setStack] = useState<readonly MapWindowId[]>([]);
  const renderedStack = reconcileStack(stack, liveIds);
  if (!sameStack(stack, renderedStack)) setStack(renderedStack);

  const activate = useCallback(
    (id: MapWindowId) => {
      setStack((current) => bringToFront(reconcileStack(current, liveIds), id));
    },
    [liveIds],
  );

  return { renderedStack, activate };
}

function useNodeFollower(
  store: NodeFollowerStore,
  summaryId: number | null,
  cardRef: React.RefObject<HTMLDivElement | null>,
  leaderRef: React.RefObject<MapWindowLeaderHandle | null>,
): void {
  useLayoutEffect(() => {
    const element = cardRef.current;
    const leader = leaderRef.current;
    if (summaryId === null || element === null) {
      leader?.hide();
      return;
    }
    const dispose = createNodeFollower(
      store,
      String(summaryId),
      element,
      (payload) => {
        const liveLeader = leaderRef.current;
        if (liveLeader !== null) {
          liveLeader.apply(element, payload);
          return;
        }
        element.style.setProperty('--map-window-transform', payload.transform);
      },
    );
    return () => {
      dispose();
      leader?.hide();
    };
  }, [cardRef, leaderRef, store, summaryId]);
}

function useCardDismissal(cardOpen: boolean, onDeselect: () => void): void {
  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!cardOpen) return;
      const action = keydownAction({
        key: event.key,
        surfaceKind: 'card',
        popupOpen: isAdoptedPopupOpen(),
        defaultPrevented: event.defaultPrevented,
      });
      if (action === 'dismiss-card') onDeselect();
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [cardOpen, onDeselect]);
}

function dockTitle(title: string | undefined, dockSystemId: number): string {
  return title ?? String(dockSystemId);
}

function DockSurface({
  visible,
  dockSystemId,
  title,
  stackIndex,
}: {
  readonly visible: boolean;
  readonly dockSystemId: number | null;
  readonly title: string | undefined;
  readonly stackIndex: number;
}) {
  if (!visible || dockSystemId === null) return null;
  return (
    <MapWindow
      windowId="dock"
      title={dockTitle(title, dockSystemId)}
      titleAccessory={<SystemTitleAccessory systemId={dockSystemId} />}
      placement={{ kind: 'docked' }}
      appearance="overlay"
      stackIndex={stackIndex}
      showCloseButton={false}
      onClose={() => undefined}
      // Click-through overlay: pointer events never reach it, so activation
      // (bring-to-front) is unreachable by construction.
      onActivate={() => undefined}
    >
      <SystemIntelligenceBody systemId={dockSystemId} />
    </MapWindow>
  );
}

function SummarySurface({
  summaryId,
  title,
  stackIndex,
  cardRef,
  onClose,
  onActivate,
}: {
  readonly summaryId: number | null;
  readonly title: string | undefined;
  readonly stackIndex: number;
  readonly cardRef: React.RefObject<HTMLDivElement | null>;
  readonly onClose: () => void;
  readonly onActivate: () => void;
}) {
  if (summaryId === null) return null;
  return (
    <MapWindow
      ref={cardRef}
      windowId="summary"
      title={title ?? String(summaryId)}
      titleAccessory={<SystemTitleAccessory systemId={summaryId} />}
      placement={{ kind: 'node-anchored', systemId: summaryId }}
      stackIndex={stackIndex}
      onClose={onClose}
      showCloseButton={false}
      onActivate={onActivate}
    >
      <SystemIntelligenceBody systemId={summaryId} />
    </MapWindow>
  );
}

/** Props supplied by the chain host to the sibling window layer. */
export interface MapWindowLayerProps {
  /** Resolved system the persistent dock renders; null hides the dock. */
  readonly dockSystemId: number | null;
  readonly onDeselect: () => void;
}

/** Hosts every map window as a pointer-inert sibling above the canvas. */
export function MapWindowLayer(props: MapWindowLayerProps) {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    clientMountedSnapshot,
    serverMountedSnapshot,
  );
  if (!mounted) {
    return (
      <div
        data-map-window-layer
        className="pointer-events-none absolute inset-0 z-sticky"
      />
    );
  }
  return <MountedMapWindowLayer {...props} />;
}

function MountedMapWindowLayer({
  dockSystemId,
  onDeselect,
}: MapWindowLayerProps) {
  const store = useStoreApi<ChainNode>();
  const boxSelectActive = useStore((state) => state.userSelectionActive);
  const selectedIds = useSelectedSystemIds();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const leaderRef = useRef<MapWindowLeaderHandle | null>(null);
  const { liveIds, summarySystemId } = useSurfacePresence({
    dockSystemId,
    boxSelectActive,
    selectedIds,
  });
  const { renderedStack, activate } = useWindowStack(liveIds);
  const dockTitleName = useNodeName(dockSystemId);
  const summaryTitle = useNodeName(summarySystemId);
  const followerStore = useMemo<NodeFollowerStore>(
    () => ({
      getState: () => store.getState(),
      subscribe: (listener) => store.subscribe(listener),
    }),
    [store],
  );
  useNodeFollower(followerStore, summarySystemId, cardRef, leaderRef);
  useCardDismissal(summarySystemId !== null, onDeselect);

  const zIndex = (id: MapWindowId) => renderedStack.indexOf(id) + 1;

  return (
    <div
      data-map-window-layer
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindowLeader ref={leaderRef} />
      <DockSurface
        visible={liveIds.includes('dock')}
        dockSystemId={dockSystemId}
        title={dockTitleName}
        stackIndex={zIndex('dock')}
      />
      <SummarySurface
        summaryId={summarySystemId}
        title={summaryTitle}
        stackIndex={zIndex('summary')}
        cardRef={cardRef}
        onClose={onDeselect}
        onActivate={() => activate('summary')}
      />
    </div>
  );
}
