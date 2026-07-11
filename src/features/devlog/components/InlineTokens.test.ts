import { Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import type { InlineToken } from '../types';
import { renderToken } from './InlineTokens';

// React elements are plain objects, so a renderer's output can be inspected without
// a DOM — enough to prove the config-map preserves each former switch branch.
type El = { type: unknown; key: string | null; props: { [key: string]: unknown } };
const asEl = (node: unknown): El => node as El;
const token = (t: InlineToken, key = 0): El => asEl(renderToken(t, key));

describe('renderToken', () => {
  it('renders bold as <strong> and code as <code>', () => {
    const b = token({ type: 'bold', value: 'stop' });
    expect(b.type).toBe('strong');
    expect(b.props.children).toBe('stop');

    const c = token({ type: 'code', value: 'run' });
    expect(c.type).toBe('code');
    expect(c.props.children).toBe('run');
  });

  it('renders plain text through a Fragment', () => {
    const t = token({ type: 'text', value: 'hello' });
    expect(t.type).toBe(Fragment);
    expect(t.props.children).toBe('hello');
  });

  it('opens an external link in a new tab with a safe rel', () => {
    const a = token({ type: 'link', text: 'PR', href: 'https://example.com/1' });
    expect(a.type).toBe('a');
    expect(a.props.href).toBe('https://example.com/1');
    expect(a.props.target).toBe('_blank');
    expect(a.props.rel).toBe('noopener noreferrer');
    expect(a.props.children).toBe('PR');
  });

  it('navigates an internal link in place, with no target or rel', () => {
    const a = token({ type: 'link', text: 'Skills', href: '/skills' });
    expect(a.type).toBe('a');
    expect(a.props.href).toBe('/skills');
    expect(a.props.target).toBeUndefined();
    expect(a.props.rel).toBeUndefined();
  });

  it('keys each token by its index', () => {
    expect(token({ type: 'code', value: 'x' }, 2).key).toBe('2');
  });
});
