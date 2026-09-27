'use client';

import dynamic from 'next/dynamic';
import { Measured } from '@/components/ui/measured';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import type { StackedBand, StackedDatum } from '@/components/ui/stacked-area-chart';
import { formatIsk } from '@/lib/format/isk';
import { formatUtcDate } from '@/lib/format/time';
import type { WorthPoint } from './board-view-model';

const StackedAreaChart = dynamic(
  () => import('@/components/ui/stacked-area-chart').then((m) => m.StackedAreaChart),
  { ssr: false },
);

// Wallet ISK sits at the bottom; everything else a pilot owns stacks on top,
// so the upper edge is net worth.
const BANDS: readonly StackedBand[] = [
  { key: 'isk', tone: 'blue' },
  { key: 'assets', tone: 'green' },
];

function WorthTooltip({ datum }: { datum: StackedDatum }) {
  const isk = datum.values[0] ?? 0;
  const assets = datum.values[1] ?? null;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted">{datum.label}</span>
      {assets !== null && <span className="text-isk">Net worth {formatIsk(isk + assets)}</span>}
      <span className="text-tone-blue">ISK {formatIsk(isk)}</span>
      {assets !== null && <span className="text-name">Assets {formatIsk(assets)}</span>}
    </span>
  );
}

/** Net worth over time as two stacked bands: ISK, then assets. */
export function WorthChart({ series, ariaLabel, height = 190 }: { series: readonly WorthPoint[]; ariaLabel: string; height?: number }) {
  if (series.length < 2) return null;
  const data: StackedDatum[] = series.map((point) => ({
    x: point.t,
    label: formatUtcDate(new Date(point.t)),
    values: [point.liquid, point.assets],
  }));
  return (
    <Measured>
      {(width) => (
        <StackedAreaChart
          data={data}
          bands={BANDS}
          width={width}
          height={height}
          formatY={formatIsk}
          formatTick={(label) => label.replace(/ \d{4}$/, '')}
          ariaLabel={ariaLabel}
          renderTooltip={(datum) => <WorthTooltip datum={datum} />}
        />
      )}
    </Measured>
  );
}

/** The (?) beside a net-worth figure: what is and is not counted. */
function NetWorthHelp() {
  return (
    <Popover
      label="About estimated net worth"
      trigger="?"
      triggerClassName="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-border-idle bg-bg-deep/60 text-micro font-bold text-muted hover:border-isk-dim hover:text-isk"
    >
      <PopoverHeading>Estimated net worth</PopoverHeading>
      <p className="text-ui leading-snug text-muted">
        Your ISK plus the market value of what your pilots own: items in hangars, ships and their
        fittings, implants, and items listed on the market.
      </p>
      <p className="text-ui leading-snug text-muted">
        Prices follow recent Jita market prices, so this number moves with the market.
      </p>
      <p className="text-ui leading-snug text-muted">Not counted: blueprints, SKINs, and PLEX in your PLEX vault.</p>
    </Popover>
  );
}

/** A net-worth headline: the big figure, the (?), and ISK beside it. */
export function WorthHeadline({
  worth,
  liquid,
  note,
}: {
  worth: number | null;
  liquid: number | null;
  note?: string;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-data text-stat tabular-nums text-isk">
        {formatIsk(worth ?? liquid)} <span className="text-ui text-muted">ISK</span>
      </span>
      {worth !== null && <NetWorthHelp />}
      {worth !== null && liquid !== null && (
        <span className="font-data text-ui tabular-nums text-muted">
          <span className="text-tone-blue">{formatIsk(liquid)}</span> liquid
        </span>
      )}
      {note !== undefined && <span className="font-data text-micro text-faint">{note}</span>}
    </span>
  );
}
