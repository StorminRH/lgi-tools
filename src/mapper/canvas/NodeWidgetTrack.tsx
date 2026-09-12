'use client';

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
      {widgets.map((widget, index) => {
        const seat = widgetSeatOffset(index);
        return (
          <div
            key={widgetKey(widget)}
            data-chain-node-widget-seat={index}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${seat.x}px, ${seat.y}px)`,
            }}
          >
            <NodeWidgetOccupant widget={widget} />
          </div>
        );
      })}
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
