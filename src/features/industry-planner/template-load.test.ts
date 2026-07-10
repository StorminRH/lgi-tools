import { describe, expect, it } from 'vitest';
import type { SavedPlanRow } from './api-contract';
import {
  loadToastFor,
  runTemplateLoad,
  stripPlanParam,
  templateGateOpen,
  type TemplateLoadOutcome,
} from './template-load';
import { applyTemplate, captureTemplate } from './template-manifest';
import { configureFull, makeApplyCtx, makeMockPlanner } from './template-test-fixtures';

// The loader core over the shared mock-planner harness. The manifest's own
// suite already pins every per-field degrade arm; here the pins are the
// loader-level decisions — the gate, row resolution, the blueprint guard,
// note pass-through, toast copy, and the param strip.

function rowFor(
  snapshot: Readonly<Record<string, unknown>>,
  over?: Partial<SavedPlanRow>,
): SavedPlanRow {
  return {
    id: 'plan-1',
    name: 'Weekly batch',
    favorite: false,
    blueprintTypeId: 999,
    productTypeId: 12042,
    productName: 'Ishtar',
    snapshot: snapshot as SavedPlanRow['snapshot'],
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...over,
  };
}

describe('templateGateOpen', () => {
  const settled = {
    preferencesReady: true,
    structuresSettled: true,
    rosterSettled: true,
    timedOut: false,
  };

  it('opens only when all three surfaces settled', () => {
    expect(templateGateOpen(settled)).toBe(true);
    expect(templateGateOpen({ ...settled, preferencesReady: false })).toBe(false);
    expect(templateGateOpen({ ...settled, structuresSettled: false })).toBe(false);
    expect(templateGateOpen({ ...settled, rosterSettled: false })).toBe(false);
  });

  it('the deadline overrides any unsettled surface (apply-what-settled)', () => {
    expect(
      templateGateOpen({
        preferencesReady: false,
        structuresSettled: false,
        rosterSettled: false,
        timedOut: true,
      }),
    ).toBe(true);
  });
});

describe('runTemplateLoad', () => {
  it('resolves the row and replays it clean (loader round-trip)', async () => {
    const source = makeMockPlanner();
    configureFull(source.state);
    const snap = captureTemplate(source.ctx, 999);

    const target = makeMockPlanner();
    const outcome = await runTemplateLoad({
      planId: 'plan-1',
      blueprintTypeId: 999,
      fetchPlans: async () => [rowFor(snap)],
      apply: (s) => applyTemplate(makeApplyCtx(target.ctx), s),
    });

    expect(outcome).toMatchObject({ kind: 'applied', notes: [] });
    // The loaded planner re-captures to the exact saved snapshot…
    expect(captureTemplate(target.ctx, 999)).toEqual(snap);
    // …including the pref-backed system write-through (persist: true).
    expect(target.state.persistedBuildLocation).toEqual(snap.buildSystem);
  });

  it('passes the manifest degrade notes through verbatim', async () => {
    const source = makeMockPlanner();
    configureFull(source.state);
    const snap = captureTemplate(source.ctx, 999);

    // A target whose shared-structure list no longer contains either saved ref.
    const target = makeMockPlanner({ structures: [] });
    const outcome = await runTemplateLoad({
      planId: 'plan-1',
      blueprintTypeId: 999,
      fetchPlans: async () => [rowFor(snap)],
      apply: (s) => applyTemplate(makeApplyCtx(target.ctx), s),
    });

    expect(outcome.kind).toBe('applied');
    if (outcome.kind !== 'applied') return;
    expect(outcome.notes).toEqual([
      'Build structure "Sotiyo Prime" is gone or no longer shared — cleared',
      'Reaction structure "Imagined Athanor" is gone or no longer shared — cleared',
    ]);
    expect(target.state.selectedStructure).toBeNull();
    expect(target.state.reactionStructure).toBeNull();
    // The rest of the template still landed.
    expect(target.state.runs).toBe(3);
  });

  it('holds the #187 guard on loaded state: a duplicated reaction structure degrades, never lands', async () => {
    const source = makeMockPlanner();
    configureFull(source.state);
    const snap = captureTemplate(source.ctx, 999);
    // Corrupt the saved pair to the state the guarded setter forbids.
    snap.reactionStructure = { id: 'corp:1021', name: 'Sotiyo Prime' };

    const target = makeMockPlanner();
    const outcome = await runTemplateLoad({
      planId: 'plan-1',
      blueprintTypeId: 999,
      fetchPlans: async () => [rowFor(snap)],
      apply: (s) => applyTemplate(makeApplyCtx(target.ctx), s),
    });

    expect(outcome.kind).toBe('applied');
    if (outcome.kind !== 'applied') return;
    expect(outcome.notes).toEqual([
      'Reaction structure duplicated the build structure — cleared',
    ]);
    expect(target.state.selectedStructure?.id).toBe('corp:1021');
    expect(target.state.reactionStructure).toBeNull();
  });

  it('an unknown plan id is not-found and never applies', async () => {
    let applied = false;
    const outcome = await runTemplateLoad({
      planId: 'plan-gone',
      blueprintTypeId: 999,
      fetchPlans: async () => [rowFor({ v: 1, blueprintTypeId: 999 })],
      apply: async () => {
        applied = true;
        return [];
      },
    });
    expect(outcome).toEqual({ kind: 'not-found' });
    expect(applied).toBe(false);
  });

  it("a plan for another blueprint is a mismatch and never applies", async () => {
    let applied = false;
    const row = rowFor({ v: 1, blueprintTypeId: 999 });
    const outcome = await runTemplateLoad({
      planId: 'plan-1',
      blueprintTypeId: 123,
      fetchPlans: async () => [row],
      apply: async () => {
        applied = true;
        return [];
      },
    });
    expect(outcome).toEqual({ kind: 'mismatch', row });
    expect(applied).toBe(false);
  });

  it('a failed list read is fetch-failed and never applies', async () => {
    let applied = false;
    const outcome = await runTemplateLoad({
      planId: 'plan-1',
      blueprintTypeId: 999,
      fetchPlans: async () => null,
      apply: async () => {
        applied = true;
        return [];
      },
    });
    expect(outcome).toEqual({ kind: 'fetch-failed' });
    expect(applied).toBe(false);
  });
});

describe('loadToastFor', () => {
  const row = rowFor({ v: 1, blueprintTypeId: 999 });

  it('a clean apply is a short success', () => {
    expect(loadToastFor({ kind: 'applied', row, notes: [] })).toEqual({
      type: 'success',
      message: 'Loaded "Weekly batch"',
      duration: 4000,
    });
  });

  it('a partial apply summarizes the notes in one toast, pluralized', () => {
    const one = loadToastFor({ kind: 'applied', row, notes: ['a fell away'] });
    expect(one).toEqual({
      type: 'info',
      message: 'Loaded "Weekly batch" — 1 setting didn\'t apply',
      description: 'a fell away',
      duration: 8000,
    });
    const two = loadToastFor({
      kind: 'applied',
      row,
      notes: ['a fell away', 'b fell away'],
    });
    expect(two.message).toBe('Loaded "Weekly batch" — 2 settings didn\'t apply');
    expect(two.description).toBe('a fell away · b fell away');
  });

  it('each failure kind gets its own error copy', () => {
    const kinds: [TemplateLoadOutcome, string][] = [
      [{ kind: 'fetch-failed' }, "Couldn't load the saved template"],
      [{ kind: 'not-found' }, 'Saved template not found — it may have been deleted'],
      [{ kind: 'mismatch', row }, '"Weekly batch" belongs to a different blueprint'],
    ];
    for (const [outcome, message] of kinds) {
      const t = loadToastFor(outcome);
      expect(t.type).toBe('error');
      expect(t.message).toBe(message);
      expect(Number.isFinite(t.duration)).toBe(true);
    }
  });
});

describe('stripPlanParam', () => {
  it('drops a lone plan param entirely', () => {
    expect(stripPlanParam('?plan=abc')).toBe('');
  });

  it('preserves the other params and their order', () => {
    expect(stripPlanParam('?runs=3&plan=abc&x=1')).toBe('?runs=3&x=1');
  });

  it('is a no-op shape on empty or plan-free searches', () => {
    expect(stripPlanParam('')).toBe('');
    expect(stripPlanParam('?a=1')).toBe('?a=1');
  });
});
