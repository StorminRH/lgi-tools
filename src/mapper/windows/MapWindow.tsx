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

const ADOPTED_POPUP_SELECTOR = [
  '[data-open][role="dialog"]',
  '[data-open][role="listbox"]',
  '[data-open][role="menu"]',
  '[data-open] [role="dialog"]',
  '[data-open] [role="listbox"]',
  '[data-open] [role="menu"]',
].join(',');

// The scanner grows with its rows up to half the viewport height, so it
// never takes more than half the map at any resolution or window size.
const MAP_SCANNER_DOCK_CLASS =
  'relative h-auto max-h-[50dvh] w-full min-w-0';

export const MAP_SCANNER_PROMPT_RAIL_CLASS =
  'pointer-events-auto mb-2 flex w-full flex-col gap-2';

export const MAP_SCANNER_DOCK_STACK_CLASS =
  'absolute bottom-0 left-0 flex w-[min(33rem,100%)] min-w-0 flex-col overflow-x-hidden';

// Below lg the card stacks above the scanner dock. From lg up it sits beside
// the dock; once ScannerAnchoredPanel measures the selected row it sets
// data-row-aligned and --scanner-card-y so the card's header lines up with
// that row.
const MAP_SCANNER_ANCHORED_GEOMETRY =
  'left-0 right-0 bottom-[calc(50dvh+0.5rem)] h-auto max-h-[calc(50dvh-1.5rem)] w-auto lg:bottom-12 lg:left-[calc(min(33rem,100vw)+4.5rem)] lg:right-auto lg:max-h-[calc(100dvh-4rem)] lg:max-w-[calc(100vw-min(33rem,100vw)-6.5rem)] lg:data-[row-aligned]:bottom-auto lg:data-[row-aligned]:top-[var(--scanner-card-y)]';

const MAP_SCANNER_EDITOR_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} lg:w-72`;

const MAP_SCANNER_SITE_VIEWER_CLASS =
  `${MAP_SCANNER_ANCHORED_GEOMETRY} lg:w-max`;

export function isAdoptedPopupOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ADOPTED_POPUP_SELECTOR) !== null;
}

interface MapWindowProps {
  readonly windowId: string;
  readonly title: string;
  readonly titleAccessory?: ReactNode;
  readonly placement: WindowPlacement;
  readonly stackIndex: number;
  readonly onClose: () => void;
  readonly showCloseButton?: boolean;
  readonly showHeader?: boolean;
  /**
   * `panel` is the frosted interactive card chrome. `overlay` is a
   * content-sized text surface (current-system dock) with faint glass. Its
   * chrome is click-through; scrollable content explicitly opts into input.
   */
  readonly appearance?: 'panel' | 'overlay';
  readonly onActivate: () => void;
  /** Plays the anchored card's exit; the owner unmounts it afterwards. */
  readonly closing?: boolean;
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
    return overlay
      ? 'left-4 top-4 h-auto max-h-[calc(100dvh-7rem)] w-max max-w-[min(24rem,calc(100vw-2rem))]'
      : 'left-4 top-4 bottom-16 w-[360px] max-w-[calc(100vw-2rem)]';
  }
  if (placement.kind === 'docked-bottom-left') {
    return MAP_SCANNER_DOCK_CLASS;
  }
  if (placement.kind === 'scanner-anchored') {
    return placement.measure === 'site'
      ? MAP_SCANNER_SITE_VIEWER_CLASS
      : MAP_SCANNER_EDITOR_CLASS;
  }
  return 'left-0 top-0 h-auto max-h-[min(24rem,calc(100dvh-7rem))] w-72 [transform:var(--map-window-transform)]';
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
        ? cn('pointer-events-auto rounded-none', mapOverlaySurface)
        : cn('pointer-events-auto', mapFrostedSurface),
    placementClassName(placement, overlay),
    (placement.kind === 'scanner-anchored' || placement.kind === 'node-anchored')
      && 'map-card-enter',
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
      ? 'pointer-events-auto px-2.5 pb-2 pt-0.5 text-left'
      : scannerDock
        ? null
        : 'py-2 pl-[22px] pr-3',
  );
}

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
      closing = false,
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
        data-closing={closing ? '' : undefined}
        className={cn(windowChromeClass(placement, overlay), closing && 'pointer-events-none')}
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
