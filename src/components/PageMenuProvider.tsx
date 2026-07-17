'use client';

// The page-menu slot (ACCOUNT.4). A client provider, mounted once in the root
// layout, that resolves the current route's page-settings spec and hands it to
// whoever reads the slot — the portrait menu's dynamic half (PageMenuSection,
// ACCOUNT.5). The global shell never imports a feature: it reads the resolved
// spec through usePageSettings().
//
// Provider-slot, NOT Next parallel routes — the page never pushes; the wiring
// manifest maps route→spec and the slot resolves usePathname() against it.
//
// usePathname() is request-time data under Cache Components, so reading it bare
// at the top of the layout would bail every route to dynamic ("uncached data
// outside <Suspense>" — it can't be known when the static shell prerenders). So
// the live read is isolated in a <Suspense>-wrapped child (the NavTools pattern)
// that reports the resolved spec up via state — the page children render with the
// context but are never DOWNSTREAM of the dynamic read, so their static shells
// are preserved. The spec is null in the prerendered shell and resolves after
// hydration; the menu opens on interaction (post-hydration), so it sees it.

import { usePathname } from 'next/navigation';
import {
  Suspense,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { resolvePageSettings } from '@/page-settings';
import type { PageSettingsSpec } from '@/page-settings/types';

// Side-effect import: fills the CLIENT registry with every page-settings spec.
// Lives here (a client module) for the same reason AppHeaderShell imports
// '@/search/register-all' — the server and client module graphs each have their
// own registry array, and the slot resolves client-side.
import '@/page-settings/register-all';

// null = no spec governs the current route (the menu's dynamic half is empty).
const PageMenuContext = createContext<PageSettingsSpec | null>(null);

// Reads the live pathname inside its own component so the provider can wrap it in
// <Suspense> (the NavTools `ActiveNavStrip` pattern), then reports the resolved
// spec up via `onResolve`. Renders nothing — the page children are siblings, not
// descendants, of this dynamic read.
function LivePathnameWatcher({
  onResolve,
}: {
  onResolve: (spec: PageSettingsSpec | null) => void;
}) {
  const pathname = usePathname();
  useEffect(() => {
    onResolve(resolvePageSettings(pathname ?? ''));
  }, [pathname, onResolve]);
  return null;
}

export function PageMenuProvider({
  pathname,
  children,
}: {
  // Optional override for tests, which resolve a sample route with no Next
  // router mounted. Resolved synchronously; the live watcher is skipped. In the
  // app it is omitted and the live pathname is used.
  pathname?: string;
  children?: ReactNode;
}) {
  const override = useMemo(
    () => (pathname === undefined ? null : resolvePageSettings(pathname)),
    [pathname],
  );
  const [live, setLive] = useState<PageSettingsSpec | null>(null);
  const spec = pathname === undefined ? live : override;

  return (
    <PageMenuContext.Provider value={spec}>
      {pathname === undefined ? (
        <Suspense fallback={null}>
          <LivePathnameWatcher onResolve={setLive} />
        </Suspense>
      ) : null}
      {children}
    </PageMenuContext.Provider>
  );
}

/**
 * The slot: the current route's page-settings spec, or null. Safe to call
 * outside a provider (returns null), like usePreference's tolerant read.
 */
export function usePageSettings(): PageSettingsSpec | null {
  return useContext(PageMenuContext);
}
