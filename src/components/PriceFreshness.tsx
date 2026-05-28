'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STALE_AFTER_TTL_MS } from '@/data/market-prices/constants';

// Passive freshness indicator. Vercel cron refreshes market prices once
// a day (see vercel.json + src/app/api/cron/refresh-prices), so this
// chip is display-only — no click, no fetch, no button. The visible
// label is the constant "● prices live"; a native `title` tooltip
// surfaces a countdown to the next expected refresh for the curious.
// When the countdown crosses zero we fire one `router.refresh()` per
// initialLastUpdatedAt so the next server render picks up the cron's
// fresh timestamp.

export function PriceFreshness({
  initialLastUpdatedAt,
}: {
  initialLastUpdatedAt: string | null;
}) {
  const router = useRouter();
  const lastUpdatedAt = useMemo(
    () => (initialLastUpdatedAt ? new Date(initialLastUpdatedAt) : null),
    [initialLastUpdatedAt],
  );
  const [now, setNow] = useState(() => Date.now());
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    // Fresh server render → reset the once-per-window guard.
    hasRefreshedRef.current = false;
  }, [initialLastUpdatedAt]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastUpdatedAt == null || hasRefreshedRef.current) return;
    const msUntilNext = lastUpdatedAt.getTime() + STALE_AFTER_TTL_MS - now;
    if (msUntilNext <= 0) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [now, lastUpdatedAt, router]);

  if (lastUpdatedAt == null) {
    return (
      <span className="price-chip flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap">
        <span
          aria-hidden
          className="w-[5px] h-[5px] rounded-full bg-[#d68c3d]"
        />
        no price data
      </span>
    );
  }

  const msUntilNext = lastUpdatedAt.getTime() + STALE_AFTER_TTL_MS - now;
  const tooltip = `Next refresh in ${formatCountdown(msUntilNext)}`;

  return (
    <span
      title={tooltip}
      className="price-chip flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap"
    >
      <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-isk" />
      prices live
    </span>
  );
}

function formatCountdown(deltaMs: number): string {
  const totalSec = Math.max(0, Math.floor(deltaMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(min).padStart(2, '0')}m`;
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
