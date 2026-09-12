import type { GlanceBucket } from '../signatures/signature-model';
import type { SystemPresence } from '../tracking/presence-model';

const DISC_SIZE_PX = 55;
const TRACK_RADIUS_PX = 27.5 + 7 + 4;
const TRACK_START_HEADING_RAD = Math.PI / 2;
const TRACK_SEAT_STEP_RAD = Math.PI / 4;

export const KSPACE_TITLE_GAP_PX = 6;

export type NodeWidget =
  | { readonly kind: 'glance'; readonly bucket: GlanceBucket }
  | { readonly kind: 'presence'; readonly presence: SystemPresence };

type DiscOffset = {
  readonly x: number;
  readonly y: number;
};

function cleanAxis(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

export function widgetSeatOffset(index: number): DiscOffset {
  const heading = TRACK_START_HEADING_RAD + index * TRACK_SEAT_STEP_RAD;
  return {
    x: cleanAxis(TRACK_RADIUS_PX * Math.sin(heading)),
    y: cleanAxis(TRACK_RADIUS_PX * -Math.cos(heading)),
  };
}

export function kspaceTitleOffset(): DiscOffset {
  return { x: 0, y: -(DISC_SIZE_PX / 2 + KSPACE_TITLE_GAP_PX) };
}

export function visibleNodeWidgets(
  marks: readonly GlanceBucket[],
  presence: SystemPresence | null,
): readonly NodeWidget[] {
  const widgets: NodeWidget[] = marks.map((bucket) => ({
    kind: 'glance',
    bucket,
  }));
  if (presence !== null && presence.pilots.length > 0) {
    widgets.push({ kind: 'presence', presence });
  }
  return widgets;
}

export function widgetKey(widget: NodeWidget): string {
  switch (widget.kind) {
    case 'glance':
      return widget.bucket;
    case 'presence':
      return 'presence';
    default: {
      const _never: never = widget;
      return _never;
    }
  }
}
