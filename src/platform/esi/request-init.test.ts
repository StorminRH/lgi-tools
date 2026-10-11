import { expect, test } from 'vitest';
import { esiAuthInit, esiJsonPostInit } from './request-init';

test('esiAuthInit always carries the bearer token, adds If-None-Match only for a held etag, and passes a signal through', () => {
  expect(esiAuthInit('tok')).toEqual({ headers: { Authorization: 'Bearer tok' } });
  expect(esiAuthInit('tok', { etag: null })).toEqual({ headers: { Authorization: 'Bearer tok' } });
  expect(esiAuthInit('tok', { etag: '"v1"' })).toEqual({
    headers: { Authorization: 'Bearer tok', 'If-None-Match': '"v1"' },
  });

  const controller = new AbortController();
  const withSignal = esiAuthInit('tok', { signal: controller.signal });
  expect(withSignal.signal).toBe(controller.signal);
  expect(Object.keys(esiAuthInit('tok', { signal: undefined }))).toEqual(['headers']);
});

test('esiJsonPostInit serializes the body as a JSON POST, with a bearer token only when given one', () => {
  expect(esiJsonPostInit([101, 102])).toEqual({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '[101,102]',
  });
  expect(esiJsonPostInit(['Chribba'], 'tok')).toEqual({
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: '["Chribba"]',
  });
});
