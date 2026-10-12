import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  recordCapabilityOutcome: vi.fn(),
}));

vi.mock('@/data/telemetry/capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/telemetry/capability')>()),
  recordCapabilityOutcome: (...args: unknown[]) => h.recordCapabilityOutcome(...args),
}));

import { capabilityRoute, runCapabilityRoute } from './capability-route';

function post(signal?: AbortSignal): Request {
  return new Request('https://lgi.tools/api/example', {
    method: 'POST',
    ...(signal ? { signal } : {}),
  });
}

function recordedOutcomes(): unknown[] {
  return h.recordCapabilityOutcome.mock.calls.map(([, outcome]) => (outcome as { outcome: unknown }).outcome);
}

test('capabilityRoute records an outage the client waited for, but not one after it hung up', async () => {
  h.recordCapabilityOutcome.mockReset();
  const unavailable = () => Promise.resolve(new Response(null, { status: 503 }));
  const route = capabilityRoute('planner.read-cost-indices', unavailable);

  expect((await route(post())).status).toBe(503);
  expect(h.recordCapabilityOutcome).toHaveBeenCalledExactlyOnceWith(
    'planner.read-cost-indices',
    expect.objectContaining({ outcome: 'dependency_unavailable', retry: null }),
  );

  const controller = new AbortController();
  controller.abort();
  expect((await route(post(controller.signal))).status).toBe(503);
  expect(recordedOutcomes()).toEqual(['dependency_unavailable']);

  const answered = capabilityRoute('planner.read-cost-indices', () =>
    Promise.resolve(Response.json({ indices: [] })),
  );
  expect((await answered(post(controller.signal))).status).toBe(200);
  expect(recordedOutcomes()).toEqual(['dependency_unavailable', 'succeeded']);
});

test('runCapabilityRoute rethrows a failure after an abort without recording it', async () => {
  h.recordCapabilityOutcome.mockReset();
  const error = new Error('search failed');
  const failing = () => Promise.reject(error);

  await expect(runCapabilityRoute('maps.search-characters', failing)).rejects.toBe(error);
  expect(recordedOutcomes()).toEqual(['unexpected']);

  const controller = new AbortController();
  controller.abort();
  await expect(runCapabilityRoute('maps.search-characters', failing, controller.signal)).rejects.toBe(error);
  expect(recordedOutcomes()).toEqual(['unexpected']);
});
