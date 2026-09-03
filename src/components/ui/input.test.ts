import { describe, it, expect } from 'vitest';
import { Input, Textarea } from './input';

function kids(el: { props: { children?: unknown } }): Array<{ type?: unknown; props?: Record<string, unknown> }> {
  return ([] as unknown[]).concat(el.props.children ?? []) as Array<{
    type?: unknown;
    props?: Record<string, unknown>;
  }>;
}

describe('Input', () => {
  it('wraps a field shell and forwards props to the inner control', () => {
    const el = Input({ placeholder: 'search sites', value: 'x', readOnly: true });
    expect(el.type).toBe('div');
    const input = kids(el).find((c) => c?.type === 'input');
    expect(input?.props?.placeholder).toBe('search sites');
    expect(input?.props?.value).toBe('x');
  });

  it('shows the prompt glyph only when asked', () => {
    expect(kids(Input({ prompt: true })).some((c) => c?.props?.children === '>')).toBe(true);
    expect(kids(Input({})).some((c) => c?.props?.children === '>')).toBe(false);
  });
});

describe('Textarea', () => {
  it('forwards props onto the textarea control', () => {
    const el = Textarea({ rows: 4, placeholder: 'message' });
    expect(el.type).toBe('textarea');
    expect(el.props.rows).toBe(4);
    expect(el.props.placeholder).toBe('message');
  });
});
