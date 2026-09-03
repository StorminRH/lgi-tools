'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import {
  systemClassificationReadout,
  systemDestinationClassReadout,
  systemDestinationHintReadout,
} from '@/data/eve-data/system-identity';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import type { NodeMotion } from '../motion/motion-contract';
import { PilotPresenceBadge } from './PilotPresenceBadge';

export type ChainNodeData = {
  name: string;
  className: string | null;
  security?: number | null;
  whClassId?: number | null;
  destinationHint?: WormholeDestinationHint | null;
  motion?: NodeMotion;
  halo?: { readonly ring: number; readonly fogged: boolean };
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

export type ChainNode = Node<ChainNodeData, 'chainSystem'>;

export const CHAIN_NODE_TYPE = 'chainSystem';

export const SYSTEM_FRAME_WIDTH = 150;

export const SYSTEM_FRAME_HEIGHT = 110;

export const SYSTEM_DISC_SIZE = 55;

const CENTER_HANDLE_CLASS =
  'left-1/2! top-1/2! -translate-x-1/2! -translate-y-1/2! opacity-0 pointer-events-none';

export function nodeMotionClass(
  motion: NodeMotion | undefined,
  dragging: boolean,
): string | null {
  if (dragging || motion === undefined) return null;
  if (motion.phase === 'entering') return 'map-node-enter';
  return motion.heavy === true ? 'map-node-exit-heavy' : 'map-node-exit';
}

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

function nodeHeader(data: ChainNodeData): {
  readonly text: string;
  readonly toneClass: string;
} {
  return { text: data.name, toneClass: 'text-name' };
}

export function chipFontSizePx(
  scrollWidth: number,
  clientWidth: number,
  basePx: number,
  minPx = 8,
): number {
  if (!(basePx > 0) || clientWidth <= 0 || scrollWidth <= clientWidth) {
    return basePx;
  }
  return Math.max(minPx, (basePx * clientWidth) / scrollWidth);
}

function ClassificationChip({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.removeProperty('--chip-fs');
    const basePx = Number.parseFloat(getComputedStyle(el).fontSize);
    const fitted = chipFontSizePx(el.scrollWidth, el.clientWidth, basePx);
    if (fitted < basePx) {
      el.style.setProperty('--chip-fs', `${fitted}px`);
    }
  }, [label]);
  return (
    <span
      ref={ref}
      data-chain-node-classification
      className={cn(
        'min-w-0 max-w-full overflow-hidden whitespace-nowrap px-0.5 font-ui font-bold uppercase leading-none tracking-optical',
        tone,
      )}
    >
      {label}
    </span>
  );
}

function nodeClassification(data: ChainNodeData, stub: boolean) {
  if (stub) {
    return (
      systemDestinationClassReadout(data.whClassId ?? null)
      ?? systemDestinationHintReadout(data.destinationHint ?? null)
    );
  }
  return systemClassificationReadout({
    security: data.security ?? null,
    whClassId: data.whClassId ?? null,
  });
}

function NodeDisc({
  derived,
  chromeClass,
  isConnectable,
  classification,
  stub,
  systemId,
}: {
  readonly derived: boolean;
  readonly chromeClass: string | null;
  readonly isConnectable: boolean | undefined;
  readonly classification: { readonly label: string; readonly tone: string } | null;
  readonly stub: boolean;
  readonly systemId: number;
}) {
  return (
    <div
      className={cn(
        'map-node-disc absolute left-1/2 top-1/2 flex size-[55px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section',
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
      {classification !== null ? (
        <ClassificationChip
          label={classification.label}
          tone={classification.tone}
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={CENTER_HANDLE_CLASS}
      />
      <div
        data-chain-node-widgets
        className="absolute -right-[16px] -top-[4px] flex items-center justify-end gap-0.5"
      >
        {stub ? null : <PilotPresenceBadge systemId={systemId} />}
      </div>
    </div>
  );
}

function SystemNodeComponent({ id, data, dragging, isConnectable }: NodeProps<ChainNode>) {
  const { stub, staticStub, derived, fogged, chromeClass } = nodePresentation(data);
  const header = nodeHeader(data);
  const classification = nodeClassification(data, stub);
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
      <NodeDisc
        derived={derived}
        chromeClass={chromeClass}
        isConnectable={isConnectable}
        classification={classification}
        stub={stub}
        systemId={Number(id)}
      />
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
