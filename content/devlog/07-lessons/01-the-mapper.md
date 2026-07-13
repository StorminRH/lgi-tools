## The Mapper
<!-- updated: 2026-06-30 -->

The mapper is the feature the architecture has been circling around, but it is not finished in this repo yet.

That distinction is important. LGI.tools has the foundation for a mapper: the full persistent universe in the SDE tables, wormhole class tags, static known-space jump graph, Convex live-sync lessons, a renderer spike, and route/lint/CSP rails. It does not yet have the production mapper data model, production collaborative routes, or a real shared wormhole-chain store.

That is the right state for it to be in. The mapper is not just another page.

Wormhole mapping is shared working state. Connections are discovered, named, rescanned, rolled, and deleted by people who are online together. A useful mapper has to represent topology, signatures, notes, connection state, mass/life hints, system attributes, and who is actively looking at the chain. Some of that data is EVE-derived. Some is user-authored. Some is corporation-private. Some is live collaboration. Treating all of it as “map data” would be the first mistake.

The first foundation landed in [PR #157](https://github.com/StorminRH/lgi-tools/pull/157): the SDE universe widened from known space into every persistent solar system, including J-space. The schema now stores wormhole class IDs on systems and a static stargate jump graph for known-space/Pochven routing. It explicitly does not try to store Anoik-style statics, effects, or richer wormhole attributes in that first table. Those belong in a later related layer, not mixed into the first-party CCP data.<sup><a href="#code-mapper-sde-foundation">1</a></sup>

That split matters because the mapper will combine different authorities. CCP’s SDE can say which solar systems exist and which known-space systems have gates. Other data can enrich wormhole systems with statics and effects. The user can add scanned connections. The corporation or group can add notes. The architecture needs to preserve those sources instead of flattening them into one blob.

The second foundation was not data. It was renderer evaluation. [PR #166](https://github.com/StorminRH/lgi-tools/pull/166) added `/dev/sandbox/mapper` as a throwaway spike using React Flow for a node graph and dnd-kit for signature reordering. The route is deliberately static, unlinked, hardcoded, and hidden from real product surfaces. That was not a small implementation detail; it was the whole point. I wanted to answer “does this renderer feel right and fit the CSP/style rules?” without also designing persistence, permissions, live sync, and map storage in the same session.<sup><a href="#code-mapper-route-static">2</a></sup><sup><a href="#code-mapper-sandbox-page">3</a></sup>

The React Flow half proved the graph interaction: draggable systems, handles, drawn connections, pan/zoom, controls, and minimap. The nodes are class-only and shaped to the site’s terminal aesthetic. The spike also records a React Flow-specific rule: keep `nodeTypes` module-level so nodes do not remount every render.<sup><a href="#code-mapper-react-flow-spike">4</a></sup>

The dnd-kit half tested the signature-list interaction. The common dnd-kit example uses inline styles for transforms; this repo avoids JSX `style` attributes. The spike writes transform values into CSS custom properties through CSSOM instead, then lets a class consume them. It also gives `DndContext` a stable ID to avoid server/client hydration mismatch in generated accessibility IDs.<sup><a href="#code-mapper-dnd-spike">5</a></sup>

That is exactly the kind of pre-work I want before giving an AI agent the real mapper. The renderer choice was tested in isolation. The CSP path was tested in isolation. The hydration gotcha was found in isolation. None of that required a production map schema.

The harder question is where the mapper state lives. The Convex chapter already established the default rule: Convex is a live whiteboard, not the source of record, unless the mapper becomes the explicit exception. The live tracker migration reinforced that rule. Slow, cached, per-owner ESI mirrors belong in Neon. Small genuinely live signals can live in Convex. The mapper may need both. A user-authored map is not regenerable from ESI, but it is also exactly the kind of collaborative state Convex is good at.

The current live engine already leaves a seam for that future. The active dataset registry only serves `onlineStatus` today, but the engine comments reserve the pattern for a future consumer such as the mapper. Presence, cold rows, scan cadence, Workpool dispatch, generation guards, and bounded backlogs are already learned patterns. The mapper should reuse the lessons, not reuse the exact online-status shape blindly.<sup><a href="#code-mapper-live-engine-seam">6</a></sup>

The fan-out rule is the biggest design constraint. A mapper cannot be one giant reactive document. If one scout renames a signature and every watcher re-reads the whole chain, the first version may feel fine with two pilots and fall apart later. The data model has to split by change rate and watcher set: topology edges, system nodes, signatures, notes, active viewers, and perhaps layout positions are different streams. Some need immediate collaboration. Some can be stale-gated. Some should be local-only until saved.

The auth model is just as important. A public wormhole site page can be static. A mapper is not public. It is group state. That means the same lessons from corporation access apply: membership is not role, scope is not consent, and a body-supplied map ID is never authority by itself. The production mapper will need a clear answer for who owns a map, who can see it, who can edit it, what gets purged, what gets retained, and what happens when a character leaves or transfers.

So the architecture direction is not “build a map.” It is:

First, keep first-party universe facts in Neon with the SDE pipeline. Second, enrich wormhole-specific reference data through a separate layer. Third, treat scanned topology and notes as user- or group-authored state with explicit ownership and deletion rules. Fourth, use Convex only where the collaboration benefit is real and the subscription scope is narrow. Fifth, keep the renderer a client island and prove route mode, CSP, and hydration behavior before mixing in live data.

The mapper is the feature most likely to reward all the earlier mistakes. The project already learned what happens when live data is placed too broadly, when subscriptions re-read too much, when route mode drifts silently, when styling escapes the rails, and when cleanup coverage is added after the fact. The mapper should be the first major feature built after those lessons, not before them.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-mapper-sde-foundation" file="src/data/eve-data/schema.ts" lines="155-221,13-35" lang="ts" -->
```ts id="g7z6xv"
// Universe (map + NPC station) data. Sourced from CCP's `map*` / `npcStations`
// / `stationOperations` / `stationServices` JSONL files. Covers every PERSISTENT
// New Eden system — K-space + Pochven + J-space (wormhole) — plus the static
// stargate jump graph. Instanced abyssal deadspace and special/non-standard
// regions stay excluded.
//
// The richer mapper attribute layer (per-WH statics + environmental effects,
// sourced from anoik.is) is NOT here — it attaches later via a related table.
export const eveSolarSystems = pgTable('eve_solar_systems', {
  id: integer('id').primaryKey(),
  constellationId: integer('constellation_id').notNull().references(() => eveConstellations.id),
  regionId: integer('region_id').notNull().references(() => eveRegions.id),
  name: text('name').notNull(),
  securityStatus: doublePrecision('security_status'),
  wormholeClassId: integer('wormhole_class_id'),
});

// Static stargate topology as a derived system↔system jump graph. Only the
// adjacency is stored — gate ids/positions aren't kept, because route adjacency
// for the mapper needs neighbours, not gate geometry.
export const eveSystemJumps = pgTable('eve_system_jumps', {
  fromSystemId: integer('from_system_id').notNull().references(() => eveSolarSystems.id),
  toSystemId: integer('to_system_id').notNull().references(() => eveSolarSystems.id),
}, (t) => ({ pk: primaryKey({ columns: [t.fromSystemId, t.toSystemId] }) }));
```

<!-- uth:code id="code-mapper-route-static" file="scripts/route-classification.json" lines="7-35" lang="json" -->
```json id="9cdxh2"
{
  "_reasons": {
    "/dev/sandbox/mapper": "Unlinked dev mapper renderer spike (OOB.4.1) — static shell over hardcoded sample data; the React Flow node graph + dnd-kit reorder list are a client island. No PageShell, no DB/live reads."
  },
  "routes": {
    "/dev/sandbox/mapper": "static"
  }
}
```

<!-- uth:code id="code-mapper-sandbox-page" file="src/app/dev/sandbox/mapper/page.tsx" lines="3-19" lang="tsx" -->
```tsx id="ty1ptx"
import { SandboxHeader } from '../_shared/sandbox-ui';
import { MapperDemo } from './MapperDemo';

// Renderer/interaction spike for the future wormhole mapper. No DB read and no
// request-time input; the graph + list data are hardcoded, so this leaf
// prerenders fully static. Like the other sandbox leaves it carries no auth gate.
export default function MapperSpikePage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Wormhole Mapper — Renderer Spike"
        subtitle="React Flow graph + dnd-kit reorder · throwaway evaluation"
      />
      <MapperDemo />
    </div>
  );
}
```

<!-- uth:code id="code-mapper-react-flow-spike" file="src/app/dev/sandbox/mapper/MapperDemo.tsx" lines="5-12,52-83,102-124" lang="tsx" -->
```tsx id="33cajw"
// Throwaway renderer/interaction spike. Two demos prove the v4.0 mapper feel:
// a React Flow node graph and a dnd-kit drag-to-reorder list. This is renderer /
// interaction ONLY: the mapper's data-cost / subscription fan-out is separate.

type SystemData = { label: string; wclass: string; statics: string; home?: boolean };
type WormholeNode = Node<SystemData, 'wormholeSystem'>;

function WormholeSystemNode({ data }: NodeProps<WormholeNode>) {
  return (
    <div className={data.home ? 'min-w-[132px] border border-isk bg-section' : 'min-w-[132px] border border-border bg-section'}>
      <Handle type="target" position={Position.Top} />
      <div>{data.wclass}</div>
      <div>{data.label}</div>
      <div>{data.statics}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { wormholeSystem: WormholeSystemNode } satisfies NodeTypes;

function MapperGraph() {
  const [nodes, , onNodesChange] = useNodesState<WormholeNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  return <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView />;
}
```

<!-- uth:code id="code-mapper-dnd-spike" file="src/app/dev/sandbox/mapper/MapperDemo.tsx" lines="141-158,189-205" lang="tsx" -->
```tsx id="6x9e19"
// dnd-kit applies the per-item transform via an inline style in its docs; here
// it is written to CSS vars through the house CSSOM pattern, so there is no JSX
// `style` attribute and no eslint exemption.
function SortableSig({ sig }: { sig: Sig }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sig.id });
  const ref = useRef<HTMLLIElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--sbx-tf', CSS.Transform.toString(transform) || 'none');
    el.style.setProperty('--sbx-tr', transition ?? 'none');
  }, [transform, transition]);
}

<DndContext id="mapper-signatures" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
  <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
    {/* rows */}
  </SortableContext>
</DndContext>
```

<!-- uth:code id="code-mapper-live-engine-seam" file="convex/engine.ts" lines="8-23,10-17" lang="ts" -->
```ts id="twd4n4"
// Trigger classes: 'while-watched', 'on-view', and 'on-schedule'. The on-schedule
// class has no live consumer since the jobs trackers moved to Neon; it is reserved
// for a future consumer such as the v4.0 mapper.
//
// The engine's stored dataset literal is a single live consumer today
// (onlineStatus). The union is designed to hold a superset of the active registry
// while a dataset is being retired. The v4.0 mapper re-instantiates the pattern
// against its own dataset lifecycle.
const syncDatasetValidator = v.literal('onlineStatus');
const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;
```
<!-- uth:code-excerpts:end -->
