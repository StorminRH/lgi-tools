import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChevronDownIcon } from './icons';
import { Stepper } from './stepper';

describe('Stepper', () => {
  it('renders the default control as two round chevron buttons', () => {
    const root = Stepper({ value: 1, onChange: vi.fn(), ariaLabel: 'Runs' });
    const [group] = root.props.children;
    expect(group.props.className).toContain('gap-1');
    expect(group.props.children[0].props.className).toContain('rounded-full');
    expect(group.props.children[0].props.children.type).toBe(ChevronDownIcon);
    expect(group.props.children[2].props.children.props.className).toBe('rotate-180');
  });

  it('renders the compact inline controls and trailing slot', () => {
    const trailing = 'reset';
    const root = Stepper({
      value: 1,
      onChange: vi.fn(),
      ariaLabel: 'Material efficiency',
      variant: 'inline',
      trailing,
    });
    const [group, slot] = root.props.children;
    expect(group.props.className).not.toContain('gap-1');
    expect(group.props.children[0].props.children.type).toBe(ChevronDownIcon);
    expect(group.props.children[0].props.className).toContain('after:-inset-1');
    expect(group.props.children[2].props.children.props.className).toBe('rotate-180');
    expect(slot.props.children).toBe(trailing);
  });

  it('reserves an external trailing slot without widening the button group', () => {
    const root = Stepper({
      value: 1,
      onChange: vi.fn(),
      ariaLabel: 'Runs',
      reserveTrailing: true,
    });
    const [group, slot] = root.props.children;
    expect(group.props.className).toContain('gap-1');
    expect(group.props.children).toHaveLength(3);
    expect(slot.props.className).toContain('w-3.5');
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
