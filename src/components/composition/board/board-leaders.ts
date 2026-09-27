import { type LeaderPoint, roundedLeaderPath } from '@/lib/leader-path';

export interface LeaderBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LeaderLine {
  key: string;
  d: string;
  end: LeaderPoint;
}

const HEADER_Y = 18;
const RADIUS = 10;
const SAME_COLUMN = 24;
/**
 * Leaders from the anchor to each panel's header. They share a trunk in
 * the gutter between the left column and the panels; a panel in a further
 * column is reached along the gap just above its own row and down the
 * gutter before it, so no line crosses a panel.
 */
export function leaderLines(
  anchor: LeaderBox,
  columnRight: number,
  panels: readonly { key: string; box: LeaderBox }[],
  columnGap: number,
): LeaderLine[] {
  if (panels.length === 0) return [];
  const firstLeft = Math.min(...panels.map((panel) => panel.box.left));
  const start = { x: anchor.right + 6, y: (anchor.top + anchor.bottom) / 2 };
  const trunkX = (columnRight + firstLeft) / 2;
  return panels.map(({ key, box }) => {
    const y = box.top + HEADER_Y;
    const end = { x: box.left, y };
    const points: LeaderPoint[] =
      box.left - firstLeft < SAME_COLUMN
        ? [start, { x: trunkX, y: start.y }, { x: trunkX, y }, end]
        : [
            start,
            { x: trunkX, y: start.y },
            { x: trunkX, y: box.top - columnGap / 2 },
            { x: box.left - columnGap / 2, y: box.top - columnGap / 2 },
            { x: box.left - columnGap / 2, y },
            end,
          ];
    return { key, d: roundedLeaderPath(points, RADIUS), end };
  });
}
