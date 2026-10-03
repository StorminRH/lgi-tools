import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChevronDownIcon } from './icons';
import { Stepper } from './stepper';

describe('Stepper', () => {
  it('renders decrement and increment chevrons, and a trailing slot only when one is reserved', () => {
    const onChange = vi.fn();
    const plain = Stepper({ value: 1, onChange, ariaLabel: 'Runs' });
    const [plainGroup, plainSlot] = plain.props.children;
    expect(plainSlot).toBe(false);
    expect(plainGroup.props.children).toHaveLength(3);
    expect(plainGroup.props.children[0].props.children.type).toBe(ChevronDownIcon);
    expect(plainGroup.props.children[2].props.children.type).toBe(ChevronDownIcon);

    const trailing = 'reset';
    const inline = Stepper({
      value: 1,
      onChange,
      ariaLabel: 'Material efficiency',
      variant: 'inline',
      trailing,
    });
    const [inlineGroup, inlineSlot] = inline.props.children;
    expect(inlineGroup.props.children[0].props.children.type).toBe(ChevronDownIcon);
    expect(inlineSlot.props.children).toBe(trailing);

    const reserved = Stepper({
      value: 1,
      onChange,
      ariaLabel: 'Runs',
      reserveTrailing: true,
    });
    const [, reservedSlot] = reserved.props.children;
    expect(reservedSlot.props.children).toBeUndefined();
  });

  it('allows a caller-owned semantic tone on the value only', () => {
    const markup = renderToStaticMarkup(createElement(Stepper, {
      value: 10,
      onChange: vi.fn(),
      ariaLabel: 'Material efficiency',
      valueClassName: 'text-evb-bright',
    }));
    expect(markup.match(/text-evb-bright/g)).toHaveLength(1);
    expect(markup).toMatch(/<input[^>]*class="[^"]*text-evb-bright/);
  });
});
