import { ConvexError } from 'convex/values';
import { expect, test } from 'vitest';
import { readConvexError } from './convex-error';

test('readConvexError decodes a ConvexError and a plain { data } object alike', () => {
  expect(readConvexError(new ConvexError({
    code: 'TRACKING_CAP_EXCEEDED',
    detail: 'At most 32 tracked characters per map.',
  }))).toStrictEqual({
    code: 'TRACKING_CAP_EXCEEDED',
    detail: 'At most 32 tracked characters per map.',
  });
  expect(readConvexError({
    data: { code: 'TRACKING_MAP_CAP_EXCEEDED', detail: 'This map has reached its tracking limit.' },
  })).toStrictEqual({
    code: 'TRACKING_MAP_CAP_EXCEEDED',
    detail: 'This map has reached its tracking limit.',
  });
  expect(readConvexError(new ConvexError({ code: 'FORBIDDEN' })))
    .toStrictEqual({ code: 'FORBIDDEN', detail: null });
  expect(readConvexError({ data: { code: 'MAP_TOO_LARGE', detail: { limit: 1024 } } }))
    .toStrictEqual({ code: 'MAP_TOO_LARGE', detail: null });
});

test('readConvexError gives null for an error that carries no code', () => {
  expect(readConvexError(new ConvexError('Map is archived.'))).toBeNull();
  expect(readConvexError(new ConvexError({ detail: 'No code here.' }))).toBeNull();
  expect(readConvexError({ data: { code: 409 } })).toBeNull();
  // A message that merely mentions a code is not decoded.
  expect(readConvexError(new Error('Uncaught ConvexError: {"code":"OFF_MAP_SCAN_SYSTEM"}')))
    .toBeNull();
  expect(readConvexError('OFF_MAP_SCAN_SYSTEM')).toBeNull();
  expect(readConvexError(null)).toBeNull();
  expect(readConvexError(undefined)).toBeNull();
});
