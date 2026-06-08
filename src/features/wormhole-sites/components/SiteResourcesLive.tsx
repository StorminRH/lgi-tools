'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRefreshOnView } from '@/data/market-prices/use-refresh-on-view';
import { OdometerValue } from '@/components/ui/odometer-value';
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

// Live ore/gas pricing for one site. The provider wraps the WHOLE card (header
// summary + expanded body) so the card's headline total and the per-resource
// rows + footer all refresh from one engine call and flash together. Static site
// data (waves, NPCs, loot) is untouched and stays in the prerendered shell.
//
// The refresh is gated to "on view": a zero-layout sentinel lives inside the
// collapsed body, so the first time the card is opened AND scrolled into view it
// calls `requestEnable` and the loop starts (one trigger covering card view,
// table view, and the default-open detail page). Until then, and for anything
// the engine can't price, every figure shows its server seed.

// Derive the set of type IDs worth refreshing for a site (those whose rows can
// actually take a live value).
function eligibleTypeIdsOf(resources: SiteResource[]): number[] {
  return [
    ...new Set(
      resources.filter((r) => r.liveEligible && r.typeId != null).map((r) => r.typeId as number),
    ),
  ];
}

export function SiteLiveProvider({
  resources,
  children,
}: {
  resources: SiteResource[];
  children: ReactNode;
}) {
  const eligibleTypeIds = useMemo(() => eligibleTypeIdsOf(resources), [resources]);

  const [enabled, setEnabled] = useState(false);
  const requestEnable = useCallback(() => setEnabled(true), []);

  const { prices, isPending } = useRefreshOnView(eligibleTypeIds, { enabled });

  const value = useMemo<SiteLiveValue>(
    () => ({ priceOf: (typeId) => prices.get(typeId), isPending, requestEnable }),
    [prices, isPending, requestEnable],
  );

  return <SiteLiveContext.Provider value={value}>{children}</SiteLiveContext.Provider>;
}

// Zero-height marker placed at the top of the (collapsed-hidden) body. Fires the
// provider's `requestEnable` the first time it's on screen — i.e. once the card
// is opened and scrolled into view.
function ViewSentinel() {
  const { requestEnable } = useSiteLive();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        requestEnable();
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [requestEnable]);
  return <div ref={ref} aria-hidden className="h-0" />;
}

// The card's headline total, summed live from the same map the rows read —
// hero-style: it shimmers while any eligible row is pending, then settles to the
// live sum. Shows the server seed until the refresh lands.
export function SiteHeaderTotal({ resources }: { resources: SiteResource[] }) {
  const live = useSiteLive();
  const total = resources.reduce((sum, r) => sum + (resourceLiveIsk(r, live) ?? 0), 0);
  const anyPending = resources.some(
    (r) => r.liveEligible && r.typeId != null && live.isPending(r.typeId),
  );
  return <OdometerValue value={formatIskHeader(total)} pending={anyPending} />;
}

// The expanded body's resource rows + footer. Renders the view sentinel that
// arms the refresh, then the live rows and the live total. Consumes the context
// from the SiteLiveProvider above it.
export function SiteResourcesLive({
  resources,
  siteType,
  footerLabel,
}: {
  resources: SiteResource[];
  siteType: SiteType;
  footerLabel: string;
}) {
  return (
    <>
      <ViewSentinel />
      {resources.map((resource) => (
        <ResourceRow key={resource.id} resource={resource} siteType={siteType} />
      ))}
      <LiveResourceFooter resources={resources} label={footerLabel} />
    </>
  );
}

// The section total — same live sum as the header, rendered as the footer line.
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
  return (
    <SectionFooter
      label={label}
      value={<OdometerValue value={formatIskHeader(total)} pending={anyPending} />}
    />
  );
}
