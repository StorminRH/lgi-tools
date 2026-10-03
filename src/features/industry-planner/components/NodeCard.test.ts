import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { itemImage, nodeImage } from '@/data/eve-data/type-images';
import { nodeCardView } from '../node-card-view';
import { NodeCard } from './NodeCard';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: <T,>(current: T) => ({ current }),
}));

function buildable(onHover = vi.fn()) {
  const card = NodeCard({
    typeId: 34, name: 'Fernite Carbide', label: 'Reaction', qty: 1, value: null,
    lit: true, dimmed: false, onOpen: vi.fn(), onHover,
  });
  return { card, onHover };
}

function blurEvent(focusStaysInside: boolean) {
  return { currentTarget: { contains: () => focusStaysInside }, relatedTarget: null };
}

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
    card.props.onPointerLeave();
    card.props.onFocus();
    card.props.onBlur(blurEvent(false));
    expect(onHover.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('keeps the chain lit when focus leaves while the pointer remains inside', () => {
    const { card, onHover } = buildable();
    card.props.onPointerEnter();
    card.props.onFocus();
    card.props.onBlur(blurEvent(false));
    expect(onHover).toHaveBeenLastCalledWith(true);
    card.props.onPointerLeave();
    expect(onHover).toHaveBeenLastCalledWith(false);
  });

  it('keeps the chain lit when the pointer leaves while a card control remains focused', () => {
    const { card, onHover } = buildable();
    card.props.onFocus();
    card.props.onPointerEnter();
    card.props.onPointerLeave();
    expect(onHover).toHaveBeenLastCalledWith(true);
    card.props.onBlur(blurEvent(false));
    expect(onHover).toHaveBeenLastCalledWith(false);
  });

  it('does not clear the chain as focus moves between card controls', () => {
    const { card, onHover } = buildable();
    card.props.onFocus();
    onHover.mockClear();
    card.props.onBlur(blurEvent(true));
    expect(onHover).not.toHaveBeenCalled();
    card.props.onFocus();
    expect(onHover).toHaveBeenLastCalledWith(true);
    card.props.onBlur(blurEvent(false));
    expect(onHover).toHaveBeenLastCalledWith(false);
  });

  it('a raw material neither opens nor lights its chain', () => {
    const onHover = vi.fn();
    const card = NodeCard({ typeId: 34, name: 'Tritanium', label: 'Mineral', qty: 1, value: null, lit: false, dimmed: true, onHover });
    expect(card.props.children[0]).toBe(false);
    expect(card.props.onPointerEnter).toBeUndefined();
    expect(card.props.onFocus).toBeUndefined();
  });

  it('is interactive only when it opens, and defaults the icon to the item', () => {
    const base = { typeId: 34, lit: false, dimmed: false };
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, onOpen: () => {} }).interactive).toBe(true);
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(nodeImage(999, 34));
    // A lit card rises slightly into its bubble; the rest of the plan recedes a little.
    expect(nodeCardView({ ...base, lit: true }).className).toMatch(/after:opacity-100 .*motion-safe:-translate-y-0\.5/);
    expect(nodeCardView({ ...base, dimmed: true }).className).toContain('opacity-60');
  });
});
