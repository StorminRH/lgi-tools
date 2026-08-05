import { describe, expect, it } from 'vitest';
import { nodeCardView } from './node-card-view';

const base = { typeId: 34, selected: false, related: false, faded: false };

describe('nodeCardView', () => {
  it('is interactive only when onSelect is set', () => {
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, selected: true, onSelect: () => {} }).interactive).toBe(true);
  });
});
