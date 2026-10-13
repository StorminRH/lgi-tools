import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { defineEndpoint, jsonBody } from './endpoint';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('./api-client', () => ({ apiFetch: apiFetchMock }));

import { apiFailureLabel, apiFetchData } from './api-fetch-data';

const thingEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things/[id]',
  request: null,
  params: z.object({ id: z.string() }),
  responses: { 200: jsonBody(z.object({ value: z.string() })) },
});

test('a failure reads as its kind, then its status when it has one', () => {
  expect(apiFailureLabel({ kind: 'network' })).toBe('network');
  expect(apiFailureLabel({ kind: 'api', status: 500 })).toBe('api 500');
  expect(apiFailureLabel({ kind: 'protocol', status: 200 })).toBe('protocol 200');
});

test('apiFetchData passes the call through, resolves the data, and rejects a failure under its label', async () => {
  apiFetchMock.mockReset().mockResolvedValueOnce({ ok: true, status: 200, data: { value: 'found' } });
  await expect(apiFetchData(thingEndpoint, 'thing', { params: { id: '7' } })).resolves.toEqual({ value: 'found' });
  expect(apiFetchMock).toHaveBeenCalledWith(thingEndpoint, { params: { id: '7' } });

  apiFetchMock.mockResolvedValueOnce({ ok: false, kind: 'api', status: 503, error: null });
  await expect(apiFetchData(thingEndpoint, 'thing', { params: { id: '7' } })).rejects.toThrow(
    new Error('thing api 503'),
  );
  apiFetchMock.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') });
  await expect(apiFetchData(thingEndpoint, 'thing', { params: { id: '7' } })).rejects.toThrow(
    new Error('thing network'),
  );
});
