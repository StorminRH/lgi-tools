'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type RefreshResponse = {
  cached: boolean;
  lastUpdatedAt: string;
  fetched?: number;
  written?: number;
};

export function RefreshFooter({
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
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-[1100px] mt-12 pt-6 border-t border-border-soft flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className="font-display font-semibold text-[12px] tracking-[0.14em] uppercase text-name bg-[#161e28] border border-[#1e2c3a] rounded-[3px] px-4 py-2 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
      >
        {isPending ? 'Refreshing…' : 'Refresh Market Prices'}
      </button>
      <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
        {subscriptText(lastUpdatedAt, flash, now)}
      </div>
    </div>
  );
}

function subscriptText(
  lastUpdatedAt: Date | null,
  flash: 'refreshed' | 'cached' | null,
  now: number,
): string {
  if (flash === 'refreshed') return 'Just refreshed';
  if (flash === 'cached' && lastUpdatedAt != null) {
    const remainingMs = CACHE_TTL_MS - (now - lastUpdatedAt.getTime());
    return `Cache hit · try again in ${formatRemaining(remainingMs)}`;
  }
  if (lastUpdatedAt == null) return 'Never updated';
  return formatUpdated(now - lastUpdatedAt.getTime());
}

function formatUpdated(deltaMs: number): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) return 'Updated just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Updated ${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  return `Updated ${day} day${day === 1 ? '' : 's'} ago`;
}

function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const hr = Math.ceil(totalMin / 60);
  return `${hr}h`;
}
