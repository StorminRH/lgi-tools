import { describe, expect, it, vi } from 'vitest';
import { postLeaveBeacon } from './leave-signal';

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
