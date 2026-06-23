import { serverStatusPresentation } from '@/components/server-status-presentation';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';

// Passive Tranquility status chip in the nav (replaces the price-freshness
// indicator). A coloured LED keyed to server state + a compact label: a green
// pulsing dot with the online player count, an amber dot during the VIP-only
// window after downtime, or a muted dot + "offline" when ESI/TQ is unreachable.
// Display-only — the count is server-fetched and cached upstream, so there is
// no click, no client fetch, no clock.
//
// className is a plain template, NOT cn(): twMerge misclassifies the
// `text-caption` font-size token as a color utility and would drop it in favour
// of `text-isk`/`text-muted` (the same footgun documented on the old chip).
export function ServerStatus({ status }: { status: ServerStatusValue }) {
  const { label, ariaLabel, reachable } = serverStatusPresentation(status);
  return (
    <span
      aria-label={ariaLabel}
      className={`status-chip flex items-center gap-2 px-3 h-full font-mono text-caption uppercase tracking-[0.1em] whitespace-nowrap ${
        reachable ? 'text-isk' : 'text-muted'
      }`}
    >
      <span aria-hidden className={`status-led ${status.state}`} />
      {label}
    </span>
  );
}
