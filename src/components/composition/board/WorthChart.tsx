'use client';

import dynamic from 'next/dynamic';
import { Measured } from '@/components/ui/measured';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import type { SplitDatum } from '@/components/ui/split-axis-chart';
import type { StackedBand, StackedDatum } from '@/components/ui/stacked-area-chart';
import { formatIsk } from '@/lib/format/isk';
import { formatUtcDate } from '@/lib/format/time';
import { splitDomains, type WorthPoint, worthChartMode } from './board-view-model';

const StackedAreaChart = dynamic(
  () => import('@/components/ui/stacked-area-chart').then((m) => m.StackedAreaChart),
  { ssr: false },
);
const SplitAxisChart = dynamic(
  () => import('@/components/ui/split-axis-chart').then((m) => m.SplitAxisChart),
  { ssr: false },
);

// Wallet ISK sits at the bottom; everything else a pilot owns stacks on top,
// so the upper edge is net worth.
const BANDS: readonly StackedBand[] = [
  { key: 'isk', tone: 'blue' },
  { key: 'assets', tone: 'green' },
];

function WorthTooltip({ label, isk, worth }: { label: string; isk: number; worth: number | null }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted">{label}</span>
      {worth !== null && <span className="text-isk">Net worth {formatIsk(worth)}</span>}
      <span className="text-tone-blue">ISK {formatIsk(isk)}</span>
      {worth !== null && <span className="text-name">Assets {formatIsk(worth - isk)}</span>}
    </span>
  );
}

const shortDate = (label: string) => label.replace(/ \d{4}$/, '');

/**
 * Net worth over time. When net worth dwarfs ISK the two get their own
 * fitted segments of a broken axis; otherwise ISK and assets stack.
 */
export function WorthChart({ series, ariaLabel, height = 190 }: { series: readonly WorthPoint[]; ariaLabel: string; height?: number }) {
  if (series.length < 2) return null;
  const label = (point: WorthPoint) => formatUtcDate(new Date(point.t));
  if (worthChartMode(series) === 'broken') {
    const domains = splitDomains(series);
    const data: SplitDatum[] = series.map((point) => ({
      x: point.t,
      label: label(point),
      upper: point.assets === null ? null : point.liquid + point.assets,
      lower: point.liquid,
    }));
    return (
      <Measured>
        {(width) => (
          <SplitAxisChart
            data={data}
            upperTone="green"
            lowerTone="blue"
            upperDomain={domains.upper}
            lowerDomain={domains.lower}
            width={width}
            height={height}
            formatY={formatIsk}
            formatTick={shortDate}
            ariaLabel={ariaLabel}
            renderTooltip={(datum) => <WorthTooltip label={datum.label} isk={datum.lower} worth={datum.upper} />}
          />
        )}
      </Measured>
    );
  }
  const data: StackedDatum[] = series.map((point) => ({
    x: point.t,
    label: label(point),
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
          formatTick={shortDate}
          ariaLabel={ariaLabel}
          renderTooltip={(datum) => {
            const isk = datum.values[0] ?? 0;
            const assets = datum.values[1] ?? null;
            return <WorthTooltip label={datum.label} isk={isk} worth={assets === null ? null : isk + assets} />;
          }}
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
        Prices follow recent Jita market prices, so this number moves with the market. It is
        recalculated once a day after prices update, and when you add or remove a pilot.
      </p>
      <p className="text-ui leading-snug text-muted">Not counted: blueprints, SKINs, PLEX in your PLEX vault, and items without a price.</p>
    </Popover>
  );
}

/**
 * A net-worth headline in the chart tooltip's terms: the big figure labelled Net worth with its (?), then
 * ISK beside it. With no net worth yet the big figure is the ISK alone.
 */
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
        {formatIsk(worth ?? liquid)}{' '}
        <span className="text-ui text-muted">{worth === null ? 'ISK' : 'Net worth'}</span>
      </span>
      {worth !== null && <NetWorthHelp />}
      {worth !== null && liquid !== null && (
        <span className="font-data text-ui tabular-nums text-muted">
          <span className="text-tone-blue">{formatIsk(liquid)}</span> ISK
        </span>
      )}
      {note !== undefined && <span className="font-data text-micro text-faint">{note}</span>}
    </span>
  );
}
