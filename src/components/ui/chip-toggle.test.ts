import { describe, expect, it, vi } from 'vitest';
import { ChipToggle, ChipToggleGroup } from './chip-toggle';

describe('ChipToggle', () => {
  it('uses the static chip tone and the shared pressed state', () => {
    const el = ChipToggle({ tone: 'blue', value: 'c1', children: 'C1' });
    expect(el.props.value).toBe('c1');
    expect(el.props.className({ pressed: false })).toContain('bg-chip-blue-bg');
    expect(el.props.className({ pressed: true })).toContain('bg-chip-pressed-bg');
  });

  it('keeps filter chips neutral until Base UI reports them pressed', () => {
    const el = ChipToggle({
      tone: 'red',
      value: 'c5',
      children: 'C5',
      appearance: 'filter',
    });
    expect(el.props.className({ pressed: false })).toContain('bg-surface-sunk');
    expect(el.props.className({ pressed: false })).not.toContain('bg-chip-red-bg');
    expect(el.props.className({ pressed: true })).toContain('bg-chip-red-bg');
  });

  it('keeps filter rows neutral while exposing their pressed surface', () => {
    const el = ChipToggle({
      tone: 'blue',
      value: 'data',
      children: 'Data',
      appearance: 'row',
    });
    expect(el.props.className({ pressed: false })).not.toContain('bg-chip-blue-bg');
    expect(el.props.className({ pressed: true })).toContain('bg-row-sites-on');
  });

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
