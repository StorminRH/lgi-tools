'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CACHE_TTL_MS } from '@/data/market-prices/constants';

// Passive freshness indicator. Vercel cron refreshes market prices every
// hour (see vercel.json + src/app/api/cron/refresh-prices), so this chip
// is display-only — no click, no fetch, no button. The visible label is
// the constant "● prices live"; a native `title` tooltip surfaces the
// countdown to the next expected refresh for the curious. When the
// countdown crosses zero we fire one `router.refresh()` per
// initialLastUpdatedAt so the next server render picks up the cron's
// fresh timestamp.

export function PriceFreshness({
  initialLastUpdatedAt,
}: {
  initialLastUpdatedAt: string | null;
}) {
  const router = useRouter();
  const lastUpdatedAt = initialLastUpdatedAt
    ? new Date(initialLastUpdatedAt)
    : null;
  const [now, setNow] = useState(() => Date.now());
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    // Fresh server render → reset the once-per-window guard.
    hasRefreshedRef.current = false;
  }, [initialLastUpdatedAt]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastUpdatedAt == null || hasRefreshedRef.current) return;
    const msUntilNext = lastUpdatedAt.getTime() + CACHE_TTL_MS - now;
    if (msUntilNext <= 0) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [now, lastUpdatedAt, router]);

  if (lastUpdatedAt == null) {
    return (
      <span className="flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap">
        <span
          aria-hidden
          className="w-[5px] h-[5px] rounded-full bg-[#d68c3d]"
        />
        no price data
      </span>
    );
  }

  const msUntilNext = lastUpdatedAt.getTime() + CACHE_TTL_MS - now;
  const tooltip = `Next refresh in ${formatCountdown(msUntilNext)}`;

  return (
    <span
      title={tooltip}
      className="flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap"
    >
      <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-isk" />
      prices live
    </span>
  );
}

function formatCountdown(deltaMs: number): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(min).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}
