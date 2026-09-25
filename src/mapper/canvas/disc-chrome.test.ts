import { expect, test } from 'vitest';
import { ICON_TRACK_CLEARANCE_PX, kspaceCaptionOffset, widgetSeatOffset } from './disc-chrome';

test('seats ring clockwise from the east, with clearance and the k-space caption outside the disc', () => {
  expect(widgetSeatOffset(0)).toEqual({ x: 38.5, y: 0 });
  expect(widgetSeatOffset(2)).toEqual({ x: 0, y: 38.5 });
  expect(ICON_TRACK_CLEARANCE_PX).toBe(widgetSeatOffset(0).x + 7);
  expect(kspaceCaptionOffset()).toEqual({ x: 0, y: -33.5 });
});
