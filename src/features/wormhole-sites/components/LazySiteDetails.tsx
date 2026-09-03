'use client';

import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { SiteDetail } from '../types';
import { SiteDetailsBody } from './SiteDetailsBody';

export function LazySiteDetails({
  site,
  zoom = false,
}: {
  site: SiteDetail;
  zoom?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const details = ref.current?.closest('details');
    if (!details) return;
    if (details.open) {
      setOpen(true);
      return;
    }
    const onToggle = () => {
      if (details.open) flushSync(() => setOpen(true));
    };
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [open]);

  return (
    <div ref={ref} data-lazy-details className={zoom ? 'sites-detail-zoom' : 'contents'}>
      {open ? <SiteDetailsBody site={site} /> : null}
    </div>
  );
}
