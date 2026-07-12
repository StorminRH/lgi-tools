import { describe, it, expect } from 'vitest';
import { Input, Select, Textarea } from './input';

// Node-env, no RTL: calling a component returns a React element whose props/tree
// we inspect directly. We test the prop-forwarding contract and the prompt branch
// — the styling itself is visual-review territory, so we only spot-check the well.

// One level of the returned element's children, normalized to an array.
function kids(el: { props: { children?: unknown } }): Array<{ type?: unknown; props?: Record<string, unknown> }> {
  return ([] as unknown[]).concat(el.props.children ?? []) as Array<{
    type?: unknown;
    props?: Record<string, unknown>;
  }>;
}

describe('Input', () => {
  it('wraps a field shell wearing the inset well and forwards props to the inner control', () => {
    const el = Input({ placeholder: 'search sites', value: 'x', readOnly: true });
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('bg-bg-deep');
    expect(el.props.className).toContain('shadow-field-inset');
    const input = kids(el).find((c) => c?.type === 'input');
    expect(input?.props?.placeholder).toBe('search sites');
    expect(input?.props?.value).toBe('x');
  });

  it('shows the prompt glyph only when asked', () => {
    expect(kids(Input({ prompt: true })).some((c) => c?.props?.children === '>')).toBe(true);
    expect(kids(Input({})).some((c) => c?.props?.children === '>')).toBe(false);
  });
});

describe('Select', () => {
  it('forwards its options and value to a native select in the well', () => {
    const el = Select({ value: 'a', children: 'OPTIONS', 'aria-label': 'Structure' });
    expect(el.props.className).toContain('bg-bg-deep');
    const select = kids(el).find((c) => c?.type === 'select');
    expect(select?.props?.value).toBe('a');
    expect(select?.props?.children).toBe('OPTIONS');
  });
});

describe('Textarea', () => {
  it('puts the well directly on the textarea and forwards props', () => {
    const el = Textarea({ rows: 4, placeholder: 'message' });
    expect(el.type).toBe('textarea');
    expect(el.props.className).toContain('shadow-field-inset');
    expect(el.props.rows).toBe(4);
  });
});
