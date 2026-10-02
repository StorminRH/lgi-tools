import { describe, expect, it } from 'vitest';
import { draftFromRow, emptyStructureDraft, payloadFromDraft, slotsFromRigs, type StructureDraft } from './structure-draft';
import type { CustomStructureRow } from './types';

const ROW: CustomStructureRow = {
  id: 'cs-1',
  name: 'Sobaseki Azbel',
  structureTypeId: 35826,
  rigTypeIds: [],
  systemId: 30001363,
  taxPct: 1,
  bonuses: { manufacturing: { me: 3.38, te: 39.2, cost: 4 }, reactions: { me: 0, te: 0 } },
};

const draft = (over: Partial<StructureDraft>): StructureDraft => ({ ...emptyStructureDraft(), ...over });

describe('payloadFromDraft', () => {
  it('round-trips a row with typed-in bonuses', () => {
    const result = payloadFromDraft(draftFromRow(ROW));
    expect(result).toEqual({
      ok: true,
      payload: {
        name: 'Sobaseki Azbel',
        structureTypeId: 35826,
        rigTypeIds: [],
        systemId: 30001363,
        taxPct: 1,
        bonuses: ROW.bonuses,
      },
    });
  });

  it('reads empty bonus cells as 0 and an empty tax as never entered', () => {
    const result = payloadFromDraft(draft({ name: ' Home ', structureTypeId: 35825 }));
    expect(result).toMatchObject({
      ok: true,
      payload: {
        name: 'Home',
        taxPct: null,
        bonuses: { manufacturing: { me: 0, te: 0, cost: 0 }, reactions: { me: 0, te: 0 } },
      },
    });
  });

  it('sends rigs and no bonuses for a fit, dropping empty slots', () => {
    const result = payloadFromDraft(
      draft({ name: 'Raitaru', structureTypeId: 35825, mode: 'rigs', rigSlots: [43920, null, 43921] }),
    );
    expect(result).toMatchObject({ ok: true, payload: { rigTypeIds: [43920, 43921], bonuses: null } });
  });

  it('names the first field that stops a save', () => {
    expect(payloadFromDraft(draft({}))).toEqual({ ok: false, field: 'name' });
    expect(payloadFromDraft(draft({ name: 'X' }))).toEqual({ ok: false, field: 'hull' });
    expect(payloadFromDraft(draft({ name: 'X', structureTypeId: 1, taxDraft: '12' }))).toEqual({ ok: false, field: 'tax' });
    const bad = { ...emptyStructureDraft().bonus, te: '100' };
    expect(payloadFromDraft(draft({ name: 'X', structureTypeId: 1, bonus: bad }))).toEqual({ ok: false, field: 'bonus' });
    const word = { ...emptyStructureDraft().bonus, me: 'abc' };
    expect(payloadFromDraft(draft({ name: 'X', structureTypeId: 1, bonus: word }))).toEqual({ ok: false, field: 'bonus' });
  });
});

describe('draftFromRow', () => {
  it('opens a fitted row in rig mode with its rigs in slots', () => {
    const fitted = draftFromRow({ ...ROW, rigTypeIds: [43920], bonuses: null });
    expect(fitted.mode).toBe('rigs');
    expect(fitted.rigSlots).toEqual([43920, null, null]);
    expect(fitted.bonus).toEqual({ me: '', te: '', cost: '', rxnMe: '', rxnTe: '' });
  });

  it('opens an entered row in value mode with its numbers', () => {
    const entered = draftFromRow(ROW);
    expect(entered.mode).toBe('values');
    expect(entered.bonus).toMatchObject({ me: '3.38', te: '39.2', cost: '4' });
    expect(entered.taxDraft).toBe('1');
  });
});

describe('slotsFromRigs', () => {
  it('fills three slots in order', () => {
    expect(slotsFromRigs([1, 2])).toEqual([1, 2, null]);
  });
});
