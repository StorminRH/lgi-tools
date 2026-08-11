'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { LivePrice } from '@/components/ui/live-price';
import { cn } from '@/components/ui/cn';
import {
  useRefreshOnView,
  type RefreshedPrice,
} from '@/data/market-prices/use-refresh-on-view';
import { formatIskShort } from '@/lib/format/isk';
import {
  scannerLiveEstIsk,
  scannerLiveTypeIdKey,
  scannerLiveTypeIdsForNames,
} from '../scanner-live-isk';
import {
  siteEstIskForSiteName,
  siteLiveRecipesForSiteName,
} from '../site-name-lookup';

type ScannerLiveValue = {
  readonly priceOf: (typeId: number) => RefreshedPrice | undefined;
  readonly isPending: (typeId: number) => boolean;
};

const NO_LIVE: ScannerLiveValue = {
  priceOf: () => undefined,
  isPending: () => false,
};

const ScannerLiveContext = createContext<ScannerLiveValue>(NO_LIVE);

function useScannerLive(): ScannerLiveValue {
  return useContext(ScannerLiveContext);
}

/**
 * Owns one refresh-on-view loop for every live-eligible type present among the
 * given harvestable site names. Remounts when the type-id set changes so a
 * newly identified site after paste starts a fresh confirmation loop.
 */
export function ScannerLivePricesProvider({
  harvestableNames,
  children = null,
}: {
  readonly harvestableNames: readonly string[];
  readonly children?: ReactNode;
}) {
  const typeIds = useMemo(
    () => scannerLiveTypeIdsForNames(harvestableNames, siteLiveRecipesForSiteName),
    [harvestableNames],
  );
  const typeIdKey = scannerLiveTypeIdKey(typeIds);
  return (
    <ScannerLivePricesEngine key={typeIdKey} typeIds={typeIds}>
      {children}
    </ScannerLivePricesEngine>
  );
}

function ScannerLivePricesEngine({
  typeIds,
  children,
}: {
  readonly typeIds: readonly number[];
  readonly children: ReactNode;
}) {
  const enabled = typeIds.length > 0;
  const { prices, isPending } = useRefreshOnView([...typeIds], { enabled });
  const value = useMemo<ScannerLiveValue>(
    () => ({
      priceOf: (typeId) => prices.get(typeId),
      isPending,
    }),
    [prices, isPending],
  );
  return (
    <ScannerLiveContext.Provider value={value}>
      {children}
    </ScannerLiveContext.Provider>
  );
}

/**
 * Scanner Est. ISK cell. Harvestable catalogue rows flash through LivePrice;
 * combat / unmatched / empty stay static (no pending pulse).
 */
export function ScannerEstIskCell({
  siteName,
  live,
}: {
  readonly siteName: string | null;
  /** True for harvestable rows — arms LivePrice when recipes exist. */
  readonly live: boolean;
}) {
  const scannerLive = useScannerLive();
  if (siteName === null) {
    return <StaticEstIsk isk={null} />;
  }

  const seed = siteEstIskForSiteName(siteName);
  if (!live) {
    return <StaticEstIsk isk={seed} />;
  }

  const recipes = siteLiveRecipesForSiteName(siteName);
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
