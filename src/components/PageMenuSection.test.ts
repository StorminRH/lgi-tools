import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// No Next router in the node test env; the provider resolves off its `pathname`
// prop (the PageMenuProvider.test.ts pattern). usePreference tolerates the
// missing PreferencesProvider — values fall back to each def's default.
vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider } from '@/components/PageMenuProvider';
import { PageMenuSection } from '@/components/PageMenuSection';
import { __resetPageSettings, registerPageSettings } from '@/platform/page-settings';

function renderAt(pathname: string): string {
  return renderToStaticMarkup(
    createElement(PageMenuProvider, { pathname }, createElement(PageMenuSection)),
  );
}

beforeEach(() => __resetPageSettings());

describe('PageMenuSection', () => {
  it('renders a registered enum control as a titled segmented choice', () => {
    registerPageSettings({
      route: '/sites',
      controls: [{ key: 'sites.view', placement: 'section' }],
    });
    const html = renderAt('/sites');
    expect(html).toContain('Page settings'); // default section title
    expect(html).toContain('view'); // derived row label
    expect(html).toContain('cards');
    expect(html).toContain('table');
    expect(html).toContain('aria-pressed="true"'); // the fallback value is selected
  });

  it('prefers the spec’s own title when declared', () => {
    registerPageSettings({
      route: '/sites',
      title: 'Sites',
      controls: [{ key: 'sites.view', placement: 'section' }],
    });
    expect(renderAt('/sites')).toContain('Sites');
  });

  it('renders nothing for a spec-less route (no filler)', () => {
    registerPageSettings({
      route: '/sites',
      controls: [{ key: 'sites.view', placement: 'section' }],
    });
    expect(renderAt('/skills')).toBe('');
  });

  it('renders nothing when the spec has no renderable section controls', () => {
    registerPageSettings({ route: '/jobs', strip: { surfaceId: 'jobs' } });
    expect(renderAt('/jobs')).toBe('');
  });
});
