import { describe, expect, it, vi } from 'vitest';
import { ChipToggleGroup } from './chip-toggle';

// The group's interaction contract, not styling: `multiple` keeps the wormhole
// class filter multi-select, `label` is the control's accessible name, and the
// change handler must reach Base UI. Chip tone classes are visual-review
// territory and deliberately untested.
describe('ChipToggleGroup', () => {
  it('groups chips as a named multiple-value control', () => {
    const onValueChange = vi.fn();
    const el = ChipToggleGroup({
      value: ['c1'],
      onValueChange,
      label: 'Wormhole classes',
      children: 'child',
    });
    expect(el.props.multiple).toBe(true);
    expect(el.props['aria-label']).toBe('Wormhole classes');
    expect(el.props.onValueChange).toBe(onValueChange);
  });
});
