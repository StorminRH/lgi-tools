import { describe, expect, it } from 'vitest';
import { PageHead } from './page-head';

describe('PageHead', () => {
  it('keeps the compact subtitle as uppercase data metadata', () => {
    const compact = PageHead({ crumb: 'test', title: 'Test', subtitle: 'Metadata', size: 'compact' });
    const page = PageHead({ crumb: 'test', title: 'Test', subtitle: 'Sentence', size: 'page' });
    expect(compact.props.children[0].props.children[2].props.className).toContain('font-data');
    expect(compact.props.children[0].props.children[2].props.className).toContain('uppercase');
    expect(page.props.children[0].props.children[2].props.className).toContain('font-ui');
    expect(page.props.children[0].props.children[2].props.className).not.toContain('uppercase');
  });

  it('keeps the meta wrapper layout-only so controls retain their casing', () => {
    const head = PageHead({ crumb: 'test', title: 'Test', meta: 'Meta' });
    const metaClassName = head.props.children[1].props.className;

    expect(metaClassName).toContain('flex');
    expect(metaClassName).not.toContain('uppercase');
    expect(metaClassName).not.toContain('tracking-wide');
  });
});
