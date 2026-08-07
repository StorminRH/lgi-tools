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

/** Whether an adopted Base UI popup currently owns Escape. */
export function isAdoptedPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ADOPTED_POPUP_SELECTOR) !== null;
}

/** Props for the map's single window primitive. */
export interface MapWindowProps {
  readonly windowId: string;
  readonly title: string;
  readonly placement: WindowPlacement;
  readonly stackIndex: number;
  readonly onClose: () => void;
  /** When false, the title-bar × is omitted (outside-click / Escape still close). */
  readonly showCloseButton?: boolean;
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
  // node-anchored and edge-anchored both ride `--map-window-transform`.
  if (placement.kind === 'edge-anchored') {
    // The height bound keeps the card's scroll body engaged on short
    // viewports; the position clamp alone cannot shrink an h-auto card.
    return 'left-0 top-0 h-auto max-h-[calc(100%-2rem)] w-72 [transform:var(--map-window-transform)]';
  }
  return 'left-0 top-0 h-52 w-72 [transform:var(--map-window-transform)]';
}

function WindowHeader({
  title,
  overlay,
  showCloseButton,
  onClose,
}: {
  readonly title: string;
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

/** The map's single window primitive: chrome and isolation only. */
export const MapWindow = forwardRef<HTMLDivElement, MapWindowProps>(
  function MapWindow(
    {
      windowId,
      title,
      placement,
      stackIndex,
      onClose,
      showCloseButton = true,
      appearance = 'panel',
      onActivate,
      children,
    },
    forwardedRef,
  ) {
    const surfaceKind = surfaceKindOf(placement);
    const rootRef = useRef<HTMLDivElement | null>(null);

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

    const overlay = appearance === 'overlay';

    return (
      <section
        ref={setRootRef}
        data-map-window={windowId}
        data-map-window-placement={placement.kind}
        data-map-window-appearance={appearance}
        className={cn(
          'nokey absolute z-[var(--map-window-z)] flex min-h-0 flex-col overflow-hidden text-ui',
          overlay
            ? // Passive readout: nothing inside is interactive, so the canvas
              // (node clicks, drags, box-select, pans) stays reachable under it.
              cn('pointer-events-none rounded-ctl', mapOverlaySurface)
            : cn('pointer-events-auto rounded-card', mapFrostedSurface),
          placementClassName(placement, overlay),
          (placement.kind === 'edge-anchored' ||
            placement.kind === 'node-anchored') &&
            'map-node-enter',
        )}
        onKeyDown={overlay ? undefined : handleKeyDown}
        onPointerDown={overlay ? undefined : onActivate}
      >
        <WindowHeader
          title={title}
          overlay={overlay}
          showCloseButton={showCloseButton}
          onClose={onClose}
        />
        <div
          data-map-window-scroll
          className={cn(
            scrollArea,
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            overlay
              ? 'px-2.5 pb-2 pt-0.5 text-left'
              : // pl compensates the painted 10px track when both-edges is ignored
                // (some engines only reserve the classic right gutter).
                'py-2 pl-[22px] pr-3',
          )}
        >
          {children}
        </div>
      </section>
    );
  },
);
