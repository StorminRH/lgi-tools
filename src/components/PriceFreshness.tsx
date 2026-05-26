'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { CACHE_TTL_MS } from '@/data/market-prices/constants';

// Nav-slot freshness chip + refresh affordance. Shows the live age of the
// market_prices snapshot ("prices 3h ago"); a click triggers a cache-aware
// refresh (server-side 24h limiter applies). Lives in the AppHeader so it
// is visible from every page — market prices are shared infrastructure,
// not a /sites concern. Replaces the page-bottom RefreshFooter that was
// scoped to /sites only.

type RefreshResponse = {
  cached: boolean;
  lastUpdatedAt: string;
  fetched?: number;
  written?: number;
};

export function PriceFreshness({
  initialLastUpdatedAt,
}: {
  initialLastUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(
    initialLastUpdatedAt ? new Date(initialLastUpdatedAt) : null,
  );
  const [flash, setFlash] = useState<'refreshed' | 'cached' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isCached =
    lastUpdatedAt != null && now - lastUpdatedAt.getTime() < CACHE_TTL_MS;
  const isDisabled = isCached || isPending;

  async function handleClick() {
    startTransition(async () => {
      const res = await fetch('/api/market-prices/refresh', { method: 'POST' });
      const data: RefreshResponse = await res.json();
      setLastUpdatedAt(new Date(data.lastUpdatedAt));
      setFlash(data.cached ? 'cached' : 'refreshed');
      // Wipe the flash hint after 4 seconds so the chip returns to its
      // ambient "prices Nh ago" display.
      setTimeout(() => setFlash(null), 4000);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title={isCached ? 'Prices fresh — cache hit until 24h elapses' : 'Refresh market prices from Jita'}
      className="flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted hover:text-name disabled:hover:text-muted disabled:cursor-default transition-colors whitespace-nowrap"
    >
      <span
        aria-hidden
        className={`w-[5px] h-[5px] rounded-full ${
          isCached ? 'bg-isk' : 'bg-[#d68c3d]'
        }`}
      />
      {chipText(lastUpdatedAt, flash, now, isPending)}
    </button>
  );
}

function chipText(
  lastUpdatedAt: Date | null,
  flash: 'refreshed' | 'cached' | null,
  now: number,
  isPending: boolean,
): string {
  if (isPending) return 'refreshing…';
  if (flash === 'refreshed') return 'refreshed';
  if (lastUpdatedAt == null) return 'no price data';
  return `prices ${formatAge(now - lastUpdatedAt.getTime())}`;
}

function formatAge(deltaMs: number): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
