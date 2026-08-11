'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ForwardedRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { scrollArea } from '@/components/ui/scroll-area';
import { mapFrostedSurface, mapOverlaySurface } from '../map-frosted-surface';
import {
  keydownAction,
  surfaceKindOf,
  type WindowPlacement,
} from './window-model';

// Base UI puts `data-open` on the Positioner while role lives on the nested
// Popup/List — match both co-located and descendant forms.
const ADOPTED_POPUP_SELECTOR = [
  '[data-open][role="dialog"]',
  '[data-open][role="listbox"]',
  '[data-open][role="menu"]',
  '[data-open] [role="dialog"]',
  '[data-open] [role="listbox"]',
  '[data-open] [role="menu"]',
].join(',');

// The scanner dock's effective height is min(24rem, 100vw-2rem, 100dvh-7rem):
// a square sized by the width clamp, then capped by the viewport-height clamp.
// The prompt rail below re-states that same expression as its bottom offset so
// every scanner prompt tracks the dock at every viewport size — change them
// TOGETHER.

/** Placement classes for the docked-bottom-left scanner square. */
export const MAP_SCANNER_DOCK_CLASS =
  'bottom-4 left-4 size-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-7rem)]';

/**
 * Scanner prompt rail parked just above the dock. Missing-scan and ambiguous-
 * jump prompts share it so simultaneous states stack instead of overlapping.
 * Static Tailwind string so every utility is discoverable at build time.
 */
export const MAP_SCANNER_PROMPT_RAIL_CLASS =
  'pointer-events-auto absolute bottom-[calc(1rem+min(24rem,100vw-2rem,100dvh-7rem)+0.5rem)] left-4 z-sticky flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2';

// Shared scanner-anchored parking (narrow-stack + md dock-right). Width is the
// only measure fork — editor stays 18rem fields; site viewer needs ~22rem.
const MAP_SCANNER_ANCHORED_GEOMETRY =
  'left-4 right-4 bottom-[calc(1rem+min(24rem,100vw-2rem,100dvh-7rem)+0.5rem)] h-auto max-h-[calc(100dvh-(1rem+min(24rem,100vw-2rem,100dvh-7rem)+0.5rem)-1rem)] w-auto md:bottom-4 md:left-[calc(1rem+min(24rem,100vw-2rem)+0.5rem)] md:right-auto md:max-h-[calc(100dvh-2rem)] md:max-w-[calc(100vw-2rem)]';

/**
 * The Signature Editor pop-out. On viewports wide enough for the scanner dock
 * plus a 18rem panel, it parks immediately right of the dock and shares its
 * bottom edge. On narrower viewports it stacks above the dock (same bottom
 * offset recipe as the prompt rail) and caps max-height to the space above
 * that anchor so the panel never extends past the viewport top — the body
 * scrolls internally. Change it with {@link MAP_SCANNER_DOCK_CLASS}.
 */
export const MAP_SCANNER_EDITOR_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} md:w-72`;

/**
 * Site-viewer pop-out: same scanner-anchored parking as the editor, but at a
 * catalogue-card column width (~22rem) so header stats and wave rows do not
 * wrap/clip. Geometry is shared via {@link MAP_SCANNER_ANCHORED_GEOMETRY}.
 */
export const MAP_SCANNER_SITE_VIEWER_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} md:w-[22rem]`;

/** Whether an adopted Base UI popup currently owns Escape. */
export function isAdoptedPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ADOPTED_POPUP_SELECTOR) !== null;
}

/** Props for the map's single window primitive. */
export interface MapWindowProps {
  readonly windowId: string;
  readonly title: string;
  /** Optional inline detail that inherits the title typography but owns its tone. */
  readonly titleAccessory?: ReactNode;
  readonly placement: WindowPlacement;
  readonly stackIndex: number;
  readonly onClose: () => void;
  /** When false, the title-bar × is omitted (outside-click / Escape still close). */
  readonly showCloseButton?: boolean;
  /** When false, the title bar is omitted (tabs or other chrome may lead). */
  readonly showHeader?: boolean;
  /**
   * `panel` is the frosted interactive card chrome. `overlay` is a
   * content-sized passive text surface (current-system dock) — faint glass,
   * no border/shadow, and CLICK-THROUGH: it has no interactive children, so
   * it must never steal canvas input from nodes laid out beneath it.
   */
  readonly appearance?: 'panel' | 'overlay';
  readonly onActivate: () => void;
  readonly children?: ReactNode;
}

function applyWindowStyles(
  element: HTMLDivElement,
  stackIndex: number,
): void {
  element.style.setProperty('--map-window-z', String(stackIndex));
}

function assignForwardedRef(
  forwardedRef: ForwardedRef<HTMLDivElement>,
  node: HTMLDivElement | null,
): void {
  if (typeof forwardedRef === 'function') forwardedRef(node);
  else if (forwardedRef !== null) forwardedRef.current = node;
}

function placementClassName(
  placement: WindowPlacement,
  overlay: boolean,
): string | false {
  if (placement.kind === 'docked') {
    // Top-left: chrome moved to top-right, so the dock can sit at the edge.
    // Overlay hugs content; panel fills the left rail down to the audit-log strip.
    return overlay
      ? 'left-4 top-4 h-auto w-max max-w-[min(24rem,calc(100vw-2rem))]'
      : 'left-4 top-4 bottom-16 w-[360px] max-w-[calc(100vw-2rem)]';
  }
  if (placement.kind === 'docked-bottom-left') {
    // Square sibling for the scanner: tabs own top-left chrome; list scrolls inside.
    return MAP_SCANNER_DOCK_CLASS;
  }
  if (placement.kind === 'scanner-anchored') {
    // Screen-space beside the scanner, deliberately NOT anchored to canvas
    // geometry: React Flow pans and zooms by mutating a viewport transform,
    // which fires no scroll or resize, so a floating anchor cannot track it
    // (Base UI exposes no animation-frame tracking — docs brief).
    return placement.measure === 'site'
      ? MAP_SCANNER_SITE_VIEWER_CLASS
      : MAP_SCANNER_EDITOR_CLASS;
  }
  return 'left-0 top-0 h-52 w-72 [transform:var(--map-window-transform)]';
}

function WindowHeader({
  title,
  titleAccessory,
  overlay,
  showCloseButton,
  onClose,
}: {
  readonly title: string;
  readonly titleAccessory?: ReactNode;
  readonly overlay: boolean;
  readonly showCloseButton: boolean;
  readonly onClose: () => void;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-1 px-1.5',
        overlay ? 'h-auto min-h-8 border-0 py-1' : 'h-8 border-b border-border/80',
      )}
    >
      <h2
        className={cn(
          'min-w-0 flex-1 truncate px-1',
          overlay
            ? 'text-left font-display text-h3 font-bold tracking-copy text-name'
            : 'text-center font-data text-label uppercase tracking-label text-name',
        )}
      >
        {title}
        {titleAccessory}
      </h2>
      {showCloseButton ? (
        <Button
          variant="bare"
          aria-label={`Close ${title}`}
          className="h-6 w-6 cursor-pointer justify-center text-muted hover:text-name"
          onClick={onClose}
        >
          ×
        </Button>
      ) : null}
    </header>
  );
}

function windowChromeClass(
  placement: WindowPlacement,
  overlay: boolean,
): string {
  return cn(
    'nokey absolute z-[var(--map-window-z)] flex min-h-0 flex-col overflow-hidden text-ui',
    overlay
      ? cn('pointer-events-none rounded-ctl', mapOverlaySurface)
      : cn('pointer-events-auto rounded-card', mapFrostedSurface),
    placementClassName(placement, overlay),
    (placement.kind === 'scanner-anchored' || placement.kind === 'node-anchored')
      && 'map-node-enter',
  );
}

function windowBodyClass(
  placement: WindowPlacement,
  overlay: boolean,
): string {
  const scannerDock = placement.kind === 'docked-bottom-left';
  return cn(
    scrollArea,
    'min-h-0 flex-1 overscroll-contain',
    scannerDock ? 'flex flex-col overflow-hidden p-0' : 'overflow-y-auto',
    overlay
      ? 'px-2.5 pb-2 pt-0.5 text-left'
      : scannerDock
        ? null
        // pl compensates the painted 10px track when both-edges is ignored
        // (some engines only reserve the classic right gutter).
        : 'py-2 pl-[22px] pr-3',
  );
}

/** The map's single window primitive: chrome and isolation only. */
export const MapWindow = forwardRef<HTMLDivElement, MapWindowProps>(
  function MapWindow(
    {
      windowId,
      title,
      titleAccessory,
      placement,
      stackIndex,
      onClose,
      showCloseButton = true,
      showHeader = true,
      appearance = 'panel',
      onActivate,
      children,
    },
    forwardedRef,
  ) {
    const surfaceKind = surfaceKindOf(placement);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const overlay = appearance === 'overlay';

    useEffect(() => {
      const element = rootRef.current;
      if (element === null) return;
      applyWindowStyles(element, stackIndex);
    }, [stackIndex]);

    const setRootRef = useCallback((node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (node !== null) applyWindowStyles(node, stackIndex);
      assignForwardedRef(forwardedRef, node);
    }, [forwardedRef, stackIndex]);

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

    return (
      <section
        ref={setRootRef}
        data-map-window={windowId}
        data-map-window-placement={placement.kind}
        data-map-window-appearance={appearance}
        className={windowChromeClass(placement, overlay)}
        onKeyDown={overlay ? undefined : handleKeyDown}
        onPointerDown={overlay ? undefined : onActivate}
      >
        {showHeader ? (
          <WindowHeader
            title={title}
            titleAccessory={titleAccessory}
            overlay={overlay}
            showCloseButton={showCloseButton}
            onClose={onClose}
          />
        ) : null}
        <div
          data-map-window-scroll
          className={windowBodyClass(placement, overlay)}
        >
          {children}
        </div>
      </section>
    );
  },
);
