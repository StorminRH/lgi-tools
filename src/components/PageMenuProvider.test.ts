import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// usePathname has no Next router in the node test env; mock it to null so the
// provider resolves off its `pathname` prop (the admin/load-section precedent).
// We render via react-dom/server — the house pattern (SitesFilterLayout.test.ts);
// no DOM/testing-library needed.
vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider, usePageSettings } from '@/components/PageMenuProvider';
import { __resetPageSettings, registerPageSettings } from '@/page-settings';

// Reads the slot and emits the resolved spec's route + control keys + strip, or
// EMPTY when no spec governs the route.
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

// Importing the provider runs its side-effect registration once; reset before
// each test so only the test's own specs are registered.
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
