'use client';

// Shared scanner-anchored panel chrome for the Signature Editor and the
// read-only site viewer: bracket/leader to the originating row, Escape and
// outside-click dismiss, and MapWindow geometry beside the scanner dock.
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

/** Tracks the bracket/leader geometry joining the panel to its scanner row. */
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
    if (layer === null || panel === null || row === null) {
      setLeader(null);
      return;
    }
    const origin = layer.getBoundingClientRect();
    setLeader(
      editorLeader({
        row: row.getBoundingClientRect(),
        panel: panel.getBoundingClientRect(),
        origin: { left: origin.left, top: origin.top },
      }),
    );
  }, [layerRef, panelRef, signatureId]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    // Capture: the scanner list scrolls inside its own tab panel, which never
    // bubbles a scroll event to the window.
    document.addEventListener('scroll', measure, true);
    const panel = panelRef.current;
    let observer: ResizeObserver | null = null;
    // The panel grows when body content lands; the leader has to follow that
    // reflow, not just window-level events.
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

/** Dismisses on Escape or a true outside click; a map pan or drag leaves it open. */
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
      // Arm only when a click here would be eligible to dismiss — ignore
      // starts on the panel or an open popup so a later up elsewhere cannot
      // close it.
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

    // Document-level Escape matches MapWindowLayer's card dismissal: the
    // panel's own onKeyDown only fires when focus is already inside it.
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

/** How far the bracket arms reach back toward the row they embrace. */
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

/** Props for the shared scanner-anchored panel host. */
export interface ScannerAnchoredPanelProps {
  /** Originating scanner row id for the bracket/leader; null draws no leader. */
  readonly signatureId: string | null;
  readonly windowId: string;
  readonly title: string;
  readonly onClose: () => void;
  /**
   * Panel measure: editor (compact fields) or site (catalogue-card width).
   * Defaults to editor.
   */
  readonly measure?: ScannerAnchoredMeasure;
  /** When false, omit the title-bar × (Escape / outside-click still dismiss). */
  readonly showCloseButton?: boolean;
  /** Extra attributes on the pointer-inert layer (e.g. connection mode). */
  readonly layerProps?: Record<string, string | undefined>;
  readonly children: ReactNode;
}

/**
 * Scanner-anchored pop-out chrome: window shell, drawn row tie, and shared
 * Escape / outside-click dismissal. Connection edit and site view swap only
 * the body.
 */
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
