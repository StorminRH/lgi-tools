import { describe, expect, it } from 'vitest';
import { PREFERENCES } from '@/lib/preferences';
import type { PricingContextValue } from './components/PricingProvider';
import {
  applyTemplate,
  captureTemplate,
  PREF_CLASSIFICATION,
  TEMPLATE_FIELD_KEYS,
  type ApplyCtx,
  type TemplateStructureView,
} from './template-manifest';
import { planSnapshotV1Schema, snapshotFieldSchemas } from './template-snapshot';

// The template core, tested against a mock context whose setters mimic the
// provider's public surface (including the #187 no-double-select guard). The
// round-trip pin is the completeness proof: capture → apply(fresh) → capture
// must be stable when every reference resolves; the degrade battery pins that
// each dangling-reference kind degrades ITS field alone, with one note, and
// never throws.

interface TestStructure {
  id: string;
  name: string;
}

interface MockState {
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

const STRUCTURE: TemplateStructureView = {
  blueprintTypeId: 999,
  // Two build nodes; 999 (the top blueprint) is valid for overrides too.
  nodeActivityByBlueprint: { 111: 1, 222: 11 },
};

function makeMockPlanner(opts?: {
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
  } as unknown as PricingContextValue;
  return { ctx, state };
}

function makeApplyCtx(ctx: PricingContextValue): ApplyCtx {
  return { ctx, structure: STRUCTURE, fetchedStations: null };
}

// A fully-configured planner — every field away from its default.
function configureFull(state: MockState) {
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

describe('captureTemplate', () => {
  it('captures a snapshot the versioned schema accepts, with deterministic ordering', () => {
    const { ctx, state } = makeMockPlanner();
    configureFull(state);
    const snap = captureTemplate(ctx, 999);
    expect(() => planSnapshotV1Schema.parse(snap)).not.toThrow();
    expect(snap.v).toBe(1);
    expect(snap.blueprintTypeId).toBe(999);
    // Maps/Sets serialize sorted so a re-save is byte-stable.
    expect(snap.meOverrides).toEqual([
      [111, 5],
      [999, 10],
    ]);
    expect(snap.multibuyUncheckedTiers).toEqual([2, 3]);
  });

  it('captures the unset default from an untouched planner', () => {
    const { ctx } = makeMockPlanner();
    const snap = captureTemplate(ctx, 999);
    expect(snap).toEqual({
      v: 1,
      blueprintTypeId: 999,
      runs: 1,
      buildSystem: null,
      station: null,
      buildCharacterId: null,
      buildStructure: null,
      reactionSystem: null,
      reactionStructure: null,
      meOverrides: [],
      teOverrides: [],
      costBasis: 'marginal',
      marginMode: 'net',
      multibuyMode: 'Remaining',
      multibuyUncheckedTiers: [],
    });
  });
});

describe('applyTemplate round-trip', () => {
  it('save → load → re-save is stable when every reference resolves (the completeness pin)', async () => {
    const source = makeMockPlanner();
    configureFull(source.state);
    const snap = captureTemplate(source.ctx, 999);

    const target = makeMockPlanner();
    const notes = await applyTemplate(makeApplyCtx(target.ctx), snap);
    expect(notes).toEqual([]);
    expect(captureTemplate(target.ctx, 999)).toEqual(snap);
    // The pref-backed system write-through happened (persist: true).
    expect(target.state.persistedBuildLocation).toEqual(snap.buildSystem);
  });

  it('a saved-default template clears a fully-configured planner (full-replacement semantics)', async () => {
    const source = makeMockPlanner();
    const snap = captureTemplate(source.ctx, 999);

    const target = makeMockPlanner();
    configureFull(target.state);
    const notes = await applyTemplate(makeApplyCtx(target.ctx), snap);
    expect(notes).toEqual([]);
    expect(captureTemplate(target.ctx, 999)).toEqual(snap);
  });
});

describe('applyTemplate per-field fail-open degrades', () => {
  // Each case starts from the same fully-configured snapshot and breaks ONE
  // reference — that field alone degrades, one note, everything else lands.
  async function degradeCase(
    mutate: (snap: ReturnType<typeof captureTemplate>) => void,
    target = makeMockPlanner(),
  ) {
    const source = makeMockPlanner();
    configureFull(source.state);
    const snap = captureTemplate(source.ctx, 999);
    mutate(snap);
    const notes = await applyTemplate(makeApplyCtx(target.ctx), snap);
    return { snap, notes, target };
  }

  it('a dangling build-structure id clears that slot only', async () => {
    const { notes, target } = await degradeCase((snap) => {
      snap.buildStructure = { id: 'corp:9999', name: 'Vanished Sotiyo' };
    });
    expect(notes).toEqual(['Build structure "Vanished Sotiyo" is gone or no longer shared — cleared']);
    expect(target.state.selectedStructure).toBeNull();
    // The rest of the template landed intact.
    expect(target.state.runs).toBe(3);
    expect(target.state.reactionStructure?.id).toBe('custom-uuid-1');
    expect(target.state.location?.systemId).toBe(30000142);
  });

  it('a dangling reaction-structure id clears that slot only', async () => {
    const { notes, target } = await degradeCase((snap) => {
      snap.reactionStructure = { id: 'custom-uuid-gone', name: 'Deleted Athanor' };
    });
    expect(notes).toEqual(['Reaction structure "Deleted Athanor" is gone or no longer shared — cleared']);
    expect(target.state.reactionStructure).toBeNull();
    // Its system survives — each field degrades alone.
    expect(target.state.reactionSystem?.systemId).toBe(30002187);
    expect(target.state.selectedStructure?.id).toBe('corp:1021');
  });

  it('a character no longer on the roster falls open to the active mirror', async () => {
    const { notes, target } = await degradeCase((snap) => {
      snap.buildCharacterId = 404;
    });
    expect(notes).toEqual(['Build character is no longer linked — using the active character']);
    expect(target.state.buildCharacterId).toBeNull();
    expect(target.state.runs).toBe(3);
  });

  it('a failed build-system fetch clears the slot and skips the station', async () => {
    const { notes, target } = await degradeCase(
      () => {},
      makeMockPlanner({ buildSystemOutcome: 'failed' }),
    );
    expect(notes).toEqual([
      'Build system "Jita" couldn\'t load — cleared',
      'Station "Jita IV - Moon 4" isn\'t in the loaded system — cleared',
    ]);
    expect(target.state.location).toBeNull();
    expect(target.state.station).toBeNull();
    // Everything not hanging off the system still landed.
    expect(target.state.selectedStructure?.id).toBe('corp:1021');
    expect(target.state.costBasis).toBe('batched');
  });

  it('a superseded build-system apply stays silent (a user action won the race)', async () => {
    const { notes, target } = await degradeCase(
      (snap) => {
        snap.station = null;
      },
      makeMockPlanner({ buildSystemOutcome: 'superseded' }),
    );
    expect(notes).toEqual([]);
    expect(target.state.runs).toBe(3);
  });

  it('a station missing from the loaded system clears with a note', async () => {
    const { notes, target } = await degradeCase(
      () => {},
      makeMockPlanner({ stations: [{ id: 60009999 }] }),
    );
    expect(notes).toEqual(['Station "Jita IV - Moon 4" isn\'t in the loaded system — cleared']);
    expect(target.state.station).toBeNull();
    expect(target.state.location?.systemId).toBe(30000142);
  });

  it('ME/TE overrides for blueprints not in this build are dropped, aggregated into one note each', async () => {
    const { notes, target } = await degradeCase((snap) => {
      snap.meOverrides = [
        [111, 5],
        [555, 3],
        [666, 7],
      ];
      snap.teOverrides = [[777, 12]];
    });
    expect(notes).toEqual([
      '2 ME overrides no longer apply to this build — dropped',
      '1 TE override no longer applies to this build — dropped',
    ]);
    expect([...target.state.meOverrides]).toEqual([[111, 5]]);
    expect(target.state.teOverrides.size).toBe(0);
  });

  it('a malformed field degrades to its fallback alone', async () => {
    const { notes, target } = await degradeCase((snap) => {
      (snap as Record<string, unknown>).runs = 'lots';
    });
    expect(notes).toEqual(['Saved runs couldn\'t be read — reset']);
    expect(target.state.runs).toBe(1);
    expect(target.state.costBasis).toBe('batched');
    expect(target.state.selectedStructure?.id).toBe('corp:1021');
  });

  it('a field absent from an older snapshot applies its fallback with no note', async () => {
    const { notes, target } = await degradeCase((snap) => {
      delete (snap as Record<string, unknown>).multibuyMode;
    });
    expect(notes).toEqual([]);
    expect(target.state.multibuyMode).toBe('Remaining');
  });

  it('a reaction structure duplicating the build structure degrades instead of recreating the forbidden state', async () => {
    const { notes, target } = await degradeCase((snap) => {
      snap.reactionStructure = { id: 'corp:1021', name: 'Sotiyo Prime' };
    });
    expect(notes).toEqual(['Reaction structure duplicated the build structure — cleared']);
    expect(target.state.selectedStructure?.id).toBe('corp:1021');
    expect(target.state.reactionStructure).toBeNull();
  });

  it('replaces pre-existing overrides wholesale (no merge with the pre-load planner)', async () => {
    const target = makeMockPlanner();
    target.state.meOverrides = new Map([[222, 9]]);
    const { notes } = await degradeCase(() => {}, target);
    expect(notes).toEqual([]);
    expect([...target.state.meOverrides].sort((a, b) => a[0] - b[0])).toEqual([
      [111, 5],
      [999, 10],
    ]);
  });
});

describe('classification gates', () => {
  it('the manifest and the snapshot shape agree on the field set (both ways)', () => {
    expect([...TEMPLATE_FIELD_KEYS].sort()).toEqual(Object.keys(snapshotFieldSchemas).sort());
  });

  it('every planner-scoped preference key is classified (template field or conscious exemption)', () => {
    const plannerKeys = PREFERENCES.map((p) => p.key).filter(
      (k) => k.startsWith('planner.') || k.startsWith('industry.'),
    );
    expect(plannerKeys.length).toBeGreaterThan(0);
    const unclassified = plannerKeys.filter((k) => !(k in PREF_CLASSIFICATION));
    expect(
      unclassified,
      `Unclassified planner preference key(s): ${unclassified.join(', ')}. Add each to ` +
        `PREF_CLASSIFICATION in template-manifest.ts — a template field (write-through on load) ` +
        `or a commented 'exempt'.`,
    ).toEqual([]);
  });

  it('no stale preference classification (every classified key exists in the registry)', () => {
    const known = new Set(PREFERENCES.map((p) => p.key));
    const stale = Object.keys(PREF_CLASSIFICATION).filter((k) => !known.has(k));
    expect(stale).toEqual([]);
  });
});
