import { expect, it } from 'vitest';
import { scannerLifeReadout } from './scanner-life-select';

it('uses compact lifetime selected-state text', () => {
  expect(scannerLifeReadout('under_1_day')).toBe('<1d');
  expect(scannerLifeReadout('under_4_hours')).toBe('<4h');
  expect(scannerLifeReadout('under_1_hour')).toBe('<1h');
  expect(scannerLifeReadout('expired')).toBe('Exp');
  expect(scannerLifeReadout(null)).toBe('—');
});
