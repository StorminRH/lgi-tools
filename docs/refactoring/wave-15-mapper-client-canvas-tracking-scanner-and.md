# Wave 15: Mapper client: canvas, tracking, scanner and authoring

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 14: Convex backend helpers](wave-14-convex-backend-helpers.md) · [Index](README.md#roadmap) · [Wave 16: Large cross-cutting migrations (last)](wave-16-large-cross-cutting-migrations-last.md) →

Canvas first:
1. Dead camera state, kernel positions to the reconciler, tree-link claim, compass.
2. MeasuredNode, then pointToward, then the frame coalescer (medium).
3. useStyleProperties (medium), Escape dismiss, dial tables.

Then tracking: readConvexError and the setTracking failure path, then the HomePrompt tracking rewrite (P038 closes on it), then SystemTerminalSearch and homeCurrentSystem. Then identities and prompt cards. Then the connection labels module, readouts and scanner select, then ScannerCombo. Last: signature removal with undo, scanner row open targets (after P072), and the optimistic-authoring helpers.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P307](#p307) | Delete dead camera flight state and collapse mapper camera-fit, window and edge pass-throughs | simplification | M | low | low | — |
| ☐ | [P308](#p308) | Pass kernel positions straight to reconcileChain and trim stub-layout and syncNodes duplication | simplification | M | low | low | — |
| ☐ | [P309](#p309) | Share one tree-link claim between map edge drawing and the layout crossing report | simplification | S | low | low | — |
| ☐ | [P310](#p310) | Hoist compass ring-slot arithmetic per ring and make compassKernel async | simplification | S | low | low | — |
| ☐ | [P055](#p055) | Declare the measured-node shape once in edge-geometry and pass React Flow internal nodes to it directly for camera focus | react-hook | S | low | low | — |
| ☐ | [P109](#p109) | Merge pointOnRayAtRadius and leader-path's toward into one pointToward in src/mapper/lib/geometry.ts, with shared Point and Box types; leave layout trig and coordinate-space types alone | generic-utility | S | low | low | [P055](#p055) |
| ☐ | [P111](#p111) | Extract a frame coalescer and guarded size observer into src/mapper/lib | generic-utility | S | medium | low | [P109](#p109) |
| ☐ | [P044](#p044) | Add one commit-time style-ref hook for CSS custom properties (ui zone) | react-hook | M | medium | medium | [P277](wave-01-quick-wins-delete-dead-code-fix-small.md#p277) |
| ☐ | [P051](#p051) | Move the open-popup check to ui and share one Escape-dismiss hook between the board and the mapper | react-hook | S | low | medium | — |
| ☐ | [P027](#p027) | Drive the dev dial panel from dial tables with one clamped commit helper | ui-component | M | low | medium | — |
| ☐ | [P217](#p217) | Decode ConvexError payloads in one helper and route every setTracking call through one failure path | error-handling | S | low | medium | — |
| ☐ | [P028](#p028) | Route HomePrompt's tracking portraits through the trackable roster, a shared toggle hook and CharacterPortraitPicker | ui-component | M | low | medium | [P217](#p217), [P059](wave-01-quick-wins-delete-dead-code-fix-small.md#p059) |
| ☐ | [P038](#p038) | Render HomePrompt's tracking portraits with CharacterPortraitPicker and share TrackingControls' tracking toggle | ui-component | S | low | medium | [P028](#p028) |
| ☐ | [P029](#p029) | Extract SystemTerminalSearch for the mapper's system pickers and stop NodeAddMenu offering a self-loop | ui-component | S | low | medium | [P028](#p028) |
| ☐ | [P269](#p269) | Derive HomePrompt's current system from dockCharacters and resolvePasteTarget | feature-skeleton | S | low | medium | [P028](#p028) |
| ☐ | [P032](#p032) | Resolve Friendlies names through useCharacterIdentities and share the tracked-character row content between the dock picker and the scanner prompt | ui-component | S | low | low | [P075](wave-12-market-data-search-and-client-data-reads.md#p075) |
| ☐ | [P033](#p033) | Extract a MapPromptCard shell for the scanner prompt rail and give every prompt group semantics | ui-component | S | low | low | [P032](#p032) |
| ☐ | [P030](#p030) | Move wormhole field labels into one module, give OptionalSelectField a children slot for mass/life/leads, and add a memoised useWormholeTypeSearch | ui-component | S | low | medium | — |
| ☐ | [P092](#p092) | Single-source the wormhole connection labels in mapper/authoring, share one leads readout, and fold the twin scanner selects | formatting | S | low | medium | [P030](#p030) |
| ☐ | [P031](#p031) | Extract a controlled ScannerCombo shell, a shared wormhole combo-item mapper and class chip, and one ScannerOptionalSelect for scanner mass and life | ui-component | M | medium | medium | [P030](#p030), [P092](#p092), [P039](wave-07-ui-kit-primitives-src-components-ui.md#p039) |
| ☐ | [P139](#p139) | Grow signature-toast.ts into signature-removal.ts with removeSignaturesWithUndo/restoreSignaturesAndInvalidate and route the missing-flow, stub and event-log paths through it | error-handling | S | low | medium | — |
| ☐ | [P298](#p298) | Make a scanner row's open action the ScannerPanelTarget and remove the dead trigger/clientX/clientY plumbing | simplification | S | low | medium | [P072](wave-13-industry-planner-and-wormhole-sites-verticals.md#p072) |
| ☐ | [P218](#p218) | Factor the connection-query and loaded-page helpers inside optimistic-authoring.ts, and make branch restore patch unresolved holes too | client-data | S | low | low | [P082](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p082), [P329](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p329), [P262](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p262), [P139](#p139) |

<a id="p307"></a>

## P307: Delete dead camera flight state and collapse mapper camera-fit, window and edge pass-throughs

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** Production about -120 / +35; tests about -70 / +45
- **Depends on:** —

**Problem.** The mapper canvas carries indirection that only tests exercise. Camera fit is split across six exported deciders, of which production calls only resolveFitTick, and two of them re-scan intents with the same predicate. Both camera flights increment and settle a generation counter that nothing ever reads. Several small wrappers rename or recompute values the caller already has: useSurfacePresence, nodeHeader with KnownSpaceCaption.toneClass, two identical array-equality helpers, a useCallback that never memoizes, a duplicated visible-segment computation in ChainLinkEdge, and a redundant measured flag in computeFollowerTransform.

**Verifier revision.** The core is real, and one part is stronger than proposed. CameraFlight bookkeeping (IDLE_FLIGHT, beginFlight, settleFlight, flightRef) is write-only state. Grepping src for flightRef, CameraFlight, .active and 'flight' shows nothing reads flightRef.current to make a decision; only settleFlight reads its own argument. So the right change is to delete it, not to wrap it in a flyCamera helper. The four layered fit deciders are confirmed: only resolveFitTick is imported by production (use-camera-follow.ts:17); systemsNeedingFit, nodesReadyForFit, shouldFitView, decideCameraFit, planCameraFit and decideFitExecution are test-only exports, and systemsNeedingFit and shouldFitView repeat the same appeared-or-moved predicate. Other confirmed items: useSurfacePresence renames deriveSurfaces' output; nodeHeader returns a constant tone class, and KnownSpaceCaption's toneClass prop only ever receives 'text-name'; ChainLinkEdge computes visibleChainLinkSegment twice per render; computeFollowerTransform's measured argument is always `anchor !== undefined` at its only production caller. Added: sameStack and sameSelectedIds in MapWindowLayer are byte-identical, and useWindowStack's useCallback depends on a liveIds array that deriveSurfaces rebuilds every render, so the memo never holds. Downgraded: hoisting the label boxes is tidiness, not efficiency. It saves two four-field allocations per edge per render, which is negligible at chain sizes of tens to a few hundred edges.

**Sites (15).**

- [`src/mapper/canvas/camera-follow-model.ts:6-74`](../../src/mapper/canvas/camera-follow-model.ts#L6-L74) — systemsNeedingFit, nodesReadyForFit, shouldFitView (re-scans the same predicate as systemsNeedingFit), CameraFitAction, CameraFitPlan, decideCameraFit, planCameraFit. All test-only.
- [`src/mapper/canvas/camera-follow-model.ts:130-181`](../../src/mapper/canvas/camera-follow-model.ts#L130-L181) — FitExecution, decideFitExecution and resolveFitTick each re-declare the same input shape; only resolveFitTick is used in production
- [`src/mapper/canvas/camera-follow-model.ts:228-245`](../../src/mapper/canvas/camera-follow-model.ts#L228-L245) — CameraFlight, IDLE_FLIGHT, beginFlight, settleFlight: written but never read
- [`src/mapper/canvas/use-camera-follow.ts:8-21, 29-55, 65-112, 152, 170, 203-210`](../../src/mapper/canvas/use-camera-follow.ts#L8-L21) — applyCappedFit and runCameraFitEffect each spell the setViewport signature (36-39, 76-79) and thread flightRef. The focus effect begins and settles a flight with a .then whose only job is the dead bookkeeping.
- [`src/mapper/canvas/camera-follow-model.test.ts:6-23, 39-85, 89-150, 189-217`](../../src/mapper/canvas/camera-follow-model.test.ts#L6-L23) — Tests target the test-only deciders and the flight lifecycle (the beginFlight/settleFlight asserts at the end of 'camera easing, chain bounds, and flight lifecycle')
- [`src/mapper/windows/MapWindowLayer.tsx:34-40`](../../src/mapper/windows/MapWindowLayer.tsx#L34-L40) — sameStack and sameSelectedIds are identical shallow ordered-array equality
- [`src/mapper/windows/MapWindowLayer.tsx:52-67, 258-263`](../../src/mapper/windows/MapWindowLayer.tsx#L52-L67) — useSurfacePresence is a non-hook rename of deriveSurfaces' { surfaces, summarySystemId }
- [`src/mapper/windows/MapWindowLayer.tsx:69-82, 300`](../../src/mapper/windows/MapWindowLayer.tsx#L69-L82) — useCallback([liveIds]) never memoizes because liveIds is a fresh array each render; its only consumer is an inline arrow at 300
- [`src/mapper/windows/window-model.ts:34-44`](../../src/mapper/windows/window-model.ts#L34-L44) — deriveSurfaces allocates a new surfaces array per call
- [`src/mapper/canvas/SystemNode.tsx:87-92, 242-280, 302-320`](../../src/mapper/canvas/SystemNode.tsx#L87-L92) — nodeHeader returns { text: data.name, toneClass: 'text-name' }; KnownSpaceCaption.toneClass only ever receives that constant
- [`src/mapper/canvas/ChainLinkEdge.tsx:175-176`](../../src/mapper/canvas/ChainLinkEdge.tsx#L175-L176) — chainLinkPath(...) internally calls visibleChainLinkSegment, then the next line calls it again with the same arguments
- [`src/mapper/canvas/edge-geometry.ts:71-97, 215-222`](../../src/mapper/canvas/edge-geometry.ts#L71-L97) — kspaceCaptionBox() and frameNameBox() are pure functions of module constants, rebuilt per connectionLabelBox call (lines 189-190); chainLinkPath wraps visibleChainLinkSegment
- [`src/mapper/canvas/edge-geometry.test.ts:6-16, 102-113, 143-171`](../../src/mapper/canvas/edge-geometry.test.ts#L6-L16) — Tests import chainLinkPath, kspaceCaptionBox, frameNameBox
- [`src/mapper/windows/follower-model.ts:304-313, 499-509`](../../src/mapper/windows/follower-model.ts#L304-L313) — `if (!measured \|\| anchor === undefined)`, and the only production caller passes `anchor !== undefined`
- [`src/mapper/windows/follower-model.test.ts:160-245`](../../src/mapper/windows/follower-model.test.ts#L160-L245) — Eight test calls pass `true` with a defined anchor, or `false` with an undefined anchor (228)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/canvas/camera-follow-model.ts:183-226`](../../src/mapper/canvas/camera-follow-model.ts#L183-L226) — decideFocus, newFocusRequest and focusCenter are used by the focus effect and carry real logic. Keep them.
- [`src/mapper/canvas/map-controls-model.ts:180-181`](../../src/mapper/canvas/map-controls-model.ts#L180-L181) — Ordered-sequence equality against a config constant; different call shape and module, so not worth sharing the MapWindowLayer helper for one more site
- [`src/mapper/canvas/disc-chrome.ts:26-28`](../../src/mapper/canvas/disc-chrome.ts#L26-L28) — kspaceCaptionOffset() is also a constant function, but it is used by SystemNode for a CSS transform as well. It can be left alone or hoisted the same way; it is not part of the label-box finding.

</details>

**Home.** `Everything stays in its owning file inside the mapper zone: src/mapper/canvas/camera-follow-model.ts (one resolveFitTick), src/mapper/canvas/use-camera-follow.ts, src/mapper/windows/MapWindowLayer.tsx, src/mapper/canvas/SystemNode.tsx, src/mapper/canvas/edge-geometry.ts (+ segmentPath, label-box constants), src/mapper/canvas/ChainLinkEdge.tsx, src/mapper/windows/follower-model.ts.`

**Boundary check.** No cross-zone imports are added. All files are in zone 'mapper' (src/mapper/**), and the only new imports are intra-mapper: ChainLinkEdge -> edge-geometry segmentPath, already imported from the same module. External imports are unchanged (@xyflow/react, react, '@/lib/use-client-committed', allowed under mapper allow [..., 'lib']).

**API sketch.**

```ts
// camera-follow-model.ts
export interface FitInput {
  readonly viewportReady: boolean;
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly frame: NodeFrameSize;
}
export interface FitTickResult { readonly consume: boolean; readonly bounds: CameraBounds | null; readonly framed: boolean }
export function resolveFitTick(input: FitInput): FitTickResult;
// edge-geometry.ts
export const KSPACE_CAPTION_BOX: LabelBox;
export const FRAME_NAME_BOX: LabelBox;
export function segmentPath(segment: FrameSegment): string; // `M sx,sy L ex,ey`
// follower-model.ts
export function computeFollowerTransform(baseline, anchorId, viewport, anchor: FollowerNode | undefined, card, layer): FollowerDecision | null;
```

**Migration steps.**

1. Camera fit model: in camera-follow-model.ts, add a private movedOrAppeared(intent) type guard and one exported FitInput type. Rewrite resolveFitTick as follows. If not viewportReady, or intents === previousIntents, return {consume:false, bounds:null, framed}. Let targets = intents.filter(movedOrAppeared). If targets is empty, or framed && !follow, return {consume:true, bounds:null, framed}. If some target systemId is not in nodeIds, return {consume:false, bounds:null, framed}. Otherwise compute bounds = chainBounds(systems, frame) and return {consume:true, bounds, framed: bounds !== null || framed}. Delete systemsNeedingFit, nodesReadyForFit, shouldFitView, CameraFitAction, CameraFitPlan, decideCameraFit, planCameraFit, FitExecution and decideFitExecution.
2. Flight state: delete CameraFlight, IDLE_FLIGHT, beginFlight and settleFlight (camera-follow-model.ts 228-245). In use-camera-follow.ts, remove flightRef (152), the flightRef parameters and threading (40, 82, 110, 170), and the beginFlight/settleFlight calls with their .then callbacks (42-43, 52-54, 204-210). Call `void setViewport(viewport, { duration, ease })` and `void setCenter(x, y, { zoom, duration, ease })` directly.
3. use-camera-follow.ts: after removing the flight state, define `type SetViewport = ReturnType<typeof useReactFlow>['setViewport']` once, or inline applyCappedFit into runCameraFitEffect, so the setViewport signature appears once.
4. Rewrite camera-follow-model.test.ts against resolveFitTick as one table: ignore (same intents), viewport not ready, skip (no appeared or moved intents; framed and not following), wait (nodes not mounted), fit (bounds plus framed flips true), fit with empty systems (consume true, bounds null, framed unchanged). Delete the flight-lifecycle asserts and keep the cameraEaseOf, chainBounds and focus tests.
5. MapWindowLayer.tsx: replace sameStack and sameSelectedIds with one `sameIds<T>(a: readonly T[], b: readonly T[])`. Inline useSurfacePresence as `const { surfaces: liveIds, summarySystemId } = deriveSurfaces({ dockSystemId, selectedIds, boxSelectActive })`. Then either drop the no-op useCallback in useWindowStack, or memoize liveIds with useMemo over [dockSystemId, boxSelectActive, selectedIds] so it actually holds. Pick one; the consumer at 300 is an inline arrow, so dropping it is simplest.
6. SystemNode.tsx: delete nodeHeader. Use data.name directly, drop KnownSpaceCaption's toneClass prop, and write the literal 'text-name' class into both className cn(...) calls (keep it a literal for Tailwind).
7. edge-geometry.ts: replace kspaceCaptionBox() and frameNameBox() with module constants KSPACE_CAPTION_BOX and FRAME_NAME_BOX (computed once from the same expressions). connectionLabelBox returns them. Add segmentPath(segment) and delete chainLinkPath. Update edge-geometry.test.ts: chainLinkPath(s, side, cut) becomes segmentPath(visibleChainLinkSegment(s, side, cut)), and kspaceCaptionBox() and frameNameBox() become the constants.
8. ChainLinkEdge.tsx 175-176: compute `const visibleSegment = visibleChainLinkSegment(segment, data?.fogSide, FOG_EDGE_CUT_FRACTION)` once and pass `path={segmentPath(visibleSegment)}`.
9. follower-model.ts: drop the measured parameter from computeFollowerTransform (304-313), change the guard to `if (anchor === undefined) return null`, and remove `anchor !== undefined` from createNodeFollower (505). Update the eight test calls in follower-model.test.ts.
10. Run focused mapper tests and pnpm check through the test-runner agent. surface.test.ts needs no manifest change, because no files are added or removed.

**Tests.** camera-follow-model.test.ts must be rewritten as a resolveFitTick table covering ignore, not-ready, skip (none and framed-not-following), wait, fit, and fit with empty systems. The existing 'fit execution ... one tick journey' test is the closest template. Delete the flight-lifecycle asserts. In edge-geometry.test.ts, lines 102-106 and 143-145 move to segmentPath(visibleChainLinkSegment(...)) with the same expected strings, and lines 151-171 switch to the label-box constants. In follower-model.test.ts 160-245, drop the boolean argument and keep expectations. window-model.test.ts already guards deriveSurfaces; MapWindowLayer has no unit test for the inlined rename, so rely on existing ChainHost and mapper e2e coverage. For the 'text-name' class on [data-chain-node-name], grep the existing SystemNode or chain tests before landing and add a render assertion if none exists.

**Notes.** Behavior to preserve in resolveFitTick: (1) the viewport-not-ready check comes first and never consumes; (2) the 'ignore' case (identical intents array) does not consume; (3) 'skip' consumes but does not fit; (4) 'wait' does not consume, so the same intents are re-examined when nodes mount; (5) with an empty systems map, a fit consumes but leaves framed unchanged because chainBounds returns null. The flight deletion has no behavior change, since no code reads flight.active or generation; the .then callbacks exist only to update that dead state. If a future feature needs 'is the camera mid-flight', it should be added with a real reader. Keep the 'text-name' Tailwind class as a literal string. Do not move it into a variable that the Tailwind scanner cannot see if the class is not also referenced elsewhere. The label-box hoist is not a measurable performance fix and should be described as tidiness. The fallow group pairing camera-follow-model.ts:163-169 with use-camera-follow.ts:29-35 and 65-71 is the repeated input-shape boilerplate that this collapse removes.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p308"></a>

## P308: Pass kernel positions straight to reconcileChain and trim stub-layout and syncNodes duplication

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** Production about -50 / +15; tests about -60 / +45 (new helper about 25 lines)
- **Depends on:** —

**Problem.** The merge pipeline keeps a strategy seam (PlacementAssigner) that has one production implementation, and that implementation ignores the PlacementInput built for it on every merge. In stub-layout.ts, stubKey only forwards to seatKey, assignHolderIds repeats the SeatedChild literal in both branches, and seatOrderedLayout builds `new Set(input.systems.map(...))` twice. In syncNodes, the authored-node and halo-node builders repeat the same base node and label data.

**Verifier revision.** The core is confirmed. PlacementAssigner has exactly one production implementation, assignerFromPositions, which returns `() => positions` and ignores its input. reconcileChain still builds a candidates array and spreads visible.values() on every merge only to feed it. The interface survives through test assigners (sequentialTestAssigner, assignerMoving, keepPositions, candidateOrderSpy) and a reconciler-compat test that asserts the order in which the assigner was consulted, which is an interface that production never observes. stubKey is confirmed as a pass-through to seatKey (3 uses). assignHolderIds pushes the same six-field object in both branches. seatOrderedLayout builds the same authored Set twice. The authored and halo node builders in syncNodes share base fields and the five-field label block; the relevant fallow group is dup-1169 (nodes.ts:253-259 and 278-284), not dup-879, which is an unrelated cross-file group. The scope changes are about cost: the test migration is larger than the finding implied (6 test files, including the surface.test.ts manifest), and the per-merge candidate allocation is O(n) and negligible, so the case is simplification, not efficiency.

**Sites (12).**

- [`src/mapper/chain/placement.ts:1-24`](../../src/mapper/chain/placement.ts#L1-L24) — PlacementCandidate, PlacementEdge, PlacementInput, PlacementAssigner; assignerFromPositions returns () => positions
- [`src/mapper/chain/reconciler.ts:7, 142-165`](../../src/mapper/chain/reconciler.ts#L7) — reconcileChain takes an assigner; builds candidates (152-155) and connections (158) that the only production assigner ignores; placeSystems already treats a missing proposal as ORIGIN or existing position
- [`src/mapper/chain/use-map-chain-merge.ts:31, 106-115`](../../src/mapper/chain/use-map-chain-merge.ts#L31) — Only production call: reconcileChain(previous.state, snapshot, assignerFromPositions(positions))
- [`src/mapper/chain/reconciler.test.ts:6, 20-38, 77-97`](../../src/mapper/chain/reconciler.test.ts#L6) — sequentialTestAssigner (reads candidate.position), assignerMoving, and replay(assigner) used across about 28 calls
- [`src/mapper/chain/nodes.test.ts:22, 28, 62, 138-229`](../../src/mapper/chain/nodes.test.ts#L22) — Own sequentialTestAssigner used with reconcileChain
- [`src/mapper/chain/use-map-chain.test.ts:32, 87-96, 631-767`](../../src/mapper/chain/use-map-chain.test.ts#L32) — keepPositions assigner used 7 times
- [`src/mapper/layout/reconciler-compat.test.ts:3, 35-60`](../../src/mapper/layout/reconciler-compat.test.ts#L3) — candidateOrderSpy asserts the assigner's consultation order; kernelResultAssigner wraps assignerFromPositions
- [`src/mapper/chain/seat-order.test.ts:5-8, 349-358`](../../src/mapper/chain/seat-order.test.ts#L5-L8) — assignerFromPositions(before/after)
- [`src/mapper/chain/surface.test.ts:73`](../../src/mapper/chain/surface.test.ts#L73) — Mapper file manifest lists 'chain/placement.ts' (manifest excludes __tests__/)
- [`src/mapper/chain/stub-layout.ts:146-170, 337, 375`](../../src/mapper/chain/stub-layout.ts#L146-L170) — seatKey; stubKey(row) => seatKey(row), used at 168, 337, 375
- [`src/mapper/chain/stub-layout.ts:261-303`](../../src/mapper/chain/stub-layout.ts#L261-L303) — assignHolderIds pushes identical six-field literals at 273-280 and 284-291; authored Set built at 301 and again at 303
- [`src/mapper/chain/nodes.ts:232-294`](../../src/mapper/chain/nodes.ts#L232-L294) — Authored (241-262) and halo (264-294) builders share spread-stripped-local, id, type, width, height, position, style and the five-field label data

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/chain/nodes.ts:296-338`](../../src/mapper/chain/nodes.ts#L296-L338) — Stub nodes spread the raw local node (not stripDerivedControls), set a different control set, and build stub-specific data. Do not fold them into the system-node base.
- [`src/mapper/signatures/system-readout.ts:17`](../../src/mapper/signatures/system-readout.ts#L17) — Also maps a SystemLabel, but into a readout shape rather than ChainNodeData. Not the same concept.
- [`src/mapper/chain/reconciler.ts:202-204`](../../src/mapper/chain/reconciler.ts#L202-L204) — endpointKey is directional (`from>to`) and is not mapper/lib pairKey, which is unordered. Leave it.

</details>

**Home.** `src/mapper/chain/reconciler.ts (reconcileChain takes positions); delete src/mapper/chain/placement.ts; test-only sequential placement in src/mapper/chain/__tests__/sequential-positions.ts; private systemNodeBase helper in src/mapper/chain/nodes.ts; stub-layout cleanups in place.`

**Boundary check.** Everything is inside zone 'mapper' (src/mapper/**). reconciler.test.ts, nodes.test.ts, use-map-chain.test.ts and seat-order.test.ts (mapper/chain) and reconciler-compat.test.ts (mapper/layout) import the new helper at src/mapper/chain/__tests__/, which is intra-mapper. mapper/layout tests already import from ../chain. surface.test.ts filters out __tests__/ paths, so the helper does not enter the manifest. No cross-zone imports are added.

**API sketch.**

```ts
// reconciler.ts
export function reconcileChain(
  previous: ChainState,
  snapshot: ChainSnapshot,
  positions: ReadonlyMap<number, ChainPosition>,
): ChainMerge;
// __tests__/sequential-positions.ts (test-only)
export function sequentialPositions(
  previous: ChainState,
  snapshot: ChainSnapshot,
  overrides?: ReadonlyMap<number, ChainPosition>,
): Map<number, ChainPosition>;
// nodes.ts (private)
function systemNodeBase(id: string, position: ChainPosition, label: SystemLabel, local: ChainNode | undefined): ChainNode;
```

**Migration steps.**

1. Add src/mapper/chain/__tests__/sequential-positions.ts. It reproduces what sequentialTestAssigner saw: retained systems (previous ids still in the snapshot, or all previous ids when snapshot.systems.complete is false) keep their positions and occupy their slots. Arrivals, in snapshot row order, take the next free 6-column slot. Optional overrides replace entries, which replaces assignerMoving.
2. Change reconcileChain(previous, snapshot, positions) and pass positions straight to placeSystems as proposals. Delete the candidates and connections construction (reconciler.ts 152-159) and the placement import.
3. use-map-chain-merge.ts 109-115: call reconcileChain(previous.state, snapshot, positions) and drop the assignerFromPositions import.
4. Migrate the tests. reconciler.test.ts and nodes.test.ts replace their sequentialTestAssigner with sequentialPositions(previous, snapshot), and assignerMoving becomes the overrides argument. In use-map-chain.test.ts, replace keepPositions with a full map giving every snapshot system id its existing position, or {x: systemId, y: 0} if it has none, so the result matches keepPositions exactly. seat-order.test.ts passes before and after directly. In reconciler-compat.test.ts, pass kernel results directly and rewrite the candidate-order tests to assert the observable order: [...merge.state.systems.keys()] and the order of system-appeared intents.
5. Delete src/mapper/chain/placement.ts and remove 'chain/placement.ts' from the surface.test.ts manifest (line 73).
6. stub-layout.ts: replace the stubKey calls (168, 337, 375) with seatKey and delete stubKey. In assignHolderIds, push `{ ...group, childId: group.childId }` for resolved groups and `{ ...group, childId: nextHolder }` for holders. In seatOrderedLayout, build `const authored = new Set(...)` once, before assignHolderIds, and pass it in. assignHolderIds copies it into usedIds, so the later authored.add calls do not leak.
7. nodes.ts: add a private systemNodeBase(id, position, label, local) that returns the shared base (stripDerivedControls(local) spread, id, type, width, height, position, style, and data {name, className, security, whClassId, effect}). Authored nodes become the base. Halo nodes become {...base, draggable: false, data: {...base.data, halo: {ring, fogged}}} followed by the existing fogged override.
8. Run the mapper chain and layout tests and pnpm check through the test-runner agent.

**Tests.** reconciler.test.ts, nodes.test.ts, use-map-chain.test.ts, seat-order.test.ts and reconciler-compat.test.ts must keep their current expectations after switching to positions maps. The new sequentialPositions helper must reproduce the old slot choices: a departed system's slot becomes free in a complete snapshot and stays occupied in an incomplete one. Replace the reconciler-compat candidate-order assertions with assertions on the state.systems key order and the system-appeared intent order (retained first in previous order, then arrivals in snapshot order). stub-layout.test.ts guards stubLayoutSignature, stubPostKey, seatOrderedLayout and the holder ids (negative ids skipping authored ids). The nodes.test.ts syncNodes cases guard the authored and halo node shapes, including fogged halo nodes with selected and selectable false.

**Notes.** Preserve the placeSystems fallbacks: a new system missing from positions lands at ORIGIN, and an existing system missing from positions keeps its position. The production kernel already returns positions for every fact system, so this does not change production behavior. The intents order in reconcileChain (departed systems, departed connections, appeared systems, appeared connections, moved) is unchanged. The test adapter must model resolvePresentSystems exactly: a departed system in a complete snapshot frees its slot. Otherwise expected positions in the existing tests will shift. Do not export resolvePresentSystems for tests; duplicate its three-line rule in the helper. In assignHolderIds, `{...group}` is safe because SeatCandidate and SeatedChild have the same six fields; only childId narrows from number|null to number. Do not fold stub nodes into systemNodeBase: they intentionally spread the raw local node and force connectable and focusable false.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p309"></a>

## P309: Share one tree-link claim between map edge drawing and the layout crossing report

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** Production about -20 / +12; tests about +25
- **Depends on:** —
- **Existing primitive:** `src/mapper/layout/facts.ts:deriveChainTree`

**Problem.** The rule that decides which chain links draw solid (the first link between a tree parent and child) and which draw as loops is implemented twice. nodes.ts newPairClaim drives the map's dashed edges, and proof-kit layoutSegments drives the crossingReport used by layout property tests and map-replay. The two use different keys (pair key vs child slot) and different code. A change to one would leave layout quality metrics measuring something other than what the map draws.

**Verifier revision.** The core holds. nodes.ts newPairClaim and proof-kit layoutSegments both encode the rule that a link is solid only if it is the first link joining a tree parent and child; every other link is a loop. Keying by unordered pair (nodes.ts) and keying by child id (proof-kit) are equivalent: in a tree each child has exactly one parent, so each tree pair maps to exactly one child, and deriveChainTree never creates mutual parents. The two implementations agree today, but proof-kit's crossingReport, used by properties.test.ts and src/scripts/map-replay.ts, measures loops with its own copy instead of the classifier that draws dashed edges on the map, so they can drift. Revised scope: (1) Removing ChainTree.loopEdges, or deriving it from the claim, is NOT the same concept. loopEdges excludes edges where neither endpoint is attached (orphan components), while the claim marks those as loop, so facts.test.ts would expect `[]` where the claim yields a loop. loopEdges is cheap and is the derivation's test oracle; keep it out of this change. (2) Rejected the kernel-protocol change that would return parents and rootSystemId from the worker. deriveChainTree on the main thread is linear-to-quadratic over chains of tens to a few hundred edges, sub-millisecond, while changing LayoutKernel's return type touches the worker message, the in-process fallback, compassKernel and every determinism and stability test.

**Sites (9).**

- [`src/mapper/chain/nodes.ts:374-398`](../../src/mapper/chain/nodes.ts#L374-L398) — buildEdges creates the claim and calls claimSolid for each non-skeleton connection (after the tombstone filter)
- [`src/mapper/chain/nodes.ts:415-431`](../../src/mapper/chain/nodes.ts#L415-L431) — newPairClaim: isTreeLink = parents.get(b)===a \|\| parents.get(a)===b; first claim per pairKey is solid; also tracks a separate 'rendered' pair set
- [`src/mapper/chain/nodes.ts:433-452`](../../src/mapper/chain/nodes.ts#L433-L452) — appendHaloEdges shares the same claim (claimSolid plus rendered) for halo links
- [`src/mapper/layout/proof-kit.ts:166-193`](../../src/mapper/layout/proof-kit.ts#L166-L193) — layoutSegments re-implements the rule with treeSlotUsed keyed by child id, and skips self-loops and edges without positions
- [`src/mapper/layout/proof-kit.ts:195-211`](../../src/mapper/layout/proof-kit.ts#L195-L211) — crossingReport consumes layoutSegments' loop flags
- [`src/mapper/layout/properties.test.ts:5, 42, 63`](../../src/mapper/layout/properties.test.ts#L5) — Consumers of crossingReport (treeTreeCrossings must be 0)
- [`src/mapper/chain/nodes.test.ts:240-263, 374`](../../src/mapper/chain/nodes.test.ts#L240-L263) — 'classifies tree links solid and loop closures dashed, once per pair' and the halo loop flags guard the production classifier
- [`src/mapper/layout/facts.ts:84-121`](../../src/mapper/layout/facts.ts#L84-L121) — deriveChainTree produces the parents map both classifiers consume; facts.ts imports only layout-contract, so adding the claim here creates no cycle
- [`src/mapper/lib/pair-key.ts:1-3`](../../src/mapper/lib/pair-key.ts#L1-L3) — Existing unordered pairKey, also used by halo-model and pilot-path

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/layout/facts.ts:3-10, 28-36, 47-53, 113-120`](../../src/mapper/layout/facts.ts#L3-L10) — ChainTree.loopEdges has derivation semantics (edges examined after both endpoints were attached) and excludes orphan-component edges, which the claim would mark as loop. facts.test.ts (50, 68, 75, 82, 89-92, 98, 125, 155, 162) and proof-kit.test.ts:51 pin it deliberately. It is not the same concept, so leave it.
- [`src/mapper/chain/use-map-chain-merge.ts:105-132`](../../src/mapper/chain/use-map-chain-merge.ts#L105-L132) — Re-deriving the tree on the main thread after the worker is not worth a kernel protocol change at realistic chain sizes. Rejected as an efficiency item.
- [`src/mapper/layout/compass.ts:224-232`](../../src/mapper/layout/compass.ts#L224-L232) — compassKernel derives the tree in the worker for layout; it is the kernel's own use, not a duplicate classifier

</details>

**Home.** `src/mapper/layout/facts.ts (export treeLinkClaim beside deriveChainTree)`

**Boundary check.** Both consumers and the home are in zone 'mapper' (src/mapper/**): nodes.ts (mapper/chain) and proof-kit.ts (mapper/layout) import from src/mapper/layout/facts.ts. mapper/chain already imports layout/facts (use-map-chain-merge.ts:11), and facts.ts imports nothing from chain, so there is no circular dependency. src/scripts/map-replay.ts (zone scripts) reaches the claim only through proof-kit, and scripts may import mapper per rule scripts allow [..., 'mapper']. The child-keyed design needs no pairKey import, so facts.ts stays free of mapper/lib; even if pairKey were used, it is intra-mapper.

**API sketch.**

```ts
// src/mapper/layout/facts.ts
/** First link joining a tree parent and its child is solid; every other link (duplicates, cross links, self links, orphan links) is a loop. */
export function treeLinkClaim(
  parents: ReadonlyMap<number, number>,
): (a: number, b: number) => boolean {
  const claimed = new Set<number>();
  return (a, b) => {
    const child = parents.get(b) === a ? b : parents.get(a) === b ? a : null;
    if (child === null || claimed.has(child)) return false;
    claimed.add(child);
    return true;
  };
}
```

**Migration steps.**

1. Add treeLinkClaim to src/mapper/layout/facts.ts as sketched, with unit tests in facts.test.ts.
2. nodes.ts: newPairClaim keeps its 'rendered' pair set (needed by appendHaloEdges to skip halo links already drawn as connections) but delegates solidity: `const isSolid = treeLinkClaim(treeParents)`, and claimSolid(a, b) records rendered.add(pairKey(a, b)) and returns isSolid(a, b). Alternatively rename it to edgeClaim to make the split explicit. Keep the call order: connections first (after the tombstone filter), then halo links.
3. proof-kit.ts layoutSegments: keep the skips for missing positions and self-loops, then set `loop: !isSolid(edge.fromSystemId, edge.toSystemId)` with `const isSolid = treeLinkClaim(deriveChainTree(facts).parents)`. Delete treeSlotUsed and the two-branch if/else.
4. Leave ChainTree.loopEdges, use-map-chain-merge's main-thread deriveChainTree and the LayoutKernel signature unchanged.
5. Run the mapper layout and chain tests (properties, stability, determinism, proof-kit, facts, nodes) and pnpm check through the test-runner agent.

**Tests.** Add facts.test.ts cases for treeLinkClaim: a parent-to-child link is solid; the reverse direction (child-to-parent) is solid when first; a second link for the same pair is a loop; a cross link between attached non-parent systems is a loop; a self link is a loop; links in an orphan component are loops. Existing guards: nodes.test.ts 240-263 (solid or dashed once per pair) and 374 (halo loop flags); properties.test.ts 42 and 63 (crossingReport, treeTreeCrossings === 0); proof-kit.test.ts. Optionally add a parity test in proof-kit.test.ts: for every PROOF_CORPUS chain, crossingReport's loop flags equal buildEdges' data.loop for the same facts with all-active connections, which turns the shared rule into an enforced invariant.

**Notes.** Equivalence argument for the implementer: pair-keyed claiming (nodes.ts) and child-keyed claiming (proof-kit) select the same links, because each tree pair has exactly one child and deriveChainTree never sets parents in both directions. Self links: nodes.ts classifies a===b as a loop because parents.get(a)===a never holds, while proof-kit skips them. Keep that skip in proof-kit, since a self link has no segment to intersect. The claim is stateful and order-dependent: the first qualifying link in iteration order wins. buildEdges iterates the Map of visible connections, which keeps reconciler insertion order, after filtering skeleton and dying-with-live-pair tombstones; proof-kit iterates facts.connections. Each caller keeps its own iteration and filtering. The 'rendered' set in nodes.ts is a separate concern (halo dedupe) and must stay in nodes.ts. Do not derive loopEdges from the claim: for facts([A, C, D], [[C, D]]) loopEdges is [] but the claim marks C-D as a loop. Both P308 and P309 touch nodes.ts, in different functions (syncNodes vs buildEdges and newPairClaim), so either order works; land them as separate commits to avoid conflicts.

<sub>Reported by: gap:graph-traversal-and-mapper-layout.</sub>

<a id="p310"></a>

## P310: Hoist compass ring-slot arithmetic per ring and make compassKernel async

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** compass.ts about -14/+16 (net ~0, two duplicated blocks removed); layout.worker.ts -5; test +6
- **Depends on:** —

**Problem.** BucketRegistry.candidates and tryTake each compute bucketCount, step, start and the double-mod wrapped bucket index. take and tryTake each do the get-or-create Set write on this.taken. sweep calls bucketCount in its loop condition, and tryTake calls it again for every sideways step. compassKernel is synchronous and returns Promise.resolve, so a throw is not a rejection. Only the worker guards against that. The in-process fallbacks in useLayoutKernel are unguarded, and a synchronous throw there can strand other pending requests (die loop) or skip failRequest in useMapChainMerge.

**Verifier revision.** Both halves hold up. compassKernel is a plain arrow that returns Promise.resolve, so any throw from deriveChainTree, layoutTree or parkOrphans escapes synchronously. layout.worker.ts covers that with a try/catch. The in-process paths in use-layout-kernel do not: in die(), one synchronous throw aborts the loop and strands the remaining pendings. The fallback at :111 throws out of use-map-chain-merge's effect after postRequest has advanced the request state (:75-78), so failRequest (:138) never runs. Inside the Promise executor (:117-129) the throw rejects the caller, but the pending entry stays in the map until teardown. No code path in layout/*.ts throws today, so this is latent, but the fix is one keyword. The duplication is real, and fallow reports it as dup:4c6b72b7 (compass.ts:124-127 vs 147-150). The proposed helper shape needs to change. A per-call spotAt(ring, idealAngle, sideways) would recompute bucketCount/step/start for every sideways step in candidates(), which today computes them once per ring. That is the hot generator, run once per placed system across up to 4+8 rings. A get-or-create occupancy(ring) used for reads would also insert empty Sets on lookups. Hoist the ring geometry per ring and keep separate read and write helpers. The same hoist removes sweep's two bucketCount calls per iteration.

**Sites (11).**

- [`src/mapper/layout/compass.ts:117-138`](../../src/mapper/layout/compass.ts#L117-L138) — candidates: buckets/step/start once per ring, wrapped bucket at :132, read-only occupied lookup at :130/:133
- [`src/mapper/layout/compass.ts:140-144`](../../src/mapper/layout/compass.ts#L140-L144) — take: get-or-create Set, add, set
- [`src/mapper/layout/compass.ts:146-156`](../../src/mapper/layout/compass.ts#L146-L156) — tryTake: same arithmetic as :124-126/:132, plus the same get-or-create write as take
- [`src/mapper/layout/compass.ts:158-166`](../../src/mapper/layout/compass.ts#L158-L166) — sweep: bucketCount in the loop condition and again inside tryTake on every iteration
- [`src/mapper/layout/compass.ts:224-232`](../../src/mapper/layout/compass.ts#L224-L232) — Non-async LayoutKernel returning Promise.resolve(positions)
- [`src/mapper/layout/layout.worker.ts:29-47`](../../src/mapper/layout/layout.worker.ts#L29-L47) — try/catch around compassKernel(...).then(ok, fail), which only guards a synchronous throw
- [`src/mapper/layout/use-layout-kernel.ts:26-41`](../../src/mapper/layout/use-layout-kernel.ts#L26-L41) — settleInProcess calls compassKernel(...).then with no guard against a synchronous throw
- [`src/mapper/layout/use-layout-kernel.ts:80-92`](../../src/mapper/layout/use-layout-kernel.ts#L80-L92) — die() loops settleInProcess over every pending; one throw aborts the loop and strands the rest
- [`src/mapper/layout/use-layout-kernel.ts:109-112`](../../src/mapper/layout/use-layout-kernel.ts#L109-L112) — Fallback returns compassKernel(...) directly, so a throw escapes the returned LayoutKernel
- [`src/mapper/layout/use-layout-kernel.ts:117-129`](../../src/mapper/layout/use-layout-kernel.ts#L117-L129) — settleInProcess inside the Promise executor: the throw becomes a rejection, but pendingRef keeps the entry
- [`src/mapper/chain/use-map-chain-merge.ts:74-140`](../../src/mapper/chain/use-map-chain-merge.ts#L74-L140) — Consumer: postRequest advances state at :75-78 before `void layout(...)` at :106. A synchronous throw skips failRequest at :138

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/corp-viewer.ts:69`](../../src/composition/corp-viewer.ts#L69) — The only other sync `return Promise.resolve(` in production. Different zone and concept (role read), not a layout kernel

</details>

**Home.** `src/mapper/layout/compass.ts (module-private helpers, nothing exported); layout.worker.ts and use-layout-kernel.ts only consume the async kernel`

**Boundary check.** Everything stays in the mapper zone (src/mapper/**), and all edits are inside src/mapper/layout. No cross-zone import is added or removed. use-map-chain-merge.ts (also mapper) is untouched.

**API sketch.**

```ts
interface RingSlots { readonly buckets: number; readonly step: number; readonly start: number }
function ringSlots(ring: number, idealAngle: number, config: LayoutConfig): RingSlots // buckets=bucketCount(ring,config); step=FULL_CIRCLE/buckets; start=Math.round(normalizeAngle(idealAngle)/step)%buckets
function slotBucket(slots: RingSlots, sideways: number): number // (((slots.start + centerOut(sideways)) % slots.buckets) + slots.buckets) % slots.buckets
class BucketRegistry { private isTaken(ring: number, bucket: number): boolean; private mark(ring: number, bucket: number): void; private tryTake(ring: number, slots: RingSlots, sideways: number): ClaimedSpot | null }
export const compassKernel: LayoutKernel = async (facts, config = DEFAULT_LAYOUT_CONFIG) => { ...; return positions; }
```

**Migration steps.**

1. In compass.ts, add module-level ringSlots() and slotBucket() that copy the existing expressions character for character. Keep the evaluation order (bucketCount, then step = FULL_CIRCLE / buckets, then Math.round(normalizeAngle(idealAngle) / step) % buckets) so floats stay bit-identical.
2. Add private isTaken(ring, bucket) (this.taken.get(ring)?.has(bucket) === true) and private mark(ring, bucket) (get-or-create, add, set). Do not create Sets on read.
3. candidates(): compute `const slots = ringSlots(ring, idealAngle, this.config)` once per ring, derive window from slots.buckets, and replace :132-134 with slotBucket(slots, sideways) and isTaken(). Use angle = bucket * slots.step.
4. take(candidate): replace the body with this.mark(candidate.ring, candidate.bucket).
5. sweep(): compute slots once per ring, loop `sideways < slots.buckets`, and call tryTake(ring, slots, sideways). tryTake becomes: bucket = slotBucket(slots, sideways); if isTaken return null; mark; return { ring, angle: bucket * slots.step }.
6. Change compassKernel to an async arrow that returns positions. Keep the LayoutKernel annotation. eslint.config.mjs has no require-await rule, so no lint change is needed.
7. layout.worker.ts: delete the try/catch (:39-46) and keep `void compassKernel(facts, config).then(ok, fail)`.
8. use-layout-kernel.ts needs no code change. Its settleInProcess and fallback paths now get rejections. Optionally collapse the redundant arrow in settleInProcess.

**Tests.** Guards: src/mapper/layout/determinism.test.ts (fixture-equal positions), stability.test.ts, properties.test.ts, reconciler-compat.test.ts and src/mapper/chain/seat-order.test.ts all pin exact positions, so a reordered float expression fails them. Add to properties.test.ts or a new compass.test.ts: `const run = compassKernel({ systems: null } as unknown as LayoutFacts); await expect(run).rejects.toBeInstanceOf(TypeError);` and assert the call itself does not throw. That pins the async contract the worker and hook now rely on. No test covers use-layout-kernel or layout.worker today.

**Notes.** Bit-identical positions are the hard constraint. Copy the expressions verbatim and keep the per-ring hoist; do not recompute per sideways step. candidates() reads occupancy lazily, and claim() only calls take() right before returning, so switching from the captured `occupied` to per-iteration isTaken() does not change semantics. tryTake must keep its current short-circuit: no map write when the bucket is already taken. Making the kernel async keeps resolution timing (a non-thenable return resolves like Promise.resolve). The only observable change is that a synchronous throw becomes a rejection, which is what the worker already emulates and what use-map-chain-merge's rejection handler (:134-139) expects.

<sub>Reported by: gap:graph-traversal-and-mapper-layout.</sub>

<a id="p055"></a>

## P055: Declare the measured-node shape once in edge-geometry and pass React Flow internal nodes to it directly for camera focus

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -45 / +12
- **Depends on:** —
- **Existing primitive:** `src/mapper/canvas/edge-geometry.ts:endpointFrame, frameCenter`

**Problem.** Three places describe React Flow's measured internal node. edge-geometry.ts has EdgeEndpointNode, follower-model.ts has an identical FollowerNode without data, and use-camera-follow.ts has an inline parameter type on internalNodeSummary. The camera focus path flattens getInternalNode() into {x,y,width,height}, and focusCenter rebuilds the internal-node shape to call endpointFrame, threading an injected frame fallback that the declared node size already covers. SYSTEM_FRAME_WIDTH/HEIGHT is rebuilt into a size object locally in use-camera-follow.ts and in tests, and spelled out three times in chain/nodes.ts.

**Verifier revision.** The core is real. FollowerNode (follower-model.ts 5-15) is EdgeEndpointNode (edge-geometry.ts 160-166) minus the optional data field. use-camera-follow flattens getInternalNode() into {x,y,width,height} (223-245), and focusCenter then rebuilds {internals:{positionAbsolute}, measured} (camera-follow-model.ts 219-224) only to call endpointFrame. ChainLinkEdge already passes useInternalNode() straight into the same helper (ChainLinkEdge.tsx 164-166), which shows the round trip is unnecessary. The proposed design is wrong in two places. (1) Pick<InternalNode, 'internals' | ...> drags in internals.z and internals.userNode (InternalNodeBase in @xyflow/system 0.0.82, dist/esm/types/nodes.d.ts 83-100), so the minimal fakes in follower-model.test.ts 13-27 and edge-geometry.test.ts 34-47 would stop type-checking. A small structural interface is the right shape. (2) A SYSTEM_FRAME fallback parameter is not needed: every chain node declares width/height = SYSTEM_FRAME_* (chain/nodes.ts 250-251, 274-275, 306-307), and ChainSurface registers only the chain node type (ChainSurface.tsx 18), so endpointFrame's measured-then-declared fallback already resolves to the frame. Fog's nodeCenter works on user ChainNode.position, not InternalNode, so it is a different concept; at most it can share the size constant.

**Sites (12).**

- [`src/mapper/canvas/edge-geometry.ts:160-192`](../../src/mapper/canvas/edge-geometry.ts#L160-L192) — EdgeEndpointNode, endpointFrame (measured ?? declared width/height), chainLinkSegment
- [`src/mapper/windows/follower-model.ts:5-21`](../../src/mapper/windows/follower-model.ts#L5-L21) — FollowerNode duplicates EdgeEndpointNode minus data; FollowerState.nodeLookup typed with it
- [`src/mapper/windows/follower-model.ts:304-316`](../../src/mapper/windows/follower-model.ts#L304-L316) — computeFollowerTransform already passes FollowerNode to endpointFrame + frameCenter
- [`src/mapper/canvas/use-camera-follow.ts:22-27, 96`](../../src/mapper/canvas/use-camera-follow.ts#L22-L27) — Local SYSTEM_FRAME_SIZE object; still needed for chainBounds via resolveFitTick
- [`src/mapper/canvas/use-camera-follow.ts:194-201, 223-245`](../../src/mapper/canvas/use-camera-follow.ts#L194-L201) — focusCenter(internalNodeSummary(getInternalNode(id)), SYSTEM_FRAME_SIZE); internalNodeSummary flattens the internal node
- [`src/mapper/canvas/camera-follow-model.ts:209-226`](../../src/mapper/canvas/camera-follow-model.ts#L209-L226) — focusCenter rebuilds internals/measured and substitutes the frame for the declared width
- [`src/mapper/canvas/ChainLinkEdge.tsx:164-166`](../../src/mapper/canvas/ChainLinkEdge.tsx#L164-L166) — useInternalNode results go straight into chainLinkSegment/endpointFrame, which shows the InternalNode is assignable to the structural type
- [`src/mapper/chain/nodes.ts:250-251, 274-275, 306-307`](../../src/mapper/chain/nodes.ts#L250-L251) — Every chain node declares width/height = SYSTEM_FRAME_*; could spread a shared SYSTEM_FRAME_SIZE
- [`src/mapper/canvas/disc-chrome.ts:3-4`](../../src/mapper/canvas/disc-chrome.ts#L3-L4) — SYSTEM_FRAME_WIDTH/HEIGHT constants, the natural home for SYSTEM_FRAME_SIZE
- [`src/mapper/canvas/camera-follow-model.test.ts:32, 178-186`](../../src/mapper/canvas/camera-follow-model.test.ts#L32) — Local FRAME size object; focusCenter tests in the flattened shape
- [`src/mapper/windows/follower-model.test.ts:13-27`](../../src/mapper/windows/follower-model.test.ts#L13-L27) — Minimal fake nodes without z/userNode; must keep compiling
- [`src/mapper/canvas/edge-geometry.test.ts:34-47`](../../src/mapper/canvas/edge-geometry.test.ts#L34-L47) — Minimal fake endpoint builder without z/userNode

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/fog/fog-model.ts:54-61`](../../src/mapper/fog/fog-model.ts#L54-L61) — nodeCenter reads user ChainNode.position/width, not InternalNode internals; a different input. Only the size-constant fallback could be shared.
- [`src/mapper/canvas/camera-follow-model.ts:102-129`](../../src/mapper/canvas/camera-follow-model.ts#L102-L129) — NodeFrameSize/chainBounds are about fitting placed-system positions, not measured nodes; keep them

</details>

**Home.** `src/mapper/canvas/edge-geometry.ts (MeasuredNode, nodeCenter); src/mapper/canvas/disc-chrome.ts (SYSTEM_FRAME_SIZE)`

**Boundary check.** Every file involved is in the mapper zone (src/mapper/**): canvas/edge-geometry.ts, canvas/disc-chrome.ts, canvas/camera-follow-model.ts, canvas/use-camera-follow.ts, canvas/ChainLinkEdge.tsx, windows/follower-model.ts, chain/nodes.ts, fog/fog-model.ts. Intra-zone imports need no rule, and no new cross-zone edge is introduced. Because the shape is structural, edge-geometry does not need to import from @xyflow/react.

**API sketch.**

```ts
// edge-geometry.ts
export interface MeasuredNode {
  readonly internals: { readonly positionAbsolute: { readonly x: number; readonly y: number } };
  readonly measured: { readonly width?: number; readonly height?: number };
  readonly width?: number;
  readonly height?: number;
}
export interface EdgeEndpointNode extends MeasuredNode { readonly data?: NodeCaptionData }
export function endpointFrame(node: MeasuredNode | undefined): FrameRect | null; // unchanged body
export function nodeCenter(node: MeasuredNode | undefined): ChainPosition | null; // endpointFrame -> frameCenter

// disc-chrome.ts
export const SYSTEM_FRAME_SIZE = { width: SYSTEM_FRAME_WIDTH, height: SYSTEM_FRAME_HEIGHT } as const;
```

**Migration steps.**

1. edge-geometry.ts: split MeasuredNode out of EdgeEndpointNode (EdgeEndpointNode extends MeasuredNode with data), widen endpointFrame's parameter to MeasuredNode | undefined, and add nodeCenter(node) = frame === null ? null : frameCenter(frame).
2. follower-model.ts: delete FollowerNode (5-15) and type FollowerState.nodeLookup and computeFollowerTransform's anchor with MeasuredNode. Use endpointFrame/frameCenter or nodeCenter at 314-316.
3. use-camera-follow.ts: replace focusCenter(internalNodeSummary(getInternalNode(id)), SYSTEM_FRAME_SIZE) with nodeCenter(getInternalNode(request.nodeId)) and delete internalNodeSummary (223-245).
4. camera-follow-model.ts: delete focusCenter (209-226) and the now-unused endpointFrame import (check that frameCenter is still used elsewhere in the file, otherwise drop it too).
5. disc-chrome.ts: export SYSTEM_FRAME_SIZE. Use it in use-camera-follow.ts (replacing 24-27), in chain/nodes.ts via ...SYSTEM_FRAME_SIZE at the three node literals, and in camera-follow-model.test.ts (replacing local FRAME). Optionally use it in fog-model nodeCenter's fallback.
6. Update the tests, then run pnpm check via test-runner (fallow will flag focusCenter/FollowerNode leftovers as unused exports).

**Tests.** Move the camera-follow-model.test.ts 178-186 focusCenter cases to edge-geometry.test.ts as nodeCenter cases, using the existing endpoint builder (34-47): measured size wins, declared size is the fallback, missing size returns null, undefined returns null. The follower-model.test.ts 13-27 fakes and the edge-geometry.test.ts builders keep compiling unchanged because MeasuredNode stays minimal, which guards against reintroducing Pick<InternalNode>. Existing computeFollowerTransform and chainLinkSegment tests guard endpointFrame behavior.

**Notes.** Behavior difference: focusCenter today uses measured size and otherwise the injected frame, ignoring the node's declared width. nodeCenter uses measured size and then the declared width. For chain nodes the declared size is SYSTEM_FRAME_* (nodes.ts 250-251, 274-275, 306-307) and chain nodes are the only registered type (ChainSurface.tsx 18), so the results are identical. A node with neither measured nor declared size would now produce no focus instead of a frame-centered focus, which cannot happen today. Do not use Pick<InternalNode, ...>: internals then requires z and userNode, and the test fakes break. Fog's nodeCenter stays separate (user-node position, used by deriveFogReveals); sharing SYSTEM_FRAME_SIZE there is optional.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p109"></a>

## P109: Merge pointOnRayAtRadius and leader-path's toward into one pointToward in src/mapper/lib/geometry.ts, with shared Point and Box types; leave layout trig and coordinate-space types alone

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -20 production lines (RayPoint, LeaderPoint, LeaderRect, toward, pointOnRayAtRadius), +15 in mapper/lib/geometry.ts; tests move rather than grow
- **Depends on:** [P055](#p055)
- **Existing primitive:** `src/mapper/chain/intents.ts:ChainPosition,samePosition; src/mapper/canvas/edge-geometry.ts:pointOnRayAtRadius,frameCenter; src/mapper/layout/geometry.ts:headingVector`

**Problem.** The 'point at distance d along the ray from A toward B' helper is implemented twice. canvas/edge-geometry.ts:44-55 returns null on a zero span; windows/leader-path.ts:14-19 returns `from`. follower-model.ts:167 adapts one to the other with `?? anchor`. Each copy declares its own generic point type (RayPoint, LeaderPoint).

The signature editor declares LeaderRect, identical to edge-geometry's LabelBox. proof-kit.movedSystems compares x/y inline although samePosition exists in chain/intents, which proof-kit already imports from.

**Verifier revision.** Most of the proposal does not survive inspection.
(1) The deterministic layout math must stay separate. layout/trig.ts uses Math.sqrt and the polynomial detSin/detCos on purpose, and layout/determinism.test.ts:21-31 pins a committed cross-process digest. The render-side helpers (edge-geometry, leader-path, fog) all use Math.hypot. One shared distance would either change render output or invite non-deterministic functions into the layout kernel.
(2) The 're-derives headingVector in compass and overflow' claim is false. compass.ts:36-40 and overflow.ts:28-31 call headingVector. Only disc-chrome:18-24 uses Math.sin/-Math.cos, deliberately on the render side with cleanAxis.
(3) The 'lerp inlined in five places' claim is mostly false. edge-geometry:200-238, fog-painter:244-257 and fog-model:340-351 interpolate flattened scalar fields (startX, x1, lastX), not point objects. Only tween-model:56-59 lerps points.
(4) chainBounds and fogContentBounds are not the same function. One adds frame width/height to the max corner; the other pads both sides and walks discs plus stroke endpoints.
(5) 'Removes the windows->canvas and fog->canvas imports' is false. follower-model still needs endpointFrame and SYSTEM_DISC_SIZE, and fog-model still needs ChainNode and SYSTEM_FRAME_*. mapper is one boundary zone, so those imports are legal anyway.
(6) Re-homing ChainPosition rewrites 17 imports for nothing. ScreenPoint, ScreenSize and ChainPosition name different coordinate spaces, which is useful documentation.

What survives:
- edge-geometry.pointOnRayAtRadius and leader-path.toward are the same function with byte-identical arithmetic, drifted only on zero span (null versus `from`). follower-model:167 already bridges them with `?? anchor`.
- LeaderRect (editor-leader) duplicates LabelBox (edge-geometry), and RayPoint and LeaderPoint are generic copies of the same point type.
- proof-kit.movedSystems inlines samePosition.

**Sites (8).**

- [`src/mapper/canvas/edge-geometry.ts:39-55, 143-145`](../../src/mapper/canvas/edge-geometry.ts#L39-L55) — RayPoint and pointOnRayAtRadius (null on zero span); used by frameSegment, which needs the null
- [`src/mapper/canvas/edge-geometry.ts:57-62`](../../src/mapper/canvas/edge-geometry.ts#L57-L62) — LabelBox {left, right, top, bottom}
- [`src/mapper/windows/leader-path.ts:1-19, 40-42`](../../src/mapper/windows/leader-path.ts#L1-L19) — LeaderPoint, hypot distance and toward (returns from on zero span); same arithmetic as pointOnRayAtRadius
- [`src/mapper/windows/follower-model.ts:2, 167`](../../src/mapper/windows/follower-model.ts#L2) — imports pointOnRayAtRadius from canvas and applies `?? anchor`, which is leader-path's toward
- [`src/mapper/signatures/editor-leader.ts:1-8`](../../src/mapper/signatures/editor-leader.ts#L1-L8) — LeaderRect duplicates LabelBox
- [`src/mapper/layout/proof-kit.ts:141-153`](../../src/mapper/layout/proof-kit.ts#L141-L153) — movedSystems compares next.x/next.y inline instead of samePosition
- [`src/mapper/chain/intents.ts:1-4, 33-35`](../../src/mapper/chain/intents.ts#L1-L4) — ChainPosition and samePosition stay here
- [`src/mapper/lib/pair-key.ts:1-3`](../../src/mapper/lib/pair-key.ts#L1-L3) — src/mapper/lib already exists for cross-cutting pure mapper helpers (pair-key, prng)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/layout/trig.ts:1-6, 62-78`](../../src/mapper/layout/trig.ts#L1-L6) — detSin/detCos/distance(sqrt) form the deterministic kernel math pinned by determinism.test.ts:21-31; keep them in layout and do not share them with render code
- [`src/mapper/layout/geometry.ts:1-48`](../../src/mapper/layout/geometry.ts#L1-L48) — headingVector and segmentsIntersect are already the single canonical deterministic home
- [`src/mapper/layout/compass.ts:13, 36-40, 191`](../../src/mapper/layout/compass.ts#L13) — calls headingVector; FULL_CIRCLE=2*Math.PI equals TWO_PI exactly; {x:0,y:0} is the root seat
- [`src/mapper/layout/overflow.ts:8-19, 28-44`](../../src/mapper/layout/overflow.ts#L8-L19) — uses headingVector and the deterministic distance; the across vector is a perpendicular, not a re-derivation
- [`src/mapper/canvas/disc-chrome.ts:14-24`](../../src/mapper/canvas/disc-chrome.ts#L14-L24) — render-side seat offsets using Math.sin with cleanAxis; coupling them to layout's det trig gains nothing
- [`src/mapper/canvas/camera-follow-model.ts:91-128`](../../src/mapper/canvas/camera-follow-model.ts#L91-L128) — chainBounds adds frame size to the max corner; different semantics from fogContentBounds
- [`src/mapper/fog/fog-painter.ts:4-70, 244-257`](../../src/mapper/fog/fog-painter.ts#L4-L70) — FogRect bounds pad both sides over discs and strokes; the stroke stamping interpolates scalars
- [`src/mapper/fog/fog-model.ts:1-12, 340-351`](../../src/mapper/fog/fog-model.ts#L1-L12) — still needs canvas imports (ChainNode, SYSTEM_FRAME_*); wakeSamples interpolates scalars
- [`src/mapper/motion/tween-model.ts:47-59`](../../src/mapper/motion/tween-model.ts#L47-L59) — the only point-object lerp; one site does not justify a primitive
- [`src/mapper/windows/follower-model.ts:30-38`](../../src/mapper/windows/follower-model.ts#L30-L38) — ScreenSize and ScreenPoint name screen space on purpose; structurally compatible already
- [`src/mapper/chain/reconciler.ts:59`](../../src/mapper/chain/reconciler.ts#L59) — single ORIGIN constant

</details>

**Home.** `src/mapper/lib/geometry.ts (new, beside pair-key.ts and prng.ts)`

**Boundary check.** mapper is a single zone (pattern src/mapper/**). The home and every consumer (canvas/edge-geometry, windows/leader-path, windows/follower-model, signatures/editor-leader, and layout/proof-kit for samePosition) are in it, so all imports are intra-zone and legal. scripts reach mapper through its allow list, which includes mapper, and are unaffected. The module imports nothing.

**API sketch.**

```ts
// src/mapper/lib/geometry.ts
export interface Point { readonly x: number; readonly y: number }
export interface Box { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
/** The point `length` along the ray from `from` toward `to`; null when the two coincide. Render-side (Math.hypot); layout uses layout/trig. */
export function pointToward(from: Point, to: Point, length: number): Point | null;
```

**Migration steps.**

1. Create src/mapper/lib/geometry.ts with Point, Box and pointToward, moving the body of pointOnRayAtRadius verbatim. Move its two edge-geometry.test.ts cases (the 80/60 ray and the zero span -> null) into src/mapper/lib/geometry.test.ts.
2. edge-geometry.ts: delete RayPoint and pointOnRayAtRadius and import pointToward for frameSegment (143-145), keeping its null handling. Replace LabelBox's body with `export type LabelBox = Box`, or replace the type at its uses.
3. follower-model.ts:2 and 167: import pointToward from '../lib/geometry'; `pointToward(anchor, aim, discRadius) ?? anchor`.
4. leader-path.ts: delete LeaderPoint and toward. Use Point, and at 41-42 use `pointToward(point, previous, r) ?? point` and `pointToward(point, next, r) ?? point`. Keep the local hypot distance for the corner-radius minimum, or inline Math.hypot.
5. editor-leader.ts: delete LeaderRect and use Box from '../lib/geometry'.
6. proof-kit.ts:147: `next === undefined || !samePosition(next, position)`, importing samePosition from '../chain/intents'.
7. Run pnpm check through test-runner. determinism.test.ts must stay byte-identical, because no layout file changes.

**Tests.** Move the pointOnRayAtRadius cases from src/mapper/canvas/edge-geometry.test.ts (lines 74-78) to src/mapper/lib/geometry.test.ts.

Existing tests that guard behaviour:
- src/mapper/windows/follower-model.test.ts (anchoredLeader start point)
- src/mapper/signatures/SignatureEditor.test.ts (editorLeader path strings through roundedLeaderPath)
- src/mapper/canvas/edge-geometry.test.ts (frameSegment)
- src/mapper/layout/proof-kit.test.ts and determinism.test.ts (unchanged digests)

**Notes.** The arithmetic is identical in both copies: origin + d*(len/span), with span from Math.hypot. Leader path strings and frame segments are therefore byte-identical after the merge.

The only difference is zero span: edge-geometry needs null (frameSegment bails), while leader-path wants the start point. Keep null in the primitive and use `?? from` at the leader-path call sites, as follower-model already does.

Do not move detSin, detCos, distance or headingVector out of src/mapper/layout. Keeping deterministic kernel math in its own module protects the committed digest.

If P105 lands, leader-path's private round() becomes roundTo(value, 2) from lib/math. The two changes are independent.

<sub>Reported by: area:mapper-surface, gap:graph-traversal-and-mapper-layout.</sub>

<a id="p111"></a>

## P111: Extract a frame coalescer and guarded size observer into src/mapper/lib

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** medium · **Payoff:** low · **Size:** about -45 at the sites (FogLayer -25, follower -12, scanner -8); about +30 module and +45 test
- **Depends on:** [P109](#p109)

**Problem.** Three mapper sites hand-roll the same pattern: coalesce bursts of events into one animation frame. FogLayer.useFogScheduler uses frameIdRef with a 0 sentinel plus a tickRef indirection. follower-model.armFollower uses a null sentinel and an injectable FollowerScheduler. ScannerAnchoredPanel.useEditorLeader uses a local null sentinel. follower-model and ScannerAnchoredPanel also each write their own `typeof ResizeObserver` guard.

**Verifier revision.** The core is real. Three mapper sites coalesce bursts into one requestAnimationFrame, clear the pending handle before running so the callback can re-request, and cancel on teardown. They drift in small ways: a 0 sentinel vs null, FogLayer's tickRef and useCallback detour that exists only because tick and schedule reference each other, and two hand-rolled ResizeObserver guards. The design has to change. (1) Drop the dependency on a ui FrameSeams type: P110 is rejected and the seam shapes are not interchangeable. Reuse follower-model's existing {schedule, cancel} seam shape, moved to the shared module. (2) cancel() must not latch. FogLayer's coalescer outlives React StrictMode's simulated unmount and remount, and its current cleanup only zeroes frameIdRef. A permanent 'disposed' flag would silently stop fog painting in dev. armFollower keeps its own disposed latch. (3) The new mapper file must be added to the exhaustive file list in src/mapper/chain/surface.test.ts. Payoff is modest: the main simplification is in FogLayer, and production lines come out roughly even.

**Sites (6).**

- [`src/mapper/fog/FogLayer.tsx:97-150`](../../src/mapper/fog/FogLayer.tsx#L97-L150) — useFogScheduler: frameIdRef 0 sentinel; clears before tickRef.current(); tick re-schedules when runFogTick returns again; cleanup cancels without latching
- [`src/mapper/windows/follower-model.ts:366-374`](../../src/mapper/windows/follower-model.ts#L366-L374) — FollowerScheduler {schedule, cancel} plus BROWSER_SCHEDULER, the seam the follower tests inject
- [`src/mapper/windows/follower-model.ts:376-386`](../../src/mapper/windows/follower-model.ts#L376-L386) — SizeObserver type plus BROWSER_SIZE_OBSERVER with the typeof ResizeObserver guard
- [`src/mapper/windows/follower-model.ts:388-415`](../../src/mapper/windows/follower-model.ts#L388-L415) — armFollower: null sentinel, captures the latest state, permanent disposed latch, idempotent dispose
- [`src/mapper/windows/follower-model.ts:487-494`](../../src/mapper/windows/follower-model.ts#L487-L494) — createNodeFollower defaults its scheduler and observeSize parameters to the browser seams
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:149-175`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L149-L175) — useLayoutEffect: local null-sentinel coalescer for resize, scroll and ResizeObserver; its own guard at 164-168

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/canvas/wormhole/host.ts:93-111`](../../src/mapper/canvas/wormhole/host.ts#L93-L111) — continuous self-rescheduling paint loop gated by paused/visible; not a coalescer
- [`src/mapper/motion/use-motion.ts:78-101`](../../src/mapper/motion/use-motion.ts#L78-L101) — continuous tween loop with a cancelled flag and the MotionSeams shape (adds now and prefersReducedMotion); not a coalescer
- [`src/components/ui/live-price.tsx:37-69`](../../src/components/ui/live-price.tsx#L37-L69) — double rAF to restart a CSS animation; ui zone cannot import mapper; seam signature pinned by tests
- [`src/features/wormhole-sites/components/npc-name-col.ts:39-56`](../../src/features/wormhole-sites/components/npc-name-col.ts#L39-L56) — one-shot rAF measurement; features cannot import mapper
- [`src/mapper/signatures/scanner-window-frame.tsx:51-64`](../../src/mapper/signatures/scanner-window-frame.tsx#L51-L64) — one ResizeObserver over two elements, read-only measure, no coalescing; a per-element observeSize would double the observers
- [`src/components/ui/measured.tsx:8-16`](../../src/components/ui/measured.tsx#L8-L16) — ui zone; unguarded ResizeObserver; cannot import mapper
- [`src/components/ui/use-sliding-thumb.ts:33-35`](../../src/components/ui/use-sliding-thumb.ts#L33-L35) — ui zone; cannot import mapper

</details>

**Home.** `src/mapper/lib/frame-coalescer.ts (new, next to pair-key.ts and prng.ts)`

**Boundary check.** Home zone is mapper (pattern src/mapper/**). Every consumer is also in mapper (src/mapper/fog/FogLayer.tsx, src/mapper/windows/follower-model.ts, src/mapper/signatures/ScannerAnchoredPanel.tsx), and same-zone imports need no rule. The module imports nothing, so it adds no edge that the mapper rule (allow: features, data, components, ui, transport, lib, config) would have to permit.

**API sketch.**

```ts
export interface FrameScheduler { readonly schedule: (callback: () => void) => number; readonly cancel: (handle: number) => void }
export const BROWSER_FRAME_SCHEDULER: FrameScheduler; // requestAnimationFrame / cancelAnimationFrame
export interface FrameCoalescer { readonly request: () => void; readonly cancel: () => void } // closures, no `this`; cancel does not latch
export function createFrameCoalescer(run: () => void, frames?: FrameScheduler): FrameCoalescer; // clears the handle BEFORE run(), so run may request() again
export type SizeObserver = (element: HTMLElement, onSize: () => void) => () => void;
export const observeSize: SizeObserver; // returns a no-op when ResizeObserver is undefined
```

**Migration steps.**

1. Create src/mapper/lib/frame-coalescer.ts with FrameScheduler, BROWSER_FRAME_SCHEDULER, createFrameCoalescer, SizeObserver and observeSize. Move the body of follower-model's BROWSER_SIZE_OBSERVER (376-386) verbatim into observeSize.
2. Add 'lib/frame-coalescer.ts' to the sorted list in src/mapper/chain/surface.test.ts ('walks the whole mapper zone'), between 'layout/use-layout-kernel.ts' and 'lib/pair-key.ts'.
3. follower-model.ts: delete FollowerScheduler, BROWSER_SCHEDULER, SizeObserver and BROWSER_SIZE_OBSERVER (366-386) and import the lib equivalents. In armFollower, keep `latest` and the `disposed` latch. Use `const frame = createFrameCoalescer(() => { if (!disposed) evaluate(latest); }, scheduler)`. The subscriber sets latest and calls frame.request(). Dispose keeps its early return, sets disposed, unsubscribes and calls frame.cancel(). Retype createNodeFollower's parameters with FrameScheduler, BROWSER_FRAME_SCHEDULER and observeSize.
4. ScannerAnchoredPanel.tsx useEditorLeader: replace lines 153-160 with `const frame = createFrameCoalescer(measure)`. Register frame.request for resize and capture-phase scroll. Replace 163-168 with `const stopObserve = panel === null ? () => undefined : observeSize(panel, frame.request)`. Cleanup removes both listeners, calls stopObserve() and frame.cancel().
5. FogLayer.tsx useFogScheduler: create the coalescer once with `useState(() => { const c = createFrameCoalescer(() => { ...existing tick body...; if (again) c.request(); }); return c; })`. The body reads only refs and the stable store. Delete frameIdRef, tickRef, both useCallbacks and the tickRef-sync effect. Keep `useEffect(() => () => frame.cancel(), [frame])` and return frame.request. Do not latch on cleanup.
6. Run the test-runner agent's `pnpm check`. Check that the react-hooks lint accepts ref reads inside the deferred closure.

**Tests.** Add src/mapper/lib/frame-coalescer.test.ts with a fake FrameScheduler. Cover: (a) many request() calls schedule one frame; (b) after run, request() schedules again; (c) request() made inside run schedules a new frame (FogLayer's `again` path); (d) cancel() cancels the pending frame, does not latch, and a later request() schedules again; (e) observeSize returns a no-op when ResizeObserver is undefined, and observes then disconnects with a stubbed ResizeObserver. Existing guards: follower-model.test.ts 'node follower store lifecycle' (lines 271-306: arms immediately, coalesces, no writes after dispose) and the surface.test.ts file list. FogLayer and useEditorLeader have no behaviour tests, so check fog repaint on pan and zoom and the scanner leader on scroll in the local dev server.

**Notes.** Behaviour to keep: (1) Clear the handle before invoking run. All three sites do this today, and FogLayer depends on it to re-request. (2) FogLayer cleanup is non-latching for StrictMode, while armFollower's dispose latches and is idempotent. Keep that latch in armFollower, not in the coalescer. (3) armFollower evaluates the latest store state, not the state at the time of the request; keep capturing `latest` in the subscriber. (4) The 0 and null sentinels are equivalent because rAF handles are positive; standardise on null. (5) The ScannerAnchoredPanel ResizeObserver callback ignores its entries argument, and observeSize's `() => onSize()` wrapper keeps that. Do not merge FrameScheduler with MotionSeams or ConfirmFlashScheduler (see P110).

<sub>Reported by: area:mapper-surface.</sub>

<a id="p044"></a>

## P044: Add one commit-time style-ref hook for CSS custom properties (ui zone)

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** About -55 lines across 10 sites (refs, effects, MapWindow helpers) and +35 for the hook; net ≈ -20, plus the removal of the MapWindow double write and the ChainLinkEdge `visible` hack
- **Depends on:** [P277](wave-01-quick-wins-delete-dead-code-fix-small.md#p277)

**Problem.** src/AGENTS.md:13 requires runtime-dynamic CSS to be written with ref.current.style.setProperty after mount. Ten components hand-roll that ref plus effect plus setProperty, and the copies have drifted. Three use useEffect (ProgressBar, QueueSection's Segment, SignalFill) and the mapper ones use useLayoutEffect. ChainLinkEdge lists `visible` as a dependency so its effect re-runs when the <g> host mounts late. MapWindow writes --map-window-z from both a useEffect and its ref callback, and MapWindow.input.test.ts codifies the double write. use-chain-dials writes motion properties on a shell that ChainLive renders conditionally, with an effect that will not re-run when the shell mounts. use-chain-dials and ChainSurface each carry their own copy of the motionCssProperties loop.

**Verifier revision.** The ten declarative sites, the MapWindow double write and the ChainLinkEdge `visible` hack are confirmed. I also found a latent bug of the same family that the finders missed: ChainLive renders the shell div conditionally (`if (access === false) return <NoMapAccess />`), and use-chain-dials writes the motion properties in a useEffect keyed only on motionConfig. If access goes from false to true, the shell mounts without them. The design changes in four places. (1) A callback ref keyed on the values replaces the proposed 'node in useState + useLayoutEffect'. That variant costs an extra render per mount for every chain node, edge and widget seat. React re-invokes a changed callback ref during commit, before paint, so the remount and value-change cases are covered with no state and no effect. (2) No serialised-props dependency, which would trip react-hooks/exhaustive-deps. The record form takes a referentially stable record (useMemo), and a single-property form is keyed on [name, value]. (3) The 'useEffect paints the wrong first frame' claim is overstated for ProgressBar. progress-bar.css gives .progress-soft-fill a 700ms width transition, so today client-mounted bars grow in from 0%, and SSR-hydrated bars do so under either timing. Commit-time writes remove that grow-in on client mounts, which is a visible change to decide deliberately; it is a real fix for SignalFill and QueueSection's Segment, which have no transition. (4) Moving KnownSpaceCaption's constant into static CSS would duplicate SYSTEM_DISC_SIZE=55 and KSPACE_TITLE_GAP_PX=6 from disc-chrome.ts in CSS. Hoist the transform string to a module constant and keep the write instead. The motion loops in use-chain-dials and ChainSurface both have to stay. motion-contract.css:1-10 declares stylesheet defaults on [data-map-motion-scope], which shadow the shell's inherited inline values, so the scope needs its own inline write.

**Sites (14).**

- [`src/components/ui/progress-bar.tsx:8-18`](../../src/components/ui/progress-bar.tsx#L8-L18) — useEffect sets --pct; progress-bar.css:25-35 has width var(--pct,0%) with a 700ms transition
- [`src/components/composition/board/sections/QueueSection.tsx:100-110`](../../src/components/composition/board/sections/QueueSection.tsx#L100-L110) — useEffect sets flex-grow; no transition, so one frame at grow 0 on client mount
- [`src/mapper/signatures/scanner-row-cells.tsx:28-37`](../../src/mapper/signatures/scanner-row-cells.tsx#L28-L37) — useEffect sets --signature-signal with an inline 0..100 clamp; scanner-row-cells.css:1-8 has no transition
- [`src/mapper/canvas/SystemIntelMarks.tsx:25-37`](../../src/mapper/canvas/SystemIntelMarks.tsx#L25-L37) — WidgetSeat: useLayoutEffect sets --node-widget-seat-transform (depends only on index)
- [`src/mapper/canvas/ChainLinkEdge.tsx:85-91`](../../src/mapper/canvas/ChainLinkEdge.tsx#L85-L91) — PilotArrow: useLayoutEffect writes --map-pilot-arrow-transform on a span inside EdgeLabelRenderer, which returns null until its portal node exists
- [`src/mapper/canvas/ChainLinkEdge.tsx:163-173`](../../src/mapper/canvas/ChainLinkEdge.tsx#L163-L173) — host <g>: effect deps [gradientId, visible] because the <g> is absent while segment === null
- [`src/mapper/canvas/SystemNode.tsx:242-261`](../../src/mapper/canvas/SystemNode.tsx#L242-L261) — KnownSpaceCaption: kspaceCaptionOffset() is constant (disc-chrome.ts:26-28), but the transform string is rebuilt and written on every k-space node
- [`src/mapper/windows/MapWindow.tsx:82-95, 210-228`](../../src/mapper/windows/MapWindow.tsx#L82-L95) — applyWindowStyles is called from both a useEffect([stackIndex]) and a useCallback ref keyed on stackIndex: a double write
- [`src/mapper/chain/use-chain-dials.ts:30-40`](../../src/mapper/chain/use-chain-dials.ts#L30-L40) — motionCssProperties loop onto shellRef in useEffect([motionConfig])
- [`src/mapper/chain/ChainLive.tsx:102-110`](../../src/mapper/chain/ChainLive.tsx#L102-L110) — missed by finders: the shell with ref={shellRef} renders only when access !== false, so the dials effect misses a later mount
- [`src/mapper/canvas/ChainSurface.tsx:55-64`](../../src/mapper/canvas/ChainSurface.tsx#L55-L64) — same loop onto data-map-motion-scope, skipped when motion is undefined (ChainHost.tsx:15, MapCanvas.tsx:21)
- [`src/mapper/motion/motion-contract.css:1-10`](../../src/mapper/motion/motion-contract.css#L1-L10) — stylesheet defaults on both [data-map-shell] and [data-map-motion-scope], so the scope needs its own inline write; both loops must stay
- [`src/mapper/windows/MapWindow.input.test.ts:47-67`](../../src/mapper/windows/MapWindow.input.test.ts#L47-L67) — asserts the ref callback plus stack-index effect double write (setProperty called twice)
- [`src/mapper/canvas/SystemIntelMarks.test.ts:11-15, 25-42`](../../src/mapper/canvas/SystemIntelMarks.test.ts#L11-L15) — mocks react useRef/useLayoutEffect to observe writes; must move to the hook

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/use-sliding-thumb.ts:16-29`](../../src/components/ui/use-sliding-thumb.ts#L16-L29) — measurement-driven (offsetLeft/Width of the pressed item), not a value→property write
- [`src/components/ui/use-cssom-tooltip.ts:12-22`](../../src/components/ui/use-cssom-tooltip.ts#L12-L22) — positions from measured placement
- [`src/features/wormhole-sites/components/npc-name-col.ts:40-48`](../../src/features/wormhole-sites/components/npc-name-col.ts#L40-L48) — measures widths, then writes
- [`src/mapper/canvas/SystemNode.tsx:112-122`](../../src/mapper/canvas/SystemNode.tsx#L112-L122) — ClassificationChip: removeProperty, getComputedStyle, then a fit; measurement loop
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:124-129`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L124-L129) — imperative placement from a measured anchor
- [`src/mapper/fog/fog-host.ts:57-60`](../../src/mapper/fog/fog-host.ts#L57-L60) — per-frame imperative canvas placement
- [`src/mapper/windows/follower-model.ts:265`](../../src/mapper/windows/follower-model.ts#L265) — per-frame follower transform
- [`src/mapper/windows/MapWindowLayer.tsx:129`](../../src/mapper/windows/MapWindowLayer.tsx#L129) — follower payload writer
- [`src/mapper/canvas/wormhole/host.ts:28-42`](../../src/mapper/canvas/wormhole/host.ts#L28-L42) — canvas-host imperative writes tied to backing-store setup

</details>

**Home.** `src/components/ui/use-style-ref.ts (sibling of the existing ui hooks use-sliding-thumb.ts, use-cssom-tooltip.ts and use-copy-feedback.ts)`

**Boundary check.** Home zone ui; the rule {from:'ui', allow:[]} holds because the hook imports only react. ProgressBar is in ui (same zone). QueueSection is in components-composition, whose rule allows 'ui'. SystemIntelMarks, ChainLinkEdge, SystemNode, MapWindow, use-chain-dials and ChainSurface are in mapper, whose rule allows 'ui'. src/lib would be illegal because ui (ProgressBar) may not import lib.

**API sketch.**

```ts
export function useStyleProperties<E extends HTMLElement | SVGElement>(
  properties: Readonly<Record<string, string>> | null | undefined, // must be referentially stable (module const or useMemo)
  forwardedRef?: Ref<E>,
): RefCallback<E>;
// = useCallback((node) => { if (node && properties) for (const [k, v] of Object.entries(properties)) node.style.setProperty(k, v); assignRef(forwardedRef, node); }, [properties, forwardedRef])

export function useStyleProperty<E extends HTMLElement | SVGElement>(
  name: string, value: string, forwardedRef?: Ref<E>,
): RefCallback<E>;
// = useCallback keyed on [name, value, forwardedRef]; React re-invokes a changed callback ref in the commit phase, before paint, so value changes and late host mounts are covered with no effect and no state.
```

**Migration steps.**

1. Add src/components/ui/use-style-ref.ts with useStyleProperty and useStyleProperties and a private assignRef, moving MapWindow.tsx:89-95 assignForwardedRef there. Add src/components/ui/use-style-ref.test.ts.
2. SignalFill (scanner-row-cells.tsx:28-37) and QueueSection Segment (100-110): replace useRef+useEffect with `ref={useStyleProperty('--signature-signal', pct)}` / `useStyleProperty('flex-grow', String(weight))`. Keep the 0..100 clamp in SignalFill. These have no transition, so commit-time writes only remove a one-frame flash.
3. ProgressBar (progress-bar.tsx:8-18): decide the entrance first. If the 0→pct grow-in on client mount is intended, add `@starting-style { .progress-soft-fill { width: 0 } }` to progress-bar.css (inside the reduced-motion guard), then switch to useStyleProperty('--pct', `${pct}%`). If it is not intended, switch directly. Check the board, jobs and skill-queue bars on the preview/primitives page.
4. WidgetSeat (SystemIntelMarks.tsx:25-37) and PilotArrow (ChainLinkEdge.tsx:85-91): useStyleProperty with the existing transform strings.
5. ChainLinkEdge host (163-173): `const hostRef = useStyleProperty<SVGGElement>('--map-edge-taper', `url(#${gradientId})`)` and delete `visible` together with its effect.
6. KnownSpaceCaption (SystemNode.tsx:242-261): hoist `const KSPACE_CAPTION_TRANSFORM = …kspaceCaptionOffset()…` to module scope and use useStyleProperty('--kspace-caption-transform', KSPACE_CAPTION_TRANSFORM). Do not move it into static CSS, which would duplicate SYSTEM_DISC_SIZE and KSPACE_TITLE_GAP_PX.
7. MapWindow (MapWindow.tsx:82-95, 210-228): replace useWindowRootRef, applyWindowStyles and assignForwardedRef with `useStyleProperty('--map-window-z', String(stackIndex), forwardedRef)`. This deletes the redundant useEffect.
8. use-chain-dials (30-40): `const motionProperties = useMemo(() => motionCssProperties(motionConfig), [motionConfig]); const shellRef = useStyleProperties<HTMLDivElement>(motionProperties);`. The RefObject becomes a RefCallback and ChainLive.tsx:106 keeps ref={shellRef}. This fixes the late-mounted shell after access false→true.
9. ChainSurface (55-64): `const scopeRef = useStyleProperties<HTMLDivElement>(useMemo(() => motion === undefined ? null : motionCssProperties(motion), [motion]))`. Keep this write: the scope's stylesheet defaults shadow the shell's inherited values.
10. Delete the now-unused useRef, useEffect and useLayoutEffect imports at each site.

**Tests.** New src/components/ui/use-style-ref.test.ts. Mock react's useCallback as identity (as MapWindow.input.test.ts does) and call the returned ref with fake nodes {style:{setProperty: vi.fn()}}. Assert: the property is written on attach; the ref is a no-op on null; a function forwarded ref and an object forwarded ref both receive the node and null; a null record writes nothing. Rewrite MapWindow.input.test.ts:47-67 to expect a single write per attach, because the double write is the bug being removed. Rewrite SystemIntelMarks.test.ts to mock '@/components/ui/use-style-ref' (capture name/value per seat) instead of mocking react useRef/useLayoutEffect, keeping the three transform assertions at 40-42. SystemNode.test.ts:84 (markup contains the var() class) is unaffected. Add a ChainSurface or use-chain-dials test asserting that all five --map-motion-* properties are written on attach. No tests guard ProgressBar, SignalFill or Segment timing today.

**Notes.** Behaviour to preserve or decide. (1) ProgressBar: today client-mounted bars animate 0→pct over 700ms because useEffect runs after paint. Commit-time writes make them appear at their value. Make the grow-in explicit with @starting-style, or accept the change; SSR-hydrated bars animate either way. (2) A callback ref keyed on a changing value is detached and re-attached on every change, so the forwarded ref receives null and then the node, which MapWindow already does today. (3) The record form needs a stable record; passing a fresh literal on each render still works but re-attaches the ref on every render. (4) Unverified lead: PilotArrow renders inside EdgeLabelRenderer, which returns null until React Flow's label-renderer node exists. If the arrow ever mounts on that late render, today's useLayoutEffect([transform]) would miss it, and the callback ref closes that gap too. Do not use the hook for the excluded measurement or per-frame writers.

<sub>Reported by: area:mapper-surface, concern:client-hooks.</sub>

<a id="p051"></a>

## P051: Move the open-popup check to ui and share one Escape-dismiss hook between the board and the mapper

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -45 / +30 production lines; +60 test lines
- **Depends on:** —
- **Existing primitive:** `src/mapper/windows/MapWindow.tsx:isAdoptedPopupOpen; src/mapper/windows/window-model.ts:keydownAction`

**Problem.** 'Escape closes this surface unless a Base UI popup owns the key' is implemented three times. MapWindowLayer.useCardDismissal and ScannerAnchoredPanel.useOutsideDismiss each add an identical document keydown listener (keydownAction with surfaceKind 'card' and isAdoptedPopupOpen, then close). The home and industry boards (useFocusView) add a window listener with a different inline selector. The popup predicate itself lives in a mapper component (MapWindow.tsx). Five mapper call sites import it from there, and the board, which cannot import mapper, has its own drifted copy.

**Verifier revision.** The duplication is real. MapWindowLayer.useCardDismissal and ScannerAnchoredPanel's keydown handler are token-identical (fallow group: ScannerAnchoredPanel 233-242 and MapWindowLayer 143-151). The board's useFocusView rebuilds the same 'Escape dismisses unless a popup owns it' rule with its own selector. The shared predicate isAdoptedPopupOpen lives in a mapper component file (MapWindow.tsx) and has four mapper importers, so the board cannot reach it. Two claims fail. First, the board's narrower selector is not a live bug. Base UI's useDismiss listens for Escape on document and calls preventDefault on the Escape it consumes; its React onKeyDown also stops propagation. The board listens on window, which fires after every document listener, so open menus and listboxes are already covered by defaultPrevented. Second, adding `[data-drawer-popup]:not([hidden])` is redundant: Base UI's DrawerPopup renders role=dialog with data-open, which `[data-open][role="dialog"]` already matches. The unified selector should therefore be the mapper's existing one, moved to ui. MapWindow's React handler keeps keydownAction for the card/dock split.

**Sites (7).**

- [`src/components/composition/board/use-focus-view.ts:95-108`](../../src/components/composition/board/use-focus-view.ts#L95-L108) — window keydown: Escape && !defaultPrevented && no `[data-drawer-popup]:not([hidden]), [role="dialog"]:not([hidden])` then toOverview(); used by HomeBoardView.tsx:78 and industry-workspace/ProfileWorkspace.tsx:152
- [`src/mapper/windows/MapWindowLayer.tsx:139-154`](../../src/mapper/windows/MapWindowLayer.tsx#L139-L154) — useCardDismissal: document keydown, gated by cardOpen, keydownAction(card) then onDeselect
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:179-253`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L179-L253) — useOutsideDismiss: keydown handler 232-240 (identical to MapWindowLayer), registered 245, removed 250; the pointer containment at 196-203 also calls isAdoptedPopupOpen
- [`src/mapper/windows/MapWindow.tsx:22-29, 55-57, 229-244`](../../src/mapper/windows/MapWindow.tsx#L22-L29) — ADOPTED_POPUP_SELECTOR (Base UI data-open dialog/listbox/menu), isAdoptedPopupOpen, React onKeyDown windowKeyDownHandler with stopPropagation
- [`src/mapper/windows/window-model.ts:54-71`](../../src/mapper/windows/window-model.ts#L54-L71) — keydownAction: Escape && card && !popupOpen && !defaultPrevented
- [`src/mapper/signatures/use-scanner-paste.ts:7, 26-33`](../../src/mapper/signatures/use-scanner-paste.ts#L7) — fifth mapper importer of isAdoptedPopupOpen (paste yields to an open popup)
- [`src/components/ui/drawer.tsx:36-37`](../../src/components/ui/drawer.tsx#L36-L37) — data-drawer-popup marker on Base.Popup; Base UI DrawerPopup also sets role (dialog), hidden=!mounted and data-open, so the role selector already covers it

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/windows/MapWindow.tsx:229-255`](../../src/mapper/windows/MapWindow.tsx#L229-L255) — React onKeyDown on the window itself: distinguishes dock from card via surfaceKindOf and always stops propagation. It keeps keydownAction and only switches its popup predicate import.
- [`src/components/composition/GlobalSearch.tsx:60-69`](../../src/components/composition/GlobalSearch.tsx#L60-L69) — Cmd/Ctrl-K focus shortcut; a different key concern
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:196-230`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L196-L230) — pointer outside-dismiss (slop gesture, `[data-open]` containment) is mapper-specific and stays

</details>

**Home.** `src/components/ui/popup-open.ts (new; 'use client')`

**Boundary check.** Home zone ui ({from:'ui', allow:[]}): the module imports only 'react' and DOM globals, and the selector describes Base UI popups that ui wraps. Consumers: use-focus-view.ts is in components-composition, whose allow list includes 'ui'. MapWindow.tsx, MapWindowLayer.tsx, ScannerAnchoredPanel.tsx and use-scanner-paste.ts are in mapper, whose allow list includes 'ui'. Today the board cannot import mapper (components-composition's allow list has no 'mapper'), which is why the predicate must leave MapWindow.tsx.

**API sketch.**

```ts
export function isPopupOpen(): boolean; // typeof document !== 'undefined' && document.querySelector(OPEN_POPUP_SELECTOR) !== null, selector = MapWindow's ADOPTED_POPUP_SELECTOR verbatim
export function useEscapeDismiss(onDismiss: () => void, opts?: { enabled?: boolean; target?: 'document' | 'window' }): void; // one useEffect: on keydown, if key === 'Escape' && !event.defaultPrevented && !isPopupOpen() then onDismiss()
```

**Migration steps.**

1. Create src/components/ui/popup-open.ts. Move ADOPTED_POPUP_SELECTOR (renamed OPEN_POPUP_SELECTOR) and isAdoptedPopupOpen (renamed isPopupOpen) there verbatim. Add useEscapeDismiss implemented with exactly one useEffect (deps [enabled, onDismiss, target]) and no useRef or useEffectEvent; see the test constraints in notes.
2. Update the isPopupOpen importers: MapWindow.tsx (windowKeyDownHandler; delete lines 22-29 and 55-57), ScannerAnchoredPanel.tsx (containment at 202), use-scanner-paste.ts (line 7 and 31).
3. MapWindowLayer: replace useCardDismissal (139-154) with `useEscapeDismiss(onDeselect, { enabled: cardOpen })` at its call site, and delete the function and the keydownAction import if it is no longer used.
4. ScannerAnchoredPanel: remove handleKeyDown and its add/remove lines (232-240, 245, 250) from useOutsideDismiss, and call `useEscapeDismiss(onClose)` beside it.
5. use-focus-view: replace lines 95-108 with `useEscapeDismiss(toOverview, { target: 'window' })`. Keep the window target so Base UI's document-level dismissal (with preventDefault) still runs first. Keep the comment explaining why the board, not the sheet, owns the listener.
6. Leave keydownAction in window-model.ts for MapWindow's card/dock decision; its existing tests stay as they are.

**Tests.** Add src/components/ui/popup-open.test.ts. isPopupOpen: returns false with no document, and calls querySelector with a selector containing role dialog, listbox and menu under data-open. useEscapeDismiss: mock react useEffect to run immediately (the MapWindow.input.test.ts pattern) and stub document/window addEventListener. Cover Escape firing onDismiss, defaultPrevented ignored, an open popup ignored, other keys ignored, enabled:false registering nothing, cleanup removing the listener, and target 'window' vs 'document'. Existing guards: src/mapper/windows/window-model.test.ts (keydownAction), src/mapper/windows/MapWindow.input.test.ts (window onKeyDown), src/mapper/windows/MapWindowLayer.card.test.ts (slot-ordered hook mocks), src/components/composition/board/HomeBoardView.focus.test.ts. Update src/mapper/signatures/use-scanner-paste.test.ts line 18 to mock '@/components/ui/popup-open' { isPopupOpen } instead of '../windows/MapWindow'.

**Notes.** Behavior differences. (1) The board's old selector `[role="dialog"]:not([hidden])` also matched a dialog during its exit animation (data-open already removed, still mounted). With the unified selector, an Escape pressed during that animation closes the sheet. That is acceptable, because the first Escape closing the dialog is still preventDefault'ed by Base UI. (2) Do not add `[data-drawer-popup]:not([hidden])`: Base UI's DrawerPopup gets role 'dialog' from DialogStore and data-open from popupTransitionStateMapping, so the role selector already covers it. (3) Evidence that the board's drift is latent, not live: node_modules/@base-ui/react/floating-ui-react/hooks/useDismiss.js 92-113 calls event.preventDefault() on the Escape it consumes (and stopPropagation unless escapeKeyBubbles). It is registered on document (line 419) and as React onKeyDown on the reference and floating elements, so a window listener always sees defaultPrevented. The mapper's document listeners can run before Base UI's, which is why the mapper needs the predicate and the board mostly does not. (4) Test-harness constraints: HomeBoardView.focus.test.ts spreads real react but mocks useRef by slot and useEffect as a no-op, so useEscapeDismiss must not call useRef or useEffectEvent. MapWindowLayer.card.test.ts assigns hook slots by call order, so the replacement must consume exactly one effect slot, as useCardDismissal does.

<sub>Reported by: area:mapper-surface, concern:client-hooks.</sub>

<a id="p027"></a>

## P027: Drive the dev dial panel from dial tables with one clamped commit helper

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** simplification · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** MapControls.tsx goes from about 418 to about 170 lines, map-controls-model.ts from 187 to about 130, and motion-controls-model.ts from 101 to about 55. step-dial.ts adds about 60 lines plus a test. Net about -280/+150.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/stepper.tsx:Stepper`

**Problem.** MapControls repeats a near-identical Stepper block 13 times and a label+SegmentedControl/Select block 5 times. Each copies range fields by hand, re-maps an already-compatible options array and casts the string back to its union. Behind it, map-controls-model.ts and motion-controls-model.ts define 14 numeric commit* functions that differ only by field name and range. motion-controls-model also imports clampStepped from the canvas folder. Adding or retuning a dial touches three places in two or three files.

**Verifier revision.** The repetition is real and large. MapControls.tsx has 13 Stepper blocks that each copy min/max/step from a *_RANGE constant with variant='inline' (the proposal said 15). It also has 5 label+choice blocks, each identity-copying a readonly options array. The models hold 14 numeric commit* functions that differ only by field and range: 10 in canvas and 4 in motion. Fallow's near-duplicate report has 37 groups touching these three files, and MapControls is a churn hotspot (19 commits, churn 7586). Revisions: (1) Drop the efficiency claim. The panel returns null outside development and is wrapped in memo, so the per-render .map copies cost nothing measurable. Removing them is only a simplification, and it is type-safe because WEDGE_POLICY_OPTIONS and the other option arrays are readonly {value: <string union>; label: string}[], assignable to readonly SegmentedOption[] and SelectItems. (2) Clamp once in a generic commit helper before the dial's write, so the coupled ringSpacing/minSeparation pair and the fog percent conversion become ordinary write functions rather than exceptions. (3) Put the shared helper in src/mapper/lib (which already holds pair-key.ts and prng.ts), and add the new file to the exhaustive file list in src/mapper/chain/surface.test.ts, which otherwise fails.

**Sites (11).**

- [`src/mapper/canvas/MapControls.tsx:101-175`](../../src/mapper/canvas/MapControls.tsx#L101-L175) — Layout group: 3 Steppers (ring spacing, separation, sibling fan) plus a SegmentedControl (wedge posture) and a Select (direction order), each re-mapping options.
- [`src/mapper/canvas/MapControls.tsx:177-265`](../../src/mapper/canvas/MapControls.tsx#L177-L265) — Motion group: 4 Steppers (fast/mid/slow/overshoot) plus 2 SegmentedControls (edge flavor, collapse exit).
- [`src/mapper/canvas/MapControls.tsx:267-323`](../../src/mapper/canvas/MapControls.tsx#L267-L323) — Halo group: 4 Steppers.
- [`src/mapper/canvas/MapControls.tsx:325-384`](../../src/mapper/canvas/MapControls.tsx#L325-L384) — Fog group: 3 Steppers (density reads Math.round(opacity*100)) plus a SegmentedControl (smoke tier).
- [`src/mapper/canvas/MapControls.tsx:389-418`](../../src/mapper/canvas/MapControls.tsx#L389-L418) — DialGroupHeader and DialRow, the existing local building blocks.
- [`src/mapper/canvas/map-controls-model.ts:34-43`](../../src/mapper/canvas/map-controls-model.ts#L34-L43) — clampStepped(value, min, max, step). Every caller passes range.min/max/step.
- [`src/mapper/canvas/map-controls-model.ts:45-170`](../../src/mapper/canvas/map-controls-model.ts#L45-L170) — commitRingSpacing and commitMinSeparation (coupled), commitSiblingSpread, 4 halo commits, 3 fog commits (opacity /100), plus the enum commits commitWedgePolicy, commitDirectionPreset and commitFogTier.
- [`src/mapper/motion/motion-controls-model.ts:1-101`](../../src/mapper/motion/motion-controls-model.ts#L1-L101) — Imports clampStepped from ../canvas. 4 numeric commits (3 write nested tempo.*) and 2 enum commits.
- [`src/mapper/canvas/map-controls-model.test.ts:1-79`](../../src/mapper/canvas/map-controls-model.test.ts#L1-L79) — Tests each commit* by name. Includes the ringSpacing>=minSeparation invariant and the fog-fraction test.
- [`src/mapper/motion/motion-controls-model.test.ts:1-75`](../../src/mapper/motion/motion-controls-model.test.ts#L1-L75) — Already table-driven over tempo commits and ranges.
- [`src/mapper/chain/surface.test.ts:24-120`](../../src/mapper/chain/surface.test.ts#L24-L120) — Lists every non-test mapper file. A new mapper/lib file must be added here.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/editor-leader.ts:38`](../../src/mapper/signatures/editor-leader.ts#L38) — A local clamp(value, low, high) with no step snapping. Not this concept and not part of the dial panel (a lead for a separate clamp consolidation).
- [`src/mapper/windows/follower-model.ts:86`](../../src/mapper/windows/follower-model.ts#L86) — A plain clamp with no step. Out of scope for the same reason.

</details>

**Home.** `src/mapper/lib/step-dial.ts (new). The dial tables stay next to their models: LAYOUT/HALO/FOG tables in src/mapper/canvas/map-controls-model.ts and MOTION tables in src/mapper/motion/motion-controls-model.ts. The generic DialGroup renderer stays inside src/mapper/canvas/MapControls.tsx.`

**Boundary check.** Every file involved is in the mapper zone (pattern src/mapper/**), so all imports between them are intra-zone. MapControls keeps importing Stepper, SegmentedControl, Select, Collapsible and cn from src/components/ui (zone ui), which the mapper rule allows ("ui" is in mapper's allow list). step-dial.ts imports nothing outside the zone. Moving clampStepped into mapper/lib removes the motion->canvas folder import, which was legal but odd.

**API sketch.**

```ts
// src/mapper/lib/step-dial.ts
export interface SteppedRange { readonly min: number; readonly max: number; readonly step: number }
export function clampStepped(range: SteppedRange, value: number): number
export interface StepDial<C> { readonly label: string; readonly ariaLabel: string; readonly range: SteppedRange; readonly valueClassName?: string; readonly read: (c: C) => number; /** receives an already-clamped value */ readonly write: (c: C, v: number) => C }
export interface ChoiceDial<C> { readonly label: string; readonly control: 'segmented' | 'select'; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly read: (c: C) => string; readonly write: (c: C, v: string) => C }
export function commitStepDial<C>(dial: StepDial<C>, c: C, next: number): C // dial.write(c, clampStepped(dial.range, next))
export function choiceDial<C, V extends string>(d: { label: string; control: 'segmented' | 'select'; options: readonly { value: V; label: string }[]; read: (c: C) => V; write: (c: C, v: V) => C }): ChoiceDial<C> // narrows by options lookup; unknown strings leave c unchanged
// MapControls.tsx (local)
function DialGroup<C>(props: { title: string; value: C; onChange: (c: C) => void; steps: readonly StepDial<C>[]; choices?: readonly ChoiceDial<C>[] }): JSX.Element
```

**Migration steps.**

1. Create src/mapper/lib/step-dial.ts with SteppedRange, clampStepped(range, value) (same math as map-controls-model.ts:40-42), StepDial, ChoiceDial, commitStepDial and choiceDial. Add 'lib/step-dial.ts' to the sorted list in src/mapper/chain/surface.test.ts.
2. map-controls-model.ts: replace the 10 numeric commit* functions with LAYOUT_STEP_DIALS, HALO_STEP_DIALS and FOG_STEP_DIALS. Ring spacing: write (c,v) => ({...c, ringSpacing: v, minSeparation: Math.min(c.minSeparation, v)}). Separation: write (c,v) => ({...c, minSeparation: v, ringSpacing: Math.max(c.ringSpacing, v)}). Density %: read c => Math.round(c.opacity*100), write (c,v) => ({...c, opacity: v/100}). Fold each *_RANGE literal into its dial's range.
3. In the same file replace commitWedgePolicy, commitDirectionPreset and commitFogTier with LAYOUT_CHOICE_DIALS and FOG_CHOICE_DIALS built with choiceDial. Direction order uses control 'select', read c => directionPresetOf(c) ?? 'compass-8', write (c,v) => ({...c, directionSequence: DIRECTION_PRESETS[v]}). Keep directionPresetOf exported. Delete the local clampStepped.
4. motion-controls-model.ts: replace the commit* functions with MOTION_STEP_DIALS (fast/mid/slow writing {...c, tempo: {...c.tempo, fast: v}} and so on, then overshootPct) and MOTION_CHOICE_DIALS (edge flavor, collapse exit). Remove the '../canvas/map-controls-model' import.
5. MapControls.tsx: add a generic DialGroup<C> that renders Collapsible (defaultOpen false, the same className/headerClassName) with DialGroupHeader, then one DialRow+Stepper per step dial ({...dial.range}, ariaLabel, variant 'inline', valueClassName, onChange={(n) => onChange(commitStepDial(dial, value, n))}), then one labelled choice row per choice dial, passing dial.options directly to SegmentedControl (density 'compact') or Select. Replace the four Collapsible blocks (lines 101-384) with four <DialGroup> calls in the same order. Keep the NODE_ENV gate, the Panel props and memo.
6. Delete every now-unused *_RANGE/*_OPTIONS export and commit* export. Fallow unused-exports will flag any leftovers. Rewrite both model tests against the tables, then run pnpm check through test-runner.

**Tests.** Add src/mapper/lib/step-dial.test.ts: clampStepped clamps below min and above max and snaps to the step grid; choiceDial ignores a value missing from options. Rewrite map-controls-model.test.ts and motion-controls-model.test.ts as table-driven tests. For every step dial: commitStepDial(dial, cfg, min-999) reads back min, max+999 reads back max, an off-grid value lands on the grid, and no other key changes. Keep the specific invariant tests: ringSpacing >= minSeparation in both directions (current lines 23-41), fog density stored as a fraction (lines 72-78), direction-preset round-trip through directionPresetOf (lines 50-56), and the exact option value lists (motion test lines 54-64). Extend MapControls.test.ts so the development markup contains each dial's aria-label, e.g. 'aria-label="Minimum separation"' and 'Fog density percent', and the choice labels.

**Notes.** Behaviour to preserve exactly. (1) The row label and ariaLabel differ for most dials: Separation/Minimum separation, Fast/Fast tempo, Mid/Mid tempo, Slow/Slow tempo, Overshoot/Overshoot percent, Drawn rings/Drawn halo rings, Fogged rings/Fogged halo rings, Per exit/Halo systems per exit, Total cap/Halo total system cap, Reveal/Fog reveal radius, Corridor/Fog corridor radius, Density %/Fog density percent. Sibling fan and Ring spacing use the same string for both. (2) Value widths: w-8 for ring spacing, separation, overshoot, drawn rings and fogged rings; none for sibling fan; w-12 for the three tempos; w-10 for per exit, total cap and the three fog steppers. (3) Each group renders its steppers first, then its choices. (4) Direction order is a Select with a 'compass-8' fallback; the other choices are compact SegmentedControls. (5) Clamping happens before write, so the coupled pair sees the clamped value, as it does today. No drifted copy was found: all clamps use the same formula. The panel renders only when NODE_ENV is development, so user-facing risk is nil.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p217"></a>

## P217: Decode ConvexError payloads in one helper and route every setTracking call through one failure path

- **Status:** [ ] not started
- **Category:** error-handling · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -20 / +45 (new helper and its tests account for most of the additions)
- **Depends on:** —
- **Existing primitive:** `convex/lib/errorCode.ts:errorCode`

**Problem.** The client decodes Convex application errors two different ways, and the server a third way. use-scanner-paste string-matches the stringified error. TrackingControls duck-types error.data.detail. convex/lib/errorCode does instanceof plus data.code for logs. useSetMapTracking returns the raw mutation, so only TrackingControls attaches a failure toast; HomePrompt's two calls drop rejections and give the user no feedback. The scan refusal codes OFF_MAP_SCAN_SYSTEM and UNTRACKED_SCAN_SYSTEM are written as separate literals in convex/lib/mapScanApply.ts and in the mapper, with no shared constant or test tying them.

**Verifier revision.** Real core: HomePrompt.tsx:100-106 and 124-127 call the shared useSetMapTracking mutation with `void` and no catch, so TRACKING_CAP_EXCEEDED, TRACKING_MAP_CAP_EXCEEDED, CHARACTER_NOT_ELIGIBLE, TRACKING_SCOPING_PENDING and FORBIDDEN become unhandled rejections with no feedback, while TrackingControls handles the same mutation. The two client decoders (String(error).includes in use-scanner-paste; hand-rolled data.detail in TrackingControls) and the server errorCode are the same concept done three ways. The scan codes are bare literals on both sides of the wire with no test linking them; scanFailureMessage has no test. Refuted parts: (1) TrackingControls never shows diagnostic text. setTracking only throws codes whose detail is written for users (mapTrackingOptIn 22-27/57-63, mapTrackingCapacity 21-27, mapAccess 26-29), and the cited 'The caller has no tracked character in system 123.' is applyScan's UNTRACKED_SCAN_SYSTEM detail, which the scanner path never displays. So 'treat detail as diagnostic only' would be a regression for tracking. (2) SignatureWindow, connection-authoring-api and use-signature-missing-flow do no decoding. Showing reasons there is a UX feature, not a duplicate primitive. (3) A wide map-error-code table is not needed: the client keys on only the two scan codes.

**Sites (11).**

- [`src/mapper/authoring/HomePrompt.tsx:38,100-106,124-127`](../../src/mapper/authoring/HomePrompt.tsx#L38) — void setTracking(...) twice, with no catch: unhandled rejection and no toast
- [`src/mapper/tracking/TrackingControls.tsx:51-53,80-91`](../../src/mapper/tracking/TrackingControls.tsx#L51-L53) — useSetMapTracking returns the raw mutation; the only failure path is inline in onToggle and duck-types data.detail
- [`src/mapper/tracking/TrackingControls.test.ts:194-201`](../../src/mapper/tracking/TrackingControls.test.ts#L194-L201) — mocks the rejection as a plain {data:{code,detail}} object, so the shared decoder must be structural, not instanceof-only
- [`src/mapper/signatures/use-scanner-paste.ts:15-24,41-52`](../../src/mapper/signatures/use-scanner-paste.ts#L15-L24) — scanFailureMessage string-matches codes; untested
- [`convex/lib/mapScanApply.ts:76-88`](../../convex/lib/mapScanApply.ts#L76-L88) — throws UNTRACKED_SCAN_SYSTEM / OFF_MAP_SCAN_SYSTEM as literals; the detail is diagnostic and correctly ignored by the client
- [`convex/lib/errorCode.ts:1-10`](../../convex/lib/errorCode.ts#L1-L10) — server-side decoder (instanceof + data.code, else message) used by mapAuthoringSweep and mapChainCleanup for logs
- [`convex/mapTrackingOptIn.ts:22-27,57-63`](../../convex/mapTrackingOptIn.ts#L22-L27) — setTracking details are user-facing copy (cap count, access list)
- [`convex/lib/mapTrackingCapacity.ts:21-27`](../../convex/lib/mapTrackingCapacity.ts#L21-L27) — TRACKING_MAP_CAP_EXCEEDED detail is user-facing ('Stop tracking a character before adding another.')
- [`convex/lib/mapAccess.ts:26-29,51,61`](../../convex/lib/mapAccess.ts#L26-L29) — TRACKING_SCOPING_PENDING has a user-facing detail; FORBIDDEN/UNAUTHENTICATED have none, so the client falls back
- [`src/mapper/signatures/signature-model.ts:338-362`](../../src/mapper/signatures/signature-model.ts#L338-L362) — the local 'untracked' refusal already uses the copy 'No character online', the same as the server-code mapping in use-scanner-paste
- [`src/lib/error-copy.ts:1-8`](../../src/lib/error-copy.ts#L1-L8) — existing code-to-copy lookup (resolveErrorMessage) to reuse for the scan copy table

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/SignatureWindow.tsx:83-100`](../../src/mapper/signatures/SignatureWindow.tsx#L83-L100) — generic deduplicated failure toasts; no decoding happens here, so this is a UX choice, not a duplicate decoder
- [`src/mapper/signatures/connection-authoring-api.ts:194-221`](../../src/mapper/signatures/connection-authoring-api.ts#L194-L221) — mutations wrapped by swallowMutationRejection resolve to undefined; no error is ever available to decode
- [`src/mapper/signatures/use-signature-missing-flow.ts:85-95`](../../src/mapper/signatures/use-signature-missing-flow.ts#L85-L95) — 'Restore failed' toast; showing UNDO_WINDOW_EXPIRED would be a feature request
- [`convex/lib/mapTrackingCapacity.ts:8-17`](../../convex/lib/mapTrackingCapacity.ts#L8-L17) — TRACKING_SCAN_LIMIT detail is semi-diagnostic but readable; no evidence that users see raw diagnostic text

</details>

**Home.** `src/lib/convex-error.ts for readConvexError, and src/data/maps/scan-errors.ts for the two scan refusal codes. The setTracking failure path stays in src/mapper/tracking/TrackingControls.tsx inside useSetMapTracking.`

**Boundary check.** src/lib/convex-error.ts is in zone lib (rule `lib` allows [config]). It imports no zone module: the check is structural, and at most it imports convex/values from npm. Consumers: src/mapper/** (rule `mapper` allows lib) and convex/lib/errorCode.ts (rule `convex` allows lib). src/data/maps/scan-errors.ts is in the auto-discovered data/maps zone (autoDiscover src/data) and imports nothing. Consumers: convex/lib/mapScanApply.ts (rule `convex` allows data; convex already imports @/data/maps about 80 times) and src/mapper/signatures (rule `mapper` allows data; use-scanner-paste already imports @/data/maps/scan-parse).

**API sketch.**

```ts
// src/lib/convex-error.ts
export interface ConvexErrorPayload { readonly code: string; readonly detail: string | null }
export function readConvexError(error: unknown): ConvexErrorPayload | null; // object with data.code string; detail if string else null; string-data ConvexErrors -> null

// src/data/maps/scan-errors.ts
export const SCAN_REFUSAL_CODE = { offMap: 'OFF_MAP_SCAN_SYSTEM', untracked: 'UNTRACKED_SCAN_SYSTEM' } as const;

// src/mapper/tracking/TrackingControls.tsx
export function useSetMapTracking(): (args: { mapId: string; characterId: number; tracked: boolean }) => Promise<void>; // catches and toasts 'Tracking was not changed' with readConvexError(e)?.detail ?? 'Please try again.'
```

**Migration steps.**

1. Add src/lib/convex-error.ts with readConvexError, plus src/lib/convex-error.test.ts. Cover a ConvexError with object data, a ConvexError with string data (null), a plain {data:{code,detail}} object, a plain Error (null), and a non-string detail (detail null).
2. Move the catch from TrackingControls.tsx:81-90 into useSetMapTracking so the hook returns a function that never rejects, toasting with readConvexError(error)?.detail ?? 'Please try again.'. Make TrackingControls' onToggle call it directly. HomePrompt.tsx needs no code change beyond keeping `void setTracking(...)`, which is now safe and shows the toast.
3. Add src/data/maps/scan-errors.ts and throw with SCAN_REFUSAL_CODE.* in convex/lib/mapScanApply.ts:78 and :85, keeping the literal values unchanged.
4. Move scanFailureMessage from use-scanner-paste.ts:15-24 into signature-model.ts beside scannerPasteRefusalToast. Key it with readConvexError(error)?.code against a copy record built from SCAN_REFUSAL_CODE, through resolveErrorMessage(code, copy, 'Scan not applied') ?? 'Scan not applied'. Reuse the 'No character online' string for both the local refusal and the server code.
5. Optional last step: rebuild convex/lib/errorCode.ts as `readConvexError(error)?.code ?? (error instanceof Error ? error.message : String(error))`. Log output is unchanged for object-data and string-data ConvexErrors.

**Tests.** New: src/lib/convex-error.test.ts. Move 'explains a refused tracking change' (TrackingControls.test.ts:194-205) to exercise useSetMapTracking. Add a case where a rejection without detail falls back to 'Please try again.'. Add a HomePrompt test showing that a rejected setTracking produces the toast and no unhandled rejection; HomePrompt.test.ts:55 already mocks useSetMapTracking, so test the hook itself. Add signature-model.test.ts cases mapping OFF_MAP_SCAN_SYSTEM, UNTRACKED_SCAN_SYSTEM and an unknown error to 'System not on map', 'No character online' and 'Scan not applied'. The existing convex/mapScan.test.ts:148 guards the server code.

**Notes.** Keep the server-authored detail as the tracking toast description. It carries the cap numbers (32 per user, 1024 per map) and is written for users, so moving copy to the client would duplicate the constants. Keep the scanner toast id 'scanner-paste:failed' and its 5000 ms duration, and keep the tracking toast title 'Tracking was not changed'. The decoder must stay structural (duck-typed on data.code) because the client test mocks plain objects. The string match in use-scanner-paste works today only because ConvexError.message is the JSON of its data. TRACKING_CAP_EXCEEDED is thrown with a detail in mapTrackingOptIn.ts:24-27 but without one in mapScanApply.ts:66; that is harmless because the scan path never shows detail.

<sub>Reported by: gap:failure-code-to-user-copy.</sub>

<a id="p028"></a>

## P028: Route HomePrompt's tracking portraits through the trackable roster, a shared toggle hook and CharacterPortraitPicker

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** HomePrompt about -45/+20. TrackingControls about -10/+12. Picker and toggle +6. View helper +10. Net about -10.
- **Depends on:** [P217](#p217), [P059](wave-01-quick-wins-delete-dead-code-fix-small.md#p059)
- **Existing primitive:** `src/components/character-portrait-picker.tsx:CharacterPortraitPicker; src/mapper/tracking/tracking-controls-view.ts:trackableCharacters`

**Problem.** The home-system dialog hand-rolls a second tracking toggle row that has drifted from the canonical Tracking menu. It offers characters the map's access list rejects. It drops mutation refusals (cap reached, not eligible, scoping pending) as unhandled rejections with no toast, and so does its 'Start tracking' button. It ignores needsLocationReconnect, and it re-types the portrait chrome without a keyboard focus ring.

**Verifier revision.** All three drift claims hold. (1) HomePrompt maps every account character (HomePrompt.tsx:84). On a character-scoped map, setTracking throws CHARACTER_NOT_ELIGIBLE for characters outside principal.characters (convex/mapTrackingOptIn.ts:56-62), while TrackingControls filters through trackableCharacters (TrackingControls.tsx:74). (2) HomePrompt calls 'void setTracking(...)' at lines 101-105 and 126 with no catch. The mutation also throws TRACKING_CAP_EXCEEDED and TRACKING_SCOPING_PENDING, so those refusals become unhandled rejections with no feedback. TrackingControls.test.ts:194-205 shows the codebase's intent: 'explains a refused tracking change instead of dropping the rejection'. (3) HomePrompt ignores needsLocationReconnect, which BuildCharacter carries and trackingToggleLabel handles. A fourth drift turned up: the hand-rolled button sets outline-none with no focus-visible ring, so keyboard focus on the portraits is invisible. portraitToggleClass includes focus-visible:ring-1. Three design points had to change. ChainLive only receives MapAccessState (a boolean, use-map-chain-pages.ts:25,35-36), not trackableCharacterIds, so HomePrompt should subscribe to watchMapAccess itself; Convex shares the identical subscription use-map-chain-pages already holds. CharacterPortraitPicker currently labels each toggle with the bare name and cannot emit data-tracking-reconnect, so it needs a small optional extension. Adding a file in src/mapper needs a surface.test.ts update, so the hook should stay in TrackingControls.tsx.

**Sites (10).**

- [`src/mapper/authoring/HomePrompt.tsx:73-119`](../../src/mapper/authoring/HomePrompt.tsx#L73-L119) — Hand-rolled toggle row over the unfiltered roster: Button with a copied pressed ternary, outline-none and no focus ring, its own 'Stop tracking'/'Track' label, and void setTracking without a catch.
- [`src/mapper/authoring/HomePrompt.tsx:120-128`](../../src/mapper/authoring/HomePrompt.tsx#L120-L128) — onStartTracking: void setTracking({mapId, characterId, tracked: true}), also uncaught.
- [`src/mapper/tracking/TrackingControls.tsx:51-53`](../../src/mapper/tracking/TrackingControls.tsx#L51-L53) — useSetMapTracking, a raw useMutation. Its only consumers are HomePrompt and TrackingControls.
- [`src/mapper/tracking/TrackingControls.tsx:62-95`](../../src/mapper/tracking/TrackingControls.tsx#L62-L95) — Canonical flow: watchMapAccess, trackableCharacters, and onToggle with try/catch extracting data.detail into toast.error('Tracking was not changed').
- [`src/mapper/tracking/tracking-controls-view.ts:1-35`](../../src/mapper/tracking/tracking-controls-view.ts#L1-L35) — trackingToggleLabel (reconnect-aware) and trackableCharacters.
- [`src/components/character-portrait-picker.tsx:58-95`](../../src/components/character-portrait-picker.tsx#L58-L95) — CharacterPortraitPicker, the form-context ToggleGroup picker. Labels with character.name only and has no reconnect attribute.
- [`src/components/ui/portrait-toggle.tsx:8-9, 40-54`](../../src/components/ui/portrait-toggle.tsx#L8-L9) — portraitToggleClass already styles data-[pressed], focus-visible and data-[tracking-reconnect]. PortraitToggle sets aria-label and title from label.
- [`convex/mapTrackingOptIn.ts:40-80`](../../convex/mapTrackingOptIn.ts#L40-L80) — Server refusals: CHARACTER_NOT_ELIGIBLE, TRACKING_CAP_EXCEEDED, and requireMapTrackingOpen (TRACKING_SCOPING_PENDING).
- [`src/mapper/chain/use-map-chain-pages.ts:25-47`](../../src/mapper/chain/use-map-chain-pages.ts#L25-L47) — ChainLive's access is boolean \| undefined. trackableCharacterIds is not passed through.
- [`src/mapper/authoring/HomePrompt.test.ts:54-56, 153-195`](../../src/mapper/authoring/HomePrompt.test.ts#L54-L56) — Mocks useSetMapTracking and asserts on data-map-home-track-character and 'Stop tracking …'.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/tracking/TrackingControls.tsx:112-124`](../../src/mapper/tracking/TrackingControls.tsx#L112-L124) — Uses CharacterPortraitMenuItems (MenuCheckboxItem). That is correct for a menu but cannot render inside HomePrompt's Dialog, which is why HomePrompt should use the form-context CharacterPortraitPicker instead.

</details>

**Home.** `Hook: useMapTrackingToggle in src/mapper/tracking/TrackingControls.tsx, replacing useSetMapTracking. Pure helper: trackingRefusalDetail in src/mapper/tracking/tracking-controls-view.ts. Extensions to the existing primitives src/components/character-portrait-picker.tsx (optional itemLabel) and src/components/ui/portrait-toggle.tsx (optional reconnect flag).`

**Boundary check.** HomePrompt and TrackingControls are in the mapper zone. Mapper may import components, ui, data and lib (allow list ["features","data","components","ui","transport","lib","config"]), which covers CharacterPortraitPicker (components), toast (ui), api and useLiveValue (data). HomePrompt -> ../tracking is intra-zone. character-portrait-picker.tsx (components) imports ui/portrait-toggle, allowed by components -> ["ui", ...]. portrait-toggle.tsx (ui) gains only a prop and imports nothing new, consistent with ui -> [].

**API sketch.**

```ts
// tracking-controls-view.ts
export function trackingRefusalDetail(error: unknown): string // data.detail when it is a string, else 'Please try again.'
// TrackingControls.tsx
export function useMapTrackingToggle(mapId: string): (characterId: number, tracked: boolean) => Promise<void> // try { await setTracking(...) } catch (e) { toast.error('Tracking was not changed', { description: trackingRefusalDetail(e) }) }
// character-portrait-picker.tsx
CharacterPortraitPicker({ characters, selectedIds, onToggle, label, disabled, itemLabel?: (character: PickerCharacter, selected: boolean) => string })
// portrait-toggle.tsx
PortraitToggle({ value, label, reconnect?: boolean, children }) // renders data-tracking-reconnect={reconnect ? 'true' : undefined}
```

**Migration steps.**

1. tracking-controls-view.ts: add trackingRefusalDetail(error), moving the logic from TrackingControls.tsx:84-88 unchanged. Unit-test it in tracking-controls-view.test.ts.
2. TrackingControls.tsx: replace useSetMapTracking with useMapTrackingToggle(mapId), which wraps useMutation(api.mapTrackingOptIn.setTracking) with the try/catch and toast. TrackingControls passes it as onToggle. TrackingControlsView's onToggle type can narrow to Promise<void>.
3. portrait-toggle.tsx: add an optional reconnect prop that emits data-tracking-reconnect. character-portrait-picker.tsx: add optional itemLabel (default character.name) used as PortraitToggle's label, and pass reconnect={character.needsLocationReconnect === true}. The existing consumers (features/maps/OwnCharacterPicker.tsx and composition ProfileDialogs.tsx) pass neither prop, so their output does not change.
4. HomePrompt.tsx: add const access = useLiveValue(api.mapChainAccess.watchMapAccess, { mapId }) and const toggle = useMapTrackingToggle(mapId). Derive trackable = access === undefined || characters === null ? [] : trackableCharacters(characters, access.trackableCharacterIds ?? null). Wait for access before showing toggles, so the full roster never flashes on a scoped map.
5. HomePrompt.tsx: replace lines 73-119 with a data-map-home-tracking wrapper holding the 'Track a character in space' caption and <CharacterPortraitPicker label="Tracking" characters={trackable} selectedIds={trackedIds} onToggle={({ characterId, selected }) => void toggle(characterId, selected)} itemLabel={(c, selected) => trackingToggleLabel({ name: c.name, tracked: selected, needsLocationReconnect: c.needsLocationReconnect === true })}/>. Render it only when trackable.length > 0. Drop the wrapper's role='group'/aria-label, since the ToggleGroup carries aria-label.
6. HomePrompt.tsx: change onStartTracking to call void toggle(characterId, true). Remove the now-unused Button-in-loop, cn, CharacterPortrait and useSetMapTracking imports.
7. Update the tests (see tests), then run pnpm check through test-runner.

**Tests.** HomePrompt.test.ts: mock api.mapChainAccess.watchMapAccess and branch useLiveValue on it. Mock useMapTrackingToggle instead of useSetMapTracking. Replace the data-map-home-track-character assertions with the same aria-pressed/aria-label regex style as character-portrait-picker.test.ts:19-20, e.g. /aria-pressed="true"[^>]*aria-label="Stop tracking Session Pilot"/. Add three cases: with trackableCharacterIds [202], character 101 is not offered; a character with needsLocationReconnect gets the '(cannot sync location)' label and data-tracking-reconnect; Start tracking calls toggle(101, true). Note that the test fixture uses needsReconnect and must add needsLocationReconnect. character-portrait-picker.test.ts: add itemLabel and reconnect cases. tracking-controls-view.test.ts: trackingRefusalDetail with a detail string, a non-string detail and a non-object error. Existing guard: TrackingControls.test.ts:194-205 (toast on refusal) and :140-154 (trackable filter) must still pass.

**Notes.** Behaviour changes, all intended. HomePrompt now hides characters outside the access list, toasts refusals instead of dropping them, shows reconnect state, and gains the shared focus ring and arrow-key roving from Base UI ToggleGroup. Accessible names stay 'Track X'/'Stop tracking X' via itemLabel, and aria-pressed is still emitted by Base UI Toggle. The data-map-home-track-character selector goes away, and only HomePrompt.test.ts uses it (no e2e use found). Open decision for the implementer: 'Start tracking' targets the session character, which may itself be ineligible on a scoped map. After this change that produces a toast rather than silence. Hiding the button when characterId is not in the trackable set would be stricter. Both P028 and P029 edit HomePrompt.tsx; there is no ordering dependency, but land them one after the other to avoid conflicts.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p038"></a>

## P038: Render HomePrompt's tracking portraits with CharacterPortraitPicker and share TrackingControls' tracking toggle

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -45/+15 in HomePrompt, -12/+15 in TrackingControls for the hook, +4 in the picker; net about -25
- **Depends on:** [P028](#p028)
- **Existing primitive:** `src/components/ui/portrait-toggle.tsx:PortraitToggle,portraitToggleClass`

**Problem.** HomePrompt hand-rolls the portrait toggle. It copies the exact portraitToggleClass chrome: size-10, border-2, p-0.5, opacity-35 grayscale, and border-isk when pressed. It puts that on bare aria-pressed Buttons instead of using CharacterPortraitPicker, which OwnCharacterPicker and ProfileDialogs already use. Its tracking behaviour has also drifted from TrackingControls, the canonical tracking UI:
(a) Both setTracking calls are `void` fire-and-forget with no catch. The server's setTracking throws a ConvexError, CHARACTER_NOT_ELIGIBLE or a tracking-closed error, and that becomes an unhandled rejection with no feedback. TrackingControls toasts 'Tracking was not changed' with the error detail instead.
(b) It lists every account character, while TrackingControls filters with trackableCharacters(access.trackableCharacterIds).
(c) It builds its own 'Track/Stop tracking X' label, which ignores the needsLocationReconnect variants that trackingToggleLabel produces.

**Verifier revision.** The CharacterStrip half does not hold up. The strip's lit state is deliberately borderless with hover-opacity, and its locked state is a reconnect action, not a toggle. Moving it onto portraitToggleClass would add a gold border and size-10 chrome, which is a design change. Putting reconnect Buttons inside a ToggleGroup would also break roving focus. toggleDimmed gives the same result as toggleCharacterId, but sharing it saves about 2 lines and would make a pure model import a 'use client' component module. The opacity-50 grayscale sites mean something else: a non-interactive 'not linked' or 'missing' status, not an unselected toggle, so 50 vs 35 is not drift. A grep found the real bypass the finders missed: mapper/authoring/HomePrompt hand-copies portraitToggleClass on aria-pressed Buttons (Fallow already groups it with character-portrait-picker as dup c77b3abb6f87acd9-2404). Its tracking toggle has also drifted from TrackingControls in three ways. It has no error handling, it skips the trackable-character filter, and it ignores the reconnect labels.

**Sites (11).**

- [`src/mapper/authoring/HomePrompt.tsx:73-119`](../../src/mapper/authoring/HomePrompt.tsx#L73-L119) — Hand-rolled portrait toggle with portraitToggleClass look copied inline (95-98), inline label (92), and void setTracking with no error handling (100-106)
- [`src/mapper/authoring/HomePrompt.tsx:34-42, 124-127`](../../src/mapper/authoring/HomePrompt.tsx#L34-L42) — useAccountCharacters with no trackableCharacters filter; a second fire-and-forget setTracking in onStartTracking
- [`src/components/ui/portrait-toggle.tsx:8-54`](../../src/components/ui/portrait-toggle.tsx#L8-L54) — Canonical portraitToggleClass, PortraitToggleGroup and PortraitToggle
- [`src/components/character-portrait-picker.tsx:57-95`](../../src/components/character-portrait-picker.tsx#L57-L95) — CharacterPortraitPicker; label is the character name only (no itemLabel yet)
- [`src/components/character-portrait-picker.tsx:97-135`](../../src/components/character-portrait-picker.tsx#L97-L135) — CharacterPortraitMenuItems already takes itemLabel; TrackingControls uses it
- [`src/mapper/tracking/TrackingControls.tsx:51-95`](../../src/mapper/tracking/TrackingControls.tsx#L51-L95) — useSetMapTracking; trackableCharacters filter; try/catch that toasts the ConvexError detail
- [`src/mapper/tracking/TrackingControls.tsx:97-135`](../../src/mapper/tracking/TrackingControls.tsx#L97-L135) — View passes trackingToggleLabel with needsLocationReconnect
- [`src/mapper/tracking/tracking-controls-view.ts:1-12, 28-35`](../../src/mapper/tracking/tracking-controls-view.ts#L1-L12) — trackingToggleLabel and trackableCharacters, the canonical label and filter
- [`convex/mapTrackingOptIn.ts:40-80`](../../convex/mapTrackingOptIn.ts#L40-L80) — setTracking throws CHARACTER_NOT_ELIGIBLE and requireMapTrackingOpen errors that HomePrompt never catches
- [`src/features/maps/OwnCharacterPicker.tsx:32-38`](../../src/features/maps/OwnCharacterPicker.tsx#L32-L38) — Existing consumer showing the intended CharacterPortraitPicker usage
- [`src/mapper/authoring/HomePrompt.test.ts:153-193`](../../src/mapper/authoring/HomePrompt.test.ts#L153-L193) — Asserts data-map-home-track-character, aria-pressed and the 'Stop tracking' labels; must be updated

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/character-strip.tsx:12-23, 41-75`](../../src/components/character-strip.tsx#L12-L23) — Different design. Lit state is borderless with hover:opacity-75, and locked is a reconnect action with an orange ring. portraitToggleClass would add a gold border and size-10 chrome, and reconnect Buttons inside a ToggleGroup break roving focus. Only the 35% grayscale value matches, which is already consistent.
- [`src/components/character-strip-model.ts:23-31`](../../src/components/character-strip-model.ts#L23-L31) — toggleDimmed is a flip with a locked guard. It gives the same result as toggleCharacterId(ids, {selected: !ids.includes(id)}), but sharing saves about 2 lines and would make a pure model import a 'use client' .tsx module.
- [`src/components/composition/industry-workspace/MemberRail.tsx:30-38`](../../src/components/composition/industry-workspace/MemberRail.tsx#L30-L38) — opacity-50 grayscale marks a non-interactive 'not linked' member. That is a status, not an unselected toggle.
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:46-52`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L46-L52) — Same 'not linked' status styling
- [`src/components/composition/board/sections/CharacterIdentity.tsx:25-31`](../../src/components/composition/board/sections/CharacterIdentity.tsx#L25-L31) — dimmed prop is the same status concept (missed by the finders); not a toggle
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:94`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L94) — opacity-50 grayscale on a missing facility tile; not a portrait

</details>

**Home.** `Existing src/components/character-portrait-picker.tsx:CharacterPortraitPicker, with a new optional itemLabel. The toggle handler is extracted into src/mapper/tracking/TrackingControls.tsx as useMapTrackingToggle, replacing useSetMapTracking.`

**Boundary check.** HomePrompt is in the mapper zone (src/mapper/**). The mapper rule allows [features, data, components, ui, transport, lib, config], so it may import src/components/character-portrait-picker.tsx, which is in the components zone (src/components/*.tsx). It already imports components/character-portrait and use-account-characters. character-portrait-picker imports ui/portrait-toggle, which the components rule allows (ui). The new hook lives in src/mapper/tracking, the same zone as HomePrompt, and imports ui/toast (mapper allows ui) and data/convex (mapper allows data). No boundary changes.

**API sketch.**

```ts
// src/components/character-portrait-picker.tsx
export function CharacterPortraitPicker(props: {
  readonly characters: readonly PickerCharacter[];
  readonly selectedIds: ReadonlySet<number>;
  readonly onToggle: (change: PortraitToggleChange) => void;
  readonly label: string;
  readonly disabled?: boolean;
  /** Per-portrait accessible name; defaults to character.name. */
  readonly itemLabel?: (character: PickerCharacter, selected: boolean) => string;
}): JSX.Element;

// src/mapper/tracking/TrackingControls.tsx (replaces useSetMapTracking)
/** setTracking that toasts 'Tracking was not changed' with the ConvexError detail on failure. */
export function useMapTrackingToggle(mapId: string): (characterId: number, tracked: boolean) => Promise<void>;
```

**Migration steps.**

1. In TrackingControls.tsx, move the try/catch toast block from the onToggle at lines 78-91 into `useMapTrackingToggle(mapId)`. Pass it as TrackingControlsView's onToggle and delete the `useSetMapTracking` export, whose only other consumer is HomePrompt.
2. Add optional `itemLabel` to CharacterPortraitPicker, mirroring CharacterPortraitMenuItems, and pass `itemLabel?.(character, visibleSelectedIds.has(id)) ?? character.name` to PortraitToggle's label.
3. In HomePrompt, replace lines 83-117 with `<CharacterPortraitPicker label="Tracking" characters={trackable} selectedIds={trackedIds} onToggle={({ characterId, selected }) => void toggle(characterId, selected)} itemLabel={(c, tracked) => trackingToggleLabel({ name: c.name, tracked, needsLocationReconnect: c.needsLocationReconnect === true })} />`. Keep the data-map-home-tracking wrapper and caption, and drop the now-redundant role=group and aria-label on the wrapper because ToggleGroup carries aria-label.
4. In HomePrompt, compute `trackable = trackableCharacters(characters, access?.trackableCharacterIds ?? null)` from `useLiveValue(api.mapChainAccess.watchMapAccess, { mapId })`, the same subscription TrackingControls uses.
5. Route CurrentSystemControl's onStartTracking (lines 124-127) through the same `toggle(characterId, true)`.
6. Remove HomePrompt's now-unused Button and cn imports, then update HomePrompt.test.ts.

**Tests.** HomePrompt.test.ts (153-193): replace the data-map-home-track-character assertions with aria-pressed plus aria-label 'Stop tracking Session Pilot', which now comes from trackingToggleLabel. Add cases for: a character outside access.trackableCharacterIds is not rendered; a needsLocationReconnect character reads 'Track X (reconnect required)'; a rejected toggle calls toast.error('Tracking was not changed', ...) (mock ui/toast as TrackingControls.test.ts:44 does). character-portrait-picker.test.ts: add an itemLabel case. TrackingControls.test.ts (~201) keeps guarding the extracted toast path. tracking-controls-view.test.ts guards the label and filter.

**Notes.** Behaviour changes to accept:
(1) HomePrompt no longer shows characters that are not on the map's access list. The server rejects them today anyway.
(2) Failed toggles toast instead of rejecting silently.
(3) Portraits become a Base UI ToggleGroup: arrow-key roving focus and a title tooltip. The look is the same, plus cursor-pointer.
(4) The data-map-home-track-character attribute goes away. No e2e reference exists; only HomePrompt.test.ts uses it.
Optimistic state is unchanged: both before and after, pressed state comes from the live ownTrackedCharacterIds.
Correct copy: TrackingControls, for the label, the filter and the error handling. HomePrompt is the drifted one.

<sub>Reported by: area:ui-components.</sub>

<a id="p029"></a>

## P029: Extract SystemTerminalSearch for the mapper's system pickers and stop NodeAddMenu offering a self-loop

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -30 across the three call sites, with parseDestinationSystem's 17 lines moved. The new module adds about 35 lines. Net about +5. The value is one picker definition and the self-loop fix.
- **Depends on:** [P028](#p028)
- **Existing primitive:** `src/components/use-system-search.ts:useSystemSearch,systemNameFrom`

**Problem.** Three mapper authoring surfaces configure TerminalSearch with useSystemSearch in the same way. They duplicate the 'No system matches that name.' copy, the generic types and the clear/label boilerplate. Origin exclusion lives in parseDestinationSystem inside connection-fields.tsx. NodeAddMenu's 'Add connection' picker skips it, so choosing the node's own system silently fails server-side with SELF_LOOP while the dialog closes as if it had worked.

**Verifier revision.** The three TerminalSearch<SystemParams, SystemErr> configurations are the same concept, a system picker fed by useSystemSearch. They share errorMessage copy, the generic types, a no-op or nulling onClear and an errorLabel. The efficiency claim is wrong and is dropped. loadSystems memoises a module-level promise (src/data/eve-data/systems-search.ts:16-36), so HomePrompt's useSystemSearch and useSystemName effects trigger one fetch, not two. Keep useSystemName rather than reading from the search, because it adds a 15-second retry the search hook lacks. Verification found a real drift that justifies the primitive. connection-fields and scanner-leads-control route destination parsing through parseDestinationSystem, which rejects the origin system, but NodeAddMenu does not. NodeAddMenu lets the user pick the node's own system: the server throws SELF_LOOP (convex/mapAuthoringHome.ts:110-115), swallowMutationRejection discards it (optimistic-authoring.ts:504-513), and the dialog closes as if it had succeeded. The primitive should own parseDestinationSystem and expose excludeSystemId.

**Sites (8).**

- [`src/mapper/authoring/HomePrompt.tsx:31, 41, 62-72`](../../src/mapper/authoring/HomePrompt.tsx#L31) — useSystemSearch plus useSystemName (a single shared fetch via loadSystems' promise). TerminalSearch config #1: initialValue '', no-op onClear, errorLabel 'System'.
- [`src/mapper/authoring/NodeAddMenu.tsx:38, 89-104`](../../src/mapper/authoring/NodeAddMenu.tsx#L38) — Config #2. onSubmit uses params.system.id as toSystemId and does not exclude fromSystemId.
- [`src/mapper/authoring/connection-fields.tsx:474, 494-511`](../../src/mapper/authoring/connection-fields.tsx#L474) — Config #3. parse goes through parseDestinationSystem(search.parse, input, connection.fromSystemId), keyed for reset, initialValue destination.label, onClear sets the destination to null, errorLabel 'Destination'. useSystemSearch is called even on the readOnly and hint branches.
- [`src/mapper/authoring/connection-fields.tsx:544-560`](../../src/mapper/authoring/connection-fields.tsx#L544-L560) — parseDestinationSystem: strips a ' - suffix' and rejects originSystemId.
- [`src/mapper/signatures/scanner-leads-control.tsx:17-21, 196`](../../src/mapper/signatures/scanner-leads-control.tsx#L17-L21) — Second consumer of parseDestinationSystem (in a Combobox, not TerminalSearch). Its import path changes when the function moves.
- [`convex/mapAuthoringHome.ts:101-115`](../../convex/mapAuthoringHome.ts#L101-L115) — Server rejects fromSystemId === toSystemId with SELF_LOOP.
- [`src/mapper/chain/optimistic-authoring.ts:504-513, 607-610`](../../src/mapper/chain/optimistic-authoring.ts#L504-L513) — addSystemFromNode wrapped in swallowMutationRejection, so the SELF_LOOP refusal is discarded.
- [`src/components/use-system-search.ts:26-47, 49-94`](../../src/components/use-system-search.ts#L26-L47) — Existing primitives. useSystemName retries after 15 s; useSystemSearch heals via suggest.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/scanner-leads-control.tsx:228-260`](../../src/mapper/signatures/scanner-leads-control.tsx#L228-L260) — Uses useSystemSearch with a custom Combobox and grouped suggestions, not TerminalSearch. It keeps its own UI and only shares parseDestinationSystem.
- [`src/features/custom-structures/components/StructureComposer.tsx:94-110`](../../src/features/custom-structures/components/StructureComposer.tsx#L94-L110) — Feature zone, custom suggestion state, not TerminalSearch. Mapper code is also off-limits to features.
- [`src/features/industry-planner/components/ComponentDrawer.tsx:115`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L115) — Reads systems for name lookup only. Not a picker.

</details>

**Home.** `src/mapper/authoring/system-terminal-search.tsx (new). It holds SystemTerminalSearch and the moved parseDestinationSystem.`

**Boundary check.** All consumers (HomePrompt, NodeAddMenu, connection-fields in mapper/authoring, and scanner-leads-control in mapper/signatures) and the home are in the mapper zone (src/mapper/**), so these are intra-zone imports. The new file imports '@/components/ui/terminal-search' (ui) and '@/components/use-system-search' (components), both in mapper's allow list ("components", "ui"). Promote it to src/components only if a non-mapper consumer appears; components may import ui, so that move would also be legal.

**API sketch.**

```ts
export function parseDestinationSystem<P extends { system: { id: number } }>(parse: (input: string) => { ok: true; params: P } | { ok: false }, input: string, excludeSystemId?: number): { ok: true; params: P } | { ok: false; error: SystemErr } // moved verbatim
export function SystemTerminalSearch(props: { placeholder: string; onPick: (systemId: number) => void; initialValue?: string /* '' */; onClear?: () => void /* no-op */; errorLabel?: string /* 'System' */; excludeSystemId?: number; inputRef?: Ref<HTMLInputElement> }): JSX.Element
// internally: const { parse, suggest } = useSystemSearch(); <TerminalSearch<SystemParams, SystemErr> parse={(i) => parseDestinationSystem(parse, i, excludeSystemId)} suggest={suggest} errorMessage={() => 'No system matches that name.'} onSubmit={(p) => onPick(p.system.id)} .../>
```

**Migration steps.**

1. Create src/mapper/authoring/system-terminal-search.tsx. Move parseDestinationSystem there verbatim from connection-fields.tsx:544-560 and add SystemTerminalSearch. Add 'authoring/system-terminal-search.tsx' to the sorted list in src/mapper/chain/surface.test.ts.
2. Update scanner-leads-control.tsx:17-21 to import parseDestinationSystem from '../authoring/system-terminal-search'. Delete it from connection-fields.tsx; leaving it there as a re-export would trip Fallow's duplicate or unused export rules.
3. connection-fields.tsx LeadsToField: remove the useSystemSearch() call at line 474 and replace lines 495-511 with <SystemTerminalSearch key={`${connection.connectionId}:${destination.label}`} initialValue={destination.label} placeholder="System name — e.g. J120924" excludeSystemId={connection.fromSystemId} onPick={onSetDestination} onClear={() => onSetDestination(null)} errorLabel="Destination"/>. Keep the key at the call site for reset semantics.
4. NodeAddMenu.tsx: remove the useSystemSearch() call and replace lines 89-104 with <SystemTerminalSearch placeholder="Destination system — type a name" inputRef={searchInputRef} excludeSystemId={fromSystemId ?? undefined} onPick={(toSystemId) => { if (fromSystemId === null) return; onAdd(fromSystemId, toSystemId); setSearchOpen(false); setFromSystemId(null); }}/>. This is the self-loop fix.
5. HomePrompt.tsx: remove the useSystemSearch() call and replace lines 62-72 with <SystemTerminalSearch placeholder="Search systems — type a name" inputRef={searchInputRef} onPick={onPick}/>. Keep useSystemName for the current-system label.
6. Move the parseDestinationSystem test from connection-fields.test.ts:335-351 into system-terminal-search.test.ts, add the new tests, and run pnpm check through test-runner.

**Tests.** New system-terminal-search.test.ts. Move the parseDestinationSystem cases (suffix strip, not_found, origin exclusion). Mock '@/components/ui/terminal-search' to capture props and assert: errorMessage returns 'No system matches that name.'; errorLabel defaults to 'System'; onClear defaults to a no-op; parse rejects excludeSystemId; onSubmit forwards system.id to onPick. Add a NodeAddMenu test (none exists today) asserting the picker receives excludeSystemId equal to the clicked node's systemId. Existing guards: HomePrompt.test.ts (module-mocks terminal-search and use-system-search and asserts the placeholder; module mocks still apply through the wrapper), connection-fields.test.ts (TerminalSearch mock on initialValue/placeholder), and ActiveSignatureEditor.test.ts:46 and SignatureEditor.test.ts:28 (TerminalSearch mocks via ConnectionFields).

**Notes.** Behaviour differences to preserve or reconcile. (1) The ' - suffix' stripping in parseDestinationSystem now also applies in HomePrompt and NodeAddMenu. That is harmless: suggestions are bare system names (systemsSource label: entry.name) and initialValue is ''. (2) With exclusion, NodeAddMenu shows 'No system matches that name.' when the origin is typed. connection-fields already behaves this way, though a dedicated message would be clearer. (3) connection-fields stops subscribing to useSystemSearch on the read-only and hint branches, a small saving. (4) Do not fold useSystemName into the search; it carries a retry that useSystemSearch lacks. Drift verdict: parseDestinationSystem's origin exclusion is correct (the server enforces SELF_LOOP), and NodeAddMenu is the drifted copy. P028 also edits HomePrompt.tsx; land them one after the other.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p269"></a>

## P269: Derive HomePrompt's current system from dockCharacters and resolvePasteTarget

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -35 in home-prompt-model.ts, +3 in tracked-system.ts, +10 in test fixtures
- **Depends on:** [P028](#p028)
- **Existing primitive:** `src/mapper/tracking/tracked-system.ts:dockCharacters/resolvePasteTarget`

**Problem.** src/mapper/authoring/home-prompt-model.ts answers 'which system is the user's tracked character in right now' with its own copy of the tracked-system rules. It applies the own, covered and location filter per character with linear .find scans, then prefers the active character, else the one system shared by all live own characters, else offline. tracked-system.ts already owns this as dockCharacters plus resolvePasteTarget. Any future change to the rule, such as honouring a pinned dock character or changing coverage semantics, has to be made twice.

**Verifier revision.** Core confirmed. homeCurrentSystem re-implements resolvePasteTarget's decision table: preferred character if live, else the single shared system of the live own characters, else none or ambiguous. Its liveSystemId duplicates dockCharacters' own, location and covered filter. Every home-prompt-model test case maps 1:1 onto resolvePasteTarget(dockCharacters(...), characterId). Two parts of the proposal die. The 'each component keeps its own held-coverage state machine' claim is false: the held state lives once in use-map-coverage.ts, and the three components only pair two hook calls, so a useMapTrackingFeed wrapper saves one line per site. Convex also deduplicates identical subscriptions, so there is no efficiency gain. The liveCharacterLocation helper shares only a two-condition filter between dockCharacters (own-only, seeds offline characters) and derivePresence (all pilots, freshest-wins); the indirection is not worth it.

**Sites (7).**

- [`src/mapper/authoring/home-prompt-model.ts:1-14, 22-65`](../../src/mapper/authoring/home-prompt-model.ts#L1-L14) — narrow input types; liveSystemId (own, covered, location); homeCurrentSystem (preferred → single shared system → offline)
- [`src/mapper/tracking/tracked-system.ts:29-56, 58-62, 130-144`](../../src/mapper/tracking/tracked-system.ts#L29-L56) — dockCharacters (own, location !== null, coverage === true); readyTarget; resolvePasteTarget (loading / scanner if online / all-same-system → ready / none / choose)
- [`src/mapper/tracking/presence-model.ts:70-77, 100-102`](../../src/mapper/tracking/presence-model.ts#L70-L77) — TrackingPayload/CoveragePayload types and coverageIndex (array → Map), reused by the rewrite
- [`src/mapper/tracking/use-tracked-system.ts:37-52`](../../src/mapper/tracking/use-tracked-system.ts#L37-L52) — canonical composition: coverageIndex → dockCharacters, null while loading
- [`src/mapper/authoring/HomePrompt.tsx:34-42`](../../src/mapper/authoring/HomePrompt.tsx#L34-L42) — calls homeCurrentSystem({ characterId: activeCharacterId, tracking, coverage })
- [`src/mapper/authoring/home-prompt-model.test.ts:7-162`](../../src/mapper/authoring/home-prompt-model.test.ts#L7-L162) — loading / untracked / offline / live, alt fallback, two alts in different systems → offline, same system → ready
- [`src/mapper/tracking/tracked-system.test.ts:29-60, 135-176`](../../src/mapper/tracking/tracked-system.test.ts#L29-L60) — guards dockCharacters filtering and resolvePasteTarget's table

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/tracking/PresenceProvider.tsx:18-24`](../../src/mapper/tracking/PresenceProvider.tsx#L18-L24) — only pairs forMap with useMapCoverage; no duplicated logic
- [`src/mapper/tracking/use-map-coverage.ts:13-30`](../../src/mapper/tracking/use-map-coverage.ts#L13-L30) — already the single held-coverage primitive; the 'per-component state machine' claim is wrong
- [`src/mapper/tracking/presence-model.ts:37-53`](../../src/mapper/tracking/presence-model.ts#L37-L53) — derivePresence filters all tracked pilots, not only own, and keeps the freshest per character; sharing a two-line filter with dockCharacters adds indirection for no gain
- [`src/mapper/tracking/TrackingControls.tsx:43, 64`](../../src/mapper/tracking/TrackingControls.tsx#L43) — forMap without coverage; different need
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:24`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L24) — forMap without coverage
- [`src/mapper/signatures/use-signature-jump-flow.ts:28`](../../src/mapper/signatures/use-signature-jump-flow.ts#L28) — forMap without coverage
- [`convex/mapTrackingLive.ts:36-43`](../../convex/mapTrackingLive.ts#L36-L43) — movedAt (transitionObservedAt ?? observedAt) on the server; convex cannot import mapper, and a one-expression helper does not justify a data-zone home
- [`src/mapper/tracking/doorbell-model.ts:73`](../../src/mapper/tracking/doorbell-model.ts#L73) — uses transitionObservedAt alone (rings only on jumps), a different concept

</details>

**Home.** `Reuse the existing src/mapper/tracking/tracked-system.ts (dockCharacters, resolvePasteTarget) and src/mapper/tracking/presence-model.ts (coverageIndex). No new primitive; only export the dockCharacters input type.`

**Boundary check.** Everything is inside the mapper zone (src/mapper/**), and imports within a zone are unrestricted. src/mapper/authoring already imports from ../tracking (HomePrompt.tsx 21-22). src/mapper/tracking imports nothing from authoring (grep is empty), so the circular-dependencies rule stays satisfied.

**API sketch.**

```ts
// tracked-system.ts: name the existing parameter type (private-type-leaks needs it exported)
export interface DockCharactersInput { ownTrackedCharacterIds: readonly number[]; tracked: readonly {...}[]; coverage: ReadonlyMap<number, boolean> }
// home-prompt-model.ts
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: Omit<DockCharactersInput, 'coverage'> | undefined;
  readonly coverage: CoveragePayload | undefined;
}): HomeCurrentSystem {
  if (input.characterId == null || input.tracking === undefined || input.coverage === undefined) return { kind: 'loading' };
  if (input.tracking.ownTrackedCharacterIds.length === 0) return { kind: 'untracked' };
  const target = resolvePasteTarget(
    dockCharacters({ ownTrackedCharacterIds: input.tracking.ownTrackedCharacterIds, tracked: input.tracking.tracked, coverage: coverageIndex(input.coverage) }),
    input.characterId,
  );
  return target.kind === 'ready' ? { kind: 'ready', systemId: target.systemId } : { kind: 'offline' };
}
```

**Migration steps.**

1. In tracked-system.ts, extract dockCharacters' inline parameter type (lines 29-40) into an exported DockCharactersInput interface with no behaviour change.
2. Rewrite homeCurrentSystem as in the sketch. Delete liveSystemId (22-34) and the HomePromptTracking and HomePromptCoverage interfaces (1-14), and keep the exported HomeCurrentSystem union used by HomePrompt.tsx:140.
3. Keep both guards ahead of the delegation: 'loading' when characterId is null or nullish, even though resolvePasteTarget accepts a null preference; and 'untracked' when ownTrackedCharacterIds is empty, which resolvePasteTarget would report as 'none'. Map 'none' and 'choose' to 'offline'.
4. Update the home-prompt-model.test.ts fixtures so each location carries `transitionObservedAt: null, observedAt: 0` to satisfy the wider type. Keep every expectation unchanged.
5. HomePrompt.tsx needs no change: its forMap payload already has the full location shape. Optional follow-up: ChainLive.tsx:99 already calls useTrackedCharacterTargets(mapId). Exposing its `characters` (null while loading) would let HomePrompt drop its own forMap and useMapCoverage pair and call resolvePasteTarget directly; trackedIds would equal the ids of those characters, because dockCharacters seeds every own id.

**Tests.** Existing home-prompt-model.test.ts 7-162 is the regression guard and must pass with only fixture-shape edits. Add one case: characterId null with non-empty tracking and coverage still gives 'loading'. Add another: the preferred character is covered but has location null while an alt is live, which falls back to the alt. tracked-system.test.ts 29-60 and 135-176 keep guarding the shared table. HomePrompt.test.ts mocks useLiveValue and is unaffected at runtime.

**Notes.** Equivalence holds because the server returns one tracked row per character (convex/mapTrackingLive.ts 57-63 dedupes by characterId) and one coverage row per character (lines 121-133 use the unique ids). liveSystemId's first-match .find and dockCharacters' last-write Map therefore agree. HomePrompt's preferred character is the active account character, not the scanner preference; that is passed as resolvePasteTarget's second argument and is a legitimate difference to keep. lastMovementAt is computed but unused on this path, so fixtures that lack observedAt would not change results at runtime; the fixture edit is only for types. No drift bug was found: both copies currently agree on every tested case.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p032"></a>

## P032: Resolve Friendlies names through useCharacterIdentities and share the tracked-character row content between the dock picker and the scanner prompt

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30 / +30
- **Depends on:** [P075](wave-12-market-data-search-and-client-data-reads.md#p075)
- **Existing primitive:** `src/mapper/tracking/use-character-identities.ts:useCharacterIdentities`

**Problem.** The map has a canonical roster-first identity hook (useCharacterIdentities). The Friendlies list bypasses it with a raw entity-name lookup and a different fallback ('7' instead of 'Character 7'), so the viewer's own pilots are refetched on every mount of the intel window. The two tracked-character pickers render the same identity-plus-location content from separate copies, and only one of them handles offline characters.

**Verifier revision.** Both halves are real but smaller than claimed. (1) FriendlyList resolves pilot names only through useEntityNames, a names client with cache: false. That refetches every pilot, including the viewer's own characters, which useCharacterIdentities would answer from the remembered roster. Its fallback also drifts: String(id) versus 'Character N'. The 'no portrait' point is moot, because FriendlyList renders no portraits. The claim that the friendlyRows tests assert the String(id) fallback is wrong: presence-model.test.ts 106-112 removes character 8 by coverage before friendlyRows is called. (2) CharacterItem and CandidateButton share the portrait-28, name and useSystemLabel location content. The subline tone is not clearly drift: the dock menu also uses text-faint for its Auto row (DockCharacterPicker.tsx:136), so faint is consistent within that menu. Only DockCharacterPicker handles the offline case. The scanner candidates are filtered to online characters (tracked-system.ts:135-143), so the scanner's String(systemId) can never print 'null' in practice.

**Sites (8).**

- [`src/mapper/windows/SystemIntelligenceBody.tsx:224-237`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L224-L237) — FriendlyList calls useEntityNames(pilot ids) directly
- [`src/mapper/tracking/presence-model.ts:125-136`](../../src/mapper/tracking/presence-model.ts#L125-L136) — friendlyRows takes a names record and falls back to String(characterId)
- [`src/mapper/tracking/use-character-identities.ts:12-27`](../../src/mapper/tracking/use-character-identities.ts#L12-L27) — Canonical roster-first lookup: roster name and portrait, else useEntityNames for unlisted ids, else 'Character N'
- [`src/components/use-entity-names.ts:7-14`](../../src/components/use-entity-names.ts#L7-L14) — cache: false, so every mount requests all ids
- [`src/mapper/tracking/DockCharacterPicker.tsx:48-74`](../../src/mapper/tracking/DockCharacterPicker.tsx#L48-L74) — CharacterItem: portrait 28 (opacity-50 when offline), name, subline 'Offline' or system name or String(id), in text-faint
- [`src/mapper/tracking/ScannerCharacterPrompt.tsx:14-46`](../../src/mapper/tracking/ScannerCharacterPrompt.tsx#L14-L46) — CandidateButton: portrait 28, name, subline system name or String(id) in text-muted, text-left, no offline branch
- [`src/mapper/tracking/tracked-system.ts:129-144`](../../src/mapper/tracking/tracked-system.ts#L129-L144) — resolvePasteTarget hands the prompt online characters only, so its missing offline branch is unreachable today
- [`src/mapper/tracking/presence-model.test.ts:106-121`](../../src/mapper/tracking/presence-model.test.ts#L106-L121) — friendlyRows tests pass names records. No test asserts the String(id) fallback

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/tracking/DockCharacterPicker.tsx:131-141`](../../src/mapper/tracking/DockCharacterPicker.tsx#L131-L141) — The Auto row has the same text-faint subline but no character, so it does not belong in the shared label. It is the reason the subline tone stays per surface
- [`src/components/character-portrait-picker.tsx:45-135`](../../src/components/character-portrait-picker.tsx#L45-L135) — Portrait-only toggle and menu items with no name or location line. Different concept, and in the components zone

</details>

**Home.** `src/mapper/tracking/character-location-label.tsx (new CharacterLocationLabel). Reuse the existing src/mapper/tracking/use-character-identities.ts:useCharacterIdentities in FriendlyList`

**Boundary check.** Zone mapper throughout. SystemIntelligenceBody (src/mapper/windows) already imports ../tracking/presence-model and ../tracking/presence-context, so ../tracking/use-character-identities is an intra-zone import. CharacterLocationLabel imports @/components/character-portrait (zone components, allowed by {from: mapper, allow: [..., components, ...]}) and ../windows/use-system-label (same zone), as both current copies already do. Its consumers, DockCharacterPicker and ScannerCharacterPrompt, are in mapper/tracking.

**API sketch.**

```ts
// presence-model.ts
export function friendlyRows(pilots: readonly PresencePilot[], nameOf: (characterId: number) => string, shipNames?: Record<string, string>): readonly FriendlyRowModel[];
// character-location-label.tsx
export function CharacterLocationLabel(props: {
  readonly characterId: number;
  readonly identity: CharacterIdentity;
  readonly systemId: number | null;     // null => 'Offline' + dimmed portrait
  readonly sublineClassName: string;    // 'text-faint' (menu) | 'text-muted' (prompt card)
  readonly className?: string;          // e.g. 'text-left' for the Button variant
}): JSX.Element; // fragment: <CharacterPortrait size={28}/> + <span flex-col>{name}{location}</span>
```

**Migration steps.**

1. Change friendlyRows to take nameOf: (characterId) => string in place of the names record (label: nameOf(pilot.characterId)). Update presence-model.test.ts 110 and 117 to pass (id) => names[String(id)] ?? `Character ${id}`, and add a case where an unknown id gets the 'Character N' label.
2. In FriendlyList, replace useEntityNames with const identityOf = useCharacterIdentities(pilots.map((p) => p.characterId)) and call friendlyRows(pilots, (id) => identityOf(id).name, ships). Remove the @/components/use-entity-names import from SystemIntelligenceBody.tsx.
3. Update SystemIntelligenceBody.test.ts: its line 35 mock of use-entity-names becomes a mock of '../tracking/use-character-identities' (or add a use-account-characters mock), so the auth provider is not imported.
4. Create CharacterLocationLabel holding the portrait, name and location column with the offline branch from DockCharacterPicker. Use it in CharacterItem (sublineClassName 'text-faint') and CandidateButton (sublineClassName 'text-muted', className 'text-left'). Delete the duplicated JSX.

**Tests.** Existing guards: DockCharacterPicker.test.ts (roster name 'Alpha Pilot', entity fallback 'Named 8', 'Offline', 'J31000001') and ScannerCharacterPrompt.test.ts (candidate data attribute, name, system label). Both mock use-system-label and character-portrait, which CharacterLocationLabel will also use. presence-model.test.ts covers friendlyRows. Add a CharacterLocationLabel render test for online, offline and unknown-system (String(id)) states. Add a SystemIntelligenceBody test that renders Friendlies with a mocked useSystemPresence and useCharacterIdentities and asserts the roster name.

**Notes.** Behaviour change to accept: while the account roster is loading (roster === null), useCharacterIdentities fetches no names at all (unlisted is []), so other users' pilots in Friendlies show 'Character N' briefly until the roster arrives. Today they start fetching right away. The roster is held across pages by createRememberedRead, so the gap is short and mostly on a cold load. If that matters, have useCharacterIdentities fetch every id while roster === null. The fallback changes from '7' to 'Character 7', which reads better. Keep each surface's subline tone through the prop, because the dock menu's Auto row also uses text-faint. Keep data-scanner-character-candidate and MenuRadioItem value on the wrappers, not on the shared label. Do this before or together with P033, which also edits ScannerCharacterPrompt.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p033"></a>

## P033: Extract a MapPromptCard shell for the scanner prompt rail and give every prompt group semantics

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +30
- **Depends on:** [P032](#p032)
- **Existing primitive:** `src/mapper/map-frosted-surface.ts:mapFrostedSurface`

**Problem.** The missing-signatures, jump-resolution and scanner-character prompts in the scanner rail each repeat the frosted card, eyebrow and body styling. Only one of them exposes itself to assistive technology as a labelled group, so the rail's prompts have drifted apart in accessibility as well as styling.

**Verifier revision.** The duplication is real. All three prompts render in ScannerPromptRail with the same outer class string cn('flex flex-col gap-2 p-3 text-ui', mapFrostedSurface) and the same body class 'font-data text-micro text-name'. Two of them also share the eyebrow class. Grep found no fourth site: MapEventLog is a Collapsible with a different layout. On its own this is a near-zero LoC change, so it is weak. The finder missed accessibility drift that makes a shell worth having: only ScannerCharacterPrompt is a role="group" with an accessible name. MissingSignaturesPrompt and SignatureJumpPrompt have neither, even though they offer decisions with buttons. The shell should make an accessible name required. It belongs at src/mapper root next to map-frosted-surface.ts rather than in signatures, because mapper/tracking does not import mapper/signatures today (the dependency runs the other way).

**Sites (6).**

- [`src/mapper/signatures/scanner-prompt-rail.tsx:21-57`](../../src/mapper/signatures/scanner-prompt-rail.tsx#L21-L57) — MissingSignaturesPrompt: card classes, eyebrow 'Missing from scan', body, a justify-end action row. No role and no aria-label
- [`src/mapper/signatures/SignatureJumpPrompt.tsx:17-53`](../../src/mapper/signatures/SignatureJumpPrompt.tsx#L17-L53) — Card classes, body with an inline identity readout span, a column of candidate buttons. No eyebrow, no role, no aria-label
- [`src/mapper/tracking/ScannerCharacterPrompt.tsx:52-95`](../../src/mapper/tracking/ScannerCharacterPrompt.tsx#L52-L95) — Card classes, role="group" with aria-label 'Choose scanning character', eyebrow, body, a candidate column and a Cancel row
- [`src/mapper/signatures/scanner-prompt-rail.tsx:87-111`](../../src/mapper/signatures/scanner-prompt-rail.tsx#L87-L111) — All three render as siblings in ScannerPromptRail (MAP_SCANNER_PROMPT_RAIL_CLASS)
- [`src/mapper/map-frosted-surface.ts:1-13`](../../src/mapper/map-frosted-surface.ts#L1-L13) — Existing surface tokens. The shell composes mapFrostedSurface
- [`src/components/ui/menu.tsx:35-37`](../../src/components/ui/menu.tsx#L35-L37) — An exported DataAttributes type already exists for typing pass-through data-* props

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/log/MapEventLog.tsx:46-75`](../../src/mapper/log/MapEventLog.tsx#L46-L75) — Uses mapFrostedSurface and the same eyebrow class but is a Collapsible log header with no prompt body or actions. Different concept
- [`src/mapper/authoring/connection-field-group.tsx:27-33`](../../src/mapper/authoring/connection-field-group.tsx#L27-L33) — Same eyebrow typography in text-isk, but it is a form field label, not a prompt

</details>

**Home.** `src/mapper/map-prompt-card.tsx (new), next to src/mapper/map-frosted-surface.ts`

**Boundary check.** Zone mapper (src/mapper/**). Its consumers are scanner-prompt-rail.tsx and SignatureJumpPrompt.tsx (mapper/signatures) and ScannerCharacterPrompt.tsx (mapper/tracking), all intra-zone. Placing it at the mapper root, like map-frosted-surface.ts which both subfolders already import, avoids adding a tracking -> signatures edge. It imports @/components/ui/cn and the type DataAttributes from @/components/ui/menu (zone ui, allowed by {from: mapper, allow: [..., ui, ...]}).

**API sketch.**

```ts
export function MapPromptCard(props: DataAttributes & {
  readonly ariaLabel: string;        // required: every prompt is a labelled role="group"
  readonly eyebrow?: string;         // 'font-data text-label uppercase tracking-label text-muted'
  readonly body: ReactNode;          // wrapped in <p className="font-data text-micro text-name">
  readonly children: ReactNode;      // action rows, laid out by the caller
}): JSX.Element; // <div role="group" aria-label className={cn('flex flex-col gap-2 p-3 text-ui', mapFrostedSurface)} {...data}>
```

**Migration steps.**

1. Create src/mapper/map-prompt-card.tsx with MapPromptCard. Spread the data-* props onto the root div.
2. Migrate ScannerCharacterPrompt (data-scanner-character-prompt, ariaLabel 'Choose scanning character', eyebrow 'Which character scanned this?'). Its candidate column and Cancel row become children.
3. Migrate MissingSignaturesPrompt (data-signature-missing-prompt, eyebrow 'Missing from scan', ariaLabel 'Missing signatures', body missingPromptCopy(count), children the Dismiss/Remove row).
4. Migrate SignatureJumpPrompt (data-signature-jump-prompt, no eyebrow, ariaLabel 'Choose the signature you jumped through', body containing the data-identity-readout span, children the candidate column).
5. Delete the now-unused cn and mapFrostedSurface imports from the three files.

**Tests.** Existing guards: SignatureJumpPrompt.test.ts (data-signature-jump-prompt, data-identity-readout, copy, button order and dispatch); ScannerCharacterPrompt.test.ts (copy, candidate attribute, Cancel); SignatureWindow.test.ts 273, 285, 334-335 (missing and jump prompt attributes); MapAuthoringOverlay.test.ts 43. Add map-prompt-card.test.ts asserting role="group", the aria-label, the data-* pass-through, that the eyebrow is omitted when undefined, and that the body is wrapped in the body class. Extend the jump and missing prompt tests to assert role="group".

**Notes.** Adding role="group" and an aria-label to the missing and jump prompts is a deliberate accessibility improvement, not a regression. No e2e spec references these selectors (checked e2e/). Keep the action-row layouts at the call sites: 'flex justify-end gap-1' for missing, 'flex flex-col gap-1' for the candidate columns and 'flex justify-end' for Cancel. They differ on purpose. The dependency on P032 only orders the edits to ScannerCharacterPrompt; the two can land in one change.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p030"></a>

## P030: Move wormhole field labels into one module, give OptionalSelectField a children slot for mass/life/leads, and add a memoised useWormholeTypeSearch

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -95 / +45 (three duplicate label maps, two hand-rolled optional selects, the LeadsToField readOnly branch, and the codexReady plumbing removed)
- **Depends on:** —
- **Existing primitive:** `src/mapper/authoring/connection-field-group.tsx:OptionalSelectField`

**Problem.** The connection editor and the scanner keep separate copies of the same user-facing copy for mass states, life stages and destination hints, and of the leads readout rule. The editor's Mass, Lifetime and read-only Leads fields hand-roll the optional-select/readout branch that OptionalSelectField already owns. Wormhole type search is built three ways: unmemoised with !codexReady in the editor, and memoised with codes.length===0 in two scanner combos. Two codex hooks return a fresh [] on every render while loading, or permanently for systemId <= 0, which defeats downstream memo dependencies.

**Verifier revision.** The core holds up. MassSection and LifetimeSection rebuild the OptionalSelectField branch line for line (ConnectionFieldGroup, readOnly ? FieldReadout : Select align=center, encode, decode inline) and add only an estimate line underneath. Three changes to the scope. (1) The efficiency claim is mostly cosmetic. wormholeTypeSearch runs over about 100 codex codes, and ConnectionFields re-renders on data changes plus a 60s tick (use-signature-panel.ts:9). The only real cost is that the new `suggest` identity re-fires TerminalSearch's suggest effect (terminal-search.tsx:50-64) and causes one extra render. codex.codes() returns a stable array once loaded (universe-assets-client.ts:107-118), so the `?? []` churn only happens while loading. (2) Grep found duplication the finder missed. MASS_LABELS, LIFE_LABELS and HINT_LABELS are copied word for word into scanner-mass-select (MASS_LONG), scanner-life-select (LIFE_LONG) and scanner-leads-control (HINT_LABELS). scannerLeadsReadout repeats LeadsToField's readout logic. LeadsToField's readOnly branch hand-rolls the same readout that OptionalSelectField renders. useSystemStaticCodes has the same fresh-[] problem. (3) The leniency 'drift' is not a real difference. codexReady===false holds exactly when codes is [], and a loaded codex always has codes. So the shared rule should be codes.length === 0, which every consumer can compute, and the codexReady plumbing can be deleted. That reverses the finder's pick.

**Sites (16).**

- [`src/mapper/authoring/connection-fields.tsx:312-357`](../../src/mapper/authoring/connection-fields.tsx#L312-L357) — MassSection hand-rolls ConnectionFieldGroup + readOnly ? FieldReadout : Select. Lines 340-344 re-implement decodeOptionalField inline
- [`src/mapper/authoring/connection-fields.tsx:386-422`](../../src/mapper/authoring/connection-fields.tsx#L386-L422) — LifetimeSection, same shape. Lines 412-414 decode inline
- [`src/mapper/authoring/connection-field-group.tsx:11-17, 50-86`](../../src/mapper/authoring/connection-field-group.tsx#L11-L17) — encode/decodeOptionalField and OptionalSelectField, which has no slot for content under the control
- [`src/mapper/authoring/connection-fields.tsx:474-491, 526-540`](../../src/mapper/authoring/connection-fields.tsx#L474-L491) — LeadsToField's readOnly branch hand-builds ConnectionFieldGroup + FieldReadout (what OptionalSelectField renders when readOnly), while its select branch already uses OptionalSelectField with readOnly={false}
- [`src/mapper/authoring/connection-fields.tsx:53-57, 72-77, 87-89, 91-101`](../../src/mapper/authoring/connection-fields.tsx#L53-L57) — MASS_LABELS, LIFE_LABELS, lifeStageReadout, HINT_LABELS
- [`src/mapper/signatures/scanner-mass-select.tsx:24-28`](../../src/mapper/signatures/scanner-mass-select.tsx#L24-L28) — MASS_LONG is word for word MASS_LABELS
- [`src/mapper/signatures/scanner-life-select.tsx:27-32`](../../src/mapper/signatures/scanner-life-select.tsx#L27-L32) — LIFE_LONG is word for word LIFE_LABELS
- [`src/mapper/signatures/scanner-leads-control.tsx:39-57, 295-301`](../../src/mapper/signatures/scanner-leads-control.tsx#L39-L57) — HINT_LABELS copy. scannerLeadsSeed and scannerLeadsReadout repeat connection-fields.tsx 481-487 (destination label, else hint label, else unset text)
- [`src/mapper/authoring/connection-fields.tsx:210-228`](../../src/mapper/authoring/connection-fields.tsx#L210-L228) — TypeField calls wormholeTypeSearch on every render with lenient: !codexReady
- [`src/components/ui/terminal-search.tsx:50-64`](../../src/components/ui/terminal-search.tsx#L50-L64) — The suggest effect depends on `suggest` identity, so TypeField's unmemoised search re-fires it (and setSuggestions) on every parent render
- [`src/mapper/signatures/scanner-type-combo.tsx:94-97`](../../src/mapper/signatures/scanner-type-combo.tsx#L94-L97) — Memoised wormholeTypeSearch with lenient: codes.length === 0
- [`src/mapper/signatures/scanner-identify-combo.tsx:103-106`](../../src/mapper/signatures/scanner-identify-combo.tsx#L103-L106) — Same memoised config
- [`src/mapper/authoring/use-wormhole-editor-data.ts:16-29`](../../src/mapper/authoring/use-wormhole-editor-data.ts#L16-L29) — Line 26: codes: codex?.codes() ?? [] allocates a new array per render while the codex loads. codexReady (line 28) is equivalent to codes.length > 0
- [`src/data/wh-statics/use-system-static-codes.ts:4-16`](../../src/data/wh-statics/use-system-static-codes.ts#L4-L16) — Line 15 returns a fresh [] while loading, and on every render when systemId <= 0 (scanner-wormhole-cells passes scannerSystemId ?? 0)
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:91, 98-130`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L91) — useWormholeCellContext's useMemo depends on editorData.codes and preferredCodes, so the fresh [] rebuilds ctx every render
- [`src/data/eve-data/universe-assets-client.ts:107-118`](../../src/data/eve-data/universe-assets-client.ts#L107-L118) — codes() returns one stable sorted array once loaded, so the instability is limited to the loading window and systemId<=0

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/authoring/connection-fields.tsx:281-310`](../../src/mapper/authoring/connection-fields.tsx#L281-L310) — SizeField already uses OptionalSelectField (readout differs when the codex locks size). Leave it alone
- [`src/mapper/signatures/scanner-mass-select.tsx:18-22`](../../src/mapper/signatures/scanner-mass-select.tsx#L18-L22) — MASS_SHORT ('>50%') and the '—' unset are compact scanner copy, deliberately different from the editor's 'Unset'. Keep them local
- [`src/mapper/signatures/scanner-life-select.tsx:20-25`](../../src/mapper/signatures/scanner-life-select.tsx#L20-L25) — LIFE_SHORT is compact scanner copy. Keep it local

</details>

**Home.** `src/mapper/authoring/connection-labels.ts (new, pure: MASS_STATE_LABELS, LIFE_STAGE_LABELS, DESTINATION_HINT_LABELS, leadsToReadout). OptionalSelectField children slot in src/mapper/authoring/connection-field-group.tsx. useWormholeTypeSearch in src/mapper/authoring/wormhole-type-search.ts. Module-level empty constants in src/mapper/authoring/use-wormhole-editor-data.ts and src/data/wh-statics/use-system-static-codes.ts`

**Boundary check.** All new code lives in zone mapper (src/mapper/**), and every consumer (connection-fields.tsx, scanner-mass-select.tsx, scanner-life-select.tsx, scanner-leads-control.tsx, scanner-type-combo.tsx, scanner-identify-combo.tsx, SignatureEditor.tsx) is also in mapper, so these are intra-zone imports that no rule restricts. connection-labels.ts imports only types from @/data/eve-data/wormhole-contract and @/data/eve-data/system-identity (zone data), which the rule {from: mapper, allow: [features, data, components, ui, transport, lib, config]} permits. The hook imports react plus @/data/eve-data/wormhole-contract, which is already imported there. The empty-array constant in src/data/wh-statics stays inside zone data and adds no import. No new cycles: scanner-* already import from ../authoring/*, and connection-labels imports nothing from mapper.

**API sketch.**

```ts
// connection-labels.ts
export const MASS_STATE_LABELS: Record<ConnectionMassState, string>;
export const LIFE_STAGE_LABELS: Record<WormholeLifeStage, string>;
export const DESTINATION_HINT_LABELS: Record<WormholeDestinationHint, string>;
export function leadsToReadout(hint: WormholeDestinationHint | null, destination: { readonly label: string } | null, unset?: string /* default 'Unset' */): string;
// connection-field-group.tsx
export interface OptionalSelectFieldProps { /* existing */ readonly children?: ReactNode } // rendered after the control inside ConnectionFieldGroup
// wormhole-type-search.ts
export function useWormholeTypeSearch(codes: readonly string[], preferredCodes?: readonly string[]): ReturnType<typeof wormholeTypeSearch>; // useMemo(() => wormholeTypeSearch(codes, { preferredCodes, lenient: codes.length === 0 }), [codes, preferredCodes])
```

**Migration steps.**

1. Create src/mapper/authoring/connection-labels.ts. Move MASS_LABELS (connection-fields.tsx 53-57), LIFE_LABELS (72-77) and HINT_LABELS (91-101) into it as MASS_STATE_LABELS, LIFE_STAGE_LABELS and DESTINATION_HINT_LABELS. Add leadsToReadout(hint, destination, unset = 'Unset'), returning destination !== null ? destination.label : hint === null ? unset : DESTINATION_HINT_LABELS[hint].
2. In connection-fields.tsx, import the label maps and rebuild MASS_ITEMS, LIFE_ITEMS, lifeStageReadout and the leads items from them. Delete the local maps.
3. In scanner-mass-select.tsx and scanner-life-select.tsx, replace MASS_LONG and LIFE_LONG with the shared maps (keep MASS_SHORT and LIFE_SHORT). In scanner-leads-control.tsx, delete HINT_LABELS and use DESTINATION_HINT_LABELS. Make scannerLeadsSeed = leadsToReadout(hint, destination, '') and scannerLeadsReadout = leadsToReadout(hint, destination). Keep both exports, because tests and scanner-wormhole-cells import them.
4. Add `readonly children?: ReactNode` to OptionalSelectFieldProps and render {children} after the readout or Select inside ConnectionFieldGroup.
5. Rewrite MassSection as <OptionalSelectField label="Mass" ariaLabel="Mass" items={MASS_ITEMS} value={connection.massState} readOnly={readOnly} readoutAttr="data-map-connection-mass-state-readout" readoutText={massState === null ? 'Unset' : MASS_STATE_LABELS[massState]} onChange={(v) => onChange(v as ConnectionMassState | null)}><MassEstimateView .../></OptionalSelectField>. Do the same for LifetimeSection with value lifetimeStage(connection.lifetime), readoutAttr data-map-connection-life-readout and child <LifetimeEstimateView/>.
6. Collapse LeadsToField. Keep the TerminalSearch branch only when !readOnly && destination !== null. Otherwise render a single OptionalSelectField with readOnly={readOnly} and readoutText={leadsToReadout(hint, destination)}, then delete the readOnly early return (474-491).
7. Add useWormholeTypeSearch to wormhole-type-search.ts. Use it in TypeField (do not default preferredCodes to a new [] in the parameter list). Then delete codexReady from TypeField's props, ConnectionFieldsProps and ConnectionFields, from the SignatureEditor destructure (SignatureEditor.tsx:38,55), from WormholeEditorData and the useWormholeCodexData return type, and from test fixtures (connection-fields.test.ts has 10 occurrences, and check the useWormholeEditorData mocks in SignatureEditor.test.ts, SignatureWindow.test.ts and ActiveSignatureEditor.test.ts).
8. Replace the inline useMemo(wormholeTypeSearch...) in scanner-type-combo.tsx 94-97 and scanner-identify-combo.tsx 254-257 with useWormholeTypeSearch(codes, preferredCodes).
9. Add `const EMPTY_CODES: readonly string[] = []` to use-wormhole-editor-data.ts (codex?.codes() ?? EMPTY_CODES) and an equivalent constant to use-system-static-codes.ts line 15. This follows the existing module-local EMPTY_* pattern (e.g. src/mapper/chain/use-map-chain-halo.ts:19).

**Tests.** Existing guards: connection-fields.test.ts asserts the Mass and Reliable Lifetime selects (lines 122-139), the mass range readout (186) and the restore-mode readouts (329-331). It also captures Select onValueChange per ariaLabel through selectHandlers, which exercises decode. scanner-leads-control.test.ts 62-66 pins the seed copy. scanner-mass-select.test.ts and scanner-life-select.test.ts pin the short readouts. wormhole-type-search.test.ts 25 covers lenient parsing. Add a connection-labels test for leadsToReadout (destination wins, hint label, custom unset text). Add a connection-fields test that the mass and lifetime estimate lines render under both the Select (edit) and the FieldReadout (restore). Add a LeadsToField restore-mode case with a destination, asserting data-map-connection-leads-readout shows the system label.

**Notes.** Keep the DOM order: the estimate views must stay inside ConnectionFieldGroup's inner column after the control, because tests look for data-map-connection-mass-range and data-map-connection-lifetime. Keep the readout attribute names exactly. Leniency: !codexReady and codes.length === 0 give the same result, because codexReady is false exactly when codes is [] (a 404 codex also yields null and []). Choose codes.length === 0, since the scanner combos never receive codexReady. The scanner's '—' unset copy and short labels differ from the editor's on purpose, so do not merge them. Expect only small performance gains. The useful outcome is one copy of the user-facing labels and one leniency rule.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p092"></a>

## P092: Single-source the wormhole connection labels in mapper/authoring, share one leads readout, and fold the twin scanner selects

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -75 / +55: three duplicate tables (~28 lines), one select component (~36 lines), four readout functions and the inline readouts removed; one labels module (~35 lines), one generic select (~35 lines) and tests added.
- **Depends on:** [P030](#p030)
- **Existing primitive:** `src/mapper/authoring/connection-field-group.tsx:UNSET_FIELD,encodeOptionalField,decodeOptionalField`

**Problem.** The connection editor and the signature scanner each declare their own copy of the mass-state labels (MASS_LABELS and MASS_LONG), the life-stage labels (LIFE_LABELS and LIFE_LONG) and the destination-hint labels (HINT_LABELS, twice). Each side also rebuilds the 'unset + enum' select items with its own unset label, and re-implements the `value === null ? empty : LABELS[value]` readout seven times. The leads readout (destination label, then hint label, then empty) is written three times. ScannerMassSelect and ScannerLifeSelect are the same Select wiring (popup dismiss, size sm, caret, selected class, encode/decode, '—' unset item), differing only in the table and in a trigger-label override. A copy change has to be made twice, and the scanner already disagrees with itself: its read-only row shows '—' for unset mass and life but 'Unset' for unset destination, because scannerLeadsReadout copied the editor's readout.

**Verifier revision.** Core confirmed. The three long-label tables are copied word for word between the editor and the scanner, and tests pin both copies (connection-fields.test.ts 134-145, scanner-leads-control.test.ts 62-66). Five things change from the proposal. (1) MASS_SHORT and LIFE_SHORT have one consumer each, the scanner, so they stay in src/mapper/signatures and do not move to authoring. (2) The proposal missed a third duplicate: the editor's read-only Leads text (connection-fields.tsx 481-487) is the same expression as scannerLeadsReadout (295-301), and scannerLeadsSeed (51-57) differs only in the empty value. All three collapse into one leadsToReadout(hint, destination, empty). (3) A generic scanner select needs a triggerLabelOf hook, because the life select swaps the selected trigger for the codex upper bound. The cell already computes that bound (scanner-wormhole-cells.tsx 215) and ScannerLifeSelect computes it again (scanner-life-select.tsx 53), so the fold should pass it in. (4) readoutText on connection-fields.tsx 534 is dead, since readOnly={false} is hard-coded at 532. (5) scannerWormholeSize and scannerWormholeLifetime (signature-model.ts 274-292) restate SizeField's locked readout, but only tests import them, so share nothing with them. The mapper home is right: every consumer is in the mapper zone, and no reader outside it justifies putting UI copy in data.

**Sites (18).**

- [`src/mapper/authoring/connection-fields.tsx:53-57`](../../src/mapper/authoring/connection-fields.tsx#L53-L57) — MASS_LABELS (long copy #1)
- [`src/mapper/authoring/connection-fields.tsx:59-65,67-70,79-85`](../../src/mapper/authoring/connection-fields.tsx#L59-L65) — MASS_ITEMS, SIZE_ITEMS, LIFE_ITEMS: each is an 'Unset' item followed by the enum
- [`src/mapper/authoring/connection-fields.tsx:72-77,87-89`](../../src/mapper/authoring/connection-fields.tsx#L72-L77) — LIFE_LABELS (long copy #1) and lifeStageReadout(null → 'Unset')
- [`src/mapper/authoring/connection-fields.tsx:91-101`](../../src/mapper/authoring/connection-fields.tsx#L91-L101) — HINT_LABELS (copy #1)
- [`src/mapper/authoring/connection-fields.tsx:326-333`](../../src/mapper/authoring/connection-fields.tsx#L326-L333) — inline mass readout, null → 'Unset'
- [`src/mapper/authoring/connection-fields.tsx:481-487`](../../src/mapper/authoring/connection-fields.tsx#L481-L487) — read-only Leads text: destination.label, else hint label, else 'Unset'. Identical to scannerLeadsReadout
- [`src/mapper/authoring/connection-fields.tsx:515-525,532-534`](../../src/mapper/authoring/connection-fields.tsx#L515-L525) — leads items: 'Unset', then origin leads, then hints. readoutText is dead because readOnly={false}
- [`src/mapper/authoring/connection-field-group.tsx:6-17,50-86`](../../src/mapper/authoring/connection-field-group.tsx#L6-L17) — existing UNSET_FIELD, encode/decode and OptionalSelectField. The scanner already imports these from ../authoring
- [`src/mapper/signatures/scanner-mass-select.tsx:18-28`](../../src/mapper/signatures/scanner-mass-select.tsx#L18-L28) — MASS_SHORT (scanner only) and MASS_LONG (long copy #2)
- [`src/mapper/signatures/scanner-mass-select.tsx:30-66`](../../src/mapper/signatures/scanner-mass-select.tsx#L30-L66) — ScannerMassSelect: the same Select wiring as ScannerLifeSelect
- [`src/mapper/signatures/scanner-mass-select.tsx:68-70`](../../src/mapper/signatures/scanner-mass-select.tsx#L68-L70) — scannerMassReadout, null → '—'
- [`src/mapper/signatures/scanner-life-select.tsx:20-32`](../../src/mapper/signatures/scanner-life-select.tsx#L20-L32) — LIFE_SHORT (scanner only) and LIFE_LONG (long copy #2)
- [`src/mapper/signatures/scanner-life-select.tsx:34-80`](../../src/mapper/signatures/scanner-life-select.tsx#L34-L80) — ScannerLifeSelect: identical wiring, plus the triggerLabel override from scannerLifeUpperBound (computed again at 53)
- [`src/mapper/signatures/scanner-life-select.tsx:82-84`](../../src/mapper/signatures/scanner-life-select.tsx#L82-L84) — scannerLifeReadout, null → '—'
- [`src/mapper/signatures/scanner-leads-control.tsx:39-57`](../../src/mapper/signatures/scanner-leads-control.tsx#L39-L57) — HINT_LABELS (copy #2) and scannerLeadsSeed (empty '')
- [`src/mapper/signatures/scanner-leads-control.tsx:78-88,186-191`](../../src/mapper/signatures/scanner-leads-control.tsx#L78-L88) — HINT_LABELS also drives suggestion filtering and typed-label matching
- [`src/mapper/signatures/scanner-leads-control.tsx:295-301`](../../src/mapper/signatures/scanner-leads-control.tsx#L295-L301) — scannerLeadsReadout (empty 'Unset'), a copy of the editor's read-only Leads text
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:186-198,214-221,249-262`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L186-L198) — consumers: read-only cells mix '—' (mass, life) with 'Unset' (leads). lifeEstimate is computed at 215 and recomputed inside ScannerLifeSelect

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/system-identity.ts:84-101`](../../src/data/eve-data/system-identity.ts#L84-L101) — HINT_BUCKET_READOUT holds short class tags with tone classes for system identity ('C1–C3', 'Drifter'), not the field's option labels. Different concept.
- [`convex/lib/mapEntityContracts.ts:30-55`](../../convex/lib/mapEntityContracts.ts#L30-L55) — Convex v.literal validators that satisfy the same unions. They are contract metadata, not display copy.
- [`src/mapper/signatures/scanner-leads-control.tsx:89-93,110`](../../src/mapper/signatures/scanner-leads-control.tsx#L89-L93) — the 'Unset' combobox option and the 'unset' typed match are input vocabulary, not a readout. Keep them.
- [`src/mapper/signatures/signature-model.ts:274-292`](../../src/mapper/signatures/signature-model.ts#L274-L292) — scannerWormholeSize and scannerWormholeLifetime restate SizeField's locked-size readout (connection-fields.tsx 294-297) with '—', but only signature-model.test.ts imports them. Treat them as dead-code candidates, not consumers.

</details>

**Home.** `src/mapper/authoring/connection-field-labels.ts (new; long labels, readout and item helpers) and src/mapper/signatures/scanner-optional-select.tsx (new; generic scanner select, which absorbs scanner-mass-select.tsx and scanner-life-select.tsx)`

**Boundary check.** Both files are in the mapper zone (pattern src/mapper/**). Every consumer is in that same zone (src/mapper/authoring/*, src/mapper/signatures/*), and imports inside a zone are always allowed; signatures/* already imports ../authoring/connection-field-group and ../authoring/connection-fields. The labels module imports the union types from @/data/eve-data/wormhole-contract, which the mapper rule allows ('data'). The select imports @/components/ui/select, also allowed ('ui'). Moving the labels to src/data/eve-data would be legal, but nothing outside mapper reads them.

**API sketch.**

```ts
// src/mapper/authoring/connection-field-labels.ts
export const MASS_STATE_LABELS: Readonly<Record<ConnectionMassState, string>>;
export const LIFE_STAGE_LABELS: Readonly<Record<WormholeLifeStage, string>>;
export const DESTINATION_HINT_LABELS: Readonly<Record<WormholeDestinationHint, string>>;
export function labelOr<T extends string>(value: T | null, labels: Readonly<Record<T, string>>, empty: string): string;
export interface OptionalFieldItem { readonly value: string; readonly label: string; readonly triggerLabel?: string }
export function optionalFieldItems<T extends string>(values: readonly T[], labelOf: (v: T) => string, unsetLabel: string, triggerLabelOf?: (v: T) => string): OptionalFieldItem[];
export function leadsToReadout(hint: WormholeDestinationHint | null, destination: { readonly label: string } | null, empty: string): string;

// src/mapper/signatures/scanner-optional-select.tsx
export function ScannerOptionalSelect<T extends string>(props: {
  ariaLabel: string; value: T | null; options: readonly T[];
  labels: Readonly<Record<T, string>>; triggerLabelOf: (v: T) => string;
  disabled: boolean; onChange: (v: T | null) => void;
}): JSX.Element;
export const MASS_SHORT: Readonly<Record<ConnectionMassState, string>>;
export const LIFE_SHORT: Readonly<Record<WormholeLifeStage, string>>;
export function scannerMassReadout(v: ConnectionMassState | null): string; // labelOr(v, MASS_SHORT, '—')
export function scannerLifeReadout(v: WormholeLifeStage | null): string;  // labelOr(v, LIFE_SHORT, '—')
```

**Migration steps.**

1. Add src/mapper/authoring/connection-field-labels.ts with the three long tables (copy the text exactly from connection-fields.tsx 53-57, 72-77 and 91-101), labelOr, optionalFieldItems and leadsToReadout, plus connection-field-labels.test.ts.
2. connection-fields.tsx: delete MASS_LABELS, LIFE_LABELS, HINT_LABELS and lifeStageReadout. Build MASS_ITEMS, LIFE_ITEMS and SIZE_ITEMS with optionalFieldItems(..., 'Unset'). Replace the mass readout (329-331) with labelOr(connection.massState, MASS_STATE_LABELS, 'Unset'), the life readout (404) with labelOr(lifetimeStage(...), LIFE_STAGE_LABELS, 'Unset'), and the read-only Leads text (482-486) with leadsToReadout(hint, destination, 'Unset'). Keep the leads items inline (origin leads sit between unset and hints) but map hint labels from DESTINATION_HINT_LABELS. Pass '' or drop the dead readoutText at 534.
3. scanner-leads-control.tsx: delete HINT_LABELS and import DESTINATION_HINT_LABELS. scannerLeadsSeed becomes leadsToReadout(hint, destination, ''). scannerLeadsReadout becomes leadsToReadout(hint, destination, 'Unset'), preserving today's output. Keep both exports or inline them at their single call sites (226 and scanner-wormhole-cells 197).
4. Add src/mapper/signatures/scanner-optional-select.tsx: move the shared Select wiring from scanner-mass-select.tsx 41-64 into ScannerOptionalSelect, build its items with optionalFieldItems(options, (v) => labels[v], '—', triggerLabelOf), and move MASS_SHORT, LIFE_SHORT, scannerMassReadout and scannerLifeReadout into it.
5. scanner-wormhole-cells.tsx 249-262: render ScannerOptionalSelect for Mass (ariaLabel `Mass ${rowId}`, labels MASS_STATE_LABELS, triggerLabelOf = (s) => MASS_SHORT[s]) and for Life (ariaLabel `Reliable Lifetime ${rowId}`, labels LIFE_STAGE_LABELS, triggerLabelOf = (s) => s === value && lifeEstimate !== '—' ? lifeEstimate : LIFE_SHORT[s]), reusing lifeEstimate from line 215 instead of recomputing it.
6. Delete scanner-mass-select.tsx and scanner-life-select.tsx, and merge their tests into scanner-optional-select.test.ts.
7. Separately, after a product decision: change scannerLeadsReadout's empty value to '—' to match the sibling scanner cells. Remove or wire up the test-only scannerWormholeSize and scannerWormholeLifetime.
8. Run pnpm check through the test-runner agent.

**Tests.** Existing guards: connection-fields.test.ts 134-145 (the editor's data-labels strings for Mass and Lifetime, with 'Unset' first); scanner-mass-select.test.ts and scanner-life-select.test.ts (short readouts and '—'), to be moved into scanner-optional-select.test.ts; scanner-leads-control.test.ts 23 and 62-66 (the 'Unset' suggestion and scannerLeadsSeed); SignatureWindow.test.ts 383-463 (aria labels 'Mass WHL-001' and 'Reliable Lifetime WHL-001'). Add connection-field-labels.test.ts covering labelOr with null and with a value, optionalFieldItems (unset first, triggerLabel only when given), and leadsToReadout (destination wins, then hint, then empty). Add a render test for ScannerOptionalSelect using the Select mock pattern in ActiveSignatureEditor.test.ts:41, asserting that the life trigger shows the upper bound only for the selected stage.

**Notes.** Preserve the 'Unset' versus '—' unset labels as explicit arguments: the editor uses 'Unset' for items and readouts, the scanner uses '—' for its select items and its mass and life readouts. Drift: inside the scanner row, unset destination reads 'Unset' (scannerLeadsReadout, copied from the editor) while every sibling cell reads '—' (scanner-mass-select 69, scanner-life-select 83, scanner-row-cells 104, signature-model 281/289). The '—' convention is the right one for the scanner. Keep the refactor output-preserving and change the destination text in its own commit with a test update. The life trigger override (show the codex upper bound for the selected stage unless it is '—') must survive the fold. Typed-label matching in commitScannerLeadsQuery (186-191) and suggestion filtering (78-88) depend on the exact hint label text, so the shared table must keep 'Unknown (C1–C3)' and the other labels byte-identical, including the en dash. Fallow coverage-gaps uses requireAllFiles, so each new file needs a test that reaches it.

<sub>Reported by: area:mapper-chain, area:mapper-signatures, concern:ui-patterns.</sub>

<a id="p031"></a>

## P031: Extract a controlled ScannerCombo shell, a shared wormhole combo-item mapper and class chip, and one ScannerOptionalSelect for scanner mass and life

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** about -140 / +90
- **Depends on:** [P030](#p030), [P092](#p092), [P039](wave-07-ui-kit-primitives-src-components-ui.md#p039)
- **Existing primitive:** `src/mapper/signatures/scanner-combo-panel.tsx:ScannerComboPanel; src/mapper/authoring/connection-field-group.tsx:encodeOptionalField,decodeOptionalField`

**Problem.** Three scanner comboboxes (type, identify, destination) repeat the same Base UI Combobox wiring: scroll-close popup, the item-press vs typing split, the Enter guard, field sizing and placeholder, and the panel and footer. Fixes to that interaction model have to be made three times. Type and identify map codes to items with the same far-side/class meta rule. Scanner mass and life are copies of one optional-select wrapper. The signature class chip is rendered twice with identical markup.

**Verifier revision.** Confirmed. All three combos repeat the same roughly 35-line Combobox shell: useCloseOnScannerScroll popup, controlled query, onValueChange that commits on 'item-press' and otherwise sets the query, filter={null}, openOnInputClick, an sm Field with placeholder 'Unresolved', consumeScannerEnter, and ScannerComboPanel with a footer shown while browsing. Fallow groups them (dupes-grouped 2843-2845). Type and identify also share the code-to-item meta rule. Mass and life are the same scanner Select wrapper (fallow group 2516-2517). Design changes: (a) the shell should be controlled (query plus onQueryChange), not own the seed, because each consumer memoises groups on query and the leads browsing rule also compares query to seed; (b) the hook moves to P030; (c) grep found the class chip duplicated in ReadOnlyWormholeCells, and found that `disabled` is false at every call site; (d) the life select needs a trigger-label override, so the shared select takes a triggerLabel function.

**Sites (10).**

- [`src/mapper/signatures/scanner-type-combo.tsx:55-67, 88-150`](../../src/mapper/signatures/scanner-type-combo.tsx#L55-L67) — typeGroupsAsComboItems (meta: '' for FAR_SIDE_WORMHOLE_CODE, else classLabelOf). Combo shell with an outer flex wrapper and the class chip at 134-141
- [`src/mapper/signatures/scanner-identify-combo.tsx:28-50, 118-152`](../../src/mapper/signatures/scanner-identify-combo.tsx#L28-L50) — Same meta rule with a 'type:' value prefix and empty groups filtered. Same shell without the wrapper
- [`src/mapper/signatures/scanner-leads-control.tsx:226-292`](../../src/mapper/signatures/scanner-leads-control.tsx#L226-L292) — Same shell. Initial query is the seed, browsing also when query === seed, footer 'Type to search systems…', field class adds destination?.tone
- [`src/mapper/signatures/scanner-combo-panel.tsx:16-76`](../../src/mapper/signatures/scanner-combo-panel.tsx#L16-L76) — Existing ScannerComboGroup, consumeScannerEnter and ScannerComboPanel, the natural home for the shell
- [`src/mapper/signatures/scanner-mass-select.tsx:30-66`](../../src/mapper/signatures/scanner-mass-select.tsx#L30-L66) — Select with scroll-close popup, size sm, caret={!selected}, scannerSelectedFieldClass, encode/decode, '—' unset item, long label plus short triggerLabel
- [`src/mapper/signatures/scanner-life-select.tsx:34-80`](../../src/mapper/signatures/scanner-life-select.tsx#L34-L80) — Same wrapper. The only behavioural difference is that the selected stage's triggerLabel is overridden by scannerLifeUpperBound when it is not '—'
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:178-185`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L178-L185) — ReadOnlyWormholeCells repeats the data-signature-class chip from scanner-type-combo.tsx 134-141
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:238-283`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L238-L283) — disabled={false} passed to ScannerTypeCombo, ScannerMassSelect, ScannerLifeSelect and ScannerLeadsControl (lines 246, 252, 261, 279)
- [`src/mapper/signatures/scanner-section-table.tsx:53-60`](../../src/mapper/signatures/scanner-section-table.tsx#L53-L60) — ScannerIdentifyCombo disabled={false}. It is the only other call site, so the prop is always false
- [`src/mapper/signatures/scanner-scroll-dismiss.tsx:49-66`](../../src/mapper/signatures/scanner-scroll-dismiss.tsx#L49-L66) — useCloseOnScannerScroll, used by all five controls

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/CharacterSearchControl.tsx:175-225`](../../src/features/maps/CharacterSearchControl.tsx#L175-L225) — Different zone (features), object-valued items, commits on Item onClick, no scanner scroll-close or Enter guard. Not the same concept
- [`src/components/ui/combobox.tsx:12-33`](../../src/components/ui/combobox.tsx#L12-L33) — Field's own `trailing` prop renders inside the bordered input group. The type combo's chip sits outside the field (gap-1 wrapper), so the shell needs its own `aside` slot rather than reusing `trailing`
- [`src/mapper/signatures/scanner-type-combo.tsx:37-45`](../../src/mapper/signatures/scanner-type-combo.tsx#L37-L45) — scannerTypeSuggestionGroups' typed branch orders matches the same way as wormholeTypeSearch.suggest (wormhole-type-search.ts 23-38, 53-59: preferred first, then alphabetical, capped at 12). It is a lead only, because suggest is async and the tested helper signature takes raw codes

</details>

**Home.** `src/mapper/signatures/scanner-combo-panel.tsx (ScannerCombo next to ScannerComboPanel). src/mapper/signatures/scanner-type-combo.tsx (export wormholeComboItems, which identify already imports from this module). src/mapper/signatures/scanner-row-cells.tsx (SignatureClassChip next to NameCell). src/mapper/signatures/scanner-optional-select.tsx (new, ScannerOptionalSelect)`

**Boundary check.** Everything is in zone mapper (src/mapper/**), and all consumers (scanner-type-combo, scanner-identify-combo, scanner-leads-control, scanner-mass-select, scanner-life-select, scanner-wormhole-cells) are in mapper/signatures, so these are intra-zone imports. The new code imports @/components/ui/combobox, @/components/ui/select and @/components/ui/cn (zone ui), which {from: mapper, allow: [..., ui, ...]} permits. It also imports ../authoring/connection-field-group (same zone, already imported by mass and life). The labels come from P030's src/mapper/authoring/connection-labels.ts (same zone).

**API sketch.**

```ts
// scanner-combo-panel.tsx
export function ScannerCombo(props: {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly groups: readonly ScannerComboGroup[];   // items = groups.flatMap(g => g.items.map(i => i.value))
  readonly browsing: boolean;                        // panel labels + footer
  readonly browseFooter: string;
  readonly ariaLabel: string;
  readonly fieldClassName: string;
  readonly onCommitValue: (value: string) => void;   // details.reason === 'item-press'
  readonly onCommitQuery: (query: string) => void;   // Enter via consumeScannerEnter
  readonly aside?: ReactNode;                        // when defined, wrap Field in 'flex w-full min-w-0 max-w-full items-center gap-1'
}): JSX.Element;
// scanner-type-combo.tsx
export function wormholeComboItems(codes: readonly string[], classLabelOf: (code: string) => string | null, valuePrefix?: string): ScannerComboGroup['items'];
// scanner-row-cells.tsx
export function SignatureClassChip({ className }: { readonly className: string }): JSX.Element;
// scanner-optional-select.tsx
export function ScannerOptionalSelect<T extends string>(props: {
  readonly values: readonly T[];
  readonly labels: Record<T, string>;          // long menu labels (shared maps from P030)
  readonly triggerLabel: (value: T) => string; // compact trigger text
  readonly value: T | null;
  readonly ariaLabel: string;
  readonly onChange: (value: T | null) => void;
}): JSX.Element;
```

**Migration steps.**

1. Land P030 first: it provides the shared label maps and useWormholeTypeSearch.
2. Add ScannerCombo to scanner-combo-panel.tsx. It owns useCloseOnScannerScroll, Combobox.Root (value=query, items flattened from groups, filter={null}, openOnInputClick, onValueChange routing item-press to onCommitValue and everything else to onQueryChange), Combobox.Field (size sm, placeholder 'Unresolved', aria-label, className, onKeyDown with consumeScannerEnter calling onCommitQuery(query)), the optional aside wrapper, and ScannerComboPanel (showLabels=browsing, footer=browsing ? browseFooter : null).
3. Export wormholeComboItems(codes, classLabelOf, valuePrefix = '') from scanner-type-combo.tsx and use it in typeGroupsAsComboItems and in scannerIdentifySuggestionGroups' holeGroups (identify passes TYPE_PREFIX and keeps its .filter on empty groups, which its tests assert with toEqual).
4. Migrate ScannerIdentifyCombo first (no aside): keep useState(''), the memoised groups and commitValue. Pass onCommitQuery={(q) => commitScannerIdentifyQuery(q, search.parse, onIdentify)} and fieldClassName={cn(scannerSelectedFieldClass(false), 'font-normal')}.
5. Migrate ScannerLeadsControl: keep the seed state, offeredLeads and groups memos, browsing = query.trim().length === 0 || query === seed, browseFooter 'Type to search systems…', and fieldClassName with destination?.tone.
6. Migrate ScannerTypeCombo: define one commit = (text) => { const p = search.parse(text); if (p.ok) onCommit(p.params.code); } and use it for both onCommitValue and onCommitQuery. Pass aside={code !== null && className !== null && query === code ? <SignatureClassChip className={className}/> : null} (pass null rather than undefined so the wrapper div stays).
7. Add SignatureClassChip to scanner-row-cells.tsx and use it in ReadOnlyWormholeCells (scanner-wormhole-cells.tsx 178-185).
8. Create scanner-optional-select.tsx with ScannerOptionalSelect (the popup, size sm, caret={value === null}, scannerSelectedFieldClass(value !== null), items [{value: UNSET_FIELD, label: '—'}, ...values.map(v => ({ value: v, label: labels[v], triggerLabel: triggerLabel(v) }))], and the decode cast done once). Rewrite ScannerMassSelect with triggerLabel = (s) => MASS_SHORT[s]. Rewrite ScannerLifeSelect with triggerLabel = (s) => s === value && upperBound !== '—' ? upperBound : LIFE_SHORT[s]. Keep scannerMassReadout and scannerLifeReadout exported.
9. Optional simplification: remove the always-false `disabled` prop from the five controls, their two call sites (scanner-wormhole-cells.tsx 246/252/261/279 and scanner-section-table.tsx 58) and the test props.

**Tests.** Existing guards: scanner-type-combo.test.ts 12-43 (groups, aria-label 'Type WHL-001', placeholder, class chip); scanner-identify-combo.test.ts 13-78 (groups toEqual, commitScannerIdentifyQuery, aria-label 'Name …'); scanner-leads-control.test.ts 13-212 (groups, commit paths, aria-label 'Destination …', seed text); scanner-mass-select.test.ts and scanner-life-select.test.ts (short readouts); scanner-wormhole-cells.test.ts 7 (remount keys). Add scanner-combo-panel.test.ts. It should mock '@/components/ui/combobox' to capture Root's onValueChange and Field's onKeyDown, the same selectHandlers pattern connection-fields.test.ts uses, and assert three things: item-press calls onCommitValue and does not change the query; an input change calls onQueryChange; Enter calls onCommitQuery with the current query. Also assert the aside wrapper renders only when aside !== undefined. Add a ScannerOptionalSelect test that mocks '@/components/ui/select' and asserts the '—' unset item, the triggerLabel override and that decoding UNSET_FIELD gives null.

**Notes.** Behaviour each site must keep: Type adds 'font-normal' when code is null, shows the chip only when query === code, and commits only when parse succeeds (unknown codes are rejected unless the codex is empty). Identify values carry the 'group:' and 'type:' prefixes and always use the unselected field class. Leads: browsing also when query === seed, Enter on empty text commits UNSET (clears the destination), and the field uses the destination tone. The remount keys at the call sites (scannerTypeCellKey and scannerLeadsCellKey) keep resetting query state, so the shell must stay controlled and must not hold its own seed. The scanner's '—' unset label stays different from the editor's 'Unset'. The scanner combos only use search.parse, and preferredCodes affects only suggest, so a rebuild on a preferredCodes change is harmless. The interaction logic is untested today (only markup and pure helpers are covered), so the new shell test is what makes this refactor safe.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p139"></a>

## P139: Grow signature-toast.ts into signature-removal.ts with removeSignaturesWithUndo/restoreSignaturesAndInvalidate and route the missing-flow, stub and event-log paths through it

- **Status:** [ ] not started
- **Category:** error-handling · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -45 (missing-flow restore wiring 30, stub flow body 25, SignatureWindow catch 6, duplicate interface fields 10) and +40 in signature-removal.ts; tests about +40
- **Depends on:** —
- **Existing primitive:** `src/mapper/signatures/signature-toast.ts:announceSignatureRemoval`

**Problem.** Three paths remove or restore signatures, and they have drifted:
- The scanner missing-flow hooks up raw useMutation(api.mapScan.removeSignatures/restoreSignatures), invalidates the elimination cache after both calls and surfaces failures.
- connectionLifecycleActions' stub removal goes through the swallowed authoring API. It never invalidates the cache, and its restore-failure toast is unreachable.
- The event-log restore in MapAuthoringOverlay neither invalidates nor reports failure.
The failure toast for the batch remove lives in SignatureWindow, away from the flow it belongs to.

**Sites (11).**

- [`src/mapper/signatures/use-signature-missing-flow.ts:66-102, 153-166`](../../src/mapper/signatures/use-signature-missing-flow.ts#L66-L102) — raw useMutation remove and restore; invalidates after remove and after a successful restore; restore failure toast id `signature-restore:${systemId}:batch` (the correct copy)
- [`src/mapper/signatures/connection-authoring-api.ts:35-44, 142-162, 187-223`](../../src/mapper/signatures/connection-authoring-api.ts#L35-L44) — removeStubAndAnnounce: undefined means 'Remove failed' (correct); no invalidation; the .catch on the swallowed restore is dead code
- [`src/mapper/chain/optimistic-authoring.ts:504-514, 657-662`](../../src/mapper/chain/optimistic-authoring.ts#L504-L514) — swallowMutationRejection wraps removeSignatures and restoreSignatures, so they never reject
- [`src/mapper/authoring/MapAuthoringOverlay.tsx:34-50`](../../src/mapper/authoring/MapAuthoringOverlay.tsx#L34-L50) — event-log restore: `void authoring.restoreSignatures(...)`, with no invalidation and no failure feedback
- [`src/mapper/signatures/SignatureWindow.tsx:83-89`](../../src/mapper/signatures/SignatureWindow.tsx#L83-L89) — batch 'Remove failed' toast (id 'signature-remove:batch') depends on onRemoveMissing rejecting
- [`src/mapper/signatures/signature-toast.ts:3-17`](../../src/mapper/signatures/signature-toast.ts#L3-L17) — announceSignatureRemoval, the existing shared primitive
- [`src/mapper/signatures/signature-elimination-client.ts:50-52`](../../src/mapper/signatures/signature-elimination-client.ts#L50-L52) — invalidateSignatureElimination drops the succeeded digest for the map and system
- [`src/mapper/signatures/use-identify-signature.ts:39-41`](../../src/mapper/signatures/use-identify-signature.ts#L39-L41) — same invalidate-on-change convention for identify writes
- [`src/mapper/signatures/SignatureProvider.tsx:50, 69-75, 108`](../../src/mapper/signatures/SignatureProvider.tsx#L50) — already holds the ConnectionAuthoringApi but calls useSignatureMissingFlow without it
- [`src/mapper/signatures/ActiveSignatureEditor.tsx:122-134`](../../src/mapper/signatures/ActiveSignatureEditor.tsx#L122-L134) — stub removal entry point via connectionLifecycleActions
- [`src/mapper/canvas/edge-menu.ts:72-81`](../../src/mapper/canvas/edge-menu.ts#L72-L81) — edge-menu delete enters the same connectionLifecycleActions.remove

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/connection-authoring-api.ts:164-183, 225-243`](../../src/mapper/signatures/connection-authoring-api.ts#L164-L183) — sever, restoreSeveredBranch and restoreConnection are also swallowed with no failure feedback, but they are connection mutations with a different undo toast (announceSeverOutcome); a related lead, not this primitive
- [`src/mapper/authoring/MapAuthoringOverlay.tsx:44-47`](../../src/mapper/authoring/MapAuthoringOverlay.tsx#L44-L47) — the restoreSeveredBranch branch of restoreFromEvent; same lead, out of scope

</details>

**Home.** `src/mapper/signatures/signature-removal.ts (replaces signature-toast.ts)`

**Boundary check.** Home zone: mapper. Its imports are @/components/ui/toast (mapper allows ui) and ./signature-elimination-client (same zone, which itself imports transport and data, both allowed for mapper).

Consumers, all in the mapper zone, so the imports are intra-zone: mapper/signatures/use-signature-missing-flow.ts, mapper/signatures/connection-authoring-api.ts and mapper/authoring/MapAuthoringOverlay.tsx.

To avoid a connection-authoring-api ↔ signature-removal import cycle (circular-dependencies is an error rule), declare the structural `SignatureSelectionMutations` type in signature-removal.ts. ConnectionAuthoringApi should extend it rather than signature-removal importing ConnectionAuthoringApi.

**API sketch.**

```ts
export interface SignatureSelectionArgs { mapId: string; systemId: number; signatureIds: string[] }
/** Mutations that resolve undefined on failure (swallowMutationRejection). */
export interface SignatureSelectionMutations {
  readonly removeSignatures: (args: SignatureSelectionArgs) => Promise<unknown>;
  readonly restoreSignatures: (args: SignatureSelectionArgs) => Promise<unknown>;
}
export function announceSignatureRemoval(input: { systemId: number; signatureIds: readonly string[]; onUndo: () => void }): void; // unchanged
export async function removeSignaturesWithUndo(input: { readonly mapId: string; readonly systemId: number; readonly signatureIds: readonly string[]; readonly mutations: SignatureSelectionMutations; readonly onRemoved?: () => void }): Promise<boolean>;
export async function restoreSignaturesAndInvalidate(input: { readonly mapId: string; readonly systemId: number; readonly signatureIds: readonly string[]; readonly restore: SignatureSelectionMutations['restoreSignatures'] }): Promise<boolean>;
```

**Migration steps.**

1. Rename src/mapper/signatures/signature-toast.ts to signature-removal.ts and add the types and two functions.
- removeSignaturesWithUndo: return false for empty ids. Await remove. If the result is undefined, toast.error('Remove failed', { id: `signature-remove:${systemId}:${ids}` }) and return false. Otherwise invalidateSignatureElimination, call onRemoved?.(), call announceSignatureRemoval with onUndo calling restoreSignaturesAndInvalidate, and return true.
- restoreSignaturesAndInvalidate: await restore. If the result is undefined, toast.error('Restore failed', { id: `signature-restore:${systemId}:${ids}` }) and return false. Otherwise invalidate and return true.
2. Make ConnectionAuthoringApi extend SignatureSelectionMutations and delete its two inline field declarations (35-44).
3. connection-authoring-api.removeStubAndAnnounce: replace the body with `void removeSignaturesWithUndo({ mapId, systemId, signatureIds: [signatureId], mutations: authoring, onRemoved: onDone })`. This deletes the dead .catch.
4. MapAuthoringOverlay.restoreFromEvent: in the signatures branch, call `void restoreSignaturesAndInvalidate({ mapId, systemId: action.systemId, signatureIds: action.signatureIds, restore: authoring.restoreSignatures })`.
5. use-signature-missing-flow: add `authoring: SignatureSelectionMutations` to useSignatureMissingFlow's input. Drop the two useMutation hookups. useRemoveMissingSignatures becomes `if (await removeSignaturesWithUndo({ …, mutations: authoring })) clearAllMissing(systemId)`.
6. SignatureProvider: pass authoring into useSignatureMissingFlow.
7. SignatureWindow.removeMissing: drop the now-unreachable .catch and its 'signature-remove:batch' toast, so it becomes `void props.onRemoveMissing()`.
8. Update the imports of announceSignatureRemoval to the new path, then delete signature-toast.ts.

**Tests.** Rename signature-toast.test.ts to signature-removal.test.ts and add these cases, mocking toast and signature-elimination-client:
- an undefined remove shows 'Remove failed', does not invalidate and returns false;
- a successful remove invalidates, calls onRemoved and announces with Undo;
- Undo with an undefined restore shows 'Restore failed' (the previously silent path);
- Undo with a successful restore invalidates again;
- empty ids are a no-op.
Update these existing tests:
- src/mapper/signatures/connection-authoring-api.test.ts:167-225: the stub case now also expects invalidation, and Undo failure shows a toast.
- src/mapper/signatures/use-signature-missing-flow.test.ts: inject authoring instead of mocking useMutation.
- src/mapper/signatures/SignatureWindow.test.ts: drop the rejection→'Remove failed' assertion if present.
- src/mapper/authoring/MapAuthoringOverlay.test.ts: the signatures restore now invalidates, and an undefined result toasts.

**Notes.** Correct copies: the missing-flow's invalidate-after-remove and invalidate-after-restore, and the stub flow's undefined-means-failure check. The broken parts are the stub flow's dead .catch and the overlay's silent restore.

Toast ids: unify to `signature-remove:${systemId}:${ids.join(',')}` and `signature-restore:${systemId}:${ids.join(',')}`. The stub failure id already equals announceSignatureRemoval's success id, which is harmless because they are mutually exclusive. The batch ids that lacked a systemId change, which affects nothing outside tests.

Swallowed restores lose the UNDO_WINDOW_EXPIRED code, so 'Restore failed' stays generic. Distinguishing 'Undo window expired' would require changing swallowMutationRejection to return the ConvexError, which is out of scope.

useChainAuthoringMutations returns a fresh object and fresh wrappers each render (no useMemo; no React Compiler in next.config.ts). Passing authoring into the missing-flow's useCallback deps re-creates removeMissingRows each render. SignatureWindow is not memoized, so this costs nothing observable, but do not add the callbacks to effect dependencies.

Lead for a later pass: restoreSeveredBranch and restoreConnection undo paths (connection-authoring-api.ts:169-182, MapAuthoringOverlay.tsx:44-47) are swallowed with no failure feedback either.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p298"></a>

## P298: Make a scanner row's open action the ScannerPanelTarget and remove the dead trigger/clientX/clientY plumbing

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -80 / +15 (deletes scanner-panel-body.ts, the apply/handlers/affordance helpers, OpenRowActions, openEditor/openSite and the four-argument callback types across 4 components)
- **Depends on:** [P072](wave-13-industry-planner-and-wormhole-sites-verticals.md#p072)
- **Existing primitive:** `src/mapper/signatures/signature-context.tsx:ScannerPanelTarget`

**Problem.** A scanner row click passes through six layers. SignatureRowContent measures the trigger rect and calls onOpenActions(trigger, x, y). ScannerSectionBlock, ScannerSections and ScannerWindowFrame thread that four-argument callback down to SignatureWindow. SignatureWindow re-derives scannerRowOpenAction and calls applyScannerRowOpenAction, which ignores the coordinates and dispatches to openEditor or openSite. Those only rebuild a ScannerPanelTarget for onPanelTargetChange. ActiveScannerPanel then maps the target through scannerPanelBodyKind and narrows it a second time. The action type duplicates ScannerPanelTarget, the sr-only prefix keeps an unreachable 'Open signature' fallback, and the row computes the action twice per render.

**Sites (13).**

- [`src/mapper/signatures/scanner-row-open.ts:5-77`](../../src/mapper/signatures/scanner-row-open.ts#L5-L77) — ScannerRowOpenAction mirrors ScannerPanelTarget; ScannerRowOpenHandlers; scannerRowShowsOpenAffordance is a pass-through; applyScannerRowOpenAction ignores _context
- [`src/mapper/signatures/SignatureWindow.tsx:20-24, 52-53, 100-114, 149`](../../src/mapper/signatures/SignatureWindow.tsx#L20-L24) — onOpenEditor and onOpenSite props; openRowActions re-derives the action and calls applyScannerRowOpenAction with unused coordinates
- [`src/mapper/signatures/scanner-row-cells.tsx:14-26, 55-64, 109-141, 143-194`](../../src/mapper/signatures/scanner-row-cells.tsx#L14-L26) — OpenRowActions and openRowActionsAtStart measure the rect for nothing; rowActionPrefix recomputes the action, and its 'Open signature' branch is unreachable because the button renders only when an action exists; SignatureRow takes canEdit and resolveSiteId only to feed the prefix
- [`src/mapper/signatures/scanner-section-table.tsx:153-158, 197-227, 272-277`](../../src/mapper/signatures/scanner-section-table.tsx#L153-L158) — Affordance is computed through scannerRowShowsOpenAffordance; the four-argument callback is wrapped and threaded
- [`src/mapper/signatures/scanner-window-frame.tsx:116-135, 168-174`](../../src/mapper/signatures/scanner-window-frame.tsx#L116-L135) — Threads the four-argument onOpenActions
- [`src/mapper/signatures/use-signature-panel.ts:21-53`](../../src/mapper/signatures/use-signature-panel.ts#L21-L53) — openEditor and openSite only rebuild ScannerPanelTarget
- [`src/mapper/signatures/SignatureProvider.tsx:84-87, 115-116`](../../src/mapper/signatures/SignatureProvider.tsx#L84-L87) — Passes panel.openEditor and panel.openSite into SignatureWindow
- [`src/mapper/signatures/signature-context.tsx:38-54`](../../src/mapper/signatures/signature-context.tsx#L38-L54) — ScannerPanelTarget (the canonical type) and OpenSignatureEditor, which becomes unused
- [`src/mapper/signatures/scanner-panel-body.ts:1-10`](../../src/mapper/signatures/scanner-panel-body.ts#L1-L10) — Maps the target to a kind that ActiveScannerPanel narrows again
- [`src/mapper/signatures/ActiveScannerPanel.tsx:34-58`](../../src/mapper/signatures/ActiveScannerPanel.tsx#L34-L58) — Checks both the body kind and panelTarget.kind
- [`src/mapper/chain/surface.test.ts:130, 133`](../../src/mapper/chain/surface.test.ts#L130) — Mapper file inventory lists scanner-panel-body.ts and scanner-row-open.ts and must be updated
- [`src/mapper/signatures/scanner-row-open.test.ts:84-160`](../../src/mapper/signatures/scanner-row-open.test.ts#L84-L160) — Tests the gating (84-127) plus affordance and apply dispatch (105-108, 129-160)
- [`src/mapper/signatures/SignatureWindow.test.ts:177-178, 301, 339-385, 435-436`](../../src/mapper/signatures/SignatureWindow.test.ts#L177-L178) — Passes onOpenEditor/onOpenSite/onOpenActions props; asserts the sr-only 'View site' count and no 'Edit wormhole' for viewers

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/chain/use-authoring-menus.ts:26-57`](../../src/mapper/chain/use-authoring-menus.ts#L26-L57) — Canvas producer of ScannerPanelTarget (setEditingConnectionId with signatureId null) and the canEdit-drop reset. It stays the state owner and is not part of the row chain
- [`src/mapper/canvas/edge-menu.ts:64-71`](../../src/mapper/canvas/edge-menu.ts#L64-L71) — A different openEditor(connectionId) callback for the edge menu, not this plumbing
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:215-225`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L215-L225) — Its clientX/clientY are the panel's own pointer-drag handling, unrelated to the row trigger coordinates

</details>

**Home.** `src/mapper/signatures/scanner-row-open.ts (scannerRowOpenTarget returning the existing ScannerPanelTarget from src/mapper/signatures/signature-context.tsx)`

**Boundary check.** Every touched file is in the mapper zone (src/mapper/**). scanner-row-open.ts keeps its current imports of features/wormhole-sites/site-name-lookup and data/convex/data-model; the mapper rule allows 'features' and 'data'. It adds an import of ./signature-context inside the same zone. No new zone edges.

**API sketch.**

```ts
// scanner-row-open.ts
export function scannerRowOpenTarget(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null = siteIdForSiteName,
): ScannerPanelTarget;
// scanner-row-cells.tsx
SignatureRow props: { row; missing; updated; columnsClassName; cells; openTarget: ScannerPanelTarget; onOpenTarget: (target: ScannerPanelTarget) => void }
// ScannerSections / ScannerWindowFrame / SignatureWindow
onOpenTarget: (target: ScannerPanelTarget) => void
```

**Migration steps.**

1. In scanner-row-open.ts, rename scannerRowOpenAction to scannerRowOpenTarget and make it return ScannerPanelTarget (type import from ./signature-context). Delete ScannerRowOpenAction, ScannerRowOpenHandlers, scannerRowShowsOpenAffordance and applyScannerRowOpenAction.
2. In ScannerSectionBlock (scanner-section-table.tsx:197-227), compute once per row: const openTarget = inlineWormhole || inlineIdentify ? null : scannerRowOpenTarget(row, canEdit, resolveSiteId). Pass openTarget and onOpenTarget to SignatureRow. Change the onOpenActions prop types at 153-158 and 272-277 to onOpenTarget: (target: ScannerPanelTarget) => void.
3. In scanner-row-cells.tsx, delete OpenRowActions and openRowActionsAtStart. SignatureRow derives showOpenAffordance as openTarget !== null. SignatureRowContent uses onClick={() => onOpenTarget(openTarget)} and takes its sr-only prefix from openTarget.kind ('Edit wormhole' or 'View site'), dropping the unreachable fallback. Remove the canEdit and resolveSiteId props from SignatureRow and SignatureRowContent so Fallow unused-component-props stays clean.
4. In scanner-window-frame.tsx, rename onOpenActions to onOpenTarget (116-135, 174).
5. In SignatureWindow.tsx, replace the onOpenEditor and onOpenSite props with onOpenTarget, delete openRowActions and the scanner-row-open import, and pass onOpenTarget through to ScannerWindowFrame.
6. In SignatureProvider.tsx:115-116, pass onOpenTarget={onPanelTargetChange}. In use-signature-panel.ts, delete openEditor and openSite and return { closePanel, now }. Delete the OpenSignatureEditor type from signature-context.tsx once nothing uses it.
7. Delete scanner-panel-body.ts. In ActiveScannerPanel, branch on panelTarget?.kind === 'site', then panelTarget?.kind === 'connection' && canEdit.
8. Remove 'signatures/scanner-panel-body.ts' from the inventory in src/mapper/chain/surface.test.ts:130.
9. Optional: replace the identical missingDataAttribute and updatedDataAttribute helpers (scanner-row-cells.tsx:39-49) with inline `missing || undefined` and `updated || undefined`.

**Tests.** scanner-row-open.test.ts: keep the gating expectations on scannerRowOpenTarget (84-104, 110-127) and delete the affordance and apply-dispatch blocks (105-108, 129-160). SignatureWindow.test.ts: replace onOpenEditor/onOpenSite (177-178, 367-368, 435-436) and onOpenActions (301) with onOpenTarget: vi.fn(). The 339-385 assertions (three 'View site' prefixes for viewers, no 'Edit wormhole') guard the prefix and gating. ActiveScannerPanel.test.ts:55+ guards the site-for-viewers and connection-only-when-canEdit gating after scanner-panel-body is removed. Add one test that a row click calls onOpenTarget with the row's target, for example by invoking the rendered SignatureRow onClick in a DOM test; nothing covers click dispatch end to end today.

**Notes.** Preserve these behaviors: (1) A connection target exists only when canEdit at the row (scanner-row-open.ts:31-38), and ActiveScannerPanel must still gate connection on canEdit, because canvas-originated targets (use-authoring-menus) arrive without row gating and canEdit can drop while a target is open. (2) Inline wormhole rows (wormholes section, connection, canEdit) and inline identify rows (unknown section, canEdit, group null, onIdentify present) show no open affordance even when a target exists, so keep that exclusion when computing openTarget. (3) Row targets always carry a string signatureId while ScannerPanelTarget allows null for connection; widening is safe because ActiveSignatureEditor already accepts a null anchorSignatureId. (4) Keep the resolveSiteId default parameter (siteIdForSiteName), which the tests rely on; SignatureWindow passes catalogue.siteIdForName. (5) onPanelTargetChange is menus.setPanelTarget (a useState setter) and stays stable, so dropping the useCallback wrappers causes no extra renders.

<sub>Reported by: area:mapper-signatures.</sub>

<a id="p218"></a>

## P218: Factor the connection-query and loaded-page helpers inside optimistic-authoring.ts, and make branch restore patch unresolved holes too

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -40 / +28
- **Depends on:** [P082](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p082), [P329](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p329), [P262](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p262), [P139](#p139)
- **Existing primitive:** `src/data/convex/use-mutation.ts:optimisticallyUpdateValueInPaginatedQuery`

**Problem.** optimistic-authoring.ts repeats one operation, 'apply this updater to the row wherever it lives (resolved or unresolved query)', three times, and one caller already got it wrong: optimisticRestoreSeveredBranch updates only the resolved query, diverging from the server. It hand-writes 'loaded pages of this paginated query for this map' six times. It also builds the optimistic system row twice, once without a satisfies check.

**Verifier revision.** All cited repetitions are real and line-accurate. Three functions apply one updater to both watchMapConnections and watchUnresolvedHoles (197-210, 333-344, 541-552), and six loops filter loaded pages by map. Opening the neighbours turned up a drift the finder missed. optimisticRestoreSeveredBranch (248-265) restores connection tombstones only in watchMapConnections, while the server's runBranchRestore (convex/mapAuthoringCollapse.ts:379-414) restores every connection on the map with the same stamp. Its readBoundedMapTopology (27-49) reads by_map, so unresolved holes are included. Optimistic restore therefore leaves severed stubs tombstoned until the server echo arrives, which is exactly the desync the updateConnectionRows helper prevents. The claimed system-literal drift is cosmetic: both copies end in `as never` (95 and 140), and only the second is checked with satisfies first. The helpers stay private to one file.

**Sites (9).**

- [`src/mapper/chain/optimistic-authoring.ts:197-210`](../../src/mapper/chain/optimistic-authoring.ts#L197-L210) — optimisticPatchConnection: same patch updater on both connection queries
- [`src/mapper/chain/optimistic-authoring.ts:333-344`](../../src/mapper/chain/optimistic-authoring.ts#L333-L344) — optimisticSetConnectionWormholeType: generic apply on both queries
- [`src/mapper/chain/optimistic-authoring.ts:541-552`](../../src/mapper/chain/optimistic-authoring.ts#L541-L552) — optimisticPatchDoorLeadsTo: generic apply on both queries
- [`src/mapper/chain/optimistic-authoring.ts:248-265`](../../src/mapper/chain/optimistic-authoring.ts#L248-L265) — optimisticRestoreSeveredBranch: systems plus watchMapConnections only; misses watchUnresolvedHoles (drift)
- [`convex/mapAuthoringCollapse.ts:27-49,379-414`](../../convex/mapAuthoringCollapse.ts#L27-L49) — server restore reads all map connections via by_map and restores every row with the stamp, including unresolved holes. This is the correct behavior
- [`convex/mapChainConnections.ts:40-50`](../../convex/mapChainConnections.ts#L40-L50) — the two queries partition by toSystemId (non-null vs null), so a row lives in exactly one and applying the updater to both is the correct 'wherever it is' semantics
- [`src/mapper/chain/optimistic-authoring.ts:104-110,120-125,230-239`](../../src/mapper/chain/optimistic-authoring.ts#L104-L110) — loaded-pages-for-map loops in liveSystemPresent, optimisticSetHomeSystem and severStamp
- [`src/mapper/chain/optimistic-authoring.ts:362-366,375-385,387-407`](../../src/mapper/chain/optimistic-authoring.ts#L362-L366) — optimisticClaimStaticPlaceholder filters the same unresolved pages three times
- [`src/mapper/chain/optimistic-authoring.ts:84-96,127-141`](../../src/mapper/chain/optimistic-authoring.ts#L84-L96) — system row literal built twice: `as never` with no satisfies, then satisfies OptimisticSystemRow followed by `as never`

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/convex/use-mutation.ts:1-9`](../../src/data/convex/use-mutation.ts#L1-L9) — re-exports Convex's optimisticallyUpdateValueInPaginatedQuery/insertAtTop; already the shared primitive, nothing to change there
- [`src/mapper/chain/optimistic-authoring.ts:601-665`](../../src/mapper/chain/optimistic-authoring.ts#L601-L665) — the repeated swallowMutationRejection(useMutation(...).withOptimisticUpdate(...)) calls are hook calls that must stay at top level; a table-driven loop would break the rules of hooks. Not in scope

</details>

**Home.** `Private helpers inside src/mapper/chain/optimistic-authoring.ts (no new module).`

**Boundary check.** Everything stays in src/mapper/chain/optimistic-authoring.ts (zone mapper). The helpers use only imports the file already has: @/data/convex/api and @/data/convex/use-mutation (rule `mapper` allows data) and @/data/maps/* (data). No new cross-zone edge.

**API sketch.**

```ts
type ChainPageQuery = typeof api.mapChainSystems.watchMapSystems | typeof api.mapChainConnections.watchMapConnections | typeof api.mapChainConnections.watchUnresolvedHoles;
function loadedPages<Q extends ChainPageQuery>(localStore: OptimisticLocalStore, query: Q, mapId: string): { args: FunctionArgs<Q>; value: FunctionReturnType<Q> }[];
function updateConnectionRows(localStore: OptimisticLocalStore, mapId: string, apply: <Row extends OptimisticConnectionRow>(row: Row) => Row): void;
function patchById<Patch extends object>(id: string, patch: Patch): <Row extends { readonly _id: string }>(row: Row) => Row;
function optimisticSystemRow(mapId: string, systemId: number, now: number): OptimisticSystemRow;
```

**Migration steps.**

1. Add updateConnectionRows. Rewrite optimisticPatchConnection (197-210) as updateConnectionRows(localStore, mapId, patchById(connectionId, patch)), and optimisticSetConnectionWormholeType (333-344) and optimisticPatchDoorLeadsTo (541-552) as updateConnectionRows(localStore, mapId, apply).
2. Switch the connection pass of optimisticRestoreSeveredBranch (257-265) to updateConnectionRows, so unresolved holes with the same stamp are restored, matching runBranchRestore.
3. Add loadedPages and use it in liveSystemPresent, the any-live check in optimisticSetHomeSystem, and severStamp. In optimisticClaimStaticPlaceholder, compute `const pages = loadedPages(localStore, api.mapChainConnections.watchUnresolvedHoles, mapId)` once and reuse it for the claimant lookup, the placeholder lookup and the setQuery loop.
4. Add optimisticSystemRow (checked with satisfies OptimisticSystemRow) and use it in insertOptimisticSystemIfAbsent (84-96) and optimisticSetHomeSystem (127-141). Keep the single `as never` at the insertAtTop/insertAtBottomIfLoaded call, since temp ids are not branded Id<'mapSystems'>.

**Tests.** The existing src/mapper/chain/optimistic-authoring.test.ts covers patch (254-279), destination (281-321), sever/restore (323-366), home and add-from-node (192-252), and the static-placeholder claim (482-528). Add one case to 'optimistic collapse patches': 'restores unresolved holes sharing the cut stamp', seeding mockStore with `unresolved` tombstoned at the same stamp and expecting tombstone.kind 'live' after optimisticRestoreSeveredBranch.

**Notes.** Applying updaters to both connection queries is safe, because the queries partition rows by toSystemId, so the patch is a no-op on the query that does not hold the row. The one intended behavior change is the restore fix. severStamp can keep reading only watchMapConnections, since sever is invoked on drawn (resolved) edges; widening it is optional.

<sub>Reported by: area:mapper-chain.</sub>

← [Wave 14: Convex backend helpers](wave-14-convex-backend-helpers.md) · [Index](README.md#roadmap) · [Wave 16: Large cross-cutting migrations (last)](wave-16-large-cross-cutting-migrations-last.md) →
