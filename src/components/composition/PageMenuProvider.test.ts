import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider, usePageSettings } from '@/components/composition/PageMenuProvider';
import { __resetPageSettings, registerPageSettings } from '@/platform/page-settings';

function Consumer() {
  const spec = usePageSettings();
  const text = spec
    ? `${spec.route}|${(spec.controls ?? []).map((c) => ('key' in c ? c.key : c.id)).join(',')}|strip:${spec.strip?.surfaceId ?? 'none'}`
    : 'EMPTY';
  return createElement('output', null, text);
}

function renderAt(pathname: string): string {
  return renderToStaticMarkup(
    createElement(PageMenuProvider, { pathname }, createElement(Consumer)),
  );
}

beforeEach(() => __resetPageSettings());

describe('PageMenuProvider slot', () => {
  it('yields a registered section through the slot for its route', () => {
    registerPageSettings({
      route: '/sites',
      controls: [{ key: 'sites.view', placement: 'section' }],
    });
    expect(renderAt('/sites')).toContain('/sites|sites.view|strip:none');
  });

  it('resolves a sub-route to the same spec', () => {
    registerPageSettings({ route: '/sites', controls: [] });
    expect(renderAt('/sites/30002')).toContain('/sites||strip:none');
  });

  it('yields empty for a route with no spec', () => {
    registerPageSettings({ route: '/sites', controls: [] });
    expect(renderAt('/skills')).toContain('EMPTY');
  });

  it('carries an optional character-strip declaration through the slot (D-7 type)', () => {
    registerPageSettings({ route: '/jobs', strip: { surfaceId: 'jobs' } });
    expect(renderAt('/jobs')).toContain('strip:jobs');
  });
});
