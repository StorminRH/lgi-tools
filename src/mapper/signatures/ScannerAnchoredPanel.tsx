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
import { editorLeader, type EditorLeader } from './editor-leader';

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
    panel: panel.getBoundingClientRect(),
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

function useEditorLeader(
  signatureId: string | null,
  layerRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
): EditorLeader | null {
  const [leader, setLeader] = useState<EditorLeader | null>(null);

  const measure = useCallback(() => {
    setLeader(
      measureEditorLeader(layerRef.current, panelRef.current, rowElement(signatureId)),
    );
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
  const { bracket, line } = leader;
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
        className="stroke-isk"
      />
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        strokeWidth={1.5}
        className="stroke-isk"
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
      <EditorLeaderLine leader={leader} />
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
