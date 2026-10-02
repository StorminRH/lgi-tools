import { describe, expect, it } from 'vitest';
import { PageShell } from './page-shell';

describe('PageShell', () => {
  it('starts every page at the same top offset and adds only the mode-owned inner treatment', () => {
    expect(PageShell({ mode: 'reading', children: 'content' }).props.children.props.className)
      .toContain('max-w-reading');
    for (const mode of ['workspace', 'reading', 'detail'] as const) {
      expect(PageShell({ mode, children: 'content' }).props.className).toContain('pt-region');
    }
    expect(PageShell({ mode: 'workspace', children: 'content' }).props.children.props.className)
      .not.toContain('max-w-reading');
  });
});
