'use client';

import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { SiteDetail } from '../types';
import { SiteDetailsBody } from './SiteDetailsBody';

/**
 * Defers the (large) site detail body until the parent `<details>` is first
 * opened. The `<details>` element still owns open/closed state natively — this
 * only gates when the body MOUNTS, listening to the same native `toggle` event
 * `UrlSync` taps. So the index renders ~69 lightweight summaries instead of ~69
 * full wave/NPC trees: no server render and no DOM for collapsed detail, far
 * less per-request work and memory in dev and prod alike.
 *
 * Once opened it stays mounted (re-open is instant; live-price state persists).
 * `flushSync` on the toggle renders the body before the browser paints the open
 * state, so there's no empty-then-pop flash. The `<SiteCard defaultOpen>` path
 * (the /sites/[id] detail page) renders `SiteDetailsBody` directly server-side
 * instead — keeping that page's NPC content in the initial HTML for SEO.
 *
 * The wrapper is `display:contents` so the body lays out exactly as it did when
 * it was a direct child of `<details>` (card) or `.sites-table-expanded` (table).
 */
export function LazySiteDetails({
  site,
  zoom = false,
}: {
  site: SiteDetail;
  /** Scale the detail up slightly for readability (the card expand uses this;
   *  the denser table view doesn't). */
  zoom?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const details = ref.current?.closest('details');
    if (!details) return;
    // Already open on mount (e.g. opened before hydration) — mount immediately.
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
    <div ref={ref} className={zoom ? 'sites-detail-zoom' : 'contents'}>
      {open ? <SiteDetailsBody site={site} /> : null}
    </div>
  );
}
