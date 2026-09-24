'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  type WormholeEffect,
} from '@/data/eve-data/wormhole-contract';
import type { NodeMotion } from '../motion/motion-contract';
import { IntelIcon } from '../windows/IntelIcon';
import { useUniverseAssets } from '../chain/use-universe-assets';
import { kspaceCaptionOffset } from './disc-chrome';
import { SystemIntelMarks } from './SystemIntelMarks';
import { ChainViewportContext } from './ChainViewportContext';
import type { DiscBody } from './wormhole/palette';
import { WormholeVisual } from './wormhole/WormholeVisual';

export type ChainNodeData = {
  name: string;
  className: string | null;
  security?: number | null;
  whClassId?: number | null;
  effect?: WormholeEffect | null;
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

export { SYSTEM_DISC_SIZE } from './disc-chrome';

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

interface BodyFacts {
  readonly whClassId: number | null;
  readonly effect: WormholeEffect | null;
  readonly security: number | null;
  readonly hint: WormholeDestinationHint | null;
  readonly stub: boolean;
}

function paintedBody({ whClassId, effect, security, hint, stub }: BodyFacts): DiscBody | null {
  const classId = whClassId ?? (stub && hint !== null ? destinationHintSoleClassId(hint) : null);
  if (classId !== null && systemSecurityClass(null, classId) === 'wormhole') {
    return { kind: 'wormhole', classId, effect };
  }
  if (stub) return classId === null ? { kind: 'wormhole', classId: null, effect: null } : null;
  return security === null ? null : { kind: 'planet', security };
}

function usePaintedBody(data: ChainNodeData, stub: boolean): DiscBody | null {
  const whClassId = data.whClassId ?? null;
  const effect = data.effect ?? null;
  const security = data.security ?? null;
  const hint = data.destinationHint ?? null;
  return useMemo(
    () => paintedBody({ whClassId, effect, security, hint, stub }),
    [whClassId, effect, security, hint, stub],
  );
}

const DISC_BODY_CLASS: Readonly<Record<DiscBody['kind'], string>> = {
  wormhole: 'map-node-disc-wormhole',
  planet: 'map-node-disc-planet',
};

function NodeDisc({
  derived,
  chromeClass,
  isConnectable,
  classification,
  stub,
  systemId,
  body,
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
  readonly body: DiscBody | null;
  readonly active: boolean;
  readonly paused: boolean;
  readonly seed: string;
}) {
  return (
    <div
      className={cn(
        'map-node-disc absolute left-1/2 top-1/2 flex size-[55px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section',
        derived && 'border-dashed',
        body !== null && DISC_BODY_CLASS[body.kind],
        chromeClass,
      )}
    >
      {body !== null ? (
        <WormholeVisual body={body} active={active} paused={paused} seed={seed} />
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
      {stub ? null : <SystemIntelMarks systemId={systemId} />}
    </div>
  );
}

function KnownSpaceCaption({
  systemId,
  text,
  toneClass,
  chromeClass,
}: {
  readonly systemId: number;
  readonly text: string;
  readonly toneClass: string;
  readonly chromeClass: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const assets = useUniverseAssets();
  const info = assets?.systemInfo(systemId);
  const hub = assets?.hubJumps(systemId)[0];
  const offset = kspaceCaptionOffset();
  const transform = `translate(-50%, -100%) translate(${offset.x}px, ${offset.y}px)`;
  useLayoutEffect(() => {
    ref.current?.style.setProperty('--kspace-caption-transform', transform);
  }, [transform]);
  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-1/2 flex w-full flex-col [transform:var(--kspace-caption-transform)]"
    >
      {hub?.jumps != null ? (
        <span data-chain-node-hub className="flex items-center justify-center gap-1 font-data text-micro text-intel-market">
          <IntelIcon kind="market" />{hub.name} {hub.jumps}
        </span>
      ) : null}
      <span
        data-chain-node-name
        className={cn(
          'min-w-0 truncate px-1 text-center font-ui text-nav font-bold leading-none',
          toneClass,
          chromeClass,
        )}
      >
        {text}
      </span>
      {info?.regionName ? (
        <span className="min-w-0 truncate px-1 text-center font-data text-micro leading-none text-muted">
          {info.regionName}
        </span>
      ) : null}
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
  const body = usePaintedBody(data, stub);
  const showKspaceCaption =
    !derived && systemSecurityClass(data.security ?? null, data.whClassId ?? null) !== 'wormhole';
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
      {showKspaceCaption ? (
        <KnownSpaceCaption
          systemId={Number(id)}
          text={header.text}
          toneClass={header.toneClass}
          chromeClass={chromeClass}
        />
      ) : (
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
      )}
      <NodeDisc
        derived={derived}
        chromeClass={chromeClass}
        isConnectable={isConnectable}
        classification={classification}
        stub={stub}
        systemId={Number(id)}
        body={body}
        active={active}
        paused={paused}
        seed={id}
      />
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
