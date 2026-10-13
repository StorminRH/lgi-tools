'use client';

import { useStyleProperty } from '@/components/ui/use-style-ref';
import { useGlanceMarks } from '../signatures/use-glance-mark-index';
import { useSystemPresence } from '../tracking/presence-context';
import { IntelIcon } from '../windows/IntelIcon';
import { INTEL_CATEGORY_LABEL } from '../windows/intel-model';
import { widgetSeatOffset } from './disc-chrome';
import { trackSeats, type TrackSeat } from './node-chrome';
import { PresenceBadgeView } from './PilotPresenceBadge';

function seatGlyph(seat: TrackSeat) {
  switch (seat.kind) {
    case 'glance':
      return <IntelIcon kind={seat.bucket} />;
    case 'pilot':
      return <PresenceBadgeView count={seat.count} />;
    default: {
      const unmapped: never = seat;
      return unmapped;
    }
  }
}

function WidgetSeat({
  index,
  seat,
}: {
  readonly index: number;
  readonly seat: TrackSeat;
}) {
  const offset = widgetSeatOffset(index);
  const ref = useStyleProperty<HTMLSpanElement>(
    '--node-widget-seat-transform',
    `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
  );
  const bucket = seat.kind === 'glance' ? seat.bucket : null;
  return (
    <span
      ref={ref}
      data-chain-node-widget-seat={index}
      role={bucket === null ? undefined : 'img'}
      aria-label={bucket === null ? undefined : INTEL_CATEGORY_LABEL[bucket]}
      data-glance-mark={bucket ?? undefined}
      className="absolute left-1/2 top-1/2 inline-flex [transform:var(--node-widget-seat-transform)]"
    >
      {seatGlyph(seat)}
    </span>
  );
}

export function SystemIntelMarks({ systemId }: { readonly systemId: number }) {
  const marks = useGlanceMarks(systemId);
  const presence = useSystemPresence(systemId);
  const seats = trackSeats(marks, presence?.pilots.length ?? 0);
  return (
    <div className="pointer-events-none absolute inset-0" data-chain-node-widgets>
      {seats.map((seat, index) => (
        <WidgetSeat
          key={seat.kind === 'glance' ? seat.bucket : 'pilot'}
          index={index}
          seat={seat}
        />
      ))}
    </div>
  );
}
