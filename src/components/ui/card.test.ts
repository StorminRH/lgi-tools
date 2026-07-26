import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('defaults to the existing div surface', () => {
    const el = Card({ children: 'content' });
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('bg-section');
  });

  it('supports list-item card semantics', () => {
    const el = Card({ as: 'li', children: 'content' });
    expect(el.type).toBe('li');
  });
});
