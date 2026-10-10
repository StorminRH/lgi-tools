import { expect, test, vi } from 'vitest';
import { postTelemetry } from './client';

test('postTelemetry beacons the event to the telemetry route, defaulting metadata to an empty object', async () => {
  const sendBeacon = vi.fn<(url: string, data?: Blob) => boolean>(() => true);
  vi.stubGlobal('navigator', { sendBeacon });

  postTelemetry({ action: 'page_view' });
  postTelemetry({ action: 'page_view', metadata: { path: '/sites', is_entry: true } });

  expect(sendBeacon).toHaveBeenCalledTimes(2);
  const [[barePath, bareBlob] = [], [fullPath, fullBlob] = []] = sendBeacon.mock.calls;
  expect(barePath).toBe('/api/telemetry');
  expect(JSON.parse((await bareBlob?.text()) ?? '')).toEqual({ action: 'page_view', metadata: {} });
  expect(fullPath).toBe('/api/telemetry');
  expect(JSON.parse((await fullBlob?.text()) ?? '')).toEqual({
    action: 'page_view',
    metadata: { path: '/sites', is_entry: true },
  });
  vi.unstubAllGlobals();
});
