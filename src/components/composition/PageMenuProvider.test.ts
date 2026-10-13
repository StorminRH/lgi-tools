import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider, usePageSettings } from '@/components/composition/PageMenuProvider';

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

describe('PageMenuProvider slot', () => {
  it("yields a route's spec through the slot, for the route and its sub-routes", () => {
    expect(renderAt('/sites')).toContain('/sites|sites.view,sites.detailMode|strip:none');
    expect(renderAt('/sites/30002')).toContain('/sites|sites.view,sites.detailMode|strip:none');
  });

  it('yields empty for a route with no spec', () => {
    expect(renderAt('/skills')).toContain('EMPTY');
  });

  it('carries an optional character-strip declaration through the slot (D-7 type)', () => {
    expect(renderAt('/industry/jobs')).toContain('/industry/jobs||strip:jobs');
  });
});
