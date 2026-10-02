import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { itemImage, nodeImage } from '@/data/eve-data/type-images';
import { nodeCardView } from '../node-card-view';
import { NodeCard } from './NodeCard';

describe('NodeCard', () => {
  it('opens a buildable through a named native button, and reports hover and focus', () => {
    const onOpen = vi.fn();
    const onHover = vi.fn();
    const card = NodeCard({
      typeId: 34,
      name: 'Fernite Carbide',
      label: 'Reaction',
      qty: 1,
      value: null,
      lit: true,
      dimmed: false,
      onOpen,
      onHover,
    });
    const button = card.props.children[0];

    expect(button.type).toBe(Button);
    expect(button.props.type).toBe('button');
    expect(button.props['aria-label']).toBe('Open Fernite Carbide');
    button.props.onClick();
    expect(onOpen).toHaveBeenCalledOnce();

    card.props.onPointerEnter();
    button.props.onBlur();
    button.props.onFocus();
    card.props.onPointerLeave();
    expect(onHover.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('a raw material neither opens nor lights its chain', () => {
    const onHover = vi.fn();
    const card = NodeCard({ typeId: 34, name: 'Tritanium', label: 'Mineral', qty: 1, value: null, lit: false, dimmed: true, onHover });
    expect(card.props.children[0]).toBe(false);
    expect(card.props.onPointerEnter).toBeUndefined();
  });

  it('is interactive only when it opens, and defaults the icon to the item', () => {
    const base = { typeId: 34, lit: false, dimmed: false };
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, onOpen: () => {} }).interactive).toBe(true);
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(nodeImage(999, 34));
    expect(nodeCardView({ ...base, lit: true }).className).toContain('after:opacity-100');
    expect(nodeCardView({ ...base, dimmed: true }).className).toContain('opacity-45');
  });
});
