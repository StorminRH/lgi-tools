'use client';

import { usePathname } from 'next/navigation';
import { Suspense, createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { resolvePageSettings } from '@/platform/page-settings';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

import '@/composition/page-settings/register-all';

// The live spec resolves in an effect after mount, so it lives in a client
// store (see createClientStore). An explicit pathname overrides it.
const livePageSettings = createClientStore<PageSettingsSpec | null>(null);

const PageMenuOverride = createContext<{ spec: PageSettingsSpec | null } | null>(null);

function LivePathnameWatcher() {
  const pathname = usePathname();
  useEffect(() => {
    livePageSettings.set(resolvePageSettings(pathname ?? ''));
  }, [pathname]);
  return null;
}

export function PageMenuProvider({
  pathname,
  children,
}: {
  pathname?: string;
  children?: ReactNode;
}) {
  const override = useMemo(
    () => (pathname === undefined ? null : { spec: resolvePageSettings(pathname) }),
    [pathname],
  );

  return (
    <PageMenuOverride.Provider value={override}>
      {pathname === undefined ? (
        <Suspense fallback={null}>
          <LivePathnameWatcher />
        </Suspense>
      ) : null}
      {children}
    </PageMenuOverride.Provider>
  );
}

export function usePageSettings(): PageSettingsSpec | null {
  const override = useContext(PageMenuOverride);
  const live = useClientStore(livePageSettings);
  return override === null ? live : override.spec;
}
