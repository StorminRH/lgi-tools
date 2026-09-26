'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isAdoptedPopupOpen, MapWindow } from '../windows/MapWindow';
import {
  isOutsideClickGesture,
  keydownAction,
  outsideDismissAction,
  type ScannerAnchoredMeasure,
} from '../windows/window-model';
import { editorLeader, SCANNER_CARD_RISE_PX, type EditorLeader } from './editor-leader';

function rowElement(signatureId: string | null): Element | null {
  if (signatureId === null || typeof document === 'undefined') return null;
  return document.querySelector(
    `[data-signature-row][data-signature-id="${CSS.escape(signatureId)}"]`,
  );
}

export type MeasuredBox = {
  getBoundingClientRect(): DOMRect;
};

export type MeasuredRow = MeasuredBox & {
  closest(selector: string): MeasuredBox | null;
};

/**
 * The panel's resting box. Its entrance animation translates and scales it,
 * which getBoundingClientRect would report mid-flight; offset metrics give
 * the settled layout the leader should land on.
 */
function layoutBox(panel: MeasuredBox, origin: DOMRect) {
  if (typeof HTMLElement === 'undefined' || !(panel instanceof HTMLElement)) {
    return panel.getBoundingClientRect();
  }
  const left = origin.left + panel.offsetLeft;
  const top = origin.top + panel.offsetTop;
  return {
    left,
    top,
    right: left + panel.offsetWidth,
    bottom: top + panel.offsetHeight,
  };
}

export function measureEditorLeader(
  layer: MeasuredBox | null,
  panel: MeasuredBox | null,
  row: MeasuredRow | null,
): EditorLeader | null {
  if (layer === null || panel === null || row === null) return null;
  const origin = layer.getBoundingClientRect();
  const clipEl = row.closest('[data-scanner-scroll]');
  const clipRect = clipEl?.getBoundingClientRect();
  return editorLeader({
    row: row.getBoundingClientRect(),
    panel: layoutBox(panel, origin),
    origin: { left: origin.left, top: origin.top },
    clip:
      clipRect === undefined
        ? undefined
        : {
            left: clipRect.left,
            right: clipRect.right,
            top: clipRect.top,
            bottom: clipRect.bottom,
          },
  });
}

/** Viewport padding kept above a row-aligned card. */
const CARD_EDGE_PX = 16;

/** Clearance kept under the card so it floats rather than rests on the edge. */
const CARD_FLOAT_PX = 48;

/** Card header centre, measured down from its top: where the leader lands. */
const CARD_ATTACH_Y = 18;

const ROW_ALIGN_QUERY = '(min-width: 768px)';

/**
 * Floats the card up and away from the selected row: its header sits
 * SCANNER_CARD_RISE_PX above the row, clamped inside the layer with extra
 * clearance at the bottom. Below md the card stacks above the dock and keeps
 * its CSS spot.
 */
function alignCardToRow(
  layer: HTMLElement,
  panel: HTMLElement,
  row: Element | null,
): void {
  const wide =
    typeof window !== 'undefined' && window.matchMedia?.(ROW_ALIGN_QUERY).matches;
  if (!wide || row === null) {
    delete panel.dataset.rowAligned;
    return;
  }
  const origin = layer.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const clip = row.closest('[data-scanner-scroll]')?.getBoundingClientRect();
  const rowTop = Math.max(rowBox.top, clip?.top ?? rowBox.top);
  const rowBottom = Math.min(rowBox.bottom, clip?.bottom ?? rowBox.bottom);
  if (rowBottom <= rowTop && panel.dataset.rowAligned !== undefined) return;
  const middle = (rowTop + rowBottom) / 2 - origin.top;
  const maxTop = Math.max(CARD_EDGE_PX, layer.clientHeight - panel.offsetHeight - CARD_FLOAT_PX);
  const top = Math.min(
    Math.max(middle - SCANNER_CARD_RISE_PX - CARD_ATTACH_Y, CARD_EDGE_PX),
    maxTop,
  );
  panel.style.setProperty('--scanner-card-y', `${Math.round(top)}px`);
  panel.dataset.rowAligned = '';
}

function useEditorLeader(
  signatureId: string | null,
  layerRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
): EditorLeader | null {
  const [leader, setLeader] = useState<EditorLeader | null>(null);

  const measure = useCallback(() => {
    const layer = layerRef.current;
    const panel = panelRef.current;
    const row = rowElement(signatureId);
    if (layer !== null && panel !== null) alignCardToRow(layer, panel, row);
    setLeader(measureEditorLeader(layer, panel, row as MeasuredRow | null));
  }, [layerRef, panelRef, signatureId]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    const panel = panelRef.current;
    let observer: ResizeObserver | null = null;
    if (panel !== null && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(panel);
    }
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
      observer?.disconnect();
    };
  }, [measure, panelRef]);

  return leader;
}

function useOutsideDismiss(
  panelRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
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
      const panel = panelRef.current;
      return {
        insideCard:
          panel !== null && target instanceof Node && panel.contains(target),
        insideOpenPopup:
          target instanceof Element && target.closest('[data-open]') !== null,
        popupOpen: isAdoptedPopupOpen(),
      };
    };

    const handlePointerDown = (event: PointerEvent) => {
      const action = outsideDismissAction({
        ...containment(event.target),
        isClick: true,
      });
      if (action !== 'dismiss-card') {
        clearDown();
        return;
      }
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
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

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = keydownAction({
        key: event.key,
        surfaceKind: 'card',
        popupOpen: isAdoptedPopupOpen(),
        defaultPrevented: event.defaultPrevented,
      });
      if (action === 'dismiss-card') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', clearDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', clearDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [panelRef, onClose]);
}

const BRACKET_ARM_PX = 4;

function EditorLeaderLine({ leader }: { readonly leader: EditorLeader | null }) {
  if (leader === null) return null;
  const { bracket, path } = leader;
  return (
    <svg
      data-signature-editor-leader
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
    >
      <path
        data-signature-editor-bracket
        d={`M ${bracket.x - BRACKET_ARM_PX} ${bracket.top} H ${bracket.x} V ${bracket.bottom} H ${bracket.x - BRACKET_ARM_PX}`}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className="map-leader-bracket stroke-isk"
      />
      <path
        data-signature-editor-connector
        d={path}
        pathLength={1}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="map-leader-path map-leader-path-after-bracket stroke-isk"
      />
    </svg>
  );
}

export interface ScannerAnchoredPanelProps {
  readonly signatureId: string | null;
  readonly windowId: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly measure?: ScannerAnchoredMeasure;
  readonly showCloseButton?: boolean;
  readonly layerProps?: Record<string, string | undefined>;
  readonly children: ReactNode;
}

export function ScannerAnchoredPanel({
  signatureId,
  windowId,
  title,
  onClose,
  measure = 'editor',
  showCloseButton = true,
  layerProps,
  children,
}: ScannerAnchoredPanelProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const leader = useEditorLeader(signatureId, layerRef, panelRef);
  useOutsideDismiss(panelRef, onClose);

  return (
    <div
      ref={layerRef}
      data-signature-editor-layer
      className="pointer-events-none absolute inset-0 z-sticky"
      {...layerProps}
    >
      <EditorLeaderLine key={signatureId} leader={leader} />
      <MapWindow
        ref={panelRef}
        windowId={windowId}
        title={title}
        placement={{ kind: 'scanner-anchored', measure }}
        stackIndex={3}
        onClose={onClose}
        showCloseButton={showCloseButton}
        onActivate={() => undefined}
      >
        {children}
      </MapWindow>
    </div>
  );
}
