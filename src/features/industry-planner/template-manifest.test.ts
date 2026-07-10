import { describe, expect, it } from 'vitest';
import { PREFERENCES } from '@/lib/preferences';
import {
  applyTemplate,
  captureTemplate,
  PREF_CLASSIFICATION,
  SETTER_CLASSIFICATION,
  TEMPLATE_FIELD_KEYS,
} from './template-manifest';
import { planSnapshotV1Schema, snapshotFieldSchemas } from './template-snapshot';
import { configureFull, makeApplyCtx, makeMockPlanner } from './template-test-fixtures';

// The template core, tested against a mock context whose setters mimic the
// provider's public surface (including the #187 no-double-select guard) — the
// shared harness in template-test-fixtures.ts. The round-trip pin is the
// completeness proof: capture → apply(fresh) → capture must be stable when
// every reference resolves; the degrade battery pins that each
// dangling-reference kind degrades ITS field alone, with one note, and
// never throws.

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

  it('every snapshot-classified setter names a real manifest field (the runtime mirror of the tsc pin)', () => {
    const fieldKeys = new Set<string>(TEMPLATE_FIELD_KEYS);
    // Widened: today every mutator happens to classify as a field key, and the
    // narrowed literal union would make the exemption comparisons a tsc error.
    const classifications = Object.entries(SETTER_CLASSIFICATION) as [string, string][];
    const bad = classifications.filter(
      ([, cls]) => cls !== 'derived-or-account' && cls !== 'exempt' && !fieldKeys.has(cls),
    );
    expect(bad).toEqual([]);
    // Every manifest field has at least one setter feeding it — a field no
    // mutator can reach could never restore.
    const reachable = new Set(classifications.map(([, cls]) => cls));
    const unreachable = TEMPLATE_FIELD_KEYS.filter((k) => !reachable.has(k));
    expect(unreachable).toEqual([]);
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
