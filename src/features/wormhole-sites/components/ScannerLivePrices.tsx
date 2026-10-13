'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { LivePrice } from '@/components/ui/live-price';
import { cn } from '@/components/ui/cn';
import { idsKey } from '@/lib/array';
import { formatIskShort } from '@/lib/format/isk';
import {
  scannerLiveEstIsk,
  scannerEstIskSum,
  scannerLiveTypeIdsForNames,
} from '../scanner-live-isk';
import { useSiteCatalogue } from '../site-catalogue';
import {
  NO_LIVE_PRICES,
  useLivePriceLookup,
  type LivePriceLookup,
} from './live-price-lookup';

const ScannerLiveContext = createContext<LivePriceLookup>(NO_LIVE_PRICES);

function useScannerLive(): LivePriceLookup {
  return useContext(ScannerLiveContext);
}

export function ScannerLivePricesProvider({
  harvestableNames,
  children = null,
}: {
  readonly harvestableNames: readonly string[];
  readonly children?: ReactNode;
}) {
  const catalogue = useSiteCatalogue();
  const typeIds = useMemo(
    () => scannerLiveTypeIdsForNames(harvestableNames, catalogue.liveRecipesForName),
    [catalogue, harvestableNames],
  );
  // A new harvestable set (a jump, a fresh gas or ore signature) refetches
  // prices in place; keying a wrapper instead remounted the whole scanner dock.
  const value = useLivePriceLookup(typeIds, {
    enabled: typeIds.length > 0,
    refreshKey: idsKey(typeIds),
  });
  return (
    <ScannerLiveContext.Provider value={value}>
      {children}
    </ScannerLiveContext.Provider>
  );
}

export function useScannerEstIskSum(names: readonly (string | null)[]): number | null {
  const catalogue = useSiteCatalogue();
  const live = useScannerLive();
  return scannerEstIskSum(names, catalogue, live.priceOf);
}

export function ScannerEstIskCell({
  siteName,
  live,
}: {
  readonly siteName: string | null;
  readonly live: boolean;
}) {
  const scannerLive = useScannerLive();
  const catalogue = useSiteCatalogue();
  if (siteName === null) {
    return <StaticEstIsk isk={null} />;
  }

  const seed = catalogue.estIskForName(siteName);
  if (!live) {
    return <StaticEstIsk isk={seed} />;
  }

  const recipes = catalogue.liveRecipesForName(siteName);
  if (recipes.length === 0) {
    return <StaticEstIsk isk={seed} />;
  }

  const { total, pending } = scannerLiveEstIsk(
    recipes,
    scannerLive.priceOf,
    scannerLive.isPending,
  );
  return (
    <span
      data-signature-isk={total === null ? 'empty' : 'value'}
      className="justify-self-end text-right"
    >
      <LivePrice
        value={formatIskShort(total)}
        pending={pending}
        className={total === null ? 'text-muted' : 'text-isk'}
      />
    </span>
  );
}

function StaticEstIsk({ isk }: { readonly isk: number | null }) {
  return (
    <span
      data-signature-isk={isk === null ? 'empty' : 'value'}
      className={cn(
        'text-right tabular-nums',
        isk === null ? 'text-muted' : 'text-isk',
      )}
    >
      {formatIskShort(isk)}
    </span>
  );
}
