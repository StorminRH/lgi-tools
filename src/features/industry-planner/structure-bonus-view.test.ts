import { describe, expect, it } from 'vitest';
import type { StructureBonus } from './structure-bonus';
import { formatBonusPct, structureBonusColumns } from './structure-bonus-view';
import type { StructureReadout } from './structure-factors';

const bonus = (over: Partial<StructureBonus>): StructureBonus => ({
  me: 0,
  te: 0,
  costBonus: 0,
  ...over,
});

describe('formatBonusPct', () => {
  it('shows one decimal at every size, as the game does', () => {
    expect(formatBonusPct(2.4)).toBe('2.4%');
    expect(formatBonusPct(3.38)).toBe('3.4%');
    expect(formatBonusPct(9.99)).toBe('10.0%');
    expect(formatBonusPct(21.5)).toBe('21.5%');
    expect(formatBonusPct(24)).toBe('24.0%');
  });
});

// Every metric the columns show, in reading order.
const shown = (readout: StructureReadout, taxPct?: number | null) =>
  structureBonusColumns(readout, taxPct).flatMap((line) => line.cells.filter((cell) => cell !== null));

describe('structure bonus metrics', () => {
  it('is empty when there is no bonus and no tax', () => {
    expect(shown({ mfg: null, rxn: null })).toEqual([]);
    expect(shown({ mfg: bonus({}), rxn: null })).toEqual([]);
  });

  it('shows only the positive manufacturing metrics, in ME/TE/cost order', () => {
    const readout: StructureReadout = { mfg: bonus({ me: 2, te: 4.2, costBonus: 3 }), rxn: null };
    expect(shown(readout)).toEqual([
      { kind: 'me', pct: '2.0%' },
      { kind: 'te', pct: '4.2%' },
      { kind: 'cost', pct: '3.0%' },
    ]);
  });

  it('adds the reaction TE with a marker only when manufacturing shares the line', () => {
    const withMfg: StructureReadout = { mfg: bonus({ me: 2 }), rxn: bonus({ te: 1 }) };
    expect(shown(withMfg)).toEqual([
      { kind: 'me', pct: '2.0%' },
      { kind: 'rxn-te', pct: '1.0%', withMarker: true },
    ]);

    const rxnOnly: StructureReadout = { mfg: null, rxn: bonus({ te: 1 }) };
    expect(shown(rxnOnly)).toEqual([{ kind: 'rxn-te', pct: '1.0%', withMarker: false }]);
  });

  it('ignores a non-positive reaction TE', () => {
    expect(shown({ mfg: null, rxn: bonus({ te: 0 }) })).toEqual([]);
  });

  it('shows the tax whenever one is entered, including a real 0%', () => {
    expect(shown({ mfg: null, rxn: null }, 2.5)).toEqual([{ kind: 'tax', taxPct: 2.5 }]);
    expect(shown({ mfg: null, rxn: null }, 0)).toEqual([{ kind: 'tax', taxPct: 0 }]);
    expect(shown({ mfg: null, rxn: null }, null)).toEqual([]);
  });
});

describe('structureBonusColumns', () => {
  it('is empty when there is nothing to show', () => {
    expect(structureBonusColumns({ mfg: bonus({}), rxn: null })).toEqual([]);
  });

  it('keeps each metric in its own column, leaving gaps for the missing ones', () => {
    const readout: StructureReadout = { mfg: bonus({ me: 2.4, costBonus: 3 }), rxn: null };
    expect(structureBonusColumns(readout, 1.5)).toEqual([
      {
        reactions: false,
        cells: [{ kind: 'me', pct: '2.4%' }, null, { kind: 'cost', pct: '3.0%' }, { kind: 'tax', taxPct: 1.5 }],
      },
    ]);
  });

  it('puts reactions on their own line under material and time, with tax on the first line', () => {
    const readout: StructureReadout = { mfg: bonus({ me: 1 }), rxn: bonus({ me: 2.64, te: 44.8 }) };
    expect(structureBonusColumns(readout, 0)).toEqual([
      { reactions: false, cells: [{ kind: 'me', pct: '1.0%' }, null, null, { kind: 'tax', taxPct: 0 }] },
      {
        reactions: true,
        cells: [
          { kind: 'rxn-me', pct: '2.6%', withMarker: true },
          { kind: 'rxn-te', pct: '44.8%', withMarker: false },
          null,
          null,
        ],
      },
    ]);
  });

  it('moves tax onto the reaction line when there is no manufacturing bonus', () => {
    const readout: StructureReadout = { mfg: bonus({}), rxn: bonus({ te: 44.8 }) };
    expect(structureBonusColumns(readout, 0)).toEqual([
      { reactions: true, cells: [null, { kind: 'rxn-te', pct: '44.8%', withMarker: true }, null, { kind: 'tax', taxPct: 0 }] },
    ]);
  });

  it('shows tax alone when the structure gives no bonus', () => {
    expect(structureBonusColumns({ mfg: null, rxn: null }, 2)).toEqual([
      { reactions: false, cells: [null, null, null, { kind: 'tax', taxPct: 2 }] },
    ]);
  });
});
