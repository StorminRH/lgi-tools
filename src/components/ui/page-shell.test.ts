import { describe, expect, it } from 'vitest';
import { PageShell } from './page-shell';

describe('PageShell', () => {
  it('keeps the shared frame and foot rhythm for every mode', () => {
    for (const mode of ['workspace', 'reading', 'detail'] as const) {
      const shell = PageShell({ mode, children: 'content' });
      expect(shell.props.className).toContain('max-w-frame');
      expect(shell.props.className).toContain('pb-region');
    }
  });

  it('adds only the mode-owned inner treatment', () => {
    expect(PageShell({ mode: 'reading', children: 'content' }).props.children.props.className)
      .toContain('max-w-reading');
    expect(PageShell({ mode: 'detail', children: 'content' }).props.children.props.className)
      .toContain('pt-region');
    expect(PageShell({ mode: 'workspace', children: 'content' }).props.children.props.className)
      .not.toContain('max-w-reading');
  });
});
