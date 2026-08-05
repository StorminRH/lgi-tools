import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { NodeCard } from './NodeCard';

describe('NodeCard', () => {
  it('wires selectable nodes through a named native toggle button', () => {
    const onSelect = vi.fn();
    const card = NodeCard({
      typeId: 34,
      name: 'Tritanium',
      label: 'Material',
      qty: 1,
      value: null,
      selected: true,
      related: false,
      faded: false,
      onSelect,
    });
    const button = card.props.children[0];

    expect(button.type).toBe(Button);
    expect(button.props.type).toBe('button');
    expect(button.props['aria-label']).toBe('Trace Tritanium');
    expect(button.props['aria-pressed']).toBe(true);
    button.props.onClick();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
