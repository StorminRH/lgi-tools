// The settings *presentation* registry — the third instance of the register-all
// / unclassified-junction pattern (after src/search/ and src/purge/). Each
// feature exports a PageSettingsSpec describing the contextual settings for its
// route(s); the wiring manifest in ./register-all PULLS those values and
// registers them here, and a route→spec resolver hands the current route's spec
// to the page-menu slot (src/components/PageMenuProvider). The global shell never
// imports a feature — it reads the resolved spec.
//
// Mirrors src/search/index.ts: a module-level array, a register fn, a list
// accessor, a test-only reset. Like search, the server and client module graphs
// each get their own `specs[]`; the side-effect import that fills it
// (./register-all) lives in the CLIENT provider, since the slot resolves
// client-side (the AppHeaderShell.tsx '@/search/register-all' precedent).

import { resolveSpecForPath } from './resolve';
import type { PageSettingsSpec } from './types';

const specs: PageSettingsSpec[] = [];

/**
 * Registers one page-settings specification by route and rejects duplicate ownership so each page
 * has one authoritative declaration.
 */
export function registerPageSettings(spec: PageSettingsSpec): void {
  specs.push(spec);
}

/**
 * Every registered spec, in registration order. The anti-drift test reads this
 * to assert each control references a real preference key.
 */
export function listPageSettings(): readonly PageSettingsSpec[] {
  return specs;
}

/**
 * The route→spec lookup the slot calls with usePathname(). Null when no spec
 * governs the route — the menu's dynamic half is then empty.
 */
export function resolvePageSettings(pathname: string): PageSettingsSpec | null {
  return resolveSpecForPath(pathname, specs);
}

/**
 * Test-only: clear the registry so each test starts from empty. Production code
 * never calls this (mirrors __resetSearchSources).
 */
export function __resetPageSettings(): void {
  specs.length = 0;
}
