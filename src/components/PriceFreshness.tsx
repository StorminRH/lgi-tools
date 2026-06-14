// Passive freshness indicator (3.6.3, handoff §2). Vercel cron refreshes market
// prices hourly, so this chip is display-only — no click, no fetch, no clock.
// It shows a pulsing green LED + "prices live" when there's price data, or a
// static amber dot + "no price data" before the first refresh. The "next
// refresh" countdown (and the invisible router.refresh()-on-stale clock behind
// it) was removed here — any navigation re-renders and the cron updates prices
// server-side, so the chip never needs to drive a refresh itself.
//
// className is a plain template, NOT cn(): twMerge misclassifies the
// `text-caption` font-size token as a color utility and would drop it in favour
// of the `text-isk`/`text-muted` color (see SCRATCHPAD's twMerge note). The two
// don't actually conflict (font-size vs color), so they coexist unmerged.

export function PriceFreshness({
  initialLastUpdatedAt,
}: {
  initialLastUpdatedAt: string | null;
}) {
  const hasData = initialLastUpdatedAt != null;
  return (
    <span
      className={`price-chip flex items-center gap-2 px-3 h-full font-mono text-caption uppercase tracking-[0.1em] whitespace-nowrap ${
        hasData ? 'text-isk' : 'text-muted'
      }`}
    >
      <span aria-hidden className={`price-led${hasData ? '' : ' warn'}`} />
      {hasData ? 'prices live' : 'no price data'}
    </span>
  );
}
