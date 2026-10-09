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

    const openHash = `${new URL(basePath, window.location.origin).hash || '#'}/${entityId}`;
    const onToggle = () => {
      const url = new URL(basePath, window.location.origin);
      if (details.open) url.hash = openHash;
      url.search = window.location.search;
      window.history.replaceState(null, '', url);
    };

    if (window.location.hash === openHash && !details.open) {
      details.open = true;
      details.scrollIntoView({ block: 'start' });
    }
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [basePath, entityId]);

  return <div ref={ref} className={className}>{children}</div>;
}
