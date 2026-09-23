'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { systemSecurityClass } from '@/data/eve-data/security';
import {
  systemClassificationReadout,
  systemDestinationClassReadout,
  systemDestinationHintReadout,
} from '@/data/eve-data/system-identity';
import {
  destinationHintSoleClassId,
  type WormholeDestinationHint,
} from '@/data/eve-data/wormhole-contract';
import type { NodeMotion } from '../motion/motion-contract';
import { PilotPresenceBadge } from './PilotPresenceBadge';
import { ChainViewportContext } from './ChainViewportContext';
import { WormholeVisual } from './wormhole/WormholeVisual';

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

export function nodeMotionClass(motion: NodeMotion | undefined): string | null {
  if (motion === undefined) return null;
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
    exiting,
    chromeClass: fogged || stub || exiting ? null : 'pointer-events-auto nopan',
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

type WormholeAppearance = { readonly classId: number | null };

function wormholeAppearance(data: ChainNodeData): WormholeAppearance | null {
  const classId = data.whClassId ?? (
    data.stub !== undefined && data.destinationHint != null
      ? destinationHintSoleClassId(data.destinationHint)
      : null
  );
  if (classId !== null) {
    return systemSecurityClass(null, classId) === 'wormhole' ? { classId } : null;
  }
  return data.stub === undefined ? null : { classId: null };
}

function NodeDisc({
  derived,
  chromeClass,
  isConnectable,
  classification,
  stub,
  systemId,
  appearance,
  active,
  paused,
  seed,
}: {
  readonly derived: boolean;
  readonly chromeClass: string | null;
  readonly isConnectable: boolean | undefined;
  readonly classification: { readonly label: string; readonly tone: string } | null;
  readonly stub: boolean;
  readonly systemId: number;
  readonly appearance: WormholeAppearance | null;
  readonly active: boolean;
  readonly paused: boolean;
  readonly seed: string;
}) {
  return (
    <div
      className={cn(
        'map-node-disc absolute left-1/2 top-1/2 flex size-[55px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section',
        derived && 'border-dashed',
        appearance !== null && 'map-node-disc-wormhole',
        chromeClass,
      )}
    >
      {appearance !== null ? (
        <WormholeVisual
          whClassId={appearance.classId}
          active={active}
          paused={paused}
          seed={seed}
          size={75}
        />
      ) : null}
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

function SystemNodeComponent({ id, data, isConnectable, selected, dragging }: NodeProps<ChainNode>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportMoveListeners = useContext(ChainViewportContext);
  const [hovered, setHovered] = useState(false);
  const { stub, staticStub, derived, fogged, exiting, chromeClass } = nodePresentation(data);
  const header = nodeHeader(data);
  const classification = nodeClassification(data, stub);
  const appearance = wormholeAppearance(data);
  const paused = dragging === true || fogged || stub || exiting;
  const active = hovered || selected === true;
  useEffect(() => {
    if (!hovered || viewportMoveListeners === null) return;
    const release = () => {
      const node = rootRef.current;
      if (node !== null && !node.matches(':hover')) setHovered(false);
    };
    viewportMoveListeners.add(release);
    return () => {
      viewportMoveListeners.delete(release);
    };
  }, [hovered, viewportMoveListeners]);
  return (
    <div
      ref={rootRef}
      data-chain-node
      data-chain-node-selected={selected === true || undefined}
      aria-hidden={fogged || undefined}
      data-chain-node-derived={derived || undefined}
      data-chain-node-fogged={fogged || undefined}
      data-chain-node-stub={stub || undefined}
      data-chain-node-static-stub={staticStub || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      className={cn(
        'relative h-full w-full',
        derived && (fogged ? 'opacity-0' : 'opacity-75'),
        nodeMotionClass(data.motion),
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
        appearance={appearance}
        active={active}
        paused={paused}
        seed={id}
      />
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
