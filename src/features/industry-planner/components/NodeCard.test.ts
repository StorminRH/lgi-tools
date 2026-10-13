import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

  it('keeps the chain lit while either the pointer or focus stays on the card', () => {
    // Focus leaves while the pointer remains inside.
    const pointerStays = buildable();
    pointerStays.card.props.onPointerEnter();
    pointerStays.card.props.onFocus();
    pointerStays.card.props.onBlur(blurEvent(false));
    expect(pointerStays.onHover).toHaveBeenLastCalledWith(true);
    pointerStays.card.props.onPointerLeave();
    expect(pointerStays.onHover).toHaveBeenLastCalledWith(false);

    // The pointer leaves while a card control remains focused.
    const focusStays = buildable();
    focusStays.card.props.onFocus();
    focusStays.card.props.onPointerEnter();
    focusStays.card.props.onPointerLeave();
    expect(focusStays.onHover).toHaveBeenLastCalledWith(true);
    focusStays.card.props.onBlur(blurEvent(false));
    expect(focusStays.onHover).toHaveBeenLastCalledWith(false);

    // Focus moves between card controls without clearing the chain.
    const focusMoves = buildable();
    focusMoves.card.props.onFocus();
    focusMoves.onHover.mockClear();
    focusMoves.card.props.onBlur(blurEvent(true));
    expect(focusMoves.onHover).not.toHaveBeenCalled();
    focusMoves.card.props.onFocus();
    expect(focusMoves.onHover).toHaveBeenLastCalledWith(true);
    focusMoves.card.props.onBlur(blurEvent(false));
    expect(focusMoves.onHover).toHaveBeenLastCalledWith(false);
  });

  it('a raw material neither opens nor lights its chain', () => {
    const onHover = vi.fn();
    const card = NodeCard({ typeId: 34, name: 'Tritanium', label: 'Mineral', qty: 1, value: null, lit: false, dimmed: true, onHover });
    expect(card.props.children[0]).toBe(false);
    expect(card.props.onPointerEnter).toBeUndefined();
    expect(card.props.onFocus).toBeUndefined();
  });

  it('swaps the remaining count for a check once every unit is owned', () => {
    const props = { typeId: 34, name: 'Tritanium', label: 'Mineral', qty: 40, value: null, lit: false, dimmed: false };
    const short = renderToStaticMarkup(createElement(NodeCard, { ...props, ownedQty: 25 }));
    expect(short).toContain('aria-label="Tritanium: 15 still needed"');
    expect(short).toContain('>15</span>');
    expect(short).not.toContain('stroke-width="3"');

    const owned = renderToStaticMarkup(createElement(NodeCard, { ...props, ownedQty: 40 }));
    expect(owned).toContain('aria-label="Tritanium: all 40 owned"');
    expect(owned).not.toContain('>15</span>');
    expect(owned).toMatch(/<svg aria-hidden="true"[^>]*stroke-width="3"[^>]*class="size-icon-md text-isk"/);
  });

  it('is interactive only when it opens, and defaults the icon to the item', () => {
    const base = { typeId: 34, lit: false, dimmed: false };
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, onOpen: () => {} }).interactive).toBe(true);
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(nodeImage(999, 34));
  });
});
