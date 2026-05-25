'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { postTelemetry } from './client';

// Paths the tracker silently ignores. Admin surfaces are excluded so the
// developer's own dashboard inspection doesn't pollute the metrics they
// are reading.
const SKIP_PREFIXES = ['/admin', '/api/'];

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

// Mounted once at the root layout. Watches the URL via Next.js navigation
// hooks and POSTs a page_view event for every change. Failures are
// swallowed by the server route — nothing to surface to the user either
// way.
export function TelemetryReporter(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || shouldSkip(pathname)) return;
    postTelemetry({
      action: 'page_view',
      metadata: { path: pathname, search },
    });
  }, [pathname, search]);

  return null;
}
