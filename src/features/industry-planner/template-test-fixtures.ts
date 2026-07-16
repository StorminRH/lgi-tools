import type { TemplatePlannerState } from './components/planner-contexts';
import type { ApplyCtx, TemplateStructureView } from './template-manifest';

// The shared mock-planner harness for template tests: a getter-based ctx view
// over a mutable state store whose setters mimic the provider's public surface
// (including the #187 no-double-select guard). Lifted out of
// template-manifest.test.ts so the loader tests (template-load.test.ts) drive
// the REAL applyTemplate through the same surface. Test-only by intent — no
// production module imports this.

export interface TestStructure {
  id: string;
  name: string;
}

export interface MockState {
  runs: number;
  location: { systemId: number; systemName: string; security: number | null } | null;
  station: { id: number; name: string } | null;
  buildCharacterId: number | null;
  selectedStructure: TestStructure | null;
  reactionStructure: TestStructure | null;
  reactionSystem: { systemId: number; systemName: string; security: number | null } | null;
  meOverrides: Map<number, number>;
  teOverrides: Map<number, number>;
  costBasis: 'batched' | 'marginal';
  marginMode: 'gross' | 'net';
  multibuyMode: 'Total' | 'Remaining';
  multibuyUncheckedTiers: ReadonlySet<number>;
  persistedBuildLocation: MockState['location'];
}

export const STRUCTURE: TemplateStructureView = {
  blueprintTypeId: 999,
  // Two build nodes; 999 (the top blueprint) is valid for overrides too.
  nodeActivityByBlueprint: { 111: 1, 222: 11 },
};

export function makeMockPlanner(opts?: {
  roster?: { characterId: number }[];
  structures?: TestStructure[];
  buildSystemOutcome?: 'applied' | 'failed' | 'superseded';
  stations?: { id: number }[];
}) {
  const roster = opts?.roster ?? [{ characterId: 91 }];
  const structures = opts?.structures ?? [
    { id: 'corp:1021', name: 'Sotiyo Prime' },
    { id: 'custom-uuid-1', name: 'Imagined Athanor' },
  ];
  const outcome = opts?.buildSystemOutcome ?? 'applied';
  const stations = opts?.stations ?? [{ id: 60000001 }];
  const state: MockState = {
    runs: 1,
    location: null,
    station: null,
    buildCharacterId: null,
    selectedStructure: null,
    reactionStructure: null,
    reactionSystem: null,
    meOverrides: new Map(),
    teOverrides: new Map(),
    costBasis: 'marginal',
    marginMode: 'net',
    multibuyMode: 'Remaining',
    multibuyUncheckedTiers: new Set(),
    persistedBuildLocation: null,
  };
  const ctx = {
    get runs() {
      return state.runs;
    },
    setRuns(n: number) {
      state.runs = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    },
    get location() {
      return state.location;
    },
    setLocation(loc: MockState['location']) {
      state.location = loc;
      state.station = null;
    },
    get station() {
      return state.station;
    },
    setStation(id: number | null, name: string | null) {
      state.station = id === null ? null : { id, name: name ?? '' };
    },
    get buildCharacter() {
      return roster.find((c) => c.characterId === state.buildCharacterId) ?? null;
    },
    get buildCharacters() {
      return roster;
    },
    setBuildCharacter(id: number | null) {
      state.buildCharacterId = id;
    },
    get availableStructures() {
      return structures;
    },
    get selectedStructure() {
      return state.selectedStructure;
    },
    // Mimics the provider's #187 guard: taking the reaction slot's structure
    // as the build structure vacates the reaction pair.
    setSelectedStructure(s: TestStructure | null) {
      state.selectedStructure = s;
      if (s && state.reactionStructure && state.reactionStructure.id === s.id) {
        state.reactionStructure = null;
        state.reactionSystem = null;
      }
    },
    get reactionStructure() {
      return state.reactionStructure;
    },
    setReactionStructure(s: TestStructure | null) {
      state.reactionStructure = s;
    },
    get reactionSystem() {
      return state.reactionSystem;
    },
    setReactionSystem(sys: MockState['reactionSystem']) {
      state.reactionSystem = sys;
    },
    get meOverrides() {
      return state.meOverrides;
    },
    setMeOverride(bp: number, me: number) {
      state.meOverrides = new Map(state.meOverrides).set(bp, me);
    },
    resetMeOverride(bp: number) {
      const next = new Map(state.meOverrides);
      next.delete(bp);
      state.meOverrides = next;
    },
    get teOverrides() {
      return state.teOverrides;
    },
    setTeOverride(bp: number, te: number) {
      state.teOverrides = new Map(state.teOverrides).set(bp, te);
    },
    resetTeOverride(bp: number) {
      const next = new Map(state.teOverrides);
      next.delete(bp);
      state.teOverrides = next;
    },
    get costBasis() {
      return state.costBasis;
    },
    setCostBasis(b: MockState['costBasis']) {
      state.costBasis = b;
    },
    get marginMode() {
      return state.marginMode;
    },
    setMarginMode(m: MockState['marginMode']) {
      state.marginMode = m;
    },
    get multibuyMode() {
      return state.multibuyMode;
    },
    setMultibuyMode(m: MockState['multibuyMode']) {
      state.multibuyMode = m;
    },
    get multibuyUncheckedTiers() {
      return state.multibuyUncheckedTiers;
    },
    setMultibuyUncheckedTiers(tiers: ReadonlySet<number>) {
      state.multibuyUncheckedTiers = new Set(tiers);
    },
    async applyBuildSystem(
      sys: NonNullable<MockState['location']>,
      o: { persist: boolean },
    ) {
      if (outcome !== 'applied') return { status: outcome };
      state.location = { ...sys };
      state.station = null;
      if (o.persist) state.persistedBuildLocation = { ...sys };
      return {
        status: 'applied',
        data: { stations, costIndices: { manufacturing: null, reaction: null }, adjustedPrices: [] },
      };
    },
    clearBuildLocation() {
      state.location = null;
      state.station = null;
      state.persistedBuildLocation = null;
    },
  } as unknown as TemplatePlannerState;
  return { ctx, state };
}

export function makeApplyCtx(ctx: TemplatePlannerState): ApplyCtx {
  return { ctx, structure: STRUCTURE, fetchedStations: null };
}

// A fully-configured planner — every field away from its default.
export function configureFull(state: MockState) {
  state.runs = 3;
  state.location = { systemId: 30000142, systemName: 'Jita', security: 0.9 };
  state.station = { id: 60000001, name: 'Jita IV - Moon 4' };
  state.buildCharacterId = 91;
  state.selectedStructure = { id: 'corp:1021', name: 'Sotiyo Prime' };
  state.reactionStructure = { id: 'custom-uuid-1', name: 'Imagined Athanor' };
  state.reactionSystem = { systemId: 30002187, systemName: 'Amarr', security: 1.0 };
  state.meOverrides = new Map([
    [111, 5],
    [999, 10],
  ]);
  state.teOverrides = new Map([[222, 20]]);
  state.costBasis = 'batched';
  state.marginMode = 'gross';
  state.multibuyMode = 'Total';
  state.multibuyUncheckedTiers = new Set([3, 2]);
}
