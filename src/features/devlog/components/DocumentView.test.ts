import { describe, expect, it } from 'vitest';
import type { Block, Excerpt, InlineToken } from '../types';
import { CodeExcerpt } from './CodeExcerpt';
import { renderBlock } from './DocumentView';
import { InlineTokens } from './InlineTokens';

// React elements are plain objects, so a renderer's output can be inspected without
// a DOM — enough to prove the config-map preserves each former switch branch.
type El = { type: unknown; key: string | null; props: { [key: string]: unknown } };
const asEl = (node: unknown): El => node as El;
const block = (b: Block, key = 0): El => asEl(renderBlock(b, key));

const tokens: InlineToken[] = [{ type: 'text', value: 'hi' }];

describe('renderBlock', () => {
  it('wraps a paragraph in <p> around its inline tokens', () => {
    const el = block({ type: 'paragraph', tokens });
    expect(el.type).toBe('p');
    const child = asEl(el.props.children);
    expect(child.type).toBe(InlineTokens);
    expect(child.props.tokens).toBe(tokens);
  });

  it('wraps a blockquote in <blockquote> around its inline tokens', () => {
    const el = block({ type: 'blockquote', tokens });
    expect(el.type).toBe('blockquote');
    const child = asEl(el.props.children);
    expect(child.type).toBe(InlineTokens);
    expect(child.props.tokens).toBe(tokens);
  });

  it('renders an ordered list as <ol> and an unordered list as <ul>', () => {
    const items: InlineToken[][] = [tokens, [{ type: 'bold', value: 'x' }]];
    expect(block({ type: 'list', ordered: true, items }).type).toBe('ol');
    expect(block({ type: 'list', ordered: false, items }).type).toBe('ul');
  });

  it('gives each list item a keyed <li> around its own tokens', () => {
    const items: InlineToken[][] = [tokens, [{ type: 'code', value: 'y' }]];
    const lis = block({ type: 'list', ordered: true, items }).props.children as unknown[];
    expect(lis).toHaveLength(2);
    expect(asEl(lis[0]).type).toBe('li');
    expect(asEl(lis[0]).key).toBe('0');
    expect(asEl(lis[1]).key).toBe('1');
    expect(asEl(asEl(lis[1]).props.children).props.tokens).toBe(items[1]);
  });

  it('renders an excerpt through CodeExcerpt with its excerpt payload', () => {
    const excerpt: Excerpt = { id: 'a', file: 'f', lines: '1-2', lang: 'ts', code: 'x', ref: '' };
    const el = block({ type: 'excerpt', excerpt });
    expect(el.type).toBe(CodeExcerpt);
    expect(el.props.excerpt).toBe(excerpt);
  });

  it('keys each block by its index', () => {
    expect(block({ type: 'paragraph', tokens }, 3).key).toBe('3');
  });
});
