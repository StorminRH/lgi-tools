import { expect, test } from 'vitest';
import type { SystemPresence } from '../tracking/presence-model';
import { SYSTEM_DISC_SIZE } from './SystemNode';
import {
  KSPACE_TITLE_GAP_PX,
  kspaceTitleOffset,
  visibleNodeWidgets,
  widgetSeatOffset,
} from './disc-chrome';

const presenceWithPilots: SystemPresence = {
  pilots: [
    {
      characterId: 1,
      shipTypeId: null,
      docked: false,
      lastMovementAt: 0,
    },
  ],
};

test('seat 0 is east on the track and does not depend on occupant count', () => {
  expect(widgetSeatOffset(0)).toEqual({ x: 38.5, y: 0 });
  const oneWidgetSeat0 = widgetSeatOffset(0);
  const fourWidgetSeat0 = widgetSeatOffset(0);
  expect(oneWidgetSeat0).toEqual(fourWidgetSeat0);
  expect(oneWidgetSeat0).toEqual({ x: 38.5, y: 0 });
});

test('seat 1 is one eighth-turn clockwise from east', () => {
  const heading = Math.PI / 2 + Math.PI / 4;
  expect(widgetSeatOffset(1)).toEqual({
    x: 38.5 * Math.sin(heading),
    y: 38.5 * -Math.cos(heading),
  });
});

test('visible widgets follow glance order then one presence badge', () => {
  expect(
    visibleNodeWidgets(['harvestables', 'combat'], presenceWithPilots),
  ).toEqual([
    { kind: 'glance', bucket: 'harvestables' },
    { kind: 'glance', bucket: 'combat' },
    { kind: 'presence', presence: presenceWithPilots },
  ]);
  expect(visibleNodeWidgets([], null)).toEqual([]);
});

test('k-space title sits 6px above the disc rim', () => {
  expect(KSPACE_TITLE_GAP_PX).toBe(6);
  expect(kspaceTitleOffset()).toEqual({ x: 0, y: -33.5 });
});

test('track radius matches the live disc plus icon air gap', () => {
  expect(27.5 + 7 + 4).toBe(SYSTEM_DISC_SIZE / 2 + 14 / 2 + 4);
});

test('the first five seats stay below the title and seat 5 does not', () => {
  const iconHalf = 14 / 2;
  const titleBottom = kspaceTitleOffset().y;
  const iconTop = (index: number) => widgetSeatOffset(index).y - iconHalf;
  const maxClearSeats = 5;
  for (let index = 0; index < maxClearSeats; index += 1) {
    expect(iconTop(index)).toBeGreaterThan(titleBottom);
  }
  expect(iconTop(maxClearSeats)).toBeLessThan(titleBottom);
});
