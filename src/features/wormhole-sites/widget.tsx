'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { cn } from '@/components/ui/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/transport/api-client';
import { siteDetailEndpoint, type SiteDetail } from './api-contract';
import { SiteCard } from './components/SiteCard';

export {
  ScannerEstIskCell,
  ScannerLivePricesProvider,
} from './components/ScannerLivePrices';

export { useSiteCatalogue } from './site-catalogue';

export interface SiteCardWidgetProps {
  siteId: number;
  className?: string;
}

type WidgetState =
  | { siteId: number; status: 'loading' }
  | { siteId: number; status: 'ready'; site: SiteDetail }
  | { siteId: number; status: 'error' };

async function loadWidgetState(
  siteId: number,
  signal: AbortSignal,
): Promise<WidgetState> {
  try {
    const result = await apiFetch(siteDetailEndpoint, {
      params: { id: siteId },
      signal,
    });
    return result.ok
      ? { siteId, status: 'ready', site: result.data }
      : { siteId, status: 'error' };
  } catch {
    return { siteId, status: 'error' };
  }
}

function WidgetContent({ state }: { state: WidgetState }) {
  if (state.status === 'loading') {
    return (
      <Skeleton
        className="min-h-40 flex-1 rounded-card"
        label="Loading wormhole site"
      />
    );
  }
  if (state.status === 'error') {
    return (
      <Banner tone="warn" className="m-auto">
        This wormhole site could not be loaded.
      </Banner>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:auto]">
      <SiteCard
        site={state.site}
        presentation="standalone"
        contentAlign="center"
        className="border-0 bg-transparent shadow-none"
      />
    </div>
  );
}

export function SiteCardWidget({
  siteId,
  className,
}: SiteCardWidgetProps) {
  const [state, setState] = useState<WidgetState>({
    siteId,
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    void loadWidgetState(siteId, controller.signal).then((nextState) => {
      if (!ignore) setState(nextState);
    });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [siteId]);

  const visibleState: WidgetState =
    state.siteId === siteId ? state : { siteId, status: 'loading' };

  return (
    <section
      aria-label="Wormhole site card widget"
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden',
        className,
      )}
    >
      <WidgetContent state={visibleState} />
    </section>
  );
}
