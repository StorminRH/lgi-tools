'use client';

import { useLayoutEffect, useRef } from 'react';
import { useGlanceMarks } from '../signatures/use-glance-mark-index';
import { useSystemPresence } from '../tracking/presence-context';
import type { SystemPresence } from '../tracking/presence-model';
import { IntelIcon } from '../windows/IntelIcon';
import { INTEL_CATEGORY_LABEL } from '../windows/intel-model';
import { widgetSeatOffset } from './disc-chrome';
import { trackSeats, type TrackSeat } from './node-chrome';
import { PresenceBadgeView } from './PilotPresenceBadge';

function seatGlyph(seat: TrackSeat, presence: SystemPresence | null) {
  switch (seat.kind) {
    case 'glance':
      return <IntelIcon kind={seat.bucket} />;
    case 'pilot':
      return presence === null ? null : <PresenceBadgeView presence={presence} />;
    default: {
      const unmapped: never = seat;
      return unmapped;
    }
  }
}

function WidgetSeat({
  index,
  seat,
  presence,
}: {
  readonly index: number;
  readonly seat: TrackSeat;
  readonly presence: SystemPresence | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const offset = widgetSeatOffset(index);
  const transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`;
  useLayoutEffect(() => {
    ref.current?.style.setProperty('--node-widget-seat-transform', transform);
  }, [transform]);
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
      {seatGlyph(seat, presence)}
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
          presence={presence}
        />
      ))}
    </div>
  );
}
