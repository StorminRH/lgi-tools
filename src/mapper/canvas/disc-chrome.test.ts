import { expect, test } from 'vitest';
import {
  ICON_TRACK_CLEARANCE_PX,
  KSPACE_TITLE_GAP_PX,
  SYSTEM_DISC_SIZE,
  kspaceCaptionOffset,
  widgetSeatOffset,
} from './disc-chrome';

test('seat 0 is east of the disc and the ring continues clockwise', () => {
  expect(widgetSeatOffset(0)).toEqual({ x: 38.5, y: 0 });
  expect(widgetSeatOffset(2)).toEqual({ x: 0, y: 38.5 });
});

test('icon clearance is the outer edge of a ring seat', () => {
  expect(ICON_TRACK_CLEARANCE_PX).toBe(45.5);
  expect(ICON_TRACK_CLEARANCE_PX).toBe(widgetSeatOffset(0).x + 7);
});

test('k-space caption sits one gap above the disc', () => {
  expect(kspaceCaptionOffset()).toEqual({ x: 0, y: -33.5 });
  expect(kspaceCaptionOffset().y).toBe(-(SYSTEM_DISC_SIZE / 2 + KSPACE_TITLE_GAP_PX));
});
