'use client';

// The page-menu slot (ACCOUNT.4). A client provider, mounted once in the root
// layout, that resolves the current route's page-settings spec and hands it to
// whoever reads the slot — the portrait menu's dynamic half (ACCOUNT.5) and the
// /dev/page-settings harness today. The global shell never imports a feature: it
// reads the resolved spec through usePageSettings().
//
// Provider-slot, NOT Next parallel routes — the page never pushes; the wiring
// manifest maps route→spec and the slot resolves usePathname() against it.

import { usePathname } from 'next/navigation';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolvePageSettings } from '@/page-settings';
import type { PageSettingsSpec } from '@/page-settings/types';

// Side-effect import: fills the CLIENT registry with every page-settings spec.
// Lives here (a client module) for the same reason AppHeaderShell imports
// '@/search/register-all' — the server and client module graphs each have their
// own registry array, and the slot resolves client-side.
import '@/page-settings/register-all';

// null = no spec governs the current route (the menu's dynamic half is empty).
const PageMenuContext = createContext<PageSettingsSpec | null>(null);

export function PageMenuProvider({
  pathname,
  children,
}: {
  // Optional override for tests + the /dev harness, which resolve a sample route
  // with no Next router mounted. In the app it is omitted and the live pathname
  // (usePathname) is used.
  pathname?: string;
  children?: ReactNode;
}) {
  const livePathname = usePathname();
  const effective = pathname ?? livePathname ?? '';
  const spec = useMemo(() => resolvePageSettings(effective), [effective]);
  return <PageMenuContext.Provider value={spec}>{children}</PageMenuContext.Provider>;
}

// The slot: the current route's page-settings spec, or null. Safe to call
// outside a provider (returns null), like usePreference's tolerant read.
export function usePageSettings(): PageSettingsSpec | null {
  return useContext(PageMenuContext);
}
