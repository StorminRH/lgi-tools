'use client';

// OOB.4.1 throwaway renderer/interaction spike. Two demos prove the v4.0
// wormhole-mapper feel on this stack: a React Flow node graph (draggable
// systems + connections, pan/zoom) and a dnd-kit drag-to-reorder list. Both
// are className + CSSOM only — no JSX `style` attribute — so they pass the
// house-style lint ban with no eslint exemption, and CSP-clean under the
// post-OOB.1.1 `style-src 'self' 'unsafe-inline'` (proven by mapper-csp-probe).
// This is renderer/interaction ONLY: the mapper's data-cost / F² subscription
// fan-out is SA.4's domain (v4.0 ledger #6), out of scope here.

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { VariantFrame } from '../_shared/sandbox-ui';

/* ── React Flow: wormhole-chain graph ─────────────────────────────────────*/

type SystemData = {
  label: string;
  wclass: string;
  statics: string;
  home?: boolean;
};
type WormholeNode = Node<SystemData, 'wormholeSystem'>;

// Custom node, styled className-only against the EVE terminal tokens. React
// Flow's own positioning transform is an inline style emitted inside
// node_modules — never our `src/`, so it neither lint-fails nor CSP-fails.
function WormholeSystemNode({ data }: NodeProps<WormholeNode>) {
  return (
    <div
      className={
        data.home
          ? 'min-w-[132px] rounded-[4px] border border-isk bg-section px-3 py-2 shadow-[0_0_0_1px_rgba(61,214,140,0.25)]'
          : 'min-w-[132px] rounded-[4px] border border-border bg-section px-3 py-2'
      }
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-border !bg-isk-sub" />
      <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-isk">{data.wclass}</div>
      <div className="font-display text-[13px] tracking-[0.04em] text-name">{data.label}</div>
      <div className="mt-0.5 font-mono text-[9px] text-muted">{data.statics}</div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-border !bg-isk-sub" />
    </div>
  );
}

// Module-level so React Flow doesn't warn about a fresh nodeTypes object each
// render (which would re-mount every node).
const nodeTypes = { wormholeSystem: WormholeSystemNode } satisfies NodeTypes;

const initialNodes: WormholeNode[] = [
  { id: 'home', type: 'wormholeSystem', position: { x: 260, y: 0 }, data: { label: 'J155416', wclass: 'C5 · home', statics: 'static C247 · C5', home: true } },
  { id: 'a', type: 'wormholeSystem', position: { x: 40, y: 150 }, data: { label: 'J110145', wclass: 'C3', statics: 'static N968 · C3' } },
  { id: 'b', type: 'wormholeSystem', position: { x: 300, y: 150 }, data: { label: 'J164710', wclass: 'C2', statics: 'statics D382 · E175' } },
  { id: 'c', type: 'wormholeSystem', position: { x: 540, y: 150 }, data: { label: 'Turnur', wclass: 'lowsec', statics: 'eve-scout · EOL' } },
  { id: 'd', type: 'wormholeSystem', position: { x: 160, y: 300 }, data: { label: 'J143245', wclass: 'C4', statics: 'static O477 · C3' } },
  { id: 'e', type: 'wormholeSystem', position: { x: 420, y: 300 }, data: { label: 'J100200', wclass: 'C1', statics: 'mass-crit' } },
];

const initialEdges: Edge[] = [
  { id: 'home-a', source: 'home', target: 'a' },
  { id: 'home-b', source: 'home', target: 'b' },
  { id: 'b-c', source: 'b', target: 'c' },
  { id: 'a-d', source: 'a', target: 'd' },
  { id: 'b-e', source: 'b', target: 'e', animated: true },
];

function MapperGraph() {
  const [nodes, , onNodesChange] = useNodesState<WormholeNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-[3px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

/* ── dnd-kit: signature reorder list ──────────────────────────────────────*/

type Sig = { id: string; code: string; label: string };

const initialSigs: Sig[] = [
  { id: 'ABC', code: 'ABC-123', label: 'Wormhole · C247 → C5' },
  { id: 'DEF', code: 'DEF-456', label: 'Data · Unsecured Frontier Database' },
  { id: 'GHI', code: 'GHI-789', label: 'Relic · Forgotten Frontier Recursor' },
  { id: 'JKL', code: 'JKL-012', label: 'Gas · Barren Perimeter Reservoir' },
  { id: 'MNO', code: 'MNO-345', label: 'Wormhole · N968 → C3' },
];

// Classic dnd-kit (stable) applies the per-item transform via an inline style in
// its docs; we write it to CSS vars via the house CSSOM pattern instead (mirrors
// the odometer variant's ref.style.setProperty('--digit', …)), so no JSX `style`
// attribute and no eslint exemption. The `.sbx-sortable` class reads the vars.
function SortableSig({ sig }: { sig: Sig }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sig.id });
  const ref = useRef<HTMLLIElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--sbx-tf', CSS.Transform.toString(transform) ?? 'none');
    el.style.setProperty('--sbx-tr', transition ?? 'none');
  }, [transform, transition]);

  const setRefs = useCallback(
    (node: HTMLLIElement | null) => {
      ref.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  return (
    <li
      ref={setRefs}
      {...attributes}
      {...listeners}
      data-dragging={isDragging || undefined}
      className="sbx-sortable flex cursor-grab items-baseline gap-3 rounded-[4px] border border-border-soft bg-section px-3 py-2 active:cursor-grabbing"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-isk">{sig.code}</span>
      <span className="font-mono text-[11px] text-muted">{sig.label}</span>
    </li>
  );
}

function SortableSignatures() {
  const [items, setItems] = useState(initialSigs);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const from = prev.findIndex((s) => s.id === active.id);
        const to = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, from, to);
      });
    }
  }, []);

  return (
    // Stable `id` so dnd-kit's generated aria-describedby is deterministic across
    // server/client — without it, dnd-kit's module-level id counter sits at a
    // different value during SSR than on the fresh client render, which React
    // flags as a hydration mismatch.
    <DndContext id="mapper-signatures" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <SortableSig key={s.id} sig={s} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/* ── Page island ──────────────────────────────────────────────────────────*/

export function MapperDemo() {
  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-10">
      <VariantFrame
        tag="RF"
        title="React Flow — chain graph"
        notes="Drag systems to reposition · drag from a handle to draw a connection · pan/zoom/minimap. Throwaway evaluation of React Flow as the v4.0 mapper renderer."
      >
        <MapperGraph />
      </VariantFrame>

      <VariantFrame
        tag="DND"
        title="dnd-kit — signature reorder"
        notes="Drag a row to reorder. Classic dnd-kit, transform applied via CSSOM custom-properties (no inline style)."
      >
        <SortableSignatures />
      </VariantFrame>
    </div>
  );
}
