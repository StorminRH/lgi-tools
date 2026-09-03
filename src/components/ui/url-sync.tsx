'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function UrlSync({
  basePath,
  entityId,
  className,
  children,
}: {
  basePath: string;
  entityId: number | string;
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
