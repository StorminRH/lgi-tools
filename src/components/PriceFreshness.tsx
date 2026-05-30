'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HoverPopover } from '@/components/ui/hover-popover';
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
  // Starts null so the (now static) prerender of the header never reads the wall
  // clock — Cache Components forbids `Date.now()` in a prerendered Client
  // Component. The mount effect below fills it in on the client.
  const [now, setNow] = useState<number | null>(null);
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    // Fresh server render → reset the once-per-window guard.
    hasRefreshedRef.current = false;
  }, [initialLastUpdatedAt]);

  useEffect(() => {
    // Client-only: initialise and tick after hydration. The clock is read in these
    // timer callbacks, never during render, so the static prerender of the header
    // never touches the wall clock. The initial read is a 0ms timer (not a direct
    // call) to keep setState out of the synchronous effect body.
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (lastUpdatedAt == null || now == null || hasRefreshedRef.current) return;
    const msUntilNext = lastUpdatedAt.getTime() + STALE_AFTER_TTL_MS - now;
    if (msUntilNext <= 0) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [now, lastUpdatedAt, router]);

  if (lastUpdatedAt == null) {
    return (
      <HoverPopover
        className="h-full"
        triggerClassName="h-full"
        label="Market price status"
        trigger={
          <span className="price-chip flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap">
            <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-[#d68c3d]" />
            no price data
          </span>
        }
      >
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Status</div>
        <div className="text-[13px] text-name font-semibold">Awaiting first refresh</div>
      </HoverPopover>
    );
  }

  const msUntilNext =
    now == null ? null : lastUpdatedAt.getTime() + STALE_AFTER_TTL_MS - now;
  const msSinceLast = now == null ? null : Math.max(0, now - lastUpdatedAt.getTime());

  return (
    <HoverPopover
      className="h-full"
      triggerClassName="h-full"
      label="Market price freshness"
      trigger={
        <span className="price-chip flex items-center gap-2 px-3 h-full font-mono text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap">
          <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-isk" />
          prices live
        </span>
      }
    >
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Next refresh</div>
      <div className="text-[13px] text-name font-semibold tabular-nums">
        {msUntilNext == null ? '—' : formatCountdown(msUntilNext)}
      </div>
      <div className="mt-2.5 pt-2 border-t border-border-soft text-[9px] uppercase tracking-[0.1em] text-muted">
        Updated {msSinceLast == null ? '—' : formatCountdown(msSinceLast)} ago
      </div>
    </HoverPopover>
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
