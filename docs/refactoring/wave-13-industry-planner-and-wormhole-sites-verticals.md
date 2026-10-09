# Wave 13: Industry planner and wormhole-sites verticals

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 12: Market data, search and client data reads](wave-12-market-data-search-and-client-data-reads.md) · [Index](README.md#roadmap) · [Wave 14: Convex backend helpers](wave-14-convex-backend-helpers.md) →

Planner: one efficiency module, then MeField/TeField reading context, then ledger parts. StructureFactors is built once, which unblocks P070 (adjusted prices seeded once, build-location endpoint retired; medium risk, high payoff). Then the batch ledger once, pricedTypeIds and shell glue. Wormhole sites: site class (on P042's taxonomy), then site type, then one site-detail assembly, then the EWAR module, the live-priced guard and deletion of the module-global site index. P298 in wave 15 depends on that deletion.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P301](#p301) | Fold te-overrides, node-frame-state and override-map into one efficiency module and share the ME/TE factor | simplification | S | low | low | — |
| ☐ | [P025](#p025) | Have MeField/TeField read useBuildPlan themselves, own their boxed icon row, and share one blueprint meta line | ui-component | S | low | medium | [P301](#p301) |
| ☐ | [P026](#p026) | Share the cockpit's ledger column head and item name stack inside industry-planner | ui-component | S | low | low | — |
| ☐ | [P168](#p168) | Build StructureFactors in one place from a per-job bonus function, with bestOf in structure-bonus | server-pipeline | S | low | low | [P098](wave-04-formatting-dates-and-names-have-one-home.md#p098) |
| ☐ | [P070](#p070) | Seed blueprint adjusted prices once per planner, read system cost indices through costIndicesEndpoint, and retire the build-location endpoint | client-data | M | medium | high | [P168](#p168), [P185](wave-01-quick-wins-delete-dead-code-fix-small.md#p185), [P098](wave-04-formatting-dates-and-names-have-one-home.md#p098) |
| ☐ | [P291](#p291) | Resolve the batch ledger and marginal demand once per assemblePricing call | efficiency | S | low | low | [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304), [P076](wave-12-market-data-search-and-client-data-reads.md#p076) |
| ☐ | [P325](#p325) | Share one pricedTypeIds(structure) between server pricing and the client refresh set | simplification | S | low | low | [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304) |
| ☐ | [P326](#p326) | Trim planner-shell glue: one PromiseSeeder, inline TierRow, CockpitKpis owns its margin mode, ownedTe from mapOwnedBlueprints, shared CostBasis and SystemRef | simplification | S | low | low | [P260](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p260), [P025](#p025), [P301](#p301) |
| ☐ | [P120](#p120) | Give wormhole-sites one site-class range, class rank, class pill and site-type order | generic-utility | M | low | medium | [P042](wave-01-quick-wins-delete-dead-code-fix-small.md#p042) |
| ☐ | [P121](#p121) | Centralise wormhole site-type predicates and display order; route class-range logic through siteClassSet | generic-utility | S | low | medium | [P120](#p120) |
| ☐ | [P227](#p227) | Share one site-detail assembly in wormhole-sites/queries.ts, route class matching through siteClassSet, and drop listSiteDetails' unused filters | persistence | S | low | medium | [P121](#p121) |
| ☐ | [P169](#p169) | Give wormhole-sites one EWAR module (waveEwar, siteEwarTotals, activeEwarKeys) and drop summariseWave's dead ew* totals | server-pipeline | M | low | medium | — |
| ☐ | [P071](#p071) | Make resourceValueEligible a type guard in live-isk.ts and share the live-price lookup type between the site and scanner contexts | client-data | S | low | low | [P084](wave-04-formatting-dates-and-names-have-one-home.md#p084) |
| ☐ | [P072](#p072) | Delete the module-global site-name index and make GlobalSearch the only writer of the site search index | client-data | S | low | medium | [P071](#p071) |

<a id="p301"></a>

## P301: Fold te-overrides, node-frame-state and override-map into one efficiency module and share the ME/TE factor

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -40 production lines (te-overrides 19, meFactor/teFactor 3, IconState 1, file headers and imports) and 3 fewer modules; tests unchanged in substance
- **Depends on:** —
- **Existing primitive:** `src/features/industry-planner/override-map.ts:setOverride`

**Problem.** ME and TE overrides are one concept split across four tiny files. te-overrides.ts adds nothing beyond MAX_TE: its effectiveTeOf and nodeTeState just forward to the ME versions, and clampTe copies clampMe's body. The ME-material and TE-time multipliers are written twice (meFactor private in build-batch, teFactor exported from build-time, which a test imports), and the glyph tone union is declared twice (IconState in MeAdjuster, EfficiencyToneState in industry-styles). Consumers import half from me-overrides and half from te-overrides for the same computation.

**Verifier revision.** The pass-through duplication is real. effectiveTeOf returns effectiveMeOf, nodeTeState returns nodeMeState, and clampTe is clampMe with max 20. MeAdjuster.deriveAdjust already applies ME helpers to TE. build-batch's private meFactor and build-time's exported teFactor are the same formula, and IconState (MeAdjuster) repeats EfficiencyToneState (industry-styles). The 'owned-state drift' claim is refuted. nodeMeState (glyph: owned means a researched value > 0) and nodeFrameState (frame: owned means you hold any copy) are two different, deliberately pinned rules. me-overrides.test.ts 83-91 asserts nodeMeState(0, undefined) === 'unowned', and 140-152 asserts nodeFrameState with ME0/TE0 entries === 'owned'. A 0/0 blueprint with a gold frame and muted glyphs is intended, not a bug. ownedMe and ownedTe also always share keys, because both come from mapOwnedBlueprints/ownedDetail, so the frame rule has no ME-vs-TE ambiguity. The consolidation survives as a small cleanup with low payoff. useOverrideSetters in PricingProvider is already generic over clamp, and the parallel ME/TE useState pairs are the right shape, so those sites need no change beyond imports.

**Sites (13).**

- [`src/features/industry-planner/me-overrides.ts:1-27`](../../src/features/industry-planner/me-overrides.ts#L1-L27) — MAX_ME, clampMe, effectiveMeOf, NodeMeState, nodeMeState (owned when > 0)
- [`src/features/industry-planner/te-overrides.ts:1-19`](../../src/features/industry-planner/te-overrides.ts#L1-L19) — MAX_TE, clampTe (copy of clampMe body), effectiveTeOf and nodeTeState are pure forwards
- [`src/features/industry-planner/node-frame-state.ts:1-13`](../../src/features/industry-planner/node-frame-state.ts#L1-L13) — nodeFrameState: manual if either override, owned if either owned map has the id
- [`src/features/industry-planner/override-map.ts:1-18`](../../src/features/industry-planner/override-map.ts#L1-L18) — setOverride/resetOverride; only PricingProvider and the test use them
- [`src/features/industry-planner/build-batch.ts:60-62, 168-170`](../../src/features/industry-planner/build-batch.ts#L60-L62) — private meFactor: me <= 0 ? 1 : 1 - me/100
- [`src/features/industry-planner/build-time.ts:3-5, 44-57`](../../src/features/industry-planner/build-time.ts#L3-L5) — exported teFactor: same formula; build-time.test.ts imports it
- [`src/features/industry-planner/components/MeAdjuster.tsx:8-9, 31-42, 146-180`](../../src/features/industry-planner/components/MeAdjuster.tsx#L8-L9) — deriveAdjust uses effectiveMeOf/nodeMeState for both MeField and TeField; IconState repeats EfficiencyToneState; MeField/TeField are parallel
- [`src/features/industry-planner/industry-styles.ts:8, 12`](../../src/features/industry-planner/industry-styles.ts#L8) — EfficiencyToneState = NodeMeState \| 'bonus' \| 'reaction'
- [`src/features/industry-planner/components/ComponentDrawer.tsx:21-22, 43, 55`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L21-L22) — Imports nodeMeState and nodeTeState from two files for the same rule
- [`src/features/industry-planner/components/PlannerRail.tsx:22-24, 173-174`](../../src/features/industry-planner/components/PlannerRail.tsx#L22-L24) — Same split import for glyph states
- [`src/features/industry-planner/components/PricingProvider.tsx:33-34, 56, 116-133, 434-441, 444, 463`](../../src/features/industry-planner/components/PricingProvider.tsx#L33-L34) — Imports clampMe/effectiveMeOf, clampTe/effectiveTeOf and override-map; useOverrideSetters is already generic
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:16, 192`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L16) — Sole production nodeFrameState consumer
- [`src/features/industry-planner/owned-blueprint-maps.ts:8-22`](../../src/features/industry-planner/owned-blueprint-maps.ts#L8-L22) — ownedMe and ownedDetail (the source of ownedTe, PricingProvider 438-441) are filled from the same rows, so their key sets are identical

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/node-frame-state.ts:3-13`](../../src/features/industry-planner/node-frame-state.ts#L3-L13) — Its 'owned = any held copy' rule is NOT drift from nodeMeState's 'owned = researched > 0'. Both are pinned by me-overrides.test.ts (83-91 vs 140-152) and serve different UI (node frame vs per-attribute glyph). Keep both rules
- [`src/features/industry-planner/components/PricingProvider.tsx:116-133`](../../src/features/industry-planner/components/PricingProvider.tsx#L116-L133) — useOverrideSetters is already the shared primitive (clamp-parameterized); nothing to extract
- [`src/features/industry-planner/skill-time.ts:90-114`](../../src/features/industry-planner/skill-time.ts#L90-L114) — Skill time factors are a different formula (skill levels), not an efficiency percentage

</details>

**Home.** `src/features/industry-planner/efficiency.ts (new; replaces me-overrides.ts, te-overrides.ts, node-frame-state.ts, override-map.ts)`

**Boundary check.** Zone 'features' with autoDiscover over src/features, so src/features/industry-planner is one zone. Every consumer is inside it: build-batch.ts, build-time.ts, industry-styles.ts, components/{MeAdjuster,ComponentDrawer,PlannerRail,PricingProvider,CockpitBuildPlan,NodeCard}.tsx. Intra-zone imports need no rule. efficiency.ts imports nothing.

**API sketch.**

```ts
export const MAX_ME = 10; export const MAX_TE = 20;
export function clampTo(max: number): (n: number, fallback?: number) => number;
export const clampMe = clampTo(MAX_ME); export const clampTe = clampTo(MAX_TE); // module-level, so references stay stable for useCallback deps
export function effectiveEfficiencyOf(owned: Map<number, number> | null, overrides: Map<number, number>): (blueprintTypeId: number) => number | undefined;
export type EfficiencyState = 'owned' | 'manual' | 'unowned';
/** Glyph: owned only when a researched value (> 0) exists. */
export function efficiencyGlyphState(owned: number | undefined, override: number | undefined): EfficiencyState;
/** Frame: owned when any copy is held, whatever its research. */
export function nodeFrameState(bp: number, ownedMe: Map<number, number> | null, ownedTe: Map<number, number> | null, meOverrides: Map<number, number>, teOverrides: Map<number, number>): EfficiencyState;
export function efficiencyFactor(pct: number): number; // pct <= 0 ? 1 : 1 - pct / 100
export function setOverride(...); export function resetOverride(...); // moved verbatim
```

**Migration steps.**

1. Create efficiency.ts holding me-overrides.ts contents, with clampMe/clampTe as clampTo(MAX) instances, effectiveMeOf renamed to effectiveEfficiencyOf, nodeMeState renamed to efficiencyGlyphState and NodeMeState to EfficiencyState. Add nodeFrameState from node-frame-state.ts, setOverride/resetOverride from override-map.ts, and efficiencyFactor.
2. build-batch.ts: delete private meFactor (60-62) and call efficiencyFactor in meAdjust and factorFor. build-time.ts: delete teFactor (3-5) and call efficiencyFactor at 47 and 56.
3. industry-styles.ts: import EfficiencyState from ./efficiency; keep EfficiencyToneState as the one union. MeAdjuster.tsx: delete IconState (42) and type ToneGlyph/GemIcon/HourglassIcon with EfficiencyToneState from ../industry-styles.
4. Repoint imports: PricingProvider (clampMe, clampTe, effectiveEfficiencyOf for both ME and TE, setOverride, resetOverride); MeAdjuster (MAX_ME, MAX_TE, effectiveEfficiencyOf, efficiencyGlyphState); ComponentDrawer and PlannerRail (efficiencyGlyphState for both glyphs); CockpitBuildPlan (nodeFrameState); NodeCard (type EfficiencyState).
5. Delete me-overrides.ts, te-overrides.ts, node-frame-state.ts and override-map.ts. Rename me-overrides.test.ts to efficiency.test.ts and move build-time.test.ts's teFactor cases (7-13) there as efficiencyFactor cases.
6. Leave both owned rules unchanged and document the difference in JSDoc. Optional: nodeFrameState could check one owned map, since the key sets are identical, but that saves one || and is not required.

**Tests.** Guards that must stay green: me-overrides.test.ts (clampMe 9-32, effectiveMeOf 34-74, nodeMeState 76-91, clampTe 93-104, set/resetOverride 106-136, nodeFrameState 138-153), build-time.test.ts teFactor 7-13 plus computeBuildTimes, and build-batch.test.ts ledger/ME cases. Move the first set to efficiency.test.ts unchanged except for names, and add one assertion that clampMe and clampTe are referentially stable (same function across imports) so useOverrideSetters' useCallback deps do not churn.

**Notes.** Do not 'fix' the owned rule. The glyph's 'owned' means a researched ME/TE (> 0) for that attribute, and the frame's 'owned' means the player holds a copy. Tests pin both (me-overrides.test.ts 88-90 and 147), and the industry-styles comment at 27-28 is about the unowned frame staying transparent, not about ME0 copies. clampMe's optional fallback parameter is used only by tests; keep it for compatibility or drop it along with those asserts. clamp instances must be module-level constants, because useOverrideSetters lists clamp in its useCallback deps (PricingProvider 116-133). An optional follow-up, not part of this change: MeField/TeField (MeAdjuster 146-180) and the separately computed glyph states in ComponentDrawer 43/55 and PlannerRail 173-174 could collapse into one EfficiencyField({kind}), but that touches the MeProps/TeProps prop contracts across four components.

<sub>Reported by: area:industry-planner.</sub>

<a id="p025"></a>

## P025: Have MeField/TeField read useBuildPlan themselves, own their boxed icon row, and share one blueprint meta line

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -75 / +40 (two six-prop interfaces, ten-prop threading in four places, duplicate row markup and icon-state recomputation, one meta-line copy)
- **Depends on:** [P301](#p301)
- **Existing primitive:** `src/features/industry-planner/components/MeAdjuster.tsx:MeField,TeField`

**Problem.** The ME/TE stepper fields take six props each that are copied 1:1 from the BuildPlan context, so every consumer destructures and re-threads up to ten fields. The boxed layout (an icon beside a stepper) is rebuilt in PlannerRail and ComponentDrawer, each recomputing the icon state the field already computes. The '{group} · {activity} · N per run' line is duplicated with drifted omission rules.

**Verifier revision.** Verified: MeProps/TeProps mirror BuildPlanValue field for field, and all three consumers (PlannerRail.BuildSteppers, ComponentDrawer.Steppers, CockpitBuildPlan→NodeAdjusters) pull the same values off useBuildPlan and thread them back in. PlannerRail's StepperRow and ComponentDrawer's inline row() are the same markup. Both boxed sites recompute nodeMeState/nodeTeState for the icon, although MeField already derives the same state internally (deriveAdjust) but suppresses its icon in boxed mode. Revisions: (1) the proposed name EfficiencyField collides with the existing private renderer at MeAdjuster.tsx:91; keep the exported names MeField/TeField/NodeAdjusters (pinned in coverage.test.ts:60,84-88) and slim their props instead. (2) Move the icon into the boxed field, so callers stop recomputing state. (3) Drop the hero TypeIcon from scope: the sites use different image sources (blueprintImage vs nodeImage(bp, typeId)) and sizes (112 vs 64), so a wrapper would only forward props. (4) The meta line differs on purpose. The drawer omits a null activity and hides activity when it equals the group label; the rail always shows activity, which is safe today only because the root label is a group or category name (industry-styles.ts:150-152). Adopt the drawer's rule. (5) CockpitBuildPlan still needs ownedMe/ownedTe/meOverrides/teOverrides for nodeFrameState, so only the four setters leave its destructure.

**Sites (11).**

- [`src/features/industry-planner/components/MeAdjuster.tsx:13-29`](../../src/features/industry-planner/components/MeAdjuster.tsx#L13-L29) — MeProps/TeProps: six parallel props equal to BuildPlanValue fields
- [`src/features/industry-planner/components/MeAdjuster.tsx:31-40, 91-144`](../../src/features/industry-planner/components/MeAdjuster.tsx#L31-L40) — deriveAdjust computes state; the private EfficiencyField renders the icon only when !boxed (line 130)
- [`src/features/industry-planner/components/MeAdjuster.tsx:146-180`](../../src/features/industry-planner/components/MeAdjuster.tsx#L146-L180) — MeField/TeField are mirror wrappers that differ only in glyph, aria unit, max and which plan fields they read
- [`src/features/industry-planner/components/MeAdjuster.tsx:191-227`](../../src/features/industry-planner/components/MeAdjuster.tsx#L191-L227) — NodeAdjusters takes ten props only to forward them
- [`src/features/industry-planner/components/PlannerRail.tsx:157-209`](../../src/features/industry-planner/components/PlannerRail.tsx#L157-L209) — StepperRow and BuildSteppers; recomputes meState/teState (173-174) for the icon; ME/TE only for manufacturing; runs row reuses StepperRow
- [`src/features/industry-planner/components/ComponentDrawer.tsx:28-68`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L28-L68) — Steppers: inline row() identical to StepperRow; recomputes nodeMeState/nodeTeState (43, 55); isEfficiencyEligible guard
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:170-208`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L170-L208) — Destructures ten BuildPlan fields and threads them into NodeAdjusters; ownedMe/ownedTe/meOverrides/teOverrides are also used by nodeFrameState at line 192
- [`src/features/industry-planner/components/PlannerRail.tsx:75-85`](../../src/features/industry-planner/components/PlannerRail.tsx#L75-L85) — Meta line: optional group, activity always shown, N per run
- [`src/features/industry-planner/components/ComponentDrawer.tsx:73-88`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L73-L88) — Same meta line; omits a null activity and an activity equal to the label
- [`src/features/industry-planner/components/planner-contexts.tsx:77-92, 117-119`](../../src/features/industry-planner/components/planner-contexts.tsx#L77-L92) — BuildPlanValue holds every value the fields need; useBuildPlan throws outside the provider
- [`src/features/industry-planner/te-overrides.ts:10-19`](../../src/features/industry-planner/te-overrides.ts#L10-L19) — effectiveTeOf and nodeTeState are pure aliases of the ME versions, so one kind-parameterised hook suffices

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/structure-bonus-readout.tsx:41-59`](../../src/features/industry-planner/components/structure-bonus-readout.tsx#L41-L59) — GemIcon/HourglassIcon in the static 'bonus' state for readouts; not steppers
- [`src/features/industry-planner/components/PlannerRail.tsx:88-94`](../../src/features/industry-planner/components/PlannerRail.tsx#L88-L94) — Hero TypeIcon uses blueprintImage at 112px; the drawer's (ComponentDrawer.tsx:89-95) uses nodeImage at 64px, so there is nothing shared beyond the className

</details>

**Home.** `src/features/industry-planner/components/MeAdjuster.tsx (slimmed MeField/TeField/NodeAdjusters, exported StepperRow and EfficiencyStepperRows); src/features/industry-planner/components/BlueprintMetaLine.tsx`

**Boundary check.** Everything stays inside one autoDiscovered features zone (src/features/industry-planner), so the imports are intra-zone. MeAdjuster.tsx will import './planner-contexts', whose imports are type-only from ../ modules and never import MeAdjuster, so no circular dependency. NodeAdjusters renders inside NodeCard's Popover portal under the PlannerContextProviders tree, and portals preserve context.

**API sketch.**

```ts
// MeAdjuster.tsx
export function StepperRow(props: { icon: ReactNode; children: ReactNode }): JSX.Element; // moved from PlannerRail (size-3.5 icon, gap-2.5)
export function MeField(props: { blueprintTypeId: number; name: string; boxed?: boolean }): JSX.Element; // reads useBuildPlan(); boxed renders <StepperRow icon={<GemIcon state/>}>
export function TeField(props: { blueprintTypeId: number; name: string; boxed?: boolean }): JSX.Element;
export function EfficiencyStepperRows(props: { blueprintTypeId: number; name: string }): JSX.Element; // <><MeField boxed/><TeField boxed/></>
export function NodeAdjusters(props: { blueprintTypeId: number; name: string }): JSX.Element;
// internal: const KIND = { me: { glyph: 'me', ariaUnit: 'material efficiency', max: MAX_ME, pick: (p: BuildPlanValue) => [p.ownedMe, p.meOverrides, p.setMeOverride, p.resetMeOverride] }, te: {...} }
// BlueprintMetaLine.tsx
export function BlueprintMetaLine(props: { group: string; activity: string | null; perRun: number }): JSX.Element; // omits empty group, null activity, activity === group
```

**Migration steps.**

1. In MeAdjuster.tsx, add a private useEfficiency(kind, blueprintTypeId) that reads useBuildPlan() and returns { d, onCommit, onRevert }. Rewrite MeField/TeField to take { blueprintTypeId, name, boxed } and delete the MeProps/TeProps interfaces. Keep the private renderer named EfficiencyField.
2. Move StepperRow from PlannerRail.tsx:157-167 into MeAdjuster.tsx and export it. In boxed mode, wrap the field in StepperRow with its own ToneGlyph from d.state. Keep the inline (!boxed) 12px icon path for NodeAdjusters.
3. Add EfficiencyStepperRows (a fragment of boxed ME and TE). In ComponentDrawer.tsx Steppers, keep the isEfficiencyEligible guard and render <div className='flex flex-col gap-2.5'><EfficiencyStepperRows blueprintTypeId={bp} name={sheet.name}/></div>. Remove the GemIcon/HourglassIcon/nodeMeState/nodeTeState imports.
4. In PlannerRail.tsx BuildSteppers, render {manufacturing && <EfficiencyStepperRows blueprintTypeId={id} name='main blueprint'/>} followed by the runs <StepperRow> imported from MeAdjuster. Drop useBuildPlan and the nodeMeState/nodeTeState/GemIcon/HourglassIcon imports there.
5. Slim NodeAdjusters to { blueprintTypeId, name }. In CockpitBuildPlan.tsx:170-208, remove setMeOverride/resetMeOverride/setTeOverride/resetTeOverride from the destructure and pass two props.
6. Add BlueprintMetaLine.tsx using the drawer's omission rules. Use it in PlannerRail BlueprintIdentity (group from buildNodeDisplay, activity=activityLabel(structure.activityId), perRun=product.quantityPerRun) and ComponentDrawer Identity (group=sheet.label, activity=sheet.activityId===null?null:activityLabel(...), perRun=sheet.batch).
7. Check that coverage.test.ts:60,84-88 still resolves MeField/TeField/NodeAdjusters, then run test-runner `pnpm check`.

**Tests.** Add MeAdjuster.test.ts with './planner-contexts' mocked (the pattern in PlannerRail.test.ts:21-31). Cover: MeField shows override ?? owned ?? 0; the state tone is 'manual' when overridden and 'owned' when owned > 0; the ↺ button appears only when overridden and calls resetMeOverride(bp); TeField caps at MAX_TE 20; boxed mode renders exactly one icon; NodeAdjusters renders both rows from two props. Add BlueprintMetaLine.test.ts for an empty group, a null activity and an activity equal to the group. Existing guards: PlannerRail.test.ts:69 ('1 per run'), ComponentDrawer.test.ts:108 ('2 per run'), IndustryGlyph.test.ts:15-17 (icons), coverage.test.ts pins. Both component tests mock './planner-contexts', which also intercepts MeAdjuster's new import.

**Notes.** Preserve: boxed vs inline Stepper variants and reserveTrailing; the stopPropagation wrapper (keep it around the stepper only, so the icon stays outside it as today); manufacturing-only ME/TE in the rail versus isEfficiencyEligible in the drawer (callers keep their guards); aria labels '{name} material efficiency' / '{name} time efficiency' with name 'main blueprint' in the rail. Today's markup has the icon span aria-hidden in StepperRow; keep that. Meta-line drift: the drawer's rules are correct, and the rail's unconditional activity is safe only by accident. The fields now require the PricingProvider, which every current call site already sits under, because the callers already call useBuildPlan.

<sub>Reported by: area:industry-planner.</sub>

<a id="p026"></a>

## P026: Share the cockpit's ledger column head and item name stack inside industry-planner

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -24 lines at the call sites and +40 in the new file plus test. Net source grows by about 15 lines. The gain is one definition shared by two views.
- **Depends on:** —

**Problem.** The raw-materials ledger and the build-plan tier columns render the same column head: an uppercase eyebrow label, a faint '· N' count, a dotted leader rule and an ISK LivePrice total. Each re-types the same class strings, and only the tier version adds container-query collapse. The two-line item name (line-clamp-2 name over an uppercase truncate label) is also re-typed in the ledger row and in NodeCard. A style change to either part has to be made twice or the two cockpit views drift apart.

**Verifier revision.** The duplication is real. Both column headers use identical classes for the eyebrow label, the '· count' faint span, the dotted leader rule, and the LivePrice total (text-ui font-semibold tracking-normal text-isk, pending=refreshing). The name/label stack in the raw ledger and NodeCard is class-for-class identical. Two parts of the proposal had to change. (1) ItemNameStack needs a className prop: NodeCard's wrapper also carries 'relative z-10 pointer-events-none [grid-area:name]'. (2) The narrow-collapse classes must stay opt-in. @max-[14rem] resolves against the nearest @container ancestor. TierColumn declares one, but the raw ledger column (CSS columns-[260px]) does not, so applying the classes there unconditionally could bind to an outer container. Payoff is low. The value is keeping the two cockpit views visually in lockstep, not line count.

**Sites (4).**

- [`src/features/industry-planner/components/CockpitRawLedger.tsx:44-56`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L44-L56) — CategoryColumn header: label, '· {rows.length}', dotted leader, LivePrice(formatIsk(total)). Outer uses gap-2.
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:134-147`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L134-L147) — TierColumn: @container wrapper, header with the same classes plus @max-[14rem]:flex-col/items-start and a hidden leader. Label and count are wrapped in an inner span. Outer uses gap-x-2.
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:64-71`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L64-L71) — Name/label stack: 'flex min-w-0 flex-col gap-px' wrapper, name 'line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name', label 'truncate font-data text-label uppercase tracking-label text-muted'.
- [`src/features/industry-planner/components/NodeCard.tsx:274-281`](../../src/features/industry-planner/components/NodeCard.tsx#L274-L281) — Same stack. The wrapper also has 'relative z-10 pointer-events-none [grid-area:name]'.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/ComponentDrawer.tsx:152-156`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L152-L156) — InputRow name/label: a single-line truncate name, gap-0.5 and a conditional label. This is a deliberately denser drawer-list design, not the card stack.
- [`src/features/industry-planner/components/MultibuyPanel.tsx:117-126`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L117-L126) — 'Tier N · n types' is a checkbox label with no leader rule or total. Different concept.
- [`src/features/industry-planner/components/FeeBreakdownPanel.tsx:94`](../../src/features/industry-planner/components/FeeBreakdownPanel.tsx#L94) — An inline '· count' inside a sentence. Not a column head.

</details>

**Home.** `src/features/industry-planner/components/ledger-parts.tsx (new file holding both LedgerColumnHead and ItemNameStack)`

**Boundary check.** Home and all three consumers (CockpitRawLedger, CockpitBuildPlan, NodeCard) are in the features/industry-planner zone, discovered by autoDiscover over src/features, so these are intra-zone imports. The new file imports '@/components/ui/live-price' and '@/components/ui/cn' (zone ui) and '@/lib/format/isk' (zone lib). Both are in the features rule's allow list ("lib", "config", "ui", "components" among others). No new cross-zone edge.

**API sketch.**

```ts
export function LedgerColumnHead(props: { label: ReactNode; count: number; total: number; pending: boolean; /** stack total under label in a narrow @container column; caller must sit inside an @container */ collapseNarrow?: boolean }): JSX.Element
export function ItemNameStack(props: { name: string; label: ReactNode; className?: string }): JSX.Element
```

**Migration steps.**

1. Create src/features/industry-planner/components/ledger-parts.tsx. LedgerColumnHead renders the outer div 'mb-2 flex items-center gap-x-2 whitespace-nowrap text-label font-semibold uppercase tracking-eyebrow text-muted', plus '@max-[14rem]:flex-col @max-[14rem]:items-start' when collapseNarrow. Inside go an inner span 'flex items-center gap-2' with the label and <span className="text-faint">· {count}</span>, then the leader span 'h-0 flex-1 border-b border-dotted border-border-idle' (+ '@max-[14rem]:hidden' when collapseNarrow), then <LivePrice value={formatIsk(total)} pending={pending} className="text-ui font-semibold tracking-normal text-isk"/>.
2. In the same file add ItemNameStack: <div className={cn('flex min-w-0 flex-col gap-px', className)}> containing the two spans, with classes copied verbatim from CockpitRawLedger.tsx:65-69.
3. CockpitBuildPlan.tsx: replace lines 136-147 with <LedgerColumnHead label={`Tier ${tier.depth}`} count={tier.items.length} total={subtotal} pending={refreshing} collapseNarrow/>. Keep the '@container min-w-0' wrapper at line 134 and the comment at line 135.
4. CockpitRawLedger.tsx: replace lines 47-56 with <LedgerColumnHead label={group.label} count={group.rows.length} total={group.total} pending={refreshing}/>. Replace the name prop at lines 64-71 with <ItemNameStack name={row.name} label={row.unitBuy !== null ? `${formatIsk(row.unitBuy)} / unit` : 'no price'}/>.
5. NodeCard.tsx: replace lines 274-281 with <ItemNameStack className="relative z-10 pointer-events-none [grid-area:name]" name={name} label={label}/>. Keep it as the third child so the test's children[0] button lookup still holds.
6. Delete the now-unused LivePrice import from CockpitBuildPlan.tsx if nothing else uses it there (formatIsk is still used nowhere else in that file, so check). Then run pnpm check through test-runner.

**Tests.** Add ledger-parts.test.ts, rendering with renderToStaticMarkup. Check that count and formatted ISK appear. Check that the '@max-[14rem]' classes appear only with collapseNarrow. Check that ItemNameStack merges className and keeps line-clamp-2/truncate. Existing guards: NodeCard.test.ts (asserts card.props.children[0] is the Button, so child order must not change) and src/features/industry-planner/coverage.test.ts (imports and renders CockpitRawLedger and CockpitBuildPlan).

**Notes.** Two differences must be reconciled. The raw header puts label and count as direct flex children with gap-2. The tier header wraps them in an inner span and uses gap-x-2, so the stacked (flex-col) state has no vertical gap. Use the tier shape for both: with whitespace-nowrap on a single row, gap-x-2 and gap-2 render identically, so the ledger output does not change. Do not apply the collapse classes by default (see reason). Optional follow-up: the eyebrow cva in src/components/ui/type-roles.ts covers 'uppercase text-label text-muted font-semibold tracking-eyebrow', but it also adds font-ui, which these headers do not set today. Adopt it only after a visual check. ComponentDrawer's Stat/StatFigure belongs to the StatTile opportunity, per the input.

<sub>Reported by: area:industry-planner.</sub>

<a id="p168"></a>

## P168: Build StructureFactors in one place from a per-job bonus function, with bestOf in structure-bonus

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +22; net about -5, with the factor formula defined once
- **Depends on:** [P098](wave-04-formatting-dates-and-names-have-one-home.md#p098)
- **Existing primitive:** `src/features/industry-planner/structure-factors.ts:bestOf`

**Problem.** Two producers of StructureFactors re-implement the same assembly: per-blueprint ME/TE factor closures (1 - bonus/100), the cost bonus taken from the top job, per-activity readouts as the per-metric max over that activity's jobs, and the active flag. A change to any of these rules (for example, how cost bonus or readouts are chosen) has to be made twice, and the compiler does not catch a mismatch. headlineStructureBonus also hand-writes the per-metric max that bestOf already implements.

**Verifier revision.** The core holds up. structureFactorsFor (single-structure mode) and profilePlan (profile mode) both turn a per-blueprint StructureBonus into the same StructureFactors object, and use-planner-profile.ts:181 swaps one for the other in the same slot. They share the `1 - pct/100` closures, take the cost bonus from the top blueprint, build per-activity readouts as bestOf over that activity's jobs, and set `active` the same way. bestOf also repeats headlineStructureBonus's per-metric max (fallow semantic group 75b23a49, structure-bonus.ts:68-72 vs structure-factors.ts:79-83). The design needs one change. The proposed `emptyWhenNoReadouts` option is unnecessary because the NO_STRUCTURE_FACTORS early return gives the same result as profilePlan's `active` computation. When both readouts are null, every production job's bonus is null, and so are non-production and unknown blueprints, so the closures already give factor 1 and cost 0. Only the headline fallback is a real behaviour difference, and it is intentional: a profile has many facilities and no single headline. The payoff is low, because TypeScript already guards the interface shape and only the formula semantics can drift.

**Sites (6).**

- [`src/features/industry-planner/structure-factors.ts:76-84`](../../src/features/industry-planner/structure-factors.ts#L76-L84) — bestOf: per-metric Math.max, null on empty
- [`src/features/industry-planner/structure-factors.ts:111-157`](../../src/features/industry-planner/structure-factors.ts#L111-L157) — structureFactorsFor: memoised bonusOf (129-137), bestFor with headline fallback (140-144), NO_STRUCTURE_FACTORS early return (147), closures and cost from top (149-156)
- [`src/features/industry-planner/profiles/profile-plan.ts:112-165`](../../src/features/industry-planner/profiles/profile-plan.ts#L112-L165) — profilePlan: routeAndFactor memo (121-135), readout via bestOf with no fallback (140-147), same closures and cost from top (150-157)
- [`src/features/industry-planner/structure-bonus.ts:59-73`](../../src/features/industry-planner/structure-bonus.ts#L59-L73) — headlineStructureBonus: the same per-metric max inline over a never-empty candidate list
- [`src/features/industry-planner/components/use-planner-profile.ts:165-184`](../../src/features/industry-planner/components/use-planner-profile.ts#L165-L184) — consumer swaps profile.plan.structureFactors for location.structureFactors, so both must mean the same thing
- [`src/features/industry-planner/components/PricingProvider.tsx:188-198`](../../src/features/industry-planner/components/PricingProvider.tsx#L188-L198) — structureFactorsFor caller inside useMemo

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/profiles/profile-plan.ts:73-93`](../../src/features/industry-planner/profiles/profile-plan.ts#L73-L93) — better() and bestFacility pick one facility in lexicographic order (ME, then TE, then cost). That is a different rule from bestOf's per-metric max and must not be merged with it.
- [`src/features/industry-planner/build-batch.ts:111, 132, 168, 259, 309-314`](../../src/features/industry-planner/build-batch.ts#L111) — These consume structureMeFactorOf with a default of () => 1. They are consumers, not producers of factors.

</details>

**Home.** `src/features/industry-planner/structure-factors.ts gets structureFactorsFrom. bestOf and a private maxEach move to src/features/industry-planner/structure-bonus.ts.`

**Boundary check.** All files are in the auto-discovered features zone (src/features/industry-planner), so every import is intra-zone and needs no boundaries rule. profile-plan.ts already imports structure-bonus.ts and structure-factors.ts. structure-bonus.ts imports only data/eve-data/security and ./api-contract, and nothing from structure-factors, so moving bestOf there creates no cycle.

**API sketch.**

```ts
// structure-bonus.ts
export function bestOf(bonuses: readonly StructureBonus[]): StructureBonus | null; // null for []
// headlineStructureBonus: filterSets.reduce((best, ids) => maxEach(best, computeStructureBonus({...input, filterIds: ids})), computeStructureBonus({...input, filterIds: []}))

// structure-factors.ts
export function structureFactorsFrom(args: {
  bonusOf: (blueprintTypeId: number) => StructureBonus | null; // caller memoises
  nodeActivityByBlueprint: Record<number, number>;
  topBlueprintTypeId: number;
  /** Readout for an activity with no job in the build; null when omitted. */
  readoutWithoutJobs?: (activity: IndustryActivityId) => StructureBonus | null;
}): StructureFactors;
```

**Migration steps.**

1. In structure-bonus.ts, add a private maxEach(a, b) and an exported bestOf(bonuses) that returns null for [] and otherwise bonuses.reduce(maxEach). Rewrite headlineStructureBonus as a reduce seeded with the hull-only bonus (filterIds: []), so it needs no null check or non-null assertion.
2. Delete bestOf from structure-factors.ts and import it from ./structure-bonus.
3. In structure-factors.ts, add structureFactorsFrom. For each activity, readout = (jobs of that activity are empty) ? (readoutWithoutJobs?.(activity) ?? null) : bestOf(jobs.flatMap(bp => bonusOf(Number(bp)) ?? [])). If both readouts are null, return NO_STRUCTURE_FACTORS. Otherwise return the ME/TE closures, structureCostBonusPct = bonusOf(top)?.costBonus ?? 0, both readouts, and active: true.
4. Rewrite structureFactorsFor to keep routeHosts, the hosts map and the memoised bonusOf, then return structureFactorsFrom({ bonusOf, nodeActivityByBlueprint, topBlueprintTypeId, readoutWithoutJobs: (a) => bonusFor(hosts[a].structure, a, hosts[a].security, 'headline') }). Delete bestFor and the inline closures.
5. Rewrite profilePlan to set structureFactors: structureFactorsFrom({ bonusOf: (bp) => routeAndFactor(bp).bonus, nodeActivityByBlueprint, topBlueprintTypeId: args.topBlueprintTypeId }). Delete the readout helper and the inline closures. Keep `top`, which ProfilePlan.top still needs, and drop the bestOf import.

**Tests.** Existing guards that must pass unchanged: structure-factors.test.ts, including the no-job headline-fallback cases and the omitted-vs-null reaction-structure case around line 351, and profile-plan.test.ts lines 116-135 (per-job factors, cost from top job, readouts). Add to structure-bonus tests: bestOf([]) is null, bestOf takes the max per metric across mixed bonuses, and headlineStructureBonus with no filterSets equals the hull-only bonus. Add to profile-plan.test.ts: a profile that covers no production job yields active false, factor 1 and cost 0, which pins the NO_STRUCTURE_FACTORS equivalence.

**Notes.** Profile-mode readouts for an activity with no job stay null, and must not fall back to a headline: a profile has many facilities and no single structure. Station facilities return NO_BONUS ({0,0,0}), which is non-null, so the profile shows active true with zero bonuses; keep that. profilePlan may now return the shared NO_STRUCTURE_FACTORS constant when nothing is covered. The values are identical, and the reference is more stable for downstream memo dependencies. Both callers must keep their own memoisation: structureFactorsFor's Map, and profilePlan's routes Map, which also caches the skill factor. No drift bug was found between the two copies.

<sub>Reported by: area:industry-planner.</sub>

<a id="p070"></a>

## P070: Seed blueprint adjusted prices once per planner, read system cost indices through costIndicesEndpoint, and retire the build-location endpoint

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** efficiency · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** high · **Size:** About -110 net (use-component-fee-sources -40, location-writes -12, composeFeeInputs -5, the build-location contract, types, route and getBuildLocation -60, stations query -15; plus about 25 for the cached read, seeder generalisation and readCostIndices)
- **Depends on:** [P168](#p168), [P185](wave-01-quick-wins-delete-dead-code-fix-small.md#p185), [P098](wave-04-formatting-dates-and-names-have-one-home.md#p098)
- **Existing primitive:** `src/data/industry-indices/queries.ts:getAdjustedPrices; src/features/industry-planner/api-contract.ts:costIndicesEndpoint`

**Problem.** Adjusted prices depend only on the blueprint, but the planner fetches them through a per-system endpoint and keeps up to three identical copies. The build-system applier stores them on SelectedLocation, the reaction read on ReactionLocationSnapshot, and use-component-fee-sources gets them through a build-location read for an arbitrary component system, keyed `${blueprintTypeId}:${priceSystemId}`. composeFeeInputs then chooses among location, reactionLocation and components. With a profile, the build read and the price read fire together at mount, so the server resolves the same price set two or three times. The build-location response also carries stations, which no client code reads, so getIndustryStationsForSystem runs on every call for nothing. The three reads repeat the same readWithRetries(apiFetch(buildLocationEndpoint …)) body and the same `new Map(adjustedPrices.map(...))` conversion.

**Verifier revision.** Confirmed: every planner build-location read sends `blueprintId: structure.blueprintTypeId`, and getBuildLocation derives adjustedPrices from blueprintId alone (getBlueprintStructure, then collectTreeTypeIds, then getAdjustedPrices). So location.adjustedPrices, reactionLocation.adjustedPrices and readPrices' map are always the same set. composeFeeInputs merges identical maps, and readPrices picks a priceSystemId only so it has a system to send. At mount, needAdjustedPrices (`!location && !reactionLocation`) is true, so readPrices runs alongside the build read and its answer is discarded once location lands. The finder missed one point that widens the scope: SelectedLocation.stations is written (use-planner-location-writes L50) and never read anywhere. A repo-wide search over planner-contexts/SelectedLocation consumers finds no reader. So every build-location call also runs getIndustryStationsForSystem for nothing. What the planner actually uses from build-location is cost indices, which costIndicesEndpoint already serves in batches, plus blueprint-scoped adjusted prices. The efficiency gain per request is modest (getBlueprintStructure is 'use cache' max; the extra DB queries are small): one to two fewer POSTs per planner open with a profile, and no dead stations query. The simplification gain is large.

**Sites (15).**

- [`src/features/industry-planner/components/use-planner-location-writes.ts:33-55`](../../src/features/industry-planner/components/use-planner-location-writes.ts#L33-L55) — applier fetch body L36-44; SelectedLocation built at L46-53 with the never-read stations (L50) and adjustedPrices Map (L52)
- [`src/features/industry-planner/components/use-planner-location-writes.ts:71-97`](../../src/features/industry-planner/components/use-planner-location-writes.ts#L71-L97) — reaction read: same fetch body (L75-82); uses only costIndices.reaction and adjustedPrices (L89-92)
- [`src/features/industry-planner/components/use-component-fee-sources.ts:24-28, 63-73, 95-113, 122, 126`](../../src/features/industry-planner/components/use-component-fee-sources.ts#L24-L28) — ReadPrices type; priceSystemId/priceKey exist only to obtain prices; a third copy of the fetch; the adjustedPriceOf gate; pricesStatus feeds failed/pending
- [`src/features/industry-planner/components/PricingProvider.tsx:300-302`](../../src/features/industry-planner/components/PricingProvider.tsx#L300-L302) — needAdjustedPrices = !location && !reactionLocation, true at mount
- [`src/features/industry-planner/components/PricingProvider.tsx:86-114, 663-667`](../../src/features/industry-planner/components/PricingProvider.tsx#L86-L114) — existing PricingSeeder/HistorySeeder pattern: use(promise) inside Suspense, then onSeed
- [`src/features/industry-planner/structure-factors.ts:184-218`](../../src/features/industry-planner/structure-factors.ts#L184-L218) — composeFeeInputs: adjustedPriceOf at L206-211 merges location, reactionLocation and components
- [`src/features/industry-planner/queries.ts:262-287`](../../src/features/industry-planner/queries.ts#L262-L287) — getBuildLocation: prices from blueprintId; stations query at L271
- [`src/data/industry-indices/queries.ts:37-49`](../../src/data/industry-indices/queries.ts#L37-L49) — getAdjustedPrices(typeIds) takes no system
- [`src/features/industry-planner/components/planner-contexts.tsx:21-28`](../../src/features/industry-planner/components/planner-contexts.tsx#L21-L28) — SelectedLocation.stations (never read) and adjustedPrices
- [`src/features/industry-planner/selection-policy.ts:5-10`](../../src/features/industry-planner/selection-policy.ts#L5-L10) — ReactionLocationSnapshot.adjustedPrices, the second copy
- [`src/features/industry-planner/build-system-apply.ts:1-47`](../../src/features/industry-planner/build-system-apply.ts#L1-L47) — applier typed on BuildLocationData
- [`src/features/industry-planner/api-contract.ts:43-75, 77-101`](../../src/features/industry-planner/api-contract.ts#L43-L75) — build-location schemas and endpoint; costIndicesEndpoint (POST systemIds, batched, max 64)
- [`src/features/industry-planner/types.ts:91-103`](../../src/features/industry-planner/types.ts#L91-L103) — IndustryStationView and BuildLocationData, used only by this path
- [`src/app/api/industry/build-location/route.ts:1-20`](../../src/app/api/industry/build-location/route.ts#L1-L20) — route to retire
- [`src/app/(site)/industry/[id]/page.tsx:76-107`](../../src/app/%28site%29/industry/[id]/page.tsx#L76-L107) — the page already passes cached promises (pricingPromise, historyPromise) to PricingProvider

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/use-component-fee-sources.ts:75-94`](../../src/features/industry-planner/components/use-component-fee-sources.ts#L75-L94) — the cost-indices read for component systems is legitimately per system and already uses costIndicesEndpoint; it stays
- [`src/data/industry-indices/queries.ts:51-71`](../../src/data/industry-indices/queries.ts#L51-L71) — getAveragePrices/getAdjustedPrice are unrelated reads

</details>

**Home.** `Server: getBlueprintAdjustedPrices in src/features/industry-planner/queries.ts. Client: one adjustedPriceOf in PricingProvider.tsx, plus a feature-local readCostIndices(systemIds, signal) in src/features/industry-planner/components/ (next to use-component-fee-sources)`

**Boundary check.** All changes stay inside the features/industry-planner zone and its app routes. queries.ts already imports data/industry-indices (getAdjustedPrices) through the features rule, which allows data. app/(site)/industry/[id]/page.tsx is in zone app, whose rule allows features, so it can import getBlueprintAdjustedPrices just as it imports getBlueprintPricing. src/app/api/industry/cost-indices/route.ts is in zone api, whose rule allows features. Deleting the build-location route also removes an api-to-features import. No new cross-zone edges.

**API sketch.**

```ts
// queries.ts (server)
export async function getBlueprintAdjustedPrices(blueprintId: number): Promise<{ typeId: number; adjustedPrice: number }[]> { 'use cache'; cacheLife('hours'); cacheTag(BLUEPRINT_STRUCTURE_TAG); /* getBlueprintStructure -> dedupe(collectTreeTypeIds(tree)) -> getAdjustedPrices */ }
// PricingProvider props
adjustedPricesPromise: Promise<{ typeId: number; adjustedPrice: number }[]>
// generic seeder replacing PricingSeeder/HistorySeeder
function PromiseSeeder<T>({ promise, onSeed }: { promise: Promise<T>; onSeed: (v: T) => void }): null
// client
function readCostIndices(systemIds: number[], signal: AbortSignal): Promise<Map<number, SystemJobCostIndex> | null>  // readWithRetries(apiFetch(costIndicesEndpoint …))
composeFeeInputs(args: { adjustedPriceOf: (id: number) => number | null; location: { costIndices: {...} } | null; reactionLocation: { costIndex: number | null } | null; ... })
```

**Migration steps.**

1. Server: add getBlueprintAdjustedPrices to queries.ts using 'use cache' with cacheLife('hours'). Adjusted prices are rewritten daily by cron:industry-indices, which revalidates no tag, so cap staleness like getBlueprintPricing does. Wrap it in withColdStartRetry and return [] on a missing structure.
2. page.tsx: create `const adjustedPricesPromise = getBlueprintAdjustedPrices(id)` next to pricingPromise and pass it to PricingProvider.
3. PricingProvider: generalise PricingSeeder/HistorySeeder (L86-114) into one PromiseSeeder<T>; this third use is what justifies it. Seed the adjusted prices into a `Map<number, number> | null` state and derive one `adjustedPriceOf`.
4. Add the feature-local readCostIndices(systemIds, signal), built from the body in use-component-fee-sources L77-89. Use it in the component read, in the applier (use-planner-location-writes L36-44, returning bySystem.get(systemId)) and in the reaction read (L75-82).
5. Retype build-system-apply.ts from BuildLocationData to SystemJobCostIndex. SelectedLocation drops stations and adjustedPrices; ReactionLocationSnapshot drops adjustedPrices.
6. use-component-fee-sources: delete priceSystemId, priceKey, ReadPrices, readPrices, readPricesEnabled and pricesStatus, plus the needAdjustedPrices parameter. Remove adjustedPriceOf from ComponentFeeInputs, so failed and pending come from indices alone. Drop the fourth argument at PricingProvider L300-302.
7. composeFeeInputs: take a single `adjustedPriceOf` argument and remove the location/reactionLocation/components fallback (L206-211). Keep the early `return undefined` when no location, reaction or components exist.
8. Delete the build-location path: buildLocationEndpoint, buildLocationRequestSchema, buildLocationResponseSchema and industryStationViewSchema (api-contract.ts L43-75); BuildLocationData and IndustryStationView (types.ts L91-103); getBuildLocation (queries.ts L262-287); src/app/api/industry/build-location/route.ts; 'resolve-build-location' in data/telemetry/capability.ts L60; the industryBuildLocationRoute entry in composition/__tests__/idempotency-registry.ts L375-378; and getIndustryStationsForSystem (data/eve-data/queries.ts L319) once fallow reports it unused. Update queries.db.test.ts and coverage.test.ts references.

**Tests.** Rewrite structure-factors.test.ts composeFeeInputs cases L465+ ('uses independent component prices…', 'composes the mfg keys from the build location…', 'routes the reaction-slot fetch…') to pass adjustedPriceOf directly; build-pricing.test.ts L652 does the same. In use-component-fee-sources.test.ts, delete L184-L190 (prices read and its failure, current-blueprint price keying) and keep the index tests L62-L129. use-planner-location-writes.test.ts L70-L167 must mock costIndicesEndpoint instead of buildLocationEndpoint, keeping 'the system priced until now stays while the next is read' and the reaction snapshot reuse. build-system-apply.test.ts needs only a type change. Add a queries.db.test.ts case: getBlueprintAdjustedPrices returns the tree's type ids priced and skips null adjusted prices. Extend PricingProvider.test.ts so fees use the seeded prices before any location read lands.

**Notes.** Behaviour to preserve. (1) Fees still appear only once a system's cost index is read: location stays null until the applier answers, and a failed read still sets failureSystemId and clears location. (2) The applier's supersede/abort semantics (build-system-apply L24-46) are unchanged; only its payload type changes. (3) Today, with a profile that has component systems but no build system, `failed` can come from the price read. After the change it comes only from the cost-index read. That is intended, since prices no longer fail on the client, but PricingProvider's failure notice copy and tests must agree. (4) A use() of the adjusted-price promise must never reject into an error boundary: return [] on failure inside the cached function. (5) The reaction read today sends structure.blueprintTypeId, not a reaction-specific blueprint, so its price map really was identical to the build map. No drift bug, only waste. (6) If the team prefers not to seed, the fallback is a GET endpoint keyed by blueprintId with one client read in PricingProvider. Seeding is better because it needs no request at all.

<sub>Reported by: area:industry-planner, concern:efficiency.</sub>

<a id="p291"></a>

## P291: Resolve the batch ledger and marginal demand once per assemblePricing call

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -15 / +10 in source, plus mechanical test renames
- **Depends on:** [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304), [P076](wave-12-market-data-search-and-client-data-reads.md#p076)

**Problem.** assemblePricing derives the same build quantities twice. On the marginal basis, computeMarginalMaterials (resolveCostBills) and computeMarginalRuns (componentJobFees) each run marginalDemand with identical arguments. On the batched basis without a supplied ledger, computeBatchMaterials and computeBatchLedger each build the same ledger. CostBill already carries runs, meOpts and an optional ledger, so componentJobFees recomputes data that resolveCostBills already had.

**Verifier revision.** The efficiency claim does not hold at realistic sizes. flattenRecipes only descends into the first occurrence of each typeId, so a flatten costs about (unique recipes × inputs), a few thousand operations even for a capital-ship tree. assemble runs a handful of times per page (once per price batch and once per debounced input change). React rendering dwarfs the extra flattens. Server-side callers in queries.ts sit behind 'use cache', and the PricingProvider callers (collectRawTypeIds, collectBlueprintTypeIds, computeBatchLedger) are already in useMemo keyed on structure. So the module-level WeakMap cache is rejected: it adds hidden mutable module state keyed on array identity and buys nothing measurable. What remains is a plain simplification. In one assemblePricing call, resolveCostBills runs marginalDemand(tree, runs, meOpts) for the marginal bill. Then componentJobFees runs it again with identical (bill.runs, bill.meOpts) on the marginal basis, which is the preference default (src/lib/preferences.ts:27-31). The batched branch has the same split: resolveCostBills uses `opts.ledger ? … : computeBatchMaterials(...)` and componentJobFees uses `bill.ledger ?? computeBatchLedger(...)`, both deriving the same ledger. Resolve each once on the CostBill.

**Sites (6).**

- [`src/features/industry-planner/build-batch.ts:159-204`](../../src/features/industry-planner/build-batch.ts#L159-L204) — marginalDemand returns { raws, runs }. computeMarginalMaterials keeps raws and computeMarginalRuns keeps runs, so each caller throws half the result away.
- [`src/features/industry-planner/build-pricing.ts:237-267`](../../src/features/industry-planner/build-pricing.ts#L237-L267) — resolveCostBills: marginal materials at 252-255, ledger-or-computeBatchMaterials at 248-250, CostBill stores an optional ledger.
- [`src/features/industry-planner/build-pricing.ts:147-166`](../../src/features/industry-planner/build-pricing.ts#L147-L166) — componentJobFees: computeMarginalRuns at 155 (second marginalDemand), `bill.ledger ?? computeBatchLedger(...)` at 157.
- [`src/features/industry-planner/build-pricing.ts:227-235`](../../src/features/industry-planner/build-pricing.ts#L227-L235) — CostBill shape to extend.
- [`src/features/industry-planner/components/PricingProvider.tsx:313-334`](../../src/features/industry-planner/components/PricingProvider.tsx#L313-L334) — assemble passes ledger, meOf, structureMeFactorOf and basis (default 'marginal'), so on the client the marginal path is the one that repeats.
- [`src/features/industry-planner/components/PricingProvider.tsx:384-390`](../../src/features/industry-planner/components/PricingProvider.tsx#L384-L390) — onBatch → assemble per refreshed price batch.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/build-batch.ts:9-25,89-103`](../../src/features/industry-planner/build-batch.ts#L9-L25) — flattenRecipes/recipeHeights are cheap, bounded by unique recipes. A WeakMap cache is rejected as unmeasurable gain plus hidden module state.
- [`src/features/industry-planner/queries.ts:113-185,197-230`](../../src/features/industry-planner/queries.ts#L113-L185) — Server callers are inside 'use cache' (cacheLife max/hours), so the extra flattens there are paid once per cache fill.
- [`src/features/industry-planner/components/PricingProvider.tsx:225-242,450-453`](../../src/features/industry-planner/components/PricingProvider.tsx#L225-L242) — collectRawTypeIds/collectBlueprintTypeIds/computeBatchLedger are already useMemo'd on structure/runs/meOpts.
- [`src/features/industry-planner/component-sheet-view.ts:67-78`](../../src/features/industry-planner/component-sheet-view.ts#L67-L78) — componentJob flattens once per drawer open, a user-driven action unrelated to assemble.
- [`src/features/industry-planner/components/MultibuyPanel.tsx:45`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L45) — computeMultibuyDemand is a separate computation (owned/buildSet netting), not a repeat.

</details>

**Home.** `Feature-internal: src/features/industry-planner/build-batch.ts (computeMarginalDemand) and src/features/industry-planner/build-pricing.ts (CostBill).`

**Boundary check.** Both files are in the features zone (autoDiscover src/features → industry-planner). The import from build-pricing.ts to ./build-batch is intra-feature. No new cross-zone import; build-batch.ts keeps importing only the TreeNode type from data/eve-data (features → data allowed).

**API sketch.**

```ts
// build-batch.ts
export interface MarginalDemand { materials: { typeId: number; quantity: number }[]; runs: Map<number, number> }
export function computeMarginalDemand(tree: TreeNode[], requestedRuns = 1, opts?: MeOptions): MarginalDemand;
// build-pricing.ts
interface CostBill { basis; runs; meOpts; ledger: BatchLedger; marginalRuns: ReadonlyMap<number, number>; rowsCost; buildCost; bases }
```

**Migration steps.**

1. build-batch.ts: rename private marginalDemand to exported computeMarginalDemand and return { materials: rows of raws, runs }.
2. build-batch.ts: delete computeMarginalMaterials and computeMarginalRuns. Migrate their test callers in build-batch.test.ts and build-consolidate.test.ts mechanically (`computeMarginalMaterials(t, r, o)` → `computeMarginalDemand(t, r, o).materials`, `computeMarginalRuns(...)` → `.runs`). Alternatively keep them as one-line wrappers over computeMarginalDemand, provided Fallow accepts test-only exports, as it does for __resetEsiGateForTests.
3. build-pricing.ts resolveCostBills: `const ledger = opts.ledger ?? computeBatchLedger(structure.tree, runs, meOpts)`; batchedMaterials = rows of ledger.raws. Call computeMarginalDemand once, price `.materials` for marginalCost, and store `ledger` (now non-optional) and `marginalRuns: marginal.runs` on the CostBill.
4. build-pricing.ts componentJobFees: runsOf = `bill.basis === 'marginal' ? bill.marginalRuns : new Map([...bill.ledger.builds].map(([t, b]) => [t, b.runs]))`. Drop the computeMarginalRuns and computeBatchLedger fallbacks.
5. Drop now-unused imports (computeMarginalMaterials, computeMarginalRuns, computeBatchMaterials) from build-pricing.ts. computeBatchMaterials stays exported for its tests, or migrate those tests to rawRows of computeBatchLedger.
6. Do not add any WeakMap/module cache.

**Tests.** Guards that already exist: src/features/industry-planner/build-pricing.test.ts:99-116 (marginal summary and linear scaling) and 617-657 (componentJobs on batched vs marginal, runs 0.5 on marginal, totals). src/features/industry-planner/build-batch.test.ts:308+ covers marginal materials. Add one build-pricing test asserting that assemblePricing without opts.ledger produces the same rows and componentJobs as with an explicitly computed ledger.

**Notes.** opts.ledger from PricingProvider is computed from the same runs and ledgerMeOpts that assemble passes as meOf/structureMeFactorOf (PricingProvider.tsx:442-453, 324-331), so always storing the resolved ledger does not change results. computeBatchMaterials is defined as rawRows(computeBatchLedger(...)) (build-batch.ts:147-153), so deriving batched materials from the ledger costs no extra work when none is supplied. The finder's 'third flatten in feeJobs' remains and is harmless. The motivation is removing a recomputation with identical inputs, not speed.

<sub>Reported by: area:industry-planner.</sub>

<a id="p325"></a>

## P325: Share one pricedTypeIds(structure) between server pricing and the client refresh set

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -14 / +10
- **Depends on:** [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304)
- **Existing primitive:** `src/features/industry-planner/build-plan-view.ts:unitPriceMap`

**Problem.** The set of type ids the planner prices (raw materials, the product, and intermediates) is assembled twice: once in the server pricing query and once in the client PricingProvider that drives live refresh and owned-asset reads. The client copy also skips the shared dedupe helper. If either list changes without the other, the server and the live-refresh set will disagree about what gets priced.

**Verifier revision.** Only the priced-type-id set holds up. queries.ts:210-214 (server 'use cache' pricing) and PricingProvider.tsx:229-238 (the client refresh-on-view and owned-asset request set) both build raws + product + intermediates. These are the ids assemblePricing reads, so the two must agree or the client will skip refreshing a type the server prices. PricingProvider also bypasses the existing dedupe primitive (src/lib/array.ts:1-3) with [...new Set]. The rest is rejected. The 'disagreeing' intermediate basis in unitPriceMap (bestSell ?? bestBuy) is the deliberate buy-instead price: ComponentDrawer compares buildPerUnit against it (ComponentDrawer.tsx:210, component-sheet-view.ts:112), and build-plan-view.test.ts:66-69 pins it. Raws at bestBuy (profitability.ts:35) are a cost basis, a different concept. A shared pricedEntries iterator would need a row/intermediate tag to keep that per-kind basis, and it only removes loop scaffolding from two functions that project into different shapes (number versus PriceLite with product override). Hoisting unitPriceMap into MarketDataValue saves one Map build over tens of entries, but forces fixture churn in four test files that construct market data.

**Sites (5).**

- [`src/features/industry-planner/queries.ts:31-36, 210-214`](../../src/features/industry-planner/queries.ts#L31-L36) — priceIds = dedupe([...collectRawTypeIds(tree), product.typeId, ...collectIntermediateTypeIds(...)]) feeds getPrices
- [`src/features/industry-planner/components/PricingProvider.tsx:28, 53, 229-238`](../../src/features/industry-planner/components/PricingProvider.tsx#L28) — toRefresh = [...new Set([...collectRawTypeIds, product.typeId, ...collectIntermediateTypeIds])], used at 265 (owned assets body) and 391/542 (useRefreshOnView)
- [`src/features/industry-planner/build-pricing.ts:84-99, 290-306`](../../src/features/industry-planner/build-pricing.ts#L84-L99) — collectIntermediateTypeIds; assemblePricing reads exactly raws (rows), product and intermediates
- [`src/features/industry-planner/build-batch.ts:1, 27-38`](../../src/features/industry-planner/build-batch.ts#L1) — collectRawTypeIds; build-batch imports only a data type, so build-pricing importing it creates no cycle
- [`src/lib/array.ts:1-3`](../../src/lib/array.ts#L1-L3) — Existing dedupe primitive that PricingProvider bypasses

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/build-plan-view.ts:33-45`](../../src/features/industry-planner/build-plan-view.ts#L33-L45) — unitPriceMap's intermediate bestSell ?? bestBuy is the buy-instead price for build-vs-buy (ComponentDrawer.tsx:210, component-sheet-view.ts:112), pinned by build-plan-view.test.ts:66-69. Intentional, not drift.
- [`src/features/industry-planner/initial-price-map.ts:4-48`](../../src/features/industry-planner/initial-price-map.ts#L4-L48) — Inverse projection into PriceLite with a product override. A shared iterator with unitPriceMap would need a kind tag and saves only loop scaffolding.
- [`src/data/industry-math/profitability.ts:35`](../../src/data/industry-math/profitability.ts#L35) — Raw cost basis (bestBuy); a different concept from the buy-instead price
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:215`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L215) — Duplicate useMemo(unitPriceMap) over tens of entries; negligible cost
- [`src/features/industry-planner/components/ComponentDrawer.tsx:285`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L285) — Same. Moving it into MarketDataValue (planner-contexts.tsx:36-42) would churn CockpitKpis, ComponentDrawer, PlannerRail and PricingProvider test fixtures for no measurable gain.
- [`src/features/industry-planner/build-pricing.ts:101-120`](../../src/features/industry-planner/build-pricing.ts#L101-L120) — buildConfidenceInputs has only a test consumer; F220 owns it
- [`src/features/industry-planner/build-pricing.ts:302-305`](../../src/features/industry-planner/build-pricing.ts#L302-L305) — priceOf called twice per intermediate. A trivial cost; optional tidy only.

</details>

**Home.** `src/features/industry-planner/build-pricing.ts (next to collectIntermediateTypeIds)`

**Boundary check.** The home and both consumers are in the features/industry-planner zone (features autoDiscover). queries.ts:36 and PricingProvider.tsx:53 already import from build-pricing, so the server query and the client component both already load it; it imports only data/industry-math and data/market-prices types and has no 'use client' or server-only marker. The new imports are intra-feature (collectRawTypeIds from './build-batch') and features→lib (dedupe from '@/lib/array'), which the 'features' rule allows (lib).

**API sketch.**

```ts
/** Every type assemblePricing reads: raw materials, the product, then intermediates, deduped in that order. */
export function pricedTypeIds(
  structure: Pick<BlueprintStructure, 'tree' | 'product' | 'buildTree' | 'buildNodeDisplay'>,
): number[];
```

**Migration steps.**

1. Add pricedTypeIds to build-pricing.ts as `dedupe([...collectRawTypeIds(structure.tree), structure.product.typeId, ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay)])`, keeping the current order (raws, product, intermediates).
2. queries.ts: replace 210-214 with `const priceIds = pricedTypeIds(structure);` and drop the now-unused collectIntermediateTypeIds import. Keep collectRawTypeIds (still used at 125) and dedupe (127).
3. PricingProvider.tsx: replace the toRefresh memo body (229-238) with `useMemo(() => pricedTypeIds(structure), [structure])` and drop the collectRawTypeIds and collectIntermediateTypeIds imports (28, 53).
4. Optional tidy in assemblePricing (302-305): read `const p = priceOf(typeId)` once and spread `{ typeId, bestBuy: p?.bestBuy ?? null, ...rowPriceFields(p) }`.

**Tests.** Add describe('pricedTypeIds') in build-pricing.test.ts: it returns raws, the product and intermediates; dedupes when the product or an intermediate repeats; keeps the order. Existing guards: build-pricing.test.ts collectIntermediateTypeIds (145-161), build-batch.test.ts collectRawTypeIds (743-754), PricingProvider.test.ts (refresh typeIds and owned-assets body), coverage.test.ts (getBlueprintPricing).

**Notes.** Both current sites produce the same ids in the same order (dedupe and new Set both keep first occurrence), so this changes no behavior. Keep unitPriceMap's intermediate basis as it is: it is the intended buy-instead price, not a bug. initialPriceMap correctly inverts rowPriceFields: rows.unitBuy is bestBuy via computeBuildCost (build-pricing.ts resolveCostBills → profitability.ts:35), so its `bestBuy: r.unitBuy` is right.

<sub>Reported by: area:industry-planner.</sub>

<a id="p326"></a>

## P326: Trim planner-shell glue: one PromiseSeeder, inline TierRow, CockpitKpis owns its margin mode, ownedTe from mapOwnedBlueprints, shared CostBasis and SystemRef

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -75 / +20
- **Depends on:** [P260](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p260), [P025](#p025), [P301](#p301)
- **Existing primitive:** `src/features/industry-planner/cost-basis-view.ts:CostBasis`

**Problem.** The industry-planner shell has accumulated pass-through layers and repeated type spellings. There are two identical Suspense seeders. TierRow re-declares and forwards all 12 NodeCard props. PlannerRail drills marginMode and setMarginMode into a component that already reads the same context. A memo rebuilds the TE map from the detail map on every fetch, although mapOwnedBlueprints already loops over the blueprints. The 'batched' | 'marginal' union is spelled inline 7 times (6 in the feature, 1 in lib) although CostBasis exists. The system-ref shape is declared twice (SelectedReactionSystem, BuildSystemRef) and spelled inline a third time. A change to any of these has to be made in several places.

**Verifier revision.** Most of the glue is real and behaviour-neutral. PricingSeeder and HistorySeeder differ only in their type. TierRow only forwards props to NodeCard. PlannerRail reads marginMode and setMarginMode only to pass them to CockpitKpis, which already calls usePlannerConfig. ownedTe is re-derived in a memo from ownedDetail, which is always set in the same tick as ownedMe. The cost-basis union is spelled inline 7 times next to an existing CostBasis. The {systemId, systemName, security} shape is declared twice and spelled inline once more. One part is dropped: the routeMember helper. Both lookups are a one-line Array.find on profile.document.members. CockpitKpis returns undefined and ComponentDrawer returns null. The other member lookups (WorkspaceDialogs.tsx:115, ProfileWorkspace.tsx:155) sit in components-composition, and ProfileWorkspace searches a different list (RailMember[]). A helper would add indirection without fixing any drift. The ownedTe item changes shape: keep the two blueprint maps in one state rather than adding a third useState.

**Sites (18).**

- [`src/features/industry-planner/components/PricingProvider.tsx:86-114`](../../src/features/industry-planner/components/PricingProvider.tsx#L86-L114) — PricingSeeder and HistorySeeder: the same use(promise) plus a deferred onSeed effect, differing only in T
- [`src/features/industry-planner/components/PricingProvider.tsx:662-668`](../../src/features/industry-planner/components/PricingProvider.tsx#L662-L668) — The two Suspense-wrapped seeder renders
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:41-86`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L41-L86) — TierRow re-declares the props and forwards them unchanged to NodeCard (its only <NodeCard> call site in production)
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:97-117`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L97-L117) — TierRowSlot, the only TierRow caller; it can render NodeCard directly
- [`src/features/industry-planner/components/PlannerRail.tsx:248-268`](../../src/features/industry-planner/components/PlannerRail.tsx#L248-L268) — Line 257 reads marginMode/setMarginMode only to pass them as props at line 266
- [`src/features/industry-planner/components/CockpitKpis.tsx:309-321`](../../src/features/industry-planner/components/CockpitKpis.tsx#L309-L321) — Takes marginMode/setMarginMode as props while already calling usePlannerConfig() for runs
- [`src/features/industry-planner/components/PricingProvider.tsx:225-258`](../../src/features/industry-planner/components/PricingProvider.tsx#L225-L258) — Separate ownedMe/ownedDetail useState pair, always set together in applyOwnedBlueprints
- [`src/features/industry-planner/components/PricingProvider.tsx:426-441`](../../src/features/industry-planner/components/PricingProvider.tsx#L426-L441) — usePlannerLedger takes ownedDetail only to memo-derive ownedTe
- [`src/features/industry-planner/owned-blueprint-maps.ts:1-23`](../../src/features/industry-planner/owned-blueprint-maps.ts#L1-L23) — Already loops every blueprint and reads blueprint.te; it can emit ownedTe directly
- [`src/features/industry-planner/cost-basis-view.ts:1`](../../src/features/industry-planner/cost-basis-view.ts#L1) — Existing CostBasis = 'batched' \| 'marginal'
- [`src/features/industry-planner/components/PricingProvider.tsx:282`](../../src/features/industry-planner/components/PricingProvider.tsx#L282) — Inline union in PriceAssembleMirrors.costBasis
- [`src/features/industry-planner/components/planner-contexts.tsx:47-48`](../../src/features/industry-planner/components/planner-contexts.tsx#L47-L48) — Inline union twice in PlannerConfigValue
- [`src/features/industry-planner/build-pricing.ts:139, 228`](../../src/features/industry-planner/build-pricing.ts#L139) — Inline union in the pricing options and in CostBill
- [`src/features/industry-planner/types.ts:167`](../../src/features/industry-planner/types.ts#L167) — Inline union in summary.basis
- [`src/lib/preferences.ts:27-31`](../../src/lib/preferences.ts#L27-L31) — industryCostBasis = define<'batched' \| 'marginal'>(..., z.enum([...])), the persisted source of the union; lib cannot import features
- [`src/features/industry-planner/components/planner-contexts.tsx:21-34`](../../src/features/industry-planner/components/planner-contexts.tsx#L21-L34) — SelectedLocation repeats the three fields; SelectedReactionSystem is exactly the ref
- [`src/features/industry-planner/build-system-apply.ts:3-7`](../../src/features/industry-planner/build-system-apply.ts#L3-L7) — BuildSystemRef has the same shape
- [`src/features/industry-planner/components/use-planner-profile.ts:91-94`](../../src/features/industry-planner/components/use-planner-profile.ts#L91-L94) — Third spelling, inline in the LocationWriters.applyBuildSystem signature (missed by the finder)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/CockpitKpis.tsx:332`](../../src/features/industry-planner/components/CockpitKpis.tsx#L332) — Route-member lookup: a one-line find on the top route that yields undefined; a helper would only rename Array.find
- [`src/features/industry-planner/components/ComponentDrawer.tsx:118`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L118) — Same one-line find, but normalised to null; not worth a shared helper
- [`src/components/composition/industry-workspace/WorkspaceDialogs.tsx:115`](../../src/components/composition/industry-workspace/WorkspaceDialogs.tsx#L115) — Member find on ProfileDocument in components-composition, used only for categories.length
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:155`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L155) — Searches RailMember[] (railMembers output), not profile.document.members: a different list

</details>

**Home.** `Stays inside src/features/industry-planner: PromiseSeeder is a private function in components/PricingProvider.tsx, SystemRef goes in types.ts, CostBasis stays in cost-basis-view.ts (optionally derived from src/lib/preferences.ts industryCostBasis), and ownedTe is added to owned-blueprint-maps.ts`

**Boundary check.** All consumers are in the features zone (src/features/industry-planner/**), and imports between files of the same feature are internal. Deriving CostBasis from lib/preferences is a features→lib import, allowed by the rule {from: features, allow: [..., lib, ...]}. lib/preferences keeps its own literal because lib may import only config ({from: lib, allow: [config]}). No zone gains a new edge.

**API sketch.**

```ts
function PromiseSeeder<T>({ promise, onSeed }: { promise: Promise<T>; onSeed: (value: T) => void }): null

// owned-blueprint-maps.ts
export interface OwnedBlueprintMaps { ownedMe: Map<number, number>; ownedTe: Map<number, number>; ownedDetail: Map<number, OwnedComponentDetail> }

// cost-basis-view.ts
import type { industryCostBasis } from '@/lib/preferences';
export type CostBasis = (typeof industryCostBasis)['fallback']; // 'batched' | 'marginal'

// types.ts
export interface SystemRef { systemId: number; systemName: string; security: number | null }
// planner-contexts.tsx
export interface SelectedLocation extends SystemRef { stations: ...; costIndices: ...; adjustedPrices: ... }

// CockpitKpis
export function CockpitKpis({ structure }: { structure: BlueprintStructure })
```

**Migration steps.**

1. PricingProvider.tsx: replace PricingSeeder and HistorySeeder (lines 86-114) with one generic PromiseSeeder<T>({ promise, onSeed }). Render <PromiseSeeder promise={pricingPromise} onSeed={clock.seed} /> and <PromiseSeeder promise={historyPromise} onSeed={market.mergeHistory} />, each still in its own <Suspense fallback={null}> so one slow promise does not hold back the other. mergeHistory takes Iterable<MarketHistoryInputs>, which accepts T = MarketHistoryInputs[] contravariantly.
2. CockpitBuildPlan.tsx: delete TierRow (lines 41-86). In TierRowSlot, render <NodeCard typeId={item.typeId} name={item.name} label={item.label} icon=... qty=... value=... efficiency=... detail=... ownedQty=... heldBy=... lit=... dimmed=... onOpen=... onHover=... /> directly. Remove the imports that are now unused (ConsolidatedItem and AssetHolding if nothing else uses them).
3. CockpitKpis.tsx: drop the marginMode and setMarginMode props and read them in the existing call: const { runs, marginMode, setMarginMode } = usePlannerConfig(). PlannerRail.tsx: delete line 257 and pass only structure at line 266. In CockpitKpis.test.ts, add marginMode: 'net' and setMarginMode: vi.fn() to the usePlannerConfig mock (line 13) and render with { structure } only (line 35).
4. owned-blueprint-maps.ts: add ownedTe to OwnedBlueprintMaps and fill it in the existing loop with ownedTe.set(blueprint.blueprintTypeId, blueprint.te).
5. PricingProvider.tsx usePlannerOwnedResources: replace the ownedMe/ownedDetail useState pair with one useState<OwnedBlueprintMaps | null>(null). applyOwnedBlueprints becomes setOwnedBlueprints. Return ownedMe, ownedDetail and ownedTe as maps?.x ?? null. Change usePlannerLedger to take ownedTe in place of ownedDetail and delete the memo at lines 438-441. Pass owned.ownedTe at the call site (around line 520).
6. CostBasis: in cost-basis-view.ts, derive the type from lib/preferences (or keep the literal). Replace the inline unions at PricingProvider.tsx:282, planner-contexts.tsx:47-48, build-pricing.ts:139 and 228, and types.ts:167 with CostBasis. cost-basis-view.ts imports nothing, so these imports cannot form a cycle. Optionally update build-pricing.test.ts:617.
7. SystemRef: add SystemRef to types.ts. Delete BuildSystemRef (build-system-apply.ts:3-7) and import SystemRef there and in use-planner-location-writes.ts:6 and 59. Replace SelectedReactionSystem with SystemRef in planner-contexts.tsx:60, PricingProvider.tsx:83 and 168, and use-planner-profile.ts:20 and 96, then delete the interface so unused-types stays clean. Write SelectedLocation as extends SystemRef, and replace the inline shape at use-planner-profile.ts:92 with SystemRef.

**Tests.** Existing guards: CockpitKpis.test.ts (update the mock as described), PlannerRail.test.ts (it mocks CockpitKpis and needs no change), PricingProvider.test.ts (seeding and ledger behaviour), build-system-apply.test.ts, build-pricing.test.ts and coverage.test.ts. Add owned-blueprint-maps.test.ts asserting that ownedTe mirrors each blueprint's te and that ownedMe and ownedDetail are unchanged. Run pnpm check through test-runner; Fallow unused-types and unused-component-props will catch any leftover SelectedReactionSystem, BuildSystemRef or margin props.

**Notes.** Behaviour must stay identical. Keep the two seeders in separate Suspense boundaries; merging them under one would delay pricing until history resolves. ownedTe currently becomes null when ownedDetail is null (before the first fetch, or when the fetch fails), and the collapsed state must keep that null: do not default to an empty Map, because nodeFrameState and deriveAdjust treat null and an empty map differently in their has() checks. CockpitKpis keeps its useMemo dependency on marginMode, now read from context. No drift bug was found; every spelling of the union and the ref agrees today.

<sub>Reported by: area:industry-planner.</sub>

<a id="p120"></a>

## P120: Give wormhole-sites one site-class range, class rank, class pill and site-type order

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -45 / +25 in production code across 10 files, +25 in tests
- **Depends on:** [P042](wave-01-quick-wins-delete-dead-code-fix-small.md#p042)
- **Existing primitive:** `src/features/wormhole-sites/gas-classes.ts:gasClassRange`

**Problem.** The rule 'a site's class range is its wormholeClass, otherwise the gas name's spawn range' is re-derived in five places: as a set, as a membership test, as a sort key, and twice as a pill. Two of those copies, the card header and the table, are line-for-line the same pill logic. Class order is encoded three times with different bases. The filter chips, section order and table sort each re-list WORMHOLE_CLASSES or the site-type order instead of importing them. WORMHOLE_CLASSES lives in the drizzle schema module, so client-side code that needs the class list has to import a module that defines pgTables.

**Verifier revision.** The core finding holds. Five sites hand-roll 'class is wormholeClass, else the gas-name range': siteClassSet, queries matchesClass, the sort valueFor class case, deriveClassPill, and the SitesTable class column. The class order is defined three times (gas-classes 1-based, sort 1-based, search 0-based with a dead ?? 9). SitesFilterLayout re-lists WORMHOLE_CLASSES as CLASS_CHIPS. Grepping found a sibling the finder missed: the site-type display order (combat, ore, gas, relic, data) is spelled out four times. Four revisions to the proposal: (a) site-meta.ts:50 labelling a class-less gas site 'Wormhole' is not drift. It is a deliberate, test-pinned SEO label (site-meta.test.ts:70-73, 'defaults a class-less gas site to "Wormhole Gas"'), so leave it. (b) queries.ts can reuse the existing siteClassSet; no new siteMatchesClass export is needed. (c) The new module must not import schema.ts, which imports drizzle-orm/pg-core and defines pgTables. search.ts is imported by the site-wide 'use client' GlobalSearch, so routing its class rank through a module that touches schema.ts risks pulling table definitions into the global client graph. WORMHOLE_CLASSES therefore moves into the drizzle-free module and schema.ts imports it. This also removes site-filter.ts's existing schema.ts import, which the 'use client' SitesFilterLayout reaches. (d) Search keeps ordering by wormholeClass only, which preserves current behavior.

**Sites (15).**

- [`src/features/wormhole-sites/gas-classes.ts:8-10, 12-17, 19-22, 24-26`](../../src/features/wormhole-sites/gas-classes.ts#L8-L10) — CLASS_ORDER (1-based), gasClassRange, formatClassRange, classRangeIncludes
- [`src/features/wormhole-sites/site-filter.ts:1-18`](../../src/features/wormhole-sites/site-filter.ts#L1-L18) — siteClassSet: the rule expanded to a list via WORMHOLE_CLASSES.slice; imports './schema' (drizzle) at line 2; dead -1 guard at 14
- [`src/features/wormhole-sites/queries.ts:129-136, 156-158, 196-198`](../../src/features/wormhole-sites/queries.ts#L129-L136) — matchesClass, equivalent to siteClassSet(s).includes(cls); used by listSites and listSiteDetails
- [`src/features/wormhole-sites/sort.ts:17-19, 21-23, 54-61`](../../src/features/wormhole-sites/sort.ts#L17-L19) — TYPE_ORDER (site-type order), its own 1-based CLASS_ORDER, and the class sort value wormholeClass ?? range.min
- [`src/features/wormhole-sites/components/site-card-header-view.ts:36-45`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L36-L45) — deriveClassPill
- [`src/features/wormhole-sites/components/SitesTable.tsx:60-77, 117`](../../src/features/wormhole-sites/components/SitesTable.tsx#L60-L77) — class column inlines the same pill logic (size sm, '—' fallback); siteClassSet for data-site-cls
- [`src/features/wormhole-sites/search.ts:23-29, 44-45, 56`](../../src/features/wormhole-sites/search.ts#L23-L29) — 0-based CLASS_ORDER with ?? 9 fallback; ranks and shows wormholeClass only
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:29-31`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L29-L31) — SECTION_ORDER and TYPE_ROWS (the same site-type order twice) and CLASS_CHIPS (copy of WORMHOLE_CLASSES)
- [`src/app/(site)/preview/cards/page.tsx:10`](../../src/app/%28site%29/preview/cards/page.tsx#L10) — a fourth copy of the site-type SECTION_ORDER
- [`src/features/wormhole-sites/schema.ts:1, 3-7, 36`](../../src/features/wormhole-sites/schema.ts#L1) — WORMHOLE_CLASSES and WormholeClass defined beside drizzle pgTable and pgEnum; re-exported through src/composition/drizzle-schema.ts:1
- [`src/features/wormhole-sites/api-contract.ts:3`](../../src/features/wormhole-sites/api-contract.ts#L3) — imports WORMHOLE_CLASSES from './schema'
- [`src/features/wormhole-sites/sites-query.ts:5`](../../src/features/wormhole-sites/sites-query.ts#L5) — imports WORMHOLE_CLASSES from './schema'
- [`src/features/wormhole-sites/dev-sample.ts:5-9`](../../src/features/wormhole-sites/dev-sample.ts#L5-L9) — siteClassSet consumer
- [`src/app/(site)/sites/page.tsx:62`](../../src/app/%28site%29/sites/page.tsx#L62) — siteClassSet consumer
- [`src/components/composition/GlobalSearch.tsx:1, 6`](../../src/components/composition/GlobalSearch.tsx#L1) — a 'use client' module imports features/wormhole-sites/search, so the class-rank home must stay drizzle-free

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/site-meta.ts:50`](../../src/features/wormhole-sites/site-meta.ts#L50) — 'Wormhole' for a class-less gas site is deliberate SEO copy pinned by site-meta.test.ts:70-73. Changing it is a product decision, not a dedupe.
- [`src/features/wormhole-sites/search.ts:56`](../../src/features/wormhole-sites/search.ts#L56) — The compact search icon shows wormholeClass or '—'. A 'C1–C6' label would not fit an icon chip, so keep it.
- [`src/features/wormhole-sites/related-sites.ts:8`](../../src/features/wormhole-sites/related-sites.ts#L8) — Exact class equality for 'related' sites, a different concept from range membership.

</details>

**Home.** `src/features/wormhole-sites/site-class.ts (rename of gas-classes.ts; owns WORMHOLE_CLASSES, the rank and siteClassRange). siteClassPill and SITE_TYPE_ORDER go in src/features/wormhole-sites/components/wormhole-styles.ts beside CLASS_TONE and SITE_TYPE_LABEL.`

**Boundary check.** All of these modules are inside src/features/wormhole-sites, one feature in the features zone (autoDiscover src/features), so their imports are intra-zone and need no rule. search.ts:5 already imports components/wormhole-styles, which is the precedent for sort.ts doing the same. The app consumers src/app/(site)/sites/page.tsx and src/app/(site)/preview/cards/page.tsx are in the app zone, and the rule {from: app, allow: [..., features, ...]} permits them. site-class.ts must import nothing from schema.ts or types.ts at runtime: declare its site parameter structurally to avoid a site-class to types type cycle.

**API sketch.**

```ts
// site-class.ts (drizzle-free)
export const WORMHOLE_CLASSES = ['C1','C2','C3','C4','C5','C6'] as const;
export type WormholeClass = (typeof WORMHOLE_CLASSES)[number];
export interface ClassRange { min: WormholeClass; max: WormholeClass }
export function wormholeClassRank(c: WormholeClass): number; // WORMHOLE_CLASSES.indexOf(c), 0..5
export function gasClassRange(name: string): ClassRange | null; // unchanged
export function siteClassRange(site: { wormholeClass: WormholeClass | null; siteType: string; name: string }): ClassRange | null;
export function formatClassRange(range: ClassRange): string; // unchanged
export function classRangeIncludes(range: ClassRange, c: WormholeClass): boolean; // via rank

// components/wormhole-styles.ts
export const SITE_TYPE_ORDER = ['combat','ore','gas','relic','data'] as const satisfies readonly SiteType[];
export function siteClassPill(site: Parameters<typeof siteClassRange>[0]): { tone: PillTone; label: string } | null;
// range ? { tone: CLASS_TONE[range.min], label: formatClassRange(range) } : null

// site-filter.ts (kept, rebuilt on the range)
export function siteClassSet(site): WormholeClass[]; // range ? WORMHOLE_CLASSES.slice(rank(min), rank(max) + 1) : []
```

**Migration steps.**

1. Rename gas-classes.ts to site-class.ts with git mv (and gas-classes.test.ts to site-class.test.ts). Move WORMHOLE_CLASSES and WormholeClass into it from schema.ts. Add wormholeClassRank and siteClassRange. Rewrite classRangeIncludes on the rank and delete the local CLASS_ORDER.
2. schema.ts: import { WORMHOLE_CLASSES } from './site-class' for wormholeClassEnum and delete the const and type there. Do not re-export it: duplicate-exports is an error, and drizzle-schema.ts already does export *. Point types.ts' WormholeClass re-export, api-contract.ts:3 and sites-query.ts:5 at './site-class'.
3. site-filter.ts: reimplement siteClassSet on siteClassRange and WORMHOLE_CLASSES from './site-class', which removes its './schema' import.
4. queries.ts: delete matchesClass and filter with siteClassSet(s).includes(filters.wormholeClass) in listSites and listSiteDetails. Drop the gas-classes import.
5. sort.ts: the class value becomes const r = siteClassRange(s); return r ? wormholeClassRank(r.min) : null. Values become 0-based, which is harmless because only the relative order and null-last matter. TYPE_ORDER becomes SITE_TYPE_ORDER.indexOf(s.siteType).
6. search.ts: delete CLASS_ORDER. Tie-break with entry.wormholeClass ? wormholeClassRank(entry.wormholeClass) : WORMHOLE_CLASSES.length, which keeps the wormholeClass-only, null-last behavior.
7. wormhole-styles.ts: add siteClassPill and SITE_TYPE_ORDER. site-card-header-view.ts: classPill: siteClassPill(site), and delete deriveClassPill. SitesTable.tsx class column: const pill = siteClassPill(s); render <Pill tone={pill.tone} size="sm">{pill.label}</Pill>, or '—' when there is none.
8. SitesFilterLayout.tsx: replace CLASS_CHIPS with WORMHOLE_CLASSES and both SECTION_ORDER and TYPE_ROWS with SITE_TYPE_ORDER. Do the same in src/app/(site)/preview/cards/page.tsx:10.
9. Optional, same feature: site-meta.ts:10-16 re-declares SITE_TYPE_LABEL; import it from components/wormhole-styles. The ?? site.siteType fallback becomes unnecessary because the record is keyed by SiteType. Leave the 'Wormhole' label alone.

**Tests.** Rename gas-classes.test.ts to site-class.test.ts and add siteClassRange cases: a classed site gives {c, c}; Perimeter, Frontier and Core gas give their ranges; a classed gas site lets wormholeClass win; an unrecognized gas name gives null; a class-less non-gas site gives null. Add wormholeClassRank. Add a gas-range pill case to components/site-card-header-view.test.ts (label 'C1–C6', tone CLASS_TONE.C1), which is uncovered today. Add a gas-range row to sort.test.ts's class sort (line 102 covers only classed and null). Existing guards: site-filter.test.ts:5-70 (siteClassSet, matchesFilter), queries.test.ts:380-400 (gas-range class filtering in list queries), sort.test.ts:51 (type order) and :102 (class null-last), search.test.ts:33 (class tie-break), site-meta.test.ts:70-79 ('Wormhole' label stays).

**Notes.** Behavior to preserve:
- The pill label for a classed site stays the bare class: formatClassRange({min: c, max: c}) returns c, so the header and table output is identical.
- The table pill keeps size 'sm' and the '—' fallback.
- The sort keeps null last in both directions (the comparator already handles this).
- Search keeps ranking and showing wormholeClass only, so gas sites without a class still sort last and show '—'.
- site-meta's 'Wormhole' label is intentional and stays.
Keeping site-class.ts drizzle-free is the point of moving WORMHOLE_CLASSES. I did not inspect bundles, so treat 'drizzle reaches the client' as a risk to avoid, not a measured regression. The same hazard remains for SITE_TYPES and SLEEPER_CLASS_CODES: schema.ts is still imported by api-contract.ts and components/ShipClassIcon.tsx, which is worth a follow-up lead. siteClassSet's min/max -1 guard (site-filter.ts:14) is dead given the types and can go.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p121"></a>

## P121: Centralise wormhole site-type predicates and display order; route class-range logic through siteClassSet

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About 45 lines removed and 30 added (new site-type.ts plus test); net about -15
- **Depends on:** [P120](#p120)
- **Existing primitive:** `src/features/wormhole-sites/site-primary-isk.ts:primarySiteIsk`

**Problem.** Site-type taxonomy is repeated across the wormhole-sites feature.

Site-type copies:
- 'Wave-driven' (combat, relic or data) is written five times: primarySiteIsk, site-meta, site-details-view, site-card-header-view, and inverted in site-social-card.
- site-social-card re-derives primary ISK by hand.
- The hacking predicate (relic or data) is written twice.
- site-meta keeps a private copy of SITE_TYPE_LABEL.
- The display order combat, ore, gas, relic, data appears three times: SECTION_ORDER (also copied as TYPE_ROWS), the preview page and sort.ts TYPE_ORDER.

Class-range copies in the same files:
- The C1–C6 rank table exists three times: gas-classes, sort and search.
- SitesFilterLayout CLASS_CHIPS re-lists WORMHOLE_CLASSES.
- SitesTable's class cell duplicates deriveClassPill.
- queries.matchesClass re-implements siteClassSet with different semantics. For a gas site with a fixed class it also unions the gas range, where every other consumer uses the fixed class only.

**Verifier revision.** The core holds. Five copies of the wave-driven/resource predicate exist, two of the hacking predicate, three copies of the display order (plus TYPE_ROWS) and a private label table. The design needs to change in four ways. (1) Leave SITE_TYPE_LABEL where it is. wormhole-styles is already the canonical home with six importers, including the non-component search.ts. Moving it means six import edits, and a re-export would only add duplicate or unused exports, so the fix is to delete site-meta's private copy. (2) SITE_TYPES in schema.ts must keep its order. It feeds pgEnum('site_type') and the order of the zod enum and error message, so the display order has to be a separate constant. (3) isHackingSiteType must be a type predicate, because resource-row-view indexes HACKING_DOT_TONE by the narrowed type. (4) The grep turned up a sibling family that is drifting in the same files. The wormhole class rank table is written three times. The effective class range of a site is re-derived in five places instead of using the existing siteClassSet. queries.matchesClass has drifted from the others. SitesTable's class cell re-implements deriveClassPill.

**Sites (16).**

- [`src/features/wormhole-sites/site-primary-isk.ts:1-14`](../../src/features/wormhole-sites/site-primary-isk.ts#L1-L14) — primarySiteIsk, with the wave-driven predicate inline; siteType typed loosely as string
- [`src/features/wormhole-sites/site-social-card.ts:12-22`](../../src/features/wormhole-sites/site-social-card.ts#L12-L22) — isResourceSite (ore\|gas) at line 14 re-derives primary ISK (line 15) and picks the caption (line 21). Equivalent to primarySiteIsk because SiteType is closed.
- [`src/features/wormhole-sites/site-meta.ts:10-16, 24-25, 49`](../../src/features/wormhole-sites/site-meta.ts#L10-L16) — private SITE_TYPE_LABEL (Record<string,string>), inline isWaveDriven, and a dead `?? site.siteType` fallback
- [`src/features/wormhole-sites/components/site-details-view.ts:21-26`](../../src/features/wormhole-sites/components/site-details-view.ts#L21-L26) — isHackSite plus isWaveDriven
- [`src/features/wormhole-sites/components/site-card-header-view.ts:36-45, 61-66`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L36-L45) — isWaveDriven again; deriveClassPill is the class-pill logic SitesTable duplicates
- [`src/features/wormhole-sites/components/resource-row-view.ts:16-18`](../../src/features/wormhole-sites/components/resource-row-view.ts#L16-L18) — hacking predicate, which must narrow to 'relic'\|'data' for HACKING_DOT_TONE
- [`src/features/wormhole-sites/components/wormhole-styles.ts:46-52, 74-77`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L46-L52) — canonical SITE_TYPE_LABEL (Record<SiteType,string>); HACKING_DOT_TONE keyed by the hacking subset
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:29-31, 134, 228`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L29-L31) — SECTION_ORDER and TYPE_ROWS are identical; CLASS_CHIPS duplicates WORMHOLE_CLASSES
- [`src/features/wormhole-sites/sort.ts:17-23, 39-41, 54-61`](../../src/features/wormhole-sites/sort.ts#L17-L23) — TYPE_ORDER is a rank form of the display order; CLASS_ORDER is the 2nd rank copy; siteIskValue is a pointless wrapper over primarySiteIsk; the class case re-derives the gas range
- [`src/app/(site)/preview/cards/page.tsx:10-18`](../../src/app/%28site%29/preview/cards/page.tsx#L10-L18) — third SECTION_ORDER copy
- [`src/features/wormhole-sites/schema.ts:3-7`](../../src/features/wormhole-sites/schema.ts#L3-L7) — SITE_TYPES (pgEnum order combat,gas,ore,relic,data) and WORMHOLE_CLASSES
- [`src/features/wormhole-sites/search.ts:26-28, 44-46`](../../src/features/wormhole-sites/search.ts#L26-L28) — third CLASS_ORDER copy (0-based, Record<string,number>)
- [`src/features/wormhole-sites/gas-classes.ts:8-10, 24-26`](../../src/features/wormhole-sites/gas-classes.ts#L8-L10) — first CLASS_ORDER copy, used by classRangeIncludes
- [`src/features/wormhole-sites/site-filter.ts:5-18`](../../src/features/wormhole-sites/site-filter.ts#L5-L18) — existing primitive siteClassSet: fixed class first, else the gas range
- [`src/features/wormhole-sites/queries.ts:129-136, 156-158`](../../src/features/wormhole-sites/queries.ts#L129-L136) — matchesClass re-implements siteClassSet. Drift: it unions the gas range even when wormholeClass is set.
- [`src/features/wormhole-sites/components/SitesTable.tsx:60-77`](../../src/features/wormhole-sites/components/SitesTable.tsx#L60-L77) — the class column re-implements deriveClassPill (CLASS_TONE[min] + formatClassRange)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/signature-model.ts:133, 176-199`](../../src/mapper/signatures/signature-model.ts#L133) — Scanner-section buckets (harvestables/hacking/combat) for signatures, a different taxonomy from SiteType
- [`src/features/wormhole-sites/site-meta.ts:50`](../../src/features/wormhole-sites/site-meta.ts#L50) — The gas classLabel 'Wormhole' is deliberate SEO copy, not the C-range pill; do not route it through the class-range helpers
- [`src/features/wormhole-sites/api-contract.ts:6, 13`](../../src/features/wormhole-sites/api-contract.ts#L6) — Uses SITE_TYPES for validation; must stay in enum order
- [`src/features/wormhole-sites/sites-query.ts:18`](../../src/features/wormhole-sites/sites-query.ts#L18) — Error message lists SITE_TYPES; order is irrelevant there
- [`src/features/wormhole-sites/components/site-details-view.ts:3-9`](../../src/features/wormhole-sites/components/site-details-view.ts#L3-L9) — RESOURCE_SECTION_COPY is per-type copy keyed exhaustively by SiteType, not an order or a predicate

</details>

**Home.** `src/features/wormhole-sites/site-type.ts (new; absorbs site-primary-isk.ts). Class rank goes in the existing src/features/wormhole-sites/gas-classes.ts. Class-set logic reuses the existing site-filter.ts:siteClassSet. SITE_TYPE_LABEL stays in components/wormhole-styles.ts.`

**Boundary check.** All homes are inside the wormhole-sites features slice (features autoDiscover), so intra-zone imports are unrestricted. The only cross-zone consumer is src/app/(site)/preview/cards/page.tsx (zone app), and the app rule allows 'features'. site-type.ts and gas-classes.ts import only './schema' and './types', which site-filter.ts already imports and which are already in client bundles via SitesFilterLayout. No new zone edges.

**API sketch.**

```ts
// site-type.ts
export const SITE_TYPE_DISPLAY_ORDER: readonly SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];
export function isHackingSiteType(t: SiteType): t is 'relic' | 'data';
export function isWaveDrivenSiteType(t: SiteType): t is 'combat' | 'relic' | 'data';
export function primarySiteIsk(entry: { readonly siteType: SiteType; readonly blueLootIsk: number | null; readonly resourceValueIsk: number | null }): number | null;
// gas-classes.ts
export function wormholeClassRank(cls: WormholeClass): number; // reuses existing CLASS_ORDER
// site-card-header-view.ts
export function siteClassPill(site: Pick<SiteDetail,'wormholeClass'|'siteType'|'name'>): { tone: PillTone; label: string } | null; // renamed deriveClassPill
```

**Migration steps.**

1. Create site-type.ts with SITE_TYPE_DISPLAY_ORDER, isHackingSiteType, isWaveDrivenSiteType (as isHacking || 'combat') and primarySiteIsk (moved verbatim, built on isWaveDrivenSiteType, with siteType tightened to SiteType). Move site-primary-isk.test.ts to site-type.test.ts and delete site-primary-isk.ts.
2. Repoint the primarySiteIsk importers to './site-type': search.ts:7, site-catalogue.tsx:19, sort.ts:2 and components/SitesTable.tsx:11. In sort.ts, delete the siteIskValue wrapper (39-41) and call primarySiteIsk directly.
3. site-social-card.ts: replace lines 14-15 with `const waveDriven = isWaveDrivenSiteType(site.siteType); const isk = primarySiteIsk(site);` and flip the caption condition so wave-driven sites read 'ESTIMATED BLUE-LOOT VALUE'.
4. site-meta.ts: delete the private SITE_TYPE_LABEL (10-16) and import it from './components/wormhole-styles'. At line 49 drop the dead `?? site.siteType` fallback. Replace lines 24-25 with isWaveDrivenSiteType.
5. site-details-view.ts:22-25: replace with `isWaveDriven: isWaveDrivenSiteType(site.siteType)`. site-card-header-view.ts:66: use the same call, keeping isCombat for subLine. resource-row-view.ts:17: use `if (isHackingSiteType(siteType))`.
6. Display order: in SitesFilterLayout delete SECTION_ORDER and TYPE_ROWS and map SITE_TYPE_DISPLAY_ORDER at lines 134 and 228. Replace CLASS_CHIPS with WORMHOLE_CLASSES from '../schema'. In preview/cards/page.tsx, import SITE_TYPE_DISPLAY_ORDER and delete line 10. In sort.ts, delete TYPE_ORDER and use `SITE_TYPE_DISPLAY_ORDER.indexOf(s.siteType)`; only relative order matters.
7. Class rank: in gas-classes.ts export wormholeClassRank(cls) over its existing CLASS_ORDER. In sort.ts, delete CLASS_ORDER (21-23) and use wormholeClassRank in the class case. In search.ts, delete CLASS_ORDER (26-28) and use `entry.wormholeClass ? wormholeClassRank(entry.wormholeClass) : 9`. The 0-based versus 1-based difference does not matter because 9 stays above every rank.
8. Class set: in queries.ts replace the matchesClass body (129-136) with `siteClassSet(s).includes(cls)`, importing from './site-filter'. This adopts the majority semantics, where a fixed class wins over the gas range.
9. Class pill: export deriveClassPill from site-card-header-view.ts as siteClassPill. In the SitesTable class column (60-77), render `const pill = siteClassPill(s); return pill ? <Pill tone={pill.tone} size='sm'>{pill.label}</Pill> : <span className='text-muted'>—</span>`. Then drop the gasClassRange and formatClassRange imports if they are unused.
10. Run the test-runner check; fallow unused-exports will catch any leftover export.

**Tests.** New site-type.test.ts:
- primarySiteIsk cases, moved from site-primary-isk.test.ts.
- A table over every SITE_TYPES member asserting isWaveDrivenSiteType and isHackingSiteType.
- SITE_TYPE_DISPLAY_ORDER is a permutation of SITE_TYPES.

gas-classes.test.ts: add wormholeClassRank is monotonic over WORMHOLE_CLASSES.

queries.test.ts (or a pure test of the extracted predicate): add a gas site with a fixed wormholeClass is matched only by that class.

Existing guards:
- sort.test.ts:51 (type order combat→ore→gas→relic→data), plus the isk and class sort cases.
- site-meta.test.ts
- site-social-card.test.ts (value and caption)
- site-details-view.test.ts
- site-card-header-view.test.ts
- resource-row-view.test.ts
- SitesFilterLayout.test.ts
- search.test.ts (class tiebreak)
- site-filter.test.ts
- gas-classes.test.ts

**Notes.** Behaviour to preserve:
- site-social-card's ore|gas test equals !isWaveDriven only because SiteType is closed. Keep isWaveDrivenSiteType typed on SiteType, not string, so a new enum member fails to compile rather than silently landing in the wrong bucket.
- Do NOT reorder SITE_TYPES. It is the pgEnum declaration order, used in Postgres enum sort, and the zod enum.
- search.ts ranks only on the fixed wormholeClass (gas sites rank 9). Keep that and only dedupe the table.

Drift found: queries.matchesClass is the outlier. It returns true for a gas site with a fixed class C3 and a Perimeter name when the filter is C1, while siteClassSet, sort, SitesTable and deriveClassPill all use only the fixed class. Adopt siteClassSet semantics. This is a latent difference only if a gas row ever has wormholeClass set.

site-meta's label copy has identical values to wormhole-styles, so removing it changes no output.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p227"></a>

## P227: Share one site-detail assembly in wormhole-sites/queries.ts, route class matching through siteClassSet, and drop listSiteDetails' unused filters

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -75 / +20 in queries.ts; -10 in types.ts; test churn about +/-40
- **Depends on:** [P121](#p121)

**Problem.** queries.ts assembles a SiteDetail twice: listSiteDetails over many sites and getSiteDetail over one. The copies differ only in eq vs inArray, a redundant siteId column and variable names, so a change to resource columns, NPC enrichment or resource hydration has to be made twice. listSites and listSiteDetails each build the same site query and class filter, though listSiteDetails is only ever called with {}. Class membership is implemented twice: matchesClass for /api/sites, and siteClassSet for the /sites page and SitesTable. SiteListItem hand-copies fields the zod contract already infers.

**Verifier revision.** Confirmed. getSiteDetail (323-385) re-implements listSiteDetails' assembly (200-275): the same waves select, the same resource column list (218-233 vs 341-355; fallow groups these at 220-228 and 343-351), the same NPC load and grouping (243-248 vs 372-377; fallow groups 241-245 and 370-374), getCombatStatsBatch, aggregateWave and resource hydration. Only eq() and inArray() differ. listSites (144-154) and listSiteDetails (186-198) rebuild the same site query and class filter, and the only production caller passes {} (391). I revised the scope in three ways. First, the filters parameter is not dead in tests: queries.test.ts:262 and :406 exercise it, and listSites has no direct test (coverage.test.ts only pins it), so the class-filter coverage must move to listSites before the parameter is dropped. Second, matchesClass (129-136) is a second implementation of site-filter.siteClassSet (5-18), with its own class-ordering table (gas-classes.ts CLASS_ORDER and classRangeIncludes), and should fold into it. Third, the efficiency gain is cold-cache only, because every read sits behind 'use cache' with cacheLife max or hours, so concurrency is a minor and optional step.

**Sites (13).**

- [`src/features/wormhole-sites/queries.ts:129-136`](../../src/features/wormhole-sites/queries.ts#L129-L136) — matchesClass: declared class or gas range via classRangeIncludes
- [`src/features/wormhole-sites/queries.ts:138-159`](../../src/features/wormhole-sites/queries.ts#L138-L159) — listSites: site query plus matchesClass filter (sole consumer: /api/sites)
- [`src/features/wormhole-sites/queries.ts:161-177`](../../src/features/wormhole-sites/queries.ts#L161-L177) — loadNpcsForWaves, a round trip that runs after waves
- [`src/features/wormhole-sites/queries.ts:179-277`](../../src/features/wormhole-sites/queries.ts#L179-L277) — listSiteDetails: duplicated site query and filter (186-198), then the assembly (200-275)
- [`src/features/wormhole-sites/queries.ts:323-385`](../../src/features/wormhole-sites/queries.ts#L323-L385) — getSiteDetail: copy of the assembly keyed by eq(siteId)
- [`src/features/wormhole-sites/queries.ts:387-403`](../../src/features/wormhole-sites/queries.ts#L387-L403) — listPricedSiteDetails passes {} (391); getPricedSiteDetail wraps getSiteDetail
- [`src/features/wormhole-sites/site-filter.ts:5-18`](../../src/features/wormhole-sites/site-filter.ts#L5-L18) — siteClassSet: the canonical class membership used by /sites page.tsx:62, SitesTable:117 and dev-sample
- [`src/features/wormhole-sites/gas-classes.ts:8-10, 24-26`](../../src/features/wormhole-sites/gas-classes.ts#L8-L10) — CLASS_ORDER plus classRangeIncludes, used only by matchesClass
- [`src/features/wormhole-sites/types.ts:6-16`](../../src/features/wormhole-sites/types.ts#L6-L16) — SiteListItem duplicates siteMetadataShape plus resourceValueIsk
- [`src/features/wormhole-sites/api-contract.ts:10-19, 90-100`](../../src/features/wormhole-sites/api-contract.ts#L10-L19) — siteMetadataShape and siteDetailSchema; SiteDetail is inferred
- [`src/features/wormhole-sites/queries.test.ts:143-153, 155-380, 382-414`](../../src/features/wormhole-sites/queries.test.ts#L143-L153) — tests call listSiteDetails with filters at 262-265 and 406; the mock builder supports only from/where/orderBy
- [`src/features/wormhole-sites/coverage.test.ts:1-15`](../../src/features/wormhole-sites/coverage.test.ts#L1-L15) — listSites is pinned rather than tested
- [`src/app/api/sites/route.ts:11-28`](../../src/app/api/sites/route.ts#L11-L28) — only listSites consumer; uses SiteListItem

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/queries.ts:289-321`](../../src/features/wormhole-sites/queries.ts#L289-L321) — getSiteSearchIndex and getScannerSiteIndex produce a different shape with a different cache life and tag. Not part of the detail assembly.
- [`src/features/wormhole-sites/components/SitesTable.tsx:68`](../../src/features/wormhole-sites/components/SitesTable.tsx#L68) — gasClassRange used for display formatting, not class membership
- [`src/features/wormhole-sites/sort.ts:57`](../../src/features/wormhole-sites/sort.ts#L57) — gasClassRange used as a sort key, not class membership

</details>

**Home.** `Private helpers inside src/features/wormhole-sites/queries.ts; class membership via the existing src/features/wormhole-sites/site-filter.ts:siteClassSet`

**Boundary check.** Everything stays inside the features/wormhole-sites zone. queries.ts already imports '@/db' (the 'features' rule allows 'db'), '@/data/npc-stats/*' (allows 'data') and '@/lib/neon-cold-start-retry' (allows 'lib'). site-filter.ts is in the same feature. No new cross-zone imports.

**API sketch.**

```ts
function selectSiteRows(where?: SQL): Promise<SiteListItem[]>; // select(SITE_LIST_COLUMNS).from(sites).where(where).orderBy(sourceTab, name)
async function assembleSiteDetails(siteRows: SiteListItem[]): Promise<SiteDetail[]>; // [] short-circuit; waves + resources (+ npcs) by inArray(siteId); stats; group
export async function listSiteDetails(): Promise<SiteDetail[]>; // 'use cache'; cacheLife('max'); withColdStartRetry(async () => assembleSiteDetails(await selectSiteRows()))
async function getSiteDetail(id: number): Promise<SiteDetail | null>; // 'use cache'; (await assembleSiteDetails(await selectSiteRows(eq(sites.id, id))))[0] ?? null
const matchesClass = (s, cls) => siteClassSet(s).includes(cls);
export type SiteListItem = Omit<SiteDetail, 'waves' | 'resources'>;
```

**Migration steps.**

1. Move coverage first. Add listSites cases to queries.test.ts: a type filter, plus the gas-range case from 382-414 rewritten to call listSites({ wormholeClass: 'C2' }). Remove listSites from the coverage.test.ts pin, and delete that file if the pin list becomes empty.
2. Replace matchesClass's body with `siteClassSet(s).includes(cls)`, importing from ./site-filter. If no production caller of classRangeIncludes and CLASS_ORDER remains, delete them and move or delete their gas-classes.test.ts cases so the unused-export check stays green.
3. Add selectSiteRows(where?) and use it in listSites.
4. Extract assembleSiteDetails from listSiteDetails lines 200-275, keeping the empty short-circuit. Hoist the resource select object to a module const shared by the one remaining select.
5. Change listSiteDetails to take no parameters and call assembleSiteDetails(await selectSiteRows()) inside withColdStartRetry. Update listPricedSiteDetails (391) and the remaining listSiteDetails tests to call listSiteDetails().
6. Rewrite getSiteDetail as selectSiteRows(eq(sites.id, id)) then assembleSiteDetails, returning null for no row. Delete lines 330-383.
7. In types.ts, define SiteListItem as Omit<SiteDetail, 'waves' | 'resources'>. SiteDetail is already re-exported from api-contract.
8. Add a getPricedSiteDetail unit test covering a found site assembled from one row and a missing id that returns null without dependent reads.
9. Optional, cold-cache only: fetch NPCs with innerJoin(waves, eq(npcs.waveId, waves.id)).where(inArray(waves.siteId, siteIds)) in the same Promise.all as waves and resources, then delete loadNpcsForWaves. Add innerJoin to the test mock builder and keep the result-queue order: waves, resources, npcs.

**Tests.** Existing guards: src/features/wormhole-sites/queries.test.ts (empty short-circuit, full assembly with EWAR and combat aggregation, resource hydration, gas ranges); src/features/wormhole-sites/site-filter.test.ts; src/app/(site)/sites/[id]/page.test.ts and src/app/api/problem-matrix.test.ts, which mock getPricedSiteDetail. New: listSites tests (type and class filtering, ordering) to replace the coverage pin, and getPricedSiteDetail tests (single-site assembly, null on miss).

**Notes.** Behaviors to keep: getSiteDetail orders waves by waveNumber and listSiteDetails by (siteId, waveNumber), which match once grouped per site. getSiteDetail's resource select omits siteId, while the shared select includes it and strips it during grouping (same output). Both hydrate resources with liveIsk null, effectiveIsk = totalIsk and liveEligible false. Keep the empty-catalogue short-circuit (one select, no stats call). Drift: for a site with a declared wormholeClass that is also siteType 'gas' with a range name, matchesClass (the API) also matches by gas range, while siteClassSet (page filter, data-site-cls) returns only the declared class. siteClassSet is canonical. Gas sites currently have wormholeClass null, so nothing observable changes. Efficiency: listSiteDetails now makes 5 sequential round trips (sites, [waves, resources], npcs, then getCombatStatsBatch's 2 attribute reads); the join cuts that to 4, and to 3 for a single site if the site row read also joins the Promise.all. Since every path sits behind 'use cache', this is a cold-cache improvement only. I rejected the alternative of deriving getPricedSiteDetail from listPricedSiteDetails().find(): it would make a cold detail page or OG image build the whole catalogue.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p169"></a>

## P169: Give wormhole-sites one EWAR module (waveEwar, siteEwarTotals, activeEwarKeys) and drop summariseWave's dead ew* totals

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -70 / +40 (removes the aggregateWave loop and nullIfZero, the dead summariseWave ew* fields and test lines, the mock reduce, and the four reduces in activeSiteEwar)
- **Depends on:** —
- **Existing primitive:** `src/data/npc-stats/math.ts:summariseWave`

**Problem.** Wave EWAR is computed twice in the feature: aggregateWave re-reads raw stats per row, and mock-data reduces the Npc rows. A third, unused and different rule sits in data/npc-stats summariseWave, which weights by quantity and sums the web speed factor. Site-level EWAR is summed separately in activeSiteEwar (four reduces) and siteScramTotal. Turning an EWAR record into active chip keys is hand-written in EwarRow, NpcRow and activeSiteEwar, each with its own rrep/ewRrep-to-rr mapping. The quantity-weighting question for scrams cannot be decided in one place today.

**Verifier revision.** The duplication is real, but the proposed home is wrong. summariseWave's ew* totals are dead: its only caller, aggregateWave, discards them. Its ewWeb also sums webSpeedFactor × quantity, which is a speed percentage, not a count. It cannot be the canonical rule, and the right rule depends on the feature's own Npc display convention, set in mergeNpc (web becomes 0/1, neut is negated). aggregateWave's 28-line loop recomputes from raw stats exactly what the enriched Npc rows already hold. Summing those Npc fields and mapping 0 to null gives the same result: each field has one sign, so the sum is non-zero exactly when some row contributes, and -0 also maps to null. That is what mock-data's wave() already does. The primitive therefore belongs in the feature as waveEwar(npcs). The 'product decision first' framing is overstated. The extraction itself changes no behaviour, and quantity weighting only affects one displayed number: the scram total in the SitesTable Scrams column and sort. Web, neut and rr are shown only as present or absent at wave and site level. A second, smaller part covers the site-level wave sums and the three copies of EWAR_ORDER.filter(non-zero) with hand-written rrep-to-rr mapping. I also found a drift bug: mock-data's npc() writes neut as +1, against the negative convention.

**Sites (13).**

- [`src/data/npc-stats/math.ts:220-248`](../../src/data/npc-stats/math.ts#L220-L248) — summariseWave: quantity-weighted ewScram/ewWeb/ewNeut/ewRrep. ewWeb sums the web speed factor, not a count. These outputs are never read.
- [`src/data/npc-stats/types.ts:39-47`](../../src/data/npc-stats/types.ts#L39-L47) — WaveTotals carries the four dead ew* fields
- [`src/features/wormhole-sites/queries.ts:46-67`](../../src/features/wormhole-sites/queries.ts#L46-L67) — mergeNpc defines the Npc convention: scram raw, web 0/1, neut = -neutCount, rrep = rrepCount
- [`src/features/wormhole-sites/queries.ts:69-127`](../../src/features/wormhole-sites/queries.ts#L69-L127) — nullIfZero plus the aggregateWave loop (85-112) re-derive the wave EWAR from stats, ignoring quantity, and discard totals.ew*
- [`src/features/wormhole-sites/mock-data.ts:41-44, 55-83`](../../src/features/wormhole-sites/mock-data.ts#L41-L44) — npc() sets neut: 1 (positive, a drift bug). wave() reduces the Npc fields with \|\| null, which is the same rule as aggregateWave.
- [`src/features/wormhole-sites/components/site-card-header-view.ts:26-34`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L26-L34) — activeSiteEwar: four wave reduces with ewRrep mapped to rr, then filters EWAR_ORDER for non-zero
- [`src/features/wormhole-sites/sort.ts:43-45`](../../src/features/wormhole-sites/sort.ts#L43-L45) — siteScramTotal: wave scram reduce, used by the sort and by SitesTable
- [`src/features/wormhole-sites/components/SitesTable.tsx:50-58`](../../src/features/wormhole-sites/components/SitesTable.tsx#L50-L58) — Scrams column renders the siteScramTotal magnitude. This is the only place an EWAR magnitude is shown at wave or site level.
- [`src/features/wormhole-sites/components/EwarRow.tsx:5-28`](../../src/features/wormhole-sites/components/EwarRow.tsx#L5-L28) — EWAR_ORDER.filter((counts[k] ?? 0) !== 0) at lines 16-17
- [`src/features/wormhole-sites/components/WaveCard.tsx:33-40`](../../src/features/wormhole-sites/components/WaveCard.tsx#L33-L40) — maps wave.ewRrep to rr by hand for EwarRow
- [`src/features/wormhole-sites/components/NpcRow.tsx:13-21`](../../src/features/wormhole-sites/components/NpcRow.tsx#L13-L21) — npcEwarKeys: maps rrep to rr by hand, then the same EWAR_ORDER non-zero filter
- [`src/features/wormhole-sites/components/wormhole-styles.ts:54-70`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L54-L70) — EwarKey, EWAR_TONE, EWAR_LABEL, EWAR_ORDER
- [`src/features/wormhole-sites/queries.test.ts:262-345`](../../src/features/wormhole-sites/queries.test.ts#L262-L345) — Pins the current quantity-blind rule: a quantity-3 row with scram 2 gives ewScram 2. Also pins neut -3 and null when nothing contributes or the wave is empty.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/npc-stats/math.ts:220-248 (dps/alpha/ehp part)`](../../src/data/npc-stats/math.ts#L220-L248) — The quantity-weighted dpsTotal, alphaTotal and ehpTotal are live and correct. Only the ew* fields go.
- [`src/features/wormhole-sites/components/NpcRow.tsx:36-40`](../../src/features/wormhole-sites/components/NpcRow.tsx#L36-L40) — The `NEUT ${npc.neut}` chip label is a per-NPC display choice. Keep it as is.

</details>

**Home.** `New src/features/wormhole-sites/ewar.ts takes EwarKey and EWAR_ORDER from components/wormhole-styles.ts and adds npcEwar, waveEwar, waveEwarCounts, siteEwarTotals and activeEwarKeys. wormhole-styles.ts keeps EWAR_TONE and EWAR_LABEL, typed by EwarKey imported from '../ewar'. summariseWave stays in data/npc-stats without its ew* fields.`

**Boundary check.** ewar.ts and all its consumers (queries.ts, mock-data.ts, sort.ts, components/*.tsx and components/site-card-header-view.ts) are in the features zone under src/features/wormhole-sites, so the imports are intra-zone and need no rule. Keeping EwarKey and EWAR_ORDER at the feature root means sort.ts and queries.ts never import from components/. queries.ts continues to import summariseWave from data, which the 'from: features' rule allows.

**API sketch.**

```ts
export type EwarKey = 'web' | 'scram' | 'neut' | 'rr';
export const EWAR_ORDER: readonly EwarKey[] = ['web', 'scram', 'neut', 'rr'];
export type EwarCounts = Record<EwarKey, number | null>;
export function npcEwar(npc: Npc): EwarCounts; // rrep -> rr
export function waveEwar(npcs: readonly Npc[]): Pick<Wave, 'ewScram' | 'ewWeb' | 'ewNeut' | 'ewRrep'>; // sum of Npc fields, 0 -> null
export function waveEwarCounts(wave: Wave): EwarCounts; // ewRrep -> rr
export function siteEwarTotals(site: SiteDetail): Record<EwarKey, number>;
export function activeEwarKeys(counts: EwarCounts): EwarKey[]; // EWAR_ORDER, non-zero
```

**Migration steps.**

1. Create ewar.ts with EwarKey and EWAR_ORDER moved from wormhole-styles.ts, plus npcEwar, waveEwar, waveEwarCounts, siteEwarTotals and activeEwarKeys. Update wormhole-styles.ts and its importers to take EwarKey and EWAR_ORDER from '../ewar'.
2. In queries.ts aggregateWave, build `enriched` first and spread ...waveEwar(enriched) into the Wave. Delete the eight accumulators, the loop and nullIfZero. Keep summariseWave(contributing) for dps, alpha and ehp.
3. In data/npc-stats, delete ewScram, ewWeb, ewNeut and ewRrep from WaveTotals and summariseWave, and update math.test.ts (lines 168-171 and the empty-wave expectation at 175-183).
4. In mock-data.ts, replace the wave() reduce with ...waveEwar(npcs), and change npc() to set neut: neut ? -1 : null so it matches mergeNpc's negative convention.
5. Rewrite site-card-header-view activeSiteEwar as activeEwarKeys(siteEwarTotals(site)). Make sort.ts siteScramTotal a one-line wrapper around siteEwarTotals(s).scram, since SitesTable imports it.
6. Have EwarRow take `counts: EwarCounts` and use activeEwarKeys, with WaveCard passing waveEwarCounts(wave). Rewrite NpcRow's npcEwarKeys as activeEwarKeys(npcEwar(npc)).
7. Separately, and only after a product decision: if scrams should be weighted by quantity, change only waveEwar (multiply by n.quantity) and update the queries.test.ts expectations. Nothing else moves.

**Tests.** Existing guards that must pass unchanged: queries.test.ts 262-345 (wave ew* values including -3 neut, null rrep on the second wave, all-null empty wave), site-card-header-view.test.ts, sort.test.ts (scram ordering) and npc-summary.test.ts. Update math.test.ts summariseWave expectations to drop the ew* fields. Add ewar.test.ts covering: waveEwar returns null when no row contributes; -0 neut gives null; rows with null stats are skipped; mixed rows sum per field; activeEwarKeys keeps EWAR_ORDER and drops zero and null; siteEwarTotals sums across waves treating null as 0.

**Notes.** The extraction must not change behaviour. Today's rule ignores quantity, counts web as 1 per row, and makes neut negative; queries.test.ts pins this rule. Whether to weight by quantity is a product decision. It affects only the Scrams magnitude (SitesTable column and sort); other EWAR is shown only as present or absent. Make the decision after the extraction, in waveEwar alone. summariseWave's ewWeb (the web speed factor summed) is semantically wrong as a count, so deleting it is correct and must not be promoted to the canonical rule. Drift bug: mock-data npc() writes neut +1, while real data uses the negative convention, which is correct. It is visible only on the /preview/cards page.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p071"></a>

## P071: Make resourceValueEligible a type guard in live-isk.ts and share the live-price lookup type between the site and scanner contexts

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -10 net (two casts and three predicate copies removed, two NO_LIVE/memo blocks folded; plus about 20 for the guard and lookup module)
- **Depends on:** [P084](wave-04-formatting-dates-and-names-have-one-home.md#p084)
- **Existing primitive:** `src/features/wormhole-sites/live-isk.ts:liveIskFor`

**Problem.** Client code decides in four places whether a SiteResource can be live-priced, with drifted shapes. liveEligible plus typeId appears in three; liveEligible, typeId and units > 0 in one. None narrows the type, so callers cast `resource.typeId as number`. SiteLiveContext and ScannerLiveContext each define the same {priceOf, isPending} value type, a NO_LIVE default and a provider that memoises `priceOf: (id) => prices.get(id)` over useRefreshOnView.

**Verifier revision.** Partly real. The four client checks of 'can this resource be live-priced' (live-recipes-for-search L9-10, resourceValueEligible, resourceLiveIsk L27, eligibleTypeIdsOf) differ in shape: only live-recipes checks units. None is a type guard, which forces `as number` in SiteResourcesLive L20 and ResourceRow L18. resourceValueEligible is already the local predicate, so the fix is to make it a type guard and use it everywhere. The two contexts really do share the {priceOf, isPending} shape, a NO_LIVE default and the same priceOf memo around useRefreshOnView. Rejected parts: (1) liveOrSeedIsk wraps a one-line expression in another one-liner at three sites that are already named helpers (resourceLiveIsk, recipeLiveIsk). overlayLivePrices has a different shape: it stores liveIsk separately and derives effectiveIsk = liveIsk ?? totalIsk. (2) The server isLiveEligible (live-prices L46-53) is not a re-check. It produces the flag from type volume, which the client cannot see. The contexts must stay separate: the providers sit in different trees (SiteCard/SitesTable vs the mapper's SignatureWindow/SystemIntelligenceBody) with different enable rules. Payoff is low.

**Sites (7).**

- [`src/features/wormhole-sites/live-recipes-for-search.ts:8-15`](../../src/features/wormhole-sites/live-recipes-for-search.ts#L8-L15) — liveEligible && typeId != null && units > 0, then builds SiteLiveRecipe
- [`src/features/wormhole-sites/components/resource-row-view.ts:35-37`](../../src/features/wormhole-sites/components/resource-row-view.ts#L35-L37) — resourceValueEligible: liveEligible && typeId != null (not a guard)
- [`src/features/wormhole-sites/components/site-live-context.ts:8-30`](../../src/features/wormhole-sites/components/site-live-context.ts#L8-L30) — SiteLiveValue, NO_LIVE, resourceLiveIsk re-checking eligibility at L27
- [`src/features/wormhole-sites/components/SiteResourcesLive.tsx:17-23, 37-42, 47-54`](../../src/features/wormhole-sites/components/SiteResourcesLive.tsx#L17-L23) — eligibleTypeIdsOf with `as number` at L20; priceOf memo; LiveSiteTotal pending check at L51, which is not gated on eligibility
- [`src/features/wormhole-sites/components/ResourceRow.tsx:11-21`](../../src/features/wormhole-sites/components/ResourceRow.tsx#L11-L21) — `resource.typeId as number` at L18 after resourceValueEligible
- [`src/features/wormhole-sites/components/ScannerLivePrices.tsx:24-38, 54-64`](../../src/features/wormhole-sites/components/ScannerLivePrices.tsx#L24-L38) — ScannerLiveValue, NO_LIVE, the same priceOf memo; refreshKey refetch in place
- [`src/features/wormhole-sites/live-isk.ts:1-5`](../../src/features/wormhole-sites/live-isk.ts#L1-L5) — liveIskFor; the proposed home for the guard

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/live-prices.ts:25-32, 46-53`](../../src/features/wormhole-sites/live-prices.ts#L25-L32) — server-side producer of liveEligible (needs type volume). Its `r.typeId!` at L28 can go if isLiveEligible narrows too, but it is not a duplicate of the client checks
- [`src/features/wormhole-sites/scanner-live-isk.ts:4-9`](../../src/features/wormhole-sites/scanner-live-isk.ts#L4-L9) — recipeLiveIsk already names live-or-seed for recipes; a liveOrSeedIsk wrapper adds indirection for no gain
- [`src/features/wormhole-sites/components/site-live-context.ts:26-30`](../../src/features/wormhole-sites/components/site-live-context.ts#L26-L30) — the live-or-seed part of resourceLiveIsk stays as is; only its eligibility check changes

</details>

**Home.** `src/features/wormhole-sites/live-isk.ts (isLivePricedResource); src/features/wormhole-sites/components/live-price-lookup.ts (LivePriceLookup type, NO_LIVE_PRICES, useLivePriceLookup)`

**Boundary check.** All files are inside the single autoDiscovered zone features/wormhole-sites, where intra-zone imports are unrestricted. live-isk.ts is pure and has no 'use client', so it stays importable from the server module live-recipes-for-search.ts and from the client components. live-price-lookup.ts imports @/data/market-prices/use-refresh-on-view, which the features rule allows (data) and which both providers already import. External consumers (mapper/signatures, mapper/windows) keep importing via widget.tsx and scanner-live-prices.ts, unchanged.

**API sketch.**

```ts
// live-isk.ts
export type LivePricedResource = SiteResource & { typeId: number; units: number };
export function isLivePricedResource(r: SiteResource): r is LivePricedResource { return r.liveEligible && r.typeId != null && r.units != null && r.units > 0; }
// components/live-price-lookup.ts
export interface LivePriceLookup { readonly priceOf: (typeId: number) => RefreshedPrice | undefined; readonly isPending: (typeId: number) => boolean }
export const NO_LIVE_PRICES: LivePriceLookup;
export function useLivePriceLookup(typeIds: number[], opts: { enabled: boolean; refreshKey?: string }): LivePriceLookup
```

**Migration steps.**

1. Add isLivePricedResource to live-isk.ts. Delete resourceValueEligible from resource-row-view.ts and move its test cases from resource-row-view.test.ts to a live-isk test.
2. live-recipes-for-search.ts: `if (!isLivePricedResource(resource)) continue;` replaces L9-10.
3. site-live-context.ts resourceLiveIsk: `if (!isLivePricedResource(resource)) return resource.effectiveIsk;`.
4. SiteResourcesLive.tsx: eligibleTypeIdsOf becomes `resources.filter(isLivePricedResource).map((r) => r.typeId)`, with no cast. LiveSiteTotal L51 becomes `isLivePricedResource(r) && live.isPending(r.typeId)`.
5. ResourceRow.tsx: `if (!isLivePricedResource(resource)) return …;` then `live.isPending(resource.typeId)`, with no cast.
6. Create components/live-price-lookup.ts. Set SiteLiveValue = LivePriceLookup & { requestEnable }; ScannerLiveValue becomes LivePriceLookup; both NO_LIVE constants spread NO_LIVE_PRICES. Both providers call useLivePriceLookup. SiteLiveProvider memoises `{ ...lookup, requestEnable }`. The scanner passes `{ enabled: typeIds.length > 0, refreshKey: scannerLiveTypeIdKey(typeIds) }` and can drop the `[...typeIds]` copy.

**Tests.** Existing guards: live-recipes-for-search.test.ts, site-live-context.test.ts, resource-row-view.test.ts (moves to the guard), scanner-live-isk.test.ts, ScannerLivePrices.test.ts (refreshKey refetch in place), live-prices.test.ts (server flag). Add guard cases: liveEligible false; typeId null; units null; units 0; all valid.

**Notes.** Adding `units > 0` to the guard preserves behaviour: the server sets liveEligible only when typeId != null, units > 0 and the type has volume (live-prices L46-53), and every other producer sets liveEligible false (queries.ts L264, L366; mock-data L104). So the extra units check never changes a result at the old resourceValueEligible sites, and liveIskFor returns null for units <= 0 anyway. Gating LiveSiteTotal's pending on eligibility is equivalent today, because useRefreshOnView's isPending is true only for requested ids (the pending set comes from toRefresh). Keep the two contexts separate. Keep the scanner's refreshKey refetch-in-place (ScannerLivePrices L52-57) and the site provider's intersection-triggered enable. Optional follow-up: make the server isLiveEligible a guard as well, to drop `r.typeId!` at live-prices L28.

<sub>Reported by: area:features-sites-misc.</sub>

<a id="p072"></a>

## P072: Delete the module-global site-name index and make GlobalSearch the only writer of the site search index

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -45 production lines (module index, setter coupling, layout effect, fallback, barrel file) and +20 (pure builder, empty lookups). About 40 test lines rewritten.
- **Depends on:** [P071](#p071)
- **Existing primitive:** `src/lib/client-store.ts:createClientStore,useClientStore`

**Problem.** features/wormhole-sites keeps the site-name lookup in two places: the module global BY_NAME in site-name-lookup.ts, filled through setSiteSearchIndex, and a byName map in the SiteCatalogueProvider context. The module index has two writers that both mount on /atlas. GlobalSearch, in the (site) layout header, writes the sheet index from getSiteSearchIndex in a useEffect. SiteCatalogueProvider writes the live-priced getScannerSiteIndex in a useLayoutEffect. Neither cleans up. So the global search 'Sites' ISK sub-label shows live or sheet values depending on navigation and refresh order, and it keeps live /atlas values on other pages. In production the module BY_NAME is read only through MODULE_FALLBACK and the scanner-row-open default argument. Every production consumer sits under the provider and passes catalogue.siteIdForName, so the global effectively serves only tests. A second barrel, scanner-live-prices.ts (a .ts file), re-exports the ScannerLivePrices component. SystemIntelligenceBody imports through it, and it escapes the widget-host census because FEATURE_TSX only matches .tsx targets.

**Verifier revision.** The defect is real. Two module-global writers feed SITE_INDEX and BY_NAME: GlobalSearch's passive effect sends the sheet-priced index from AppHeader, and SiteCatalogueProvider's layout effect sends the live-priced scanner index from AtlasBound. Nothing cleans either up. Arriving on /atlas by client navigation lets the scanner index win, and it stays sitewide after you leave. An AtlasReturnRefresh router.refresh re-runs both effects in one commit, layout before passive, so the sheet index wins. The site-name lookup is built twice, once in the module (BY_NAME) and once in the context's useMemo. scanner-live-prices.ts is a second barrel that slips past the widget-host census. The proposed design is wrong, though. The catalogue is request-scoped server data that must resolve on the first, server render; site-catalogue.test.ts:22-45 asserts exactly that. createClientStore's serverValue is a single module constant, so readers would hydrate against EMPTY and then flash. Publishing per-request data into a module store during server render would leak between requests. The value is stable through hydration, so the src/AGENTS.md rule (for client state that changes after load) does not apply. The fix is to keep the context, delete the module-global name index and its fallback, and leave GlobalSearch as the only writer of the search index.

**Sites (17).**

- [`src/features/wormhole-sites/site-name-lookup.ts:20-60`](../../src/features/wormhole-sites/site-name-lookup.ts#L20-L60) — Module-global BY_NAME, SiteNameIndexEntry, setSiteNameIndex and three lookups. Lines 1-12 (siteNameIndexKeys) stay.
- [`src/features/wormhole-sites/search.ts:9-21`](../../src/features/wormhole-sites/search.ts#L9-L21) — SITE_INDEX setter also rebuilds BY_NAME through setSiteNameIndex
- [`src/features/wormhole-sites/site-catalogue.tsx:27-31, 42-57, 59-61, 70-72`](../../src/features/wormhole-sites/site-catalogue.tsx#L27-L31) — MODULE_FALLBACK; second byName build in useMemo; layout effect writes the globals; fallback when no provider
- [`src/components/composition/GlobalSearch.tsx:35-37`](../../src/components/composition/GlobalSearch.tsx#L35-L37) — Writer 1: passive effect with the sheet index
- [`src/components/composition/AppHeader.tsx:38-39, 59-60`](../../src/components/composition/AppHeader.tsx#L38-L39) — Header gets getSiteSearchIndex (sheet values). SiteFrame renders it from src/app/(site)/layout.tsx, so it mounts on /atlas too.
- [`src/features/wormhole-sites/queries.ts:289-321`](../../src/features/wormhole-sites/queries.ts#L289-L321) — The two writers publish different ISK: the sheet index (cacheLife max) and the scanner index (overlayLivePrices plus liveRecipes)
- [`src/app/(site)/atlas/AtlasBound.tsx:32-46, 91-101`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L32-L46) — Writer 2's source: the scanner index, or the lightweight index as a degraded fallback
- [`src/app/(site)/atlas/AtlasReturnRefresh.tsx:7-16`](../../src/app/%28site%29/atlas/AtlasReturnRefresh.tsx#L7-L16) — router.refresh re-renders both server props, so both effects re-run in one commit and the passive (sheet) write lands last
- [`src/mapper/signatures/scanner-row-open.ts:1, 26-30, 53-58`](../../src/mapper/signatures/scanner-row-open.ts#L1) — Default resolveSiteId reads the module global. Only tests rely on the default.
- [`src/mapper/signatures/SignatureWindow.tsx:6-9, 76-78, 105-108`](../../src/mapper/signatures/SignatureWindow.tsx#L6-L9) — The production caller passes catalogue.siteIdForName from context
- [`src/features/wormhole-sites/components/ScannerLivePrices.tsx:22, 47, 73, 86`](../../src/features/wormhole-sites/components/ScannerLivePrices.tsx#L22) — Every useSiteCatalogue consumer renders under the provider in production
- [`src/features/wormhole-sites/widget.tsx:11-16`](../../src/features/wormhole-sites/widget.tsx#L11-L16) — The canonical slice barrel. It lacks useScannerEstIskSum.
- [`src/features/wormhole-sites/scanner-live-prices.ts:1`](../../src/features/wormhole-sites/scanner-live-prices.ts#L1) — Second barrel re-exporting a .tsx component
- [`src/mapper/windows/SystemIntelligenceBody.tsx:11`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L11) — Imports hosted feature UI through the .ts barrel and is missing from WIDGET_HOST_FILES
- [`src/composition/__tests__/widget-host-census.ts:17-18, 98-113`](../../src/composition/__tests__/widget-host-census.ts#L17-L18) — FEATURE_TSX only classifies .tsx targets, so a .ts re-export barrel is invisible
- [`src/composition/__tests__/widget-host-registry.ts:1-10`](../../src/composition/__tests__/widget-host-registry.ts#L1-L10) — Registry of widget host files
- [`src/features/wormhole-sites/site-catalogue.test.ts:22-80`](../../src/features/wormhole-sites/site-catalogue.test.ts#L22-L80) — Asserts the provider resolves on first (server) render. That guard is why a client store is the wrong primitive.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/client-store.ts:23-45`](../../src/lib/client-store.ts#L23-L45) — Wrong primitive here. serverValue is a module-level constant, so request-scoped server props would hydrate as empty and setting it on the server would leak across requests. The context value is stable through hydration.
- [`src/features/wormhole-sites/search.ts:31-61`](../../src/features/wormhole-sites/search.ts#L31-L61) — sitesSearchSource reading SITE_INDEX is a legitimate non-React module index for the search registry. Keep it, but with one writer.

</details>

**Home.** `src/features/wormhole-sites/site-name-lookup.ts (pure createSiteNameLookups) + existing SiteCatalogueProvider context in src/features/wormhole-sites/site-catalogue.tsx; widget.tsx as the only barrel`

**Boundary check.** Everything new lives in the features zone (src/features/wormhole-sites). Consumers: mapper (scanner-row-open, SignatureWindow, SystemIntelligenceBody) under rule from:mapper allow[features]; app (AtlasBound) under from:app allow[features]; components-composition (GlobalSearch, still importing search.ts) under from:components-composition allow[features]. site-name-lookup.ts must not import ./queries; declare a structural entry type to avoid a type cycle, since queries.ts imports SiteLiveRecipe from it. The widget-host census additionally requires mapper hosts to import feature .tsx only through src/features/<slice>/widget.tsx.

**API sketch.**

```ts
// site-name-lookup.ts (pure, no module state)
export type SiteCatalogueEntry = { readonly id: number; readonly name: string; readonly siteType: string; readonly blueLootIsk: number | null; readonly resourceValueIsk: number | null; readonly liveRecipes?: readonly SiteLiveRecipe[] };
export type SiteCatalogueLookups = { siteIdForName(name: string): number | null; estIskForName(name: string): number | null; liveRecipesForName(name: string): readonly SiteLiveRecipe[] };
export const EMPTY_SITE_LOOKUPS: SiteCatalogueLookups;
export function createSiteNameLookups(entries: readonly SiteCatalogueEntry[]): SiteCatalogueLookups;
// site-catalogue.tsx
export function SiteCatalogueProvider(props: { siteIndex: readonly SiteSearchEntry[]; children?: ReactNode }): JSX.Element; // useMemo(createSiteNameLookups), no effects
export function useSiteCatalogue(): SiteCatalogueLookups; // context ?? EMPTY_SITE_LOOKUPS
// scanner-row-open.ts
scannerRowOpenAction(row, canEdit, resolveSiteId: (name: string) => number | null) // required
```

**Migration steps.**

1. In site-name-lookup.ts, add SiteCatalogueEntry, SiteCatalogueLookups (moved from site-catalogue.tsx), EMPTY_SITE_LOOKUPS and createSiteNameLookups. Build the byName map with siteNameIndexKeys, compute estIsk with primarySiteIsk(entry) and default liveRecipes to []. The logic moves verbatim from site-catalogue.tsx:42-56.
2. In site-catalogue.tsx, replace the useMemo body with createSiteNameLookups(siteIndex). Delete the useLayoutEffect (59-61), the ./search import and MODULE_FALLBACK. useSiteCatalogue returns useContext(...) ?? EMPTY_SITE_LOOKUPS.
3. In search.ts, make setSiteSearchIndex only assign SITE_INDEX and drop the setSiteNameIndex import and call. GlobalSearch is now the only writer, so search shows sheet ISK on every route.
4. In site-name-lookup.ts, delete BY_NAME, SiteNameRecord, SiteNameIndexEntry, setSiteNameIndex, siteIdForSiteName, siteEstIskForSiteName and siteLiveRecipesForSiteName.
5. In scanner-row-open.ts, remove the import and both '= siteIdForSiteName' defaults (29, 56) so resolveSiteId is required. Production callers already pass it.
6. Barrel: add useScannerEstIskSum to the widget.tsx re-export from './components/ScannerLivePrices', point SystemIntelligenceBody.tsx:11 at '@/features/wormhole-sites/widget', delete scanner-live-prices.ts, and add 'src/mapper/windows/SystemIntelligenceBody.tsx' to WIDGET_HOST_FILES.
7. Migrate the tests that seed the module index. ScannerLivePrices.test.ts and SignatureWindow.test.ts wrap the tree in SiteCatalogueProvider with SiteSearchEntry fixtures (siteType plus blueLootIsk/resourceValueIsk instead of estIsk). scanner-row-open.test.ts passes createSiteNameLookups([...]).siteIdForName explicitly. site-name-lookup.test.ts targets createSiteNameLookups. The widget-host-registry.test.ts:26 fixture string can stay, since it is resolver-mapped text.

**Tests.** Keep site-catalogue.test.ts 'resolves from props on first render' (renderToStaticMarkup). It guards the SSR behaviour that rules out a client store. Replace that test's module-fallback half with 'outside a provider every lookup returns null/[]'. Port site-name-lookup.test.ts to createSiteNameLookups, covering the typo alias in both directions, estIsk through primarySiteIsk for combat (blueLootIsk) and for gas/ore (resourceValueIsk), and the liveRecipes default. search.test.ts and composition/search/scope-equivalence.test.ts keep calling setSiteSearchIndex unchanged. widget-host-registry.test.ts 'lists every host' must now include SystemIntelligenceBody.tsx; optionally harden widget-host-census to follow `export ... from` in feature .ts files so a .ts barrel cannot hide a .tsx component again. AtlasBound.test.ts mocks SiteCatalogueProvider and needs no change. ScannerLivePrices.test.ts, SignatureWindow.test.ts and scanner-row-open.test.ts switch from setSiteNameIndex seeding to a provider or explicit lookups.

**Notes.** Behaviour change to accept: on /atlas the global-search 'Sites' sub-label shows sheet ISK, as on every other page, instead of whichever index wrote last. If live ISK in search is wanted it needs its own explicit design, not a racing side effect. Estimates match between the two current byName builders (both use primarySiteIsk), so scanner cells render the same. Keep the provider's first-render resolution: any design that resolves lookups only after an effect makes Est. ISK cells flash on hydration. Drift found: after a client navigation away from /atlas, sitesSearchSource keeps the live-priced scanner index until a refresh re-runs GlobalSearch's effect.

<sub>Reported by: area:features-sites-misc.</sub>

← [Wave 12: Market data, search and client data reads](wave-12-market-data-search-and-client-data-reads.md) · [Index](README.md#roadmap) · [Wave 14: Convex backend helpers](wave-14-convex-backend-helpers.md) →
