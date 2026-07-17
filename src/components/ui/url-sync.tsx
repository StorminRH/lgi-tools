'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Syncs the open/closed state of a child <details> element to the
 * URL path. When the details opens, the URL becomes
 * `${basePath}/${entityId}${currentSearch}`. When it closes, the URL
 * reverts to `${basePath}${currentSearch}`.
 *
 * The component locates the <details> by DOM query and listens to
 * the native `toggle` event, so the wrapped component stays a pure
 * server component with no client-state awareness.
 *
 * One-way only: state -\> URL. Reading the URL on mount to open a
 * specific child is not implemented (no current use case).
 */
export function UrlSync({
  basePath,
  entityId,
  className,
  children,
}: {
  basePath: string;
  entityId: number | string;
  // Optional class applied to the wrapper div. Useful when the wrapper itself
  // needs sibling-aware styles (e.g. `last:border-b-0`), which can't reach
  // through the wrapper from inside <details>.
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const details = root.querySelector<HTMLDetailsElement>('details');
    if (!details) return;

    const onToggle = () => {
      const search = window.location.search;
      const url = details.open
        ? `${basePath}/${entityId}${search}`
        : `${basePath}${search}`;
      window.history.replaceState(null, '', url);
    };

    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [basePath, entityId]);

  return <div ref={ref} className={className}>{children}</div>;
}
