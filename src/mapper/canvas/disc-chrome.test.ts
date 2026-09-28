import { expect, test } from 'vitest';
import { ICON_TRACK_CLEARANCE_PX, kspaceCaptionOffset, nodeCaptionKind, widgetSeatOffset } from './disc-chrome';

test('seats ring clockwise from the east, with clearance and the k-space caption outside the disc', () => {
  expect(widgetSeatOffset(0)).toEqual({ x: 38.5, y: 0 });
  expect(widgetSeatOffset(2)).toEqual({ x: 0, y: 38.5 });
  expect(ICON_TRACK_CLEARANCE_PX).toBe(45.5);
  expect(kspaceCaptionOffset()).toEqual({ x: 0, y: -33.5 });
});

test('only a live k-space system carries the caption; wormholes, halo and stubs keep the frame name', () => {
  expect(nodeCaptionKind({ security: 0.9, whClassId: null })).toBe('kspace');
  expect(nodeCaptionKind({ security: -0.4 })).toBe('kspace');
  expect(nodeCaptionKind({})).toBe('kspace');
  expect(nodeCaptionKind({ security: -1, whClassId: 3 })).toBe('frame');
  expect(nodeCaptionKind({ security: 0.9, halo: { ring: 1, fogged: false } })).toBe('frame');
  expect(nodeCaptionKind({ security: 0.9, stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC' } })).toBe('frame');
});
