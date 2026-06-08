import { describe, expect, it } from 'vitest';
import { toOdometerCells } from './odometer-value';

describe('toOdometerCells', () => {
  it('turns each numeral into a sliding strip and keeps other characters static', () => {
    const cells = toOdometerCells('41.2M');
    expect(cells.map((c) => c.digit)).toEqual([4, 1, null, 2, null]);
    expect(cells.map((c) => c.char)).toEqual(['4', '1', '.', '2', 'M']);
  });

  it('renders spaces as non-breaking so an inline-flex row keeps the gap', () => {
    const cells = toOdometerCells('1.2B ISK');
    const space = cells.find((c) => c.digit === null && c.char !== '.' && /\s/.test(c.char));
    expect(space?.char).toBe(' ');
    // The unit letters survive verbatim.
    expect(cells.filter((c) => c.digit === null).map((c) => c.char)).toEqual([
      '.',
      'B',
      ' ',
      'I',
      'S',
      'K',
    ]);
  });

  it('keeps a sign, percentage, and em dash as static cells', () => {
    expect(toOdometerCells('+12.3%').map((c) => c.digit)).toEqual([null, 1, 2, null, 3, null]);
    expect(toOdometerCells('—')).toEqual([{ digit: null, char: '—' }]);
  });
});
