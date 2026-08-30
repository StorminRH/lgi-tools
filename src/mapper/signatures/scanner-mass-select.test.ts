import { expect, it } from 'vitest';
import { scannerMassReadout } from './scanner-mass-select';

it('uses compact mass selected-state text', () => {
  expect(scannerMassReadout('stable')).toBe('>50%');
  expect(scannerMassReadout('reduced')).toBe('<50%');
  expect(scannerMassReadout('critical')).toBe('<10%');
  expect(scannerMassReadout(null)).toBe('—');
});
