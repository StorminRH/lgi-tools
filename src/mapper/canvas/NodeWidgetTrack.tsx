'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GlanceMark } from './GlanceMark';
import {
  widgetKey,
  widgetSeatOffset,
  type NodeWidget,
} from './disc-chrome';
import { PresenceBadgeView } from './PilotPresenceBadge';

export function NodeWidgetTrack({
  widgets,
}: {
  readonly widgets: readonly NodeWidget[];
}) {
  return (
    <div
      data-chain-node-widgets
      data-glance-marks={
        widgets.some((widget) => widget.kind === 'glance') ? '' : undefined
      }
      className="pointer-events-none absolute inset-0"
    >
      {widgets.map((widget, index) => (
        <WidgetSeat key={widgetKey(widget)} index={index}>
          <NodeWidgetOccupant widget={widget} />
        </WidgetSeat>
      ))}
    </div>
  );
}

function WidgetSeat({
  index,
  children,
}: {
  readonly index: number;
  readonly children: ReactNode;
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
      className="absolute left-1/2 top-1/2 [transform:var(--node-widget-seat-transform)]"
    >
      {children}
    </div>
  );
}

function NodeWidgetOccupant({ widget }: { readonly widget: NodeWidget }) {
  switch (widget.kind) {
    case 'glance':
      return <GlanceMark bucket={widget.bucket} />;
    case 'presence':
      return <PresenceBadgeView presence={widget.presence} />;
    default: {
      const _never: never = widget;
      return _never;
    }
  }
}
