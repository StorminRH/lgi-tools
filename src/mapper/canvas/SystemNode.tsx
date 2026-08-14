'use client';

// One system node on the chain canvas: an invisible widget frame whose bounds
// ARE the node box — the plain system name in the frame header, its colored
// class/security indicator centered inside the disc, and widget slots on the
// disc (pilot presence on the top-right rim first; gas/anomaly readouts extend
// the rail later).
//
// The frame is declared data-side (`width`/`height` on the node object, set by
// `syncNodes`) so React Flow sizes the wrapper before any DOM measurement:
// edges, camera fits, and followers all see the frame box from first paint.
// This component fills that box rather than sizing it.
//
// The class chip is omitted rather than shown empty when the class is unknown
// (contract DC-3), and an unresolved system falls back to its bare id, which is
// a plainer label rather than a loading state (contract HC-5). Motion
// presentation (4.0.3.2) is a class on this inner element — scale and opacity
// only, never position — and is suppressed wholesale while the node is being
// dragged (HC-2).
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/components/ui/cn';
import {
  systemClassificationReadout,
  systemDestinationClassReadout,
} from '@/data/eve-data/system-identity';
import type { NodeMotion } from '../motion/motion-contract';
import { PilotPresenceBadge } from './PilotPresenceBadge';

/**
 * What one node displays. A type alias rather than an interface so it satisfies React Flow's
 * `Record<string, unknown>` data constraint. The motion vocabulary (`NodeMotion`)
 * is owned by `../motion/motion-contract`.
 */
export type ChainNodeData = {
  name: string;
  className: string | null;
  security?: number | null;
  whClassId?: number | null;
  motion?: NodeMotion;
  /**
   * Present only on derived halo systems (4.0.4.2.3 OW3); an authored node
   * carries no halo field. `fogged` marks the ring under the fog layer: the
   * node is placed (so fog recession reveals it in place) but renders fully
   * transparent and inert — the cloud paints below the node layer, so the
   * node hides itself rather than relying on paint order.
   */
  halo?: { readonly ring: number; readonly fogged: boolean };
  /** Present only on a scanned wormhole or guaranteed-static derived ghost. */
  stub?:
    | {
        readonly connectionId: string;
        readonly fromSystemId: number;
        readonly signatureId: string;
      }
    | {
        readonly staticId: string;
        readonly fromSystemId: number;
        readonly code: string;
        readonly className: string;
        readonly whClassId: number;
      };
};

/** The only node kind this session ships. */
export type ChainNode = Node<ChainNodeData, 'chainSystem'>;

/** The node type key registered with React Flow. */
export const CHAIN_NODE_TYPE = 'chainSystem';

/**
 * The widget frame's width in canvas pixels — the node box every consumer
 * shares: `syncNodes` declares it on the node object, `edge-geometry` clips
 * connection lines to this box, and the camera pads fit bounds with it.
 * Deliberately px (not rem-derived) so browser base-font settings cannot
 * desynchronize the rendered frame from these constants.
 */
export const SYSTEM_FRAME_WIDTH = 120;

/** The widget frame's height in canvas pixels; see `SYSTEM_FRAME_WIDTH`. */
export const SYSTEM_FRAME_HEIGHT = 88;

/**
 * The handles exist because React Flow requires them for an edge's endpoints
 * to be valid; the chain edge computes its own frame-to-frame geometry and
 * never reads their positions. They stay invisible and inert at the disc's
 * center (opacity, not `display: none` — a display-none handle would measure
 * at the frame's top-left corner).
 */
const CENTER_HANDLE_CLASS =
  'left-1/2! top-1/2! -translate-x-1/2! -translate-y-1/2! opacity-0 pointer-events-none';

/**
 * The motion class for one node's inner element, or `null` for none. A
 * dragging node carries no motion presentation whatever its window (HC-2).
 */
export function nodeMotionClass(
  motion: NodeMotion | undefined,
  dragging: boolean,
): string | null {
  if (dragging || motion === undefined) return null;
  if (motion.phase === 'entering') return 'map-node-enter';
  return motion.heavy === true ? 'map-node-exit-heavy' : 'map-node-exit';
}

/** Pure presentation flags shared by every authored, halo, and stub node render. */
function nodePresentation(data: ChainNodeData) {
  const stub = data.stub !== undefined;
  const staticStub = data.stub !== undefined && 'staticId' in data.stub;
  const fogged = data.halo?.fogged === true;
  const exiting = data.motion !== undefined && data.motion.phase !== 'entering';
  return {
    stub,
    staticStub,
    fogged,
    derived: data.halo !== undefined || stub,
    chromeClass: fogged || stub || exiting ? null : 'pointer-events-auto',
  } as const;
}

/**
 * The header line for one node. Systems keep their name and scanned stubs keep
 * their signature id; guaranteed-static stubs use their wormhole code. Every
 * header stays neutral while derived ghosts remain visually provisional
 * through the frame's opacity.
 */
export function nodeHeader(data: ChainNodeData): {
  readonly text: string;
  readonly toneClass: string;
} {
  return { text: data.name, toneClass: 'text-name' };
}

/** Renders one system as a widget frame: header name, centered disc, widget slots. */
function SystemNodeComponent({ id, data, dragging, isConnectable }: NodeProps<ChainNode>) {
  const { stub, staticStub, derived, fogged, chromeClass } = nodePresentation(data);
  const header = nodeHeader(data);
  const classification = stub
    ? systemDestinationClassReadout(data.whClassId ?? null)
    : systemClassificationReadout({
        security: data.security ?? null,
        whClassId: data.whClassId ?? null,
      });
  // The wrapper is pointer-inert for every node (`INERT_NODE_STYLE` in
  // chain/nodes.ts); only the visible chrome re-enables pointer events, so
  // the invisible frame margin cannot catch clicks, drags, or hovers. Ghosts
  // (exit motion) and the fogged ring re-enable nothing and stay fully inert.
  return (
    <div
      data-chain-node
      aria-hidden={fogged || undefined}
      data-dragging={dragging || undefined}
      data-chain-node-derived={derived || undefined}
      data-chain-node-fogged={fogged || undefined}
      data-chain-node-stub={stub || undefined}
      data-chain-node-static-stub={staticStub || undefined}
      className={cn(
        'relative h-full w-full',
        // Provisional presentation: derived systems read dimmer than authored
        // truth; the fogged ring is invisible under the cloud (the fog canvas
        // paints below nodes, so the node hides itself — SC-3.2).
        derived && (fogged ? 'opacity-0' : 'opacity-75'),
        nodeMotionClass(data.motion, dragging),
      )}
    >
      <span
        data-chain-node-name
        className={cn(
          'absolute inset-x-1 top-1 truncate text-center font-ui text-nav font-bold',
          header.toneClass,
          chromeClass,
        )}
      >
        {header.text}
      </span>
      <div
        className={cn(
          'map-node-disc absolute left-1/2 top-1/2 flex size-[44px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section',
          derived && 'border-dashed',
          chromeClass,
        )}
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className={CENTER_HANDLE_CLASS}
        />
        {/* Every node keeps its identity above the disc and its colored,
            truthful class/security indicator inside it. */}
        {classification !== null ? (
          <span
            data-chain-node-classification
            className={cn(
              'font-ui text-nav font-bold uppercase tracking-label',
              classification.tone,
            )}
          >
            {classification.label}
          </span>
        ) : null}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className={CENTER_HANDLE_CLASS}
        />
        <div
          data-chain-node-widgets
          className="absolute -right-[13px] -top-[3px] flex items-center justify-end gap-0.5"
        >
          {stub ? null : <PilotPresenceBadge systemId={Number(id)} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized (drag hardening, IS-5): the moved node still re-renders every drag
 * frame through React Flow's store (its `positionAbsoluteX/Y` props change),
 * but every OTHER node's wrapper receives identical props and skips — the
 * per-frame commit stays proportional to actual movers.
 */
export const SystemNode = memo(SystemNodeComponent);
