'use client';

import { useLayoutEffect, useRef } from 'react';
import { NodeMark } from '@/components/ui/chrome-mark';
import { widgetSeatOffset } from './disc-chrome';
import type { TrackOccupant } from './node-chrome';

export function NodeWidgetTrack({
  occupants,
}: {
  readonly occupants: readonly TrackOccupant[];
}) {
  return (
    <div
      data-chain-node-widgets
      data-glance-marks={
        occupants.some((occupant) => occupant.probe.kind === 'glance')
          ? ''
          : undefined
      }
      className="pointer-events-none absolute inset-0"
    >
      {occupants.map((occupant, index) => (
        <WidgetSeat key={occupant.key} occupant={occupant} index={index} />
      ))}
    </div>
  );
}

function WidgetSeat({
  occupant,
  index,
}: {
  readonly occupant: TrackOccupant;
  readonly index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seat = widgetSeatOffset(index);
  const transform = `translate(-50%, -50%) translate(${seat.x}px, ${seat.y}px)`;
  useLayoutEffect(() => {
    ref.current?.style.setProperty('--node-widget-seat-transform', transform);
  }, [transform]);
  return (
    <div
      ref={ref}
      data-chain-node-widget-seat={index}
      {...seatProbe(occupant)}
      className="absolute left-1/2 top-1/2 [transform:var(--node-widget-seat-transform)]"
    >
      <NodeMark {...occupant.token} />
    </div>
  );
}

function seatProbe(occupant: TrackOccupant) {
  switch (occupant.probe.kind) {
    case 'glance':
      return { 'data-glance-mark': occupant.probe.bucket };
    case 'presence':
      return { 'data-pilot-presence': 'live' };
    default: {
      const _never: never = occupant.probe;
      return _never;
    }
  }
}
