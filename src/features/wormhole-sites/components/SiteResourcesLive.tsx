'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LivePrice } from '@/components/ui/live-price';
import { SectionFooter } from '@/components/ui/section-footer';
import { dedupe } from '@/lib/array';
import { formatIskShort } from '@/lib/format/isk';
import { isLivePricedResource } from '../live-isk';
import type { SiteResource, SiteType } from '../types';
import { useLivePriceLookup } from './live-price-lookup';
import { SiteResourceRow } from './ResourceRow';
import {
  resourceLiveIsk,
  SiteLiveContext,
  useSiteLive,
  type SiteLiveValue,
} from './site-live-context';

function eligibleTypeIdsOf(resources: SiteResource[]): number[] {
  return dedupe(resources.filter(isLivePricedResource).map((r) => r.typeId));
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

  const lookup = useLivePriceLookup(eligibleTypeIds, { enabled });

  const value = useMemo<SiteLiveValue>(
    () => ({ ...lookup, requestEnable }),
    [lookup, requestEnable],
  );

  return <SiteLiveContext.Provider value={value}>{children}</SiteLiveContext.Provider>;
}

function LiveSiteTotal({ resources }: { resources: SiteResource[] }) {
  const live = useSiteLive();
  const total = resources.reduce((sum, resource) => sum + (resourceLiveIsk(resource, live) ?? 0), 0);
  const pending = resources.some(
    (resource) => isLivePricedResource(resource) && live.isPending(resource.typeId),
  );
  return <LivePrice value={formatIskShort(total, { unit: true })} pending={pending} />;
}

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

export function SiteHeaderTotal({ resources }: { resources: SiteResource[] }) {
  return <LiveSiteTotal resources={resources} />;
}

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
        <SiteResourceRow key={resource.id} resource={resource} siteType={siteType} />
      ))}
      <LiveResourceFooter resources={resources} label={footerLabel} />
    </>
  );
}

function LiveResourceFooter({
  resources,
  label,
}: {
  resources: SiteResource[];
  label: string;
}) {
  return (
    <SectionFooter
      label={label}
      value={<LiveSiteTotal resources={resources} />}
    />
  );
}
