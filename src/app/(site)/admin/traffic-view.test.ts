import { describe, expect, it } from 'vitest';
import { deriveTrafficView } from './traffic-view';

describe('deriveTrafficView', () => {
  it('reshapes each list into keyed distribution rows', () => {
    const view = deriveTrafficView({
      topPages: [
        { path: '/a', count: 10 },
        { path: '/b', count: 4 },
      ],
      topReferrers: [{ host: 'g.com', count: 5 }],
      topEntryPages: [{ path: '/land', count: 2 }],
    });
    expect(view.topPages).toEqual([
      { key: '/a', label: '/a', count: 10 },
      { key: '/b', label: '/b', count: 4 },
    ]);
    expect(view.topReferrers[0]).toEqual({ key: 'g.com', label: 'g.com', count: 5 });
  });
});
