'use client';

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
import { resolvePageSettings } from '@/platform/page-settings';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

import '@/composition/page-settings/register-all';

const PageMenuContext = createContext<PageSettingsSpec | null>(null);

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

export function usePageSettings(): PageSettingsSpec | null {
  return useContext(PageMenuContext);
}
