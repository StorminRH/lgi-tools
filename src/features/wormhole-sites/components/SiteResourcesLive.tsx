'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRefreshOnView } from '@/data/market-prices/use-refresh-on-view';
import { priceFx } from '@/components/ui/price-fx';
import { SectionFooter } from '@/components/ui/section-footer';
import type { SiteResource, SiteType } from '../types';
import { formatIskHeader } from '../format';
import { ResourceRow } from './ResourceRow';
import {
  resourceLiveIsk,
  SiteLiveContext,
  useSiteLive,
  type SiteLiveValue,
} from './site-live-context';

// The client island for a site's ore/gas resources. It refreshes the resource
// ISK live the first time the site is on screen (a collapsed <details> has zero
// layout, so the observer fires only once a card is opened AND scrolled into
// view — one trigger that covers card view, table view, and the default-open
// detail page). Until then, and for anything the engine can't price, the rows
// keep their server seed. Static site data (waves, NPCs, loot) is untouched and
// stays in the prerendered shell.
//
// The provider only carries the live price map + pending state; the rows and the
// footer read it through context and apply the same dimmed→flash treatment the
// Industry Planner uses.

export function SiteResourcesLive({
  resources,
  siteType,
  footerLabel,
}: {
  resources: SiteResource[];
  siteType: SiteType;
  footerLabel: string;
}) {
  const eligibleTypeIds = useMemo(
    () => [
      ...new Set(
        resources.filter((r) => r.liveEligible && r.typeId != null).map((r) => r.typeId as number),
      ),
    ],
    [resources],
  );

  const [enabled, setEnabled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // One-shot: enable the refresh the first time the resource list is on screen.
  useEffect(() => {
    if (enabled || eligibleTypeIds.length === 0) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setEnabled(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, eligibleTypeIds.length]);

  const { prices, isPending, everPending } = useRefreshOnView(eligibleTypeIds, { enabled });

  const value = useMemo<SiteLiveValue>(
    () => ({ priceOf: (typeId) => prices.get(typeId), isPending, everPending }),
    [prices, isPending, everPending],
  );

  return (
    <SiteLiveContext.Provider value={value}>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {resources.map((resource) => (
        <ResourceRow key={resource.id} resource={resource} siteType={siteType} />
      ))}
      <LiveResourceFooter resources={resources} label={footerLabel} />
    </SiteLiveContext.Provider>
  );
}

// The section total, summed live from the same map the rows read — hero-style:
// it shimmers while any eligible row is pending, then settles to the live sum.
function LiveResourceFooter({
  resources,
  label,
}: {
  resources: SiteResource[];
  label: string;
}) {
  const live = useSiteLive();
  const total = resources.reduce((sum, r) => sum + (resourceLiveIsk(r, live) ?? 0), 0);
  const anyPending = resources.some(
    (r) => r.liveEligible && r.typeId != null && live.isPending(r.typeId),
  );
  const fx = priceFx(anyPending, live.everPending);
  return <SectionFooter label={label} value={<span className={fx}>{formatIskHeader(total)}</span>} />;
}
