import { expect, it, vi } from 'vitest';
import { instant } from './page';

vi.mock('@/mapper', () => ({
  MapCanvas: () => null,
}));

it('opts the intentionally wall-replaceable leaf out of instant validation', () => {
  expect(instant).toBe(false);
});
