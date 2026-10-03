import { describe, expect, it } from 'vitest';
import { PageShell } from './page-shell';

describe('PageShell', () => {
  it('adds the reading measure only in reading mode', () => {
    expect(PageShell({ mode: 'reading', children: 'content' }).props.children.props.className)
      .toContain('max-w-reading');
    expect(PageShell({ mode: 'workspace', children: 'content' }).props.children.props.className)
      .not.toContain('max-w-reading');
  });
});
