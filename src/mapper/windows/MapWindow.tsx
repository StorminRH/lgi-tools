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

// The scanner dock is a landscape table flush to the bottom-left canvas
// corner: content-tall up to 24rem, 33rem wide. SignatureWindow pins it in a
// bottom-left stack so the prompt rail sits on the live height. Narrow-stack
// editor/site parking still uses the 24rem cap — change that cap TOGETHER
// with {@link MAP_SCANNER_DOCK_CLASS} max-height.

/** Placement classes for the docked-bottom-left scanner table. */
const MAP_SCANNER_DOCK_CLASS =
  'relative h-auto max-h-[min(24rem,calc(100dvh-7rem))] w-full min-w-0';

/**
 * Scanner prompt rail in the dock stack, just above the live dock. Missing-scan
 * and ambiguous-jump prompts share it so simultaneous states stack instead of
 * overlapping. Static Tailwind string so every utility is discoverable at
 * build time.
 */
export const MAP_SCANNER_PROMPT_RAIL_CLASS =
  'pointer-events-auto mb-2 flex w-full flex-col gap-2';

/** Bottom-left stack that pins the prompt rail to the content-sized dock. */
export const MAP_SCANNER_DOCK_STACK_CLASS =
  'absolute bottom-0 left-0 flex w-[min(33rem,100%)] min-w-0 flex-col overflow-x-hidden';

// Shared scanner-anchored parking (narrow-stack + md dock-right). Width is the
// only measure fork — editor stays 18rem fields; site viewer sizes to its card.
// Narrow `bottom` / `max-h` use the dock's 24rem cap, not its live height.
const MAP_SCANNER_ANCHORED_GEOMETRY =
  'left-0 right-0 bottom-[calc(min(24rem,100dvh-7rem)+0.5rem)] h-auto max-h-[calc(100dvh-(min(24rem,100dvh-7rem)+0.5rem)-1rem)] w-auto md:bottom-0 md:left-[calc(min(33rem,100vw)+0.5rem)] md:right-auto md:max-h-[calc(100dvh-2rem)] md:max-w-[calc(100vw-min(33rem,100vw)-2.5rem)]';

/**
 * The Signature Editor pop-out. On viewports wide enough for the scanner dock
 * plus a 18rem panel, it parks immediately right of the dock and shares its
 * bottom edge. On narrower viewports it stacks above the dock's 24rem cap
 * and caps max-height to the space above that anchor so the panel never
 * extends past the viewport top — the body scrolls internally. Change the
 * cap with {@link MAP_SCANNER_DOCK_CLASS}.
 */
const MAP_SCANNER_EDITOR_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} md:w-72`;

/**
 * Site-viewer pop-out: same scanner-anchored parking as the editor, sized to
 * the card's contents (capped by the shared viewport max-width) so chips and
 * names are not clipped to a fixed column. Geometry is shared via
 * {@link MAP_SCANNER_ANCHORED_GEOMETRY}.
 */
const MAP_SCANNER_SITE_VIEWER_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} md:w-max`;

/** Whether an adopted Base UI popup currently owns Escape. */
export function isAdoptedPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ADOPTED_POPUP_SELECTOR) !== null;
}

/** Props for the map's single window primitive. */
interface MapWindowProps {
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
    // Flush bottom-left scanner: header owns the title; list scrolls inside.
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
  alignStart,
  showCloseButton,
  onClose,
}: {
  readonly title: string;
  readonly titleAccessory?: ReactNode;
  readonly overlay: boolean;
  readonly alignStart: boolean;
  readonly showCloseButton: boolean;
  readonly onClose: () => void;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-1',
        overlay
          ? 'h-auto min-h-8 border-0 px-1.5 py-1'
          : alignStart
            ? 'h-8 border-0 px-1.5'
            : 'h-8 border-b border-border-soft px-1.5',
      )}
    >
      <h2
        className={cn(
          'min-w-0 flex-1 truncate',
          overlay
            ? 'px-1 text-left font-display text-h3 font-bold tracking-copy text-name'
            : alignStart
              ? 'text-center font-ui text-lead font-semibold text-name'
              : 'px-1 text-center font-data text-label uppercase tracking-label text-name',
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
    'nokey z-[var(--map-window-z)] flex min-h-0 flex-col overflow-hidden text-ui',
    placement.kind === 'docked-bottom-left' ? 'relative' : 'absolute',
    overlay
      ? cn('pointer-events-none rounded-ctl', mapOverlaySurface)
      : placement.kind === 'docked-bottom-left'
        ? 'pointer-events-auto rounded-none glass-panel-faint'
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
    'min-h-0 overscroll-contain',
    scannerDock
      ? 'flex flex-auto flex-col overflow-hidden p-0'
      : cn(scrollArea, 'flex-1 overflow-y-auto'),
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
            alignStart={placement.kind === 'docked-bottom-left'}
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
