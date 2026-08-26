import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { itemImage, nodeImage } from '@/data/eve-data/type-images';
import { nodeCardView } from '../node-card-view';
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

  it('is interactive only when onSelect is set, and defaults the icon to the item', () => {
    const base = { typeId: 34, selected: false, related: false, faded: false };
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, selected: true, onSelect: () => {} }).interactive).toBe(true);
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(nodeImage(999, 34));
  });
});
