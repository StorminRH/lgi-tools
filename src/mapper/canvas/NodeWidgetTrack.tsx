'use client';

import { useLayoutEffect, useRef } from 'react';
import { NodeMark } from '@/components/ui/chrome-mark';
import { widgetSeatOffset } from './disc-chrome';
import type { TrackOccupant, TrackProbe } from './node-chrome';

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
      {occupants.map((occupant, index) => {
        const seat = seatIdentity(occupant.probe);
        return (
          <WidgetSeat
            key={seat.key}
            occupant={occupant}
            index={index}
            probeAttrs={seat.attrs}
          />
        );
      })}
    </div>
  );
}

function WidgetSeat({
  occupant,
  index,
  probeAttrs,
}: {
  readonly occupant: TrackOccupant;
  readonly index: number;
  readonly probeAttrs: ReturnType<typeof seatIdentity>['attrs'];
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
      {...probeAttrs}
      className="absolute left-1/2 top-1/2 [transform:var(--node-widget-seat-transform)]"
    >
      <NodeMark {...occupant.token} />
    </div>
  );
}

function seatIdentity(probe: TrackProbe) {
  switch (probe.kind) {
    case 'glance':
      return {
        key: probe.bucket,
        attrs: { 'data-glance-mark': probe.bucket },
      };
    case 'presence':
      return {
        key: 'presence',
        attrs: { 'data-pilot-presence': 'live' as const },
      };
    default: {
      const _never: never = probe;
      return _never;
    }
  }
}
