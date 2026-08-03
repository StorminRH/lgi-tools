'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ForwardedRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { panelSurface } from '@/components/ui/dropdown-panel';
import { scrollArea } from '@/components/ui/scroll-area';
import { createPointerGesture, type PointerDelta } from './drag-resize';
import {
  keydownAction,
  type WindowPlacement,
  type WindowSurfaceKind,
} from './window-model';

const ADOPTED_POPUP_SELECTOR = [
  '[data-open][role="dialog"]',
  '[data-open][role="listbox"]',
  '[data-open][role="menu"]',
].join(',');

/** Whether an adopted Base UI popup currently owns Escape. */
export function isAdoptedPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ADOPTED_POPUP_SELECTOR) !== null;
}

/** Props for the map's single window primitive. */
export interface MapWindowProps {
  readonly windowId: string;
  readonly title: string;
  readonly placement: WindowPlacement;
  readonly surfaceKind: WindowSurfaceKind;
  readonly stackIndex: number;
  readonly onClose: () => void;
  readonly onActivate: () => void;
  readonly onPopToggle?: () => void;
  readonly onDragDelta?: (delta: PointerDelta) => void;
  readonly onDragEnd?: () => void;
  readonly onResizeDelta?: (delta: PointerDelta) => void;
  readonly onResizeEnd?: () => void;
  readonly children?: ReactNode;
}

function applyWindowStyles(
  element: HTMLDivElement,
  placement: WindowPlacement,
  stackIndex: number,
): void {
  element.style.setProperty('--map-window-z', String(stackIndex));
  if (placement.kind !== 'floating') return;
  element.style.setProperty('--map-window-x', `${placement.rect.x}px`);
  element.style.setProperty('--map-window-y', `${placement.rect.y}px`);
  element.style.setProperty('--map-window-width', `${placement.rect.width}px`);
  element.style.setProperty('--map-window-height', `${placement.rect.height}px`);
}

function assignForwardedRef(
  forwardedRef: ForwardedRef<HTMLDivElement>,
  node: HTMLDivElement | null,
): void {
  if (typeof forwardedRef === 'function') forwardedRef(node);
  else if (forwardedRef !== null) forwardedRef.current = node;
}

function placementClassName(placement: WindowPlacement): string | false {
  if (placement.kind === 'docked') {
    return 'right-4 top-[4.5rem] h-[calc(100dvh-5.5rem)] w-[360px] max-w-[calc(100vw-2rem)]';
  }
  if (placement.kind === 'floating') {
    return 'left-[var(--map-window-x)] top-[var(--map-window-y)] h-[var(--map-window-height)] w-[var(--map-window-width)]';
  }
  return 'left-0 top-0 h-52 w-72 [transform:var(--map-window-transform)]';
}

function DragHandle({
  title,
  floating,
  onPointerDown,
}: {
  readonly title: string;
  readonly floating: boolean;
  readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  if (!floating) return null;
  return (
    <Button
      variant="bare"
      aria-label={`Drag ${title}`}
      className="h-6 w-6 cursor-move touch-none justify-center text-muted hover:text-text"
      onPointerDown={onPointerDown}
    >
      ⋮
    </Button>
  );
}

function PopToggle({
  title,
  floating,
  onPopToggle,
}: {
  readonly title: string;
  readonly floating: boolean;
  readonly onPopToggle: (() => void) | undefined;
}) {
  if (!onPopToggle) return null;
  return (
    <Button
      variant="bare"
      aria-label={floating ? `Anchor ${title}` : `Pop out ${title}`}
      className="h-6 w-6 justify-center text-muted hover:text-isk"
      onClick={onPopToggle}
    >
      {floating ? '↙' : '↗'}
    </Button>
  );
}

function WindowHeader({
  title,
  floating,
  onClose,
  onPopToggle,
  onDragPointerDown,
}: {
  readonly title: string;
  readonly floating: boolean;
  readonly onClose: () => void;
  readonly onPopToggle?: () => void;
  readonly onDragPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <header className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-1.5">
      <DragHandle
        title={title}
        floating={floating}
        onPointerDown={onDragPointerDown}
      />
      <h2 className="min-w-0 flex-1 truncate px-1 font-data text-label uppercase tracking-label text-name">
        {title}
      </h2>
      <PopToggle
        title={title}
        floating={floating}
        onPopToggle={onPopToggle}
      />
      <Button
        variant="bare"
        aria-label={`Close ${title}`}
        className="h-6 w-6 justify-center text-muted hover:text-name"
        onClick={onClose}
      >
        ×
      </Button>
    </header>
  );
}

function ResizeHandle({
  title,
  floating,
  onPointerDown,
}: {
  readonly title: string;
  readonly floating: boolean;
  readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  if (!floating) return null;
  return (
    <Button
      variant="bare"
      aria-label={`Resize ${title}`}
      className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none justify-center text-faint hover:text-isk"
      onPointerDown={onPointerDown}
    >
      ◢
    </Button>
  );
}

/** The map's single window primitive: chrome and isolation only. */
export const MapWindow = forwardRef<HTMLDivElement, MapWindowProps>(
  function MapWindow(
    {
      windowId,
      title,
      placement,
      surfaceKind,
      stackIndex,
      onClose,
      onActivate,
      onPopToggle,
      onDragDelta,
      onDragEnd,
      onResizeDelta,
      onResizeEnd,
      children,
    },
    forwardedRef,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const dragGesture = useMemo(
      () =>
        createPointerGesture({
          onDelta: (delta) => onDragDelta?.(delta),
          onEnd: () => onDragEnd?.(),
        }),
      [onDragDelta, onDragEnd],
    );
    const resizeGesture = useMemo(
      () =>
        createPointerGesture({
          onDelta: (delta) => onResizeDelta?.(delta),
          onEnd: () => onResizeEnd?.(),
        }),
      [onResizeDelta, onResizeEnd],
    );

    useEffect(
      () => () => {
        dragGesture.dispose();
        resizeGesture.dispose();
      },
      [dragGesture, resizeGesture],
    );

    useEffect(() => {
      const element = rootRef.current;
      if (element === null) return;
      applyWindowStyles(element, placement, stackIndex);
    }, [placement, stackIndex]);

    const setRootRef = useCallback((node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (node !== null) applyWindowStyles(node, placement, stackIndex);
      assignForwardedRef(forwardedRef, node);
    }, [forwardedRef, placement, stackIndex]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const action = keydownAction({
        key: event.key,
        surfaceKind,
        popupOpen: isAdoptedPopupOpen(),
        defaultPrevented: event.defaultPrevented,
      });
      if (action === 'dismiss-card') onClose();
      event.stopPropagation();
    };

    const floating = placement.kind === 'floating';

    return (
      <section
        ref={setRootRef}
        data-map-window={windowId}
        data-map-window-placement={placement.kind}
        className={cn(
          'nokey pointer-events-auto absolute z-[var(--map-window-z)] flex min-h-0 flex-col overflow-hidden rounded-card text-ui',
          panelSurface,
          placementClassName(placement),
        )}
        onKeyDown={handleKeyDown}
        onPointerDown={onActivate}
      >
        <WindowHeader
          title={title}
          floating={floating}
          onClose={onClose}
          onPopToggle={onPopToggle}
          onDragPointerDown={dragGesture.onPointerDown}
        />
        <div
          data-map-window-scroll
          className={cn(
            scrollArea,
            'min-h-0 flex-1 overflow-y-auto overscroll-contain p-2',
          )}
        >
          {children}
        </div>
        <ResizeHandle
          title={title}
          floating={floating}
          onPointerDown={resizeGesture.onPointerDown}
        />
      </section>
    );
  },
);
