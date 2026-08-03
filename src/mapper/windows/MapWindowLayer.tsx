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
import { SiteCardWidget } from '@/features/wormhole-sites/widget';
import type { ChainNode } from '../canvas/SystemNode';
import { createNodeFollower, type NodeFollowerStore } from './follower-model';
import { isAdoptedPopupOpen, MapWindow } from './MapWindow';
import { readWindowRecord, writeWindowRecord } from './persistence';
import {
  bringToFront,
  clampRect,
  DEFAULT_FLOATING_RECT,
  deriveSurfaces,
  dragRect,
  keydownAction,
  reconcileStack,
  resizeRect,
  type DockMode,
  type MapWindowId,
  type RootClickSignal,
  type WindowRect,
  type WindowViewport,
} from './window-model';

const FIXTURE_SITE_ID = 1;
const subscribeMounted = () => () => undefined;
const clientMountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

function viewportSize(): WindowViewport {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function sameStack(a: readonly MapWindowId[], b: readonly MapWindowId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function writeRect(element: HTMLElement | null, rect: WindowRect): void {
  if (element === null) return;
  element.style.setProperty('--map-window-x', `${rect.x}px`);
  element.style.setProperty('--map-window-y', `${rect.y}px`);
  element.style.setProperty('--map-window-width', `${rect.width}px`);
  element.style.setProperty('--map-window-height', `${rect.height}px`);
}

function useFloatingDock() {
  const [initialRecord] = useState(() => readWindowRecord());
  const [mode, setMode] = useState<DockMode>(initialRecord?.mode ?? 'docked');
  const [rect, setRect] = useState<WindowRect>(() =>
    clampRect(initialRecord?.rect ?? DEFAULT_FLOATING_RECT, viewportSize()),
  );
  const rectRef = useRef(rect);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const commit = useCallback(() => {
    const committed = clampRect(rectRef.current, viewportSize());
    rectRef.current = committed;
    writeRect(dockRef.current, committed);
    setRect(committed);
    writeWindowRecord({ v: 1, mode: 'floating', rect: committed });
  }, []);

  const drag = useCallback((delta: { readonly x: number; readonly y: number }) => {
    const next = dragRect(rectRef.current, delta);
    rectRef.current = next;
    writeRect(dockRef.current, next);
  }, []);

  const resize = useCallback((delta: { readonly x: number; readonly y: number }) => {
    const next = resizeRect(rectRef.current, delta);
    rectRef.current = next;
    writeRect(dockRef.current, next);
  }, []);

  const toggleMode = useCallback(() => {
    if (mode === 'docked') {
      const floating = clampRect(rectRef.current, viewportSize());
      rectRef.current = floating;
      setRect(floating);
      setMode('floating');
      writeWindowRecord({ v: 1, mode: 'floating', rect: floating });
      return;
    }
    setMode('docked');
    writeWindowRecord({ v: 1, mode: 'docked', rect: rectRef.current });
  }, [mode]);

  useEffect(() => {
    const recover = () => {
      if (mode !== 'floating') return;
      commit();
    };
    window.addEventListener('resize', recover);
    return () => window.removeEventListener('resize', recover);
  }, [commit, mode]);

  return { mode, rect, dockRef, commit, drag, resize, toggleMode };
}

function useSurfacePresence(input: {
  readonly nodes: readonly ChainNode[];
  readonly rootSystemId: number | null;
  readonly rootClick: RootClickSignal | null;
  readonly boxSelectActive: boolean;
}) {
  const [presence, setPresence] = useState({
    dockHidden: false,
    consumedRootClickToken: 0,
  });
  const selectedIds = useMemo(
    () => input.nodes.filter((node) => node.selected).map((node) => Number(node.id)),
    [input.nodes],
  );
  const derivation = deriveSurfaces({
    rootSystemId: input.rootSystemId,
    dockHidden: presence.dockHidden,
    mode: 'docked',
    selectedIds,
    boxSelectActive: input.boxSelectActive,
    rootClick: input.rootClick,
    consumedRootClickToken: presence.consumedRootClickToken,
  });

  if (
    presence.dockHidden !== derivation.dockHidden ||
    presence.consumedRootClickToken !== derivation.consumedRootClickToken
  ) {
    setPresence({
      dockHidden: derivation.dockHidden,
      consumedRootClickToken: derivation.consumedRootClickToken,
    });
  }

  const hideDock = useCallback(() => {
    setPresence((current) => ({ ...current, dockHidden: true }));
  }, []);

  return { liveIds: derivation.surfaces, selectedIds, hideDock };
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
): void {
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (summaryId === null || element === null) return;
    return createNodeFollower(store, String(summaryId), (transform) => {
      element.style.setProperty('--map-window-transform', transform);
    });
  }, [cardRef, store, summaryId]);
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

function summarySystemId(
  liveIds: readonly MapWindowId[],
  selectedIds: readonly number[],
): number | null {
  if (!liveIds.includes('summary') || selectedIds.length !== 1) return null;
  return selectedIds[0] ?? null;
}

function dockPlacement(mode: DockMode, rect: WindowRect) {
  return mode === 'docked'
    ? ({ kind: 'docked' } as const)
    : ({ kind: 'floating', rect } as const);
}

function dockTitle(title: string | undefined, rootSystemId: number): string {
  return `Current system · ${title ?? rootSystemId}`;
}

function DockSurface({
  visible,
  rootSystemId,
  title,
  mode,
  rect,
  stackIndex,
  dockRef,
  onClose,
  onActivate,
  onPopToggle,
  onDragDelta,
  onDragEnd,
  onResizeDelta,
  onResizeEnd,
}: {
  readonly visible: boolean;
  readonly rootSystemId: number | null;
  readonly title: string | undefined;
  readonly mode: DockMode;
  readonly rect: WindowRect;
  readonly stackIndex: number;
  readonly dockRef: React.RefObject<HTMLDivElement | null>;
  readonly onClose: () => void;
  readonly onActivate: () => void;
  readonly onPopToggle: () => void;
  readonly onDragDelta: (delta: { readonly x: number; readonly y: number }) => void;
  readonly onDragEnd: () => void;
  readonly onResizeDelta: (delta: { readonly x: number; readonly y: number }) => void;
  readonly onResizeEnd: () => void;
}) {
  if (!visible || rootSystemId === null) return null;
  return (
    <MapWindow
      ref={dockRef}
      windowId="dock"
      title={dockTitle(title, rootSystemId)}
      placement={dockPlacement(mode, rect)}
      surfaceKind="dock"
      stackIndex={stackIndex}
      onClose={onClose}
      onActivate={onActivate}
      onPopToggle={onPopToggle}
      onDragDelta={onDragDelta}
      onDragEnd={onDragEnd}
      onResizeDelta={onResizeDelta}
      onResizeEnd={onResizeEnd}
    >
      <SiteCardWidget siteId={FIXTURE_SITE_ID} className="min-h-0" />
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
      placement={{ kind: 'node-anchored', systemId: summaryId }}
      surfaceKind="card"
      stackIndex={stackIndex}
      onClose={onClose}
      onActivate={onActivate}
    >
      <div data-map-summary-placeholder className="flex flex-col gap-2">
        <p className="font-data text-label uppercase tracking-label text-isk">
          System summary
        </p>
        <p className="text-ui text-muted">
          Detailed system intelligence will arrive in a later Atlas slice.
        </p>
      </div>
    </MapWindow>
  );
}

/** Props supplied by the chain host to the sibling window layer. */
export interface MapWindowLayerProps {
  readonly nodes: readonly ChainNode[];
  readonly rootSystemId: number | null;
  readonly rootClick: RootClickSignal | null;
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
  nodes,
  rootSystemId,
  rootClick,
  onDeselect,
}: MapWindowLayerProps) {
  const store = useStoreApi<ChainNode>();
  const boxSelectActive = useStore((state) => state.userSelectionActive);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const floatingDock = useFloatingDock();
  const { liveIds, selectedIds, hideDock } = useSurfacePresence({
    nodes,
    rootSystemId,
    rootClick,
    boxSelectActive,
  });
  const { renderedStack, activate } = useWindowStack(liveIds);
  const summaryId = summarySystemId(liveIds, selectedIds);
  const followerStore = useMemo<NodeFollowerStore>(
    () => ({
      getState: () => store.getState(),
      subscribe: (listener) => store.subscribe(listener),
    }),
    [store],
  );
  useNodeFollower(followerStore, summaryId, cardRef);
  useCardDismissal(summaryId !== null, onDeselect);

  const rootNode = nodes.find((node) => Number(node.id) === rootSystemId);
  const summaryNode = nodes.find((node) => Number(node.id) === summaryId);
  const zIndex = (id: MapWindowId) => renderedStack.indexOf(id) + 1;

  return (
    <div
      data-map-window-layer
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <DockSurface
        visible={liveIds.includes('dock')}
        rootSystemId={rootSystemId}
        title={rootNode?.data.name}
        mode={floatingDock.mode}
        rect={floatingDock.rect}
        stackIndex={zIndex('dock')}
        dockRef={floatingDock.dockRef}
        onClose={hideDock}
        onActivate={() => activate('dock')}
        onPopToggle={floatingDock.toggleMode}
        onDragDelta={floatingDock.drag}
        onDragEnd={floatingDock.commit}
        onResizeDelta={floatingDock.resize}
        onResizeEnd={floatingDock.commit}
      />
      <SummarySurface
        summaryId={summaryId}
        title={summaryNode?.data.name}
        stackIndex={zIndex('summary')}
        cardRef={cardRef}
        onClose={onDeselect}
        onActivate={() => activate('summary')}
      />
    </div>
  );
}
