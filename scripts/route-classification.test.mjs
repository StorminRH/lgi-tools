import { describe, expect, it } from 'vitest';
import { classifyRoute } from './route-classification.mjs';

// Prerender-manifest entries shaped like `next build` 16.4 writes them with
// cacheComponents on: route handlers are STATIC with compute 'static'; every
// page is PARTIALLY_STATIC, and compute says whether its render postponed.
const handler = {
  renderingMode: 'STATIC',
  routeType: 'route',
  response: 'complete',
  compute: 'static',
  dataRoute: null,
};
const pageWithHole = {
  renderingMode: 'PARTIALLY_STATIC',
  routeType: 'page',
  response: 'initial',
  compute: 'resuming',
  dataRoute: '/contact.rsc',
};
const pageWithoutHole = {
  renderingMode: 'PARTIALLY_STATIC',
  routeType: 'page',
  response: 'complete',
  compute: 'static',
  dataRoute: '/about.rsc',
};
const paramShell = {
  renderingMode: 'PARTIALLY_STATIC',
  routeType: 'shell',
  response: 'initial',
  compute: 'resuming',
  fallback: '/sites/[id].html',
};
const emptyParamShell = {
  renderingMode: 'PARTIALLY_STATIC',
  routeType: 'page',
  response: 'empty',
  compute: 'blocking',
  fallback: null,
};

const prerender = {
  routes: {
    '/api/industry/blueprints': handler,
    '/robots.txt': handler,
    '/contact': pageWithHole,
    '/about': pageWithoutHole,
  },
  dynamicRoutes: {
    '/sites/[id]': paramShell,
    '/admin/users/[userId]': emptyParamShell,
  },
};

// `.meta` files as the export writes them without an adapter: `postponed`
// is present only when the render postponed.
const ciMeta = {
  '/api/industry/blueprints': { status: 200, headers: { 'content-type': 'application/json' } },
  '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' } },
  '/contact': { status: 200, headers: {}, postponed: '{"type":1}' },
  '/about': { status: 200, headers: {} },
  '/sites/[id]': { status: 200, headers: {}, postponed: '{"type":2}' },
  '/admin/users/[userId]': { status: 200, headers: {}, postponed: '{"type":2}' },
};

const ciLayout = (route) => ciMeta[route];
// With an adapter the prerender files live under .next/server/route-cache/,
// so nothing is found at .next/server/app/<route>.meta.
const adapterLayout = () => undefined;

const classify = (route, metaFor) => classifyRoute({ route, prerender, metaFor });

const expectations = [
  ['/api/industry/blueprints', 'static'],
  ['/robots.txt', 'static'],
  ['/contact', 'partial'],
  ['/about', 'static'],
  ['/sites/[id]', 'partial'],
  ['/admin/users/[userId]', 'partial'],
  ['/api/account/board', 'dynamic'],
];

describe('classifyRoute', () => {
  it.each(expectations)('classifies %s as %s from .meta files', (route, mode) => {
    expect(classify(route, ciLayout)).toBe(mode);
  });

  it.each(expectations)('classifies %s as %s from the manifest alone', (route, mode) => {
    expect(classify(route, adapterLayout)).toBe(mode);
  });

  it('reads postponed from .meta ahead of the manifest compute value', () => {
    const withoutCompute = { routes: { '/x': { renderingMode: 'PARTIALLY_STATIC' } }, dynamicRoutes: {} };
    const metaFor = (route) => (route === '/x' ? { status: 200, postponed: '{}' } : undefined);
    expect(classifyRoute({ route: '/x', prerender: withoutCompute, metaFor })).toBe('partial');
  });

  it('fails loudly when a prerendered route has neither signal', () => {
    const bare = { routes: { '/x': { renderingMode: 'PARTIALLY_STATIC' } }, dynamicRoutes: {} };
    expect(() => classifyRoute({ route: '/x', prerender: bare, metaFor: adapterLayout })).toThrow(
      'prerendered route "/x" has no .meta file and no prerender-manifest compute value',
    );
  });
});
