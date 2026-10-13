import { describe, expect, it } from 'vitest';
import { draftFromFit, draftFromRow, emptyStructureDraft, payloadFromDraft, type StructureDraft } from './structure-draft';
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

  it('sends an all-blank bonus grid as no bonuses and an empty tax as never entered', () => {
    const result = payloadFromDraft(draft({ name: ' Home ', structureTypeId: 35825 }));
    expect(result).toMatchObject({ ok: true, payload: { name: 'Home', taxPct: null, bonuses: null } });
  });

  it('reads the blank cells of a partly filled bonus grid as 0', () => {
    const bonus = { ...emptyStructureDraft().bonus, te: '20', rxnMe: ' 2.4 ' };
    const result = payloadFromDraft(draft({ name: 'Home', structureTypeId: 35825, bonus }));
    expect(result).toMatchObject({
      ok: true,
      payload: { bonuses: { manufacturing: { me: 0, te: 20, cost: 0 }, reactions: { me: 2.4, te: 0 } } },
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

  it('reads bonus cells with the same plain-decimal grammar as the tax, capped at 99%', () => {
    const save = (cell: string) =>
      payloadFromDraft(draft({ name: 'X', structureTypeId: 1, bonus: { ...emptyStructureDraft().bonus, cost: cell } }));
    expect(save('99')).toMatchObject({ ok: true, payload: { bonuses: { manufacturing: { me: 0, te: 0, cost: 99 } } } });
    for (const cell of ['99.01', '1e1', '0x0A', '.5', '+1']) {
      expect(save(cell)).toEqual({ ok: false, field: 'bonus' });
    }
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

describe('draftFromFit', () => {
  const TYPES = [{ typeId: 35825, name: 'Raitaru' }];
  const RIGGED = { structureTypeId: 35825, rigTypeIds: [43920, 37180], name: 'Amamake Raitaru' };

  it('fills in the hull and rigs, switches to rigs, and names an unnamed structure from the fit', () => {
    const next = draftFromFit({ name: '  ' }, RIGGED, TYPES);
    expect(next).toEqual({
      structureTypeId: 35825,
      rigSlots: [43920, 37180, null],
      mode: 'rigs',
      name: 'Amamake Raitaru',
    });
  });

  it('keeps a name already typed, and falls back to the hull when the fit has none', () => {
    expect(draftFromFit({ name: 'My factory' }, RIGGED, TYPES).name).toBe('My factory');
    expect(draftFromFit({ name: '' }, { ...RIGGED, name: null }, TYPES).name).toBe('Raitaru');
    expect(draftFromFit({ name: '' }, { ...RIGGED, name: null, structureTypeId: 1 }, TYPES).name).toBe('');
  });

  it('caps a long fit name at the structure name limit', () => {
    expect(draftFromFit({ name: '' }, { ...RIGGED, name: 'x'.repeat(200) }, TYPES).name).toBe('x'.repeat(80));
  });
});
