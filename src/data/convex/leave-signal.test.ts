import { describe, expect, it, vi } from 'vitest';
import { postLeaveBeacon, shouldSendLeave } from './leave-signal';

describe('shouldSendLeave', () => {
  it('sends only when the document is discarded, not when it enters bfcache', () => {
    expect(shouldSendLeave({ persisted: false })).toBe(true);
    expect(shouldSendLeave({ persisted: true })).toBe(false);
  });
});

describe('postLeaveBeacon', () => {
  it('posts a JSON beacon to the leave door', () => {
    const sendBeacon = vi.fn<(url: string, data?: Blob) => boolean>(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    postLeaveBeacon({ dataset: 'characterLocation', tabId: 'tab-aaaa-bbbb' });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [path, blob] = sendBeacon.mock.calls[0] ?? [];
    expect(path).toBe('/api/sync-leave');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('application/json');
    vi.unstubAllGlobals();
  });
});
