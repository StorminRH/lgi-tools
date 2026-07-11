import { describe, expect, it } from 'vitest';
import type { StructureBonus } from './structure-bonus';
import { formatBonusPct, structureBonusRows } from './structure-bonus-view';
import type { StructureReadout } from './structure-factors';

const bonus = (over: Partial<StructureBonus>): StructureBonus => ({
  me: 0,
  te: 0,
  costBonus: 0,
  ...over,
});

describe('formatBonusPct', () => {
  it('keeps one decimal below 10', () => {
    expect(formatBonusPct(2.4)).toBe('2.4%');
    expect(formatBonusPct(9.99)).toBe('10.0%');
  });

  it('rounds to whole at 10 and above', () => {
    expect(formatBonusPct(10)).toBe('10%');
    expect(formatBonusPct(24.6)).toBe('25%');
  });
});

describe('structureBonusRows', () => {
  it('is empty when there is no bonus and no tax', () => {
    expect(structureBonusRows({ mfg: null, rxn: null })).toEqual([]);
    // A zero-valued manufacturing bonus shows nothing either.
    expect(structureBonusRows({ mfg: bonus({}), rxn: null })).toEqual([]);
  });

  it('shows only the positive manufacturing metrics, in ME/TE/cost order', () => {
    const readout: StructureReadout = { mfg: bonus({ me: 2, te: 4.2, costBonus: 3 }), rxn: null };
    expect(structureBonusRows(readout)).toEqual([
      { kind: 'me', pct: '2.0%' },
      { kind: 'te', pct: '4.2%' },
      { kind: 'cost', pct: '3.0%' },
    ]);
  });

  it('adds the reaction TE with a marker only when manufacturing shares the line', () => {
    const withMfg: StructureReadout = { mfg: bonus({ me: 2 }), rxn: bonus({ te: 1 }) };
    expect(structureBonusRows(withMfg)).toEqual([
      { kind: 'me', pct: '2.0%' },
      { kind: 'rxn-te', pct: '1.0%', withMarker: true },
    ]);

    const rxnOnly: StructureReadout = { mfg: null, rxn: bonus({ te: 1 }) };
    expect(structureBonusRows(rxnOnly)).toEqual([{ kind: 'rxn-te', pct: '1.0%', withMarker: false }]);
  });

  it('ignores a non-positive reaction TE', () => {
    expect(structureBonusRows({ mfg: null, rxn: bonus({ te: 0 }) })).toEqual([]);
  });

  it('appends the tax row whenever a tax is entered, including a real 0%', () => {
    expect(structureBonusRows({ mfg: null, rxn: null }, 2.5)).toEqual([{ kind: 'tax', taxPct: 2.5 }]);
    expect(structureBonusRows({ mfg: null, rxn: null }, 0)).toEqual([{ kind: 'tax', taxPct: 0 }]);
    // An unset (null/undefined) tax adds nothing.
    expect(structureBonusRows({ mfg: null, rxn: null }, null)).toEqual([]);
  });
});
