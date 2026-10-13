import { expect, test, vi } from 'vitest';

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { expireNow } from './cache-expiry';

test('expires the tag with no stale window, so the next read misses instead of serving the old entry', () => {
  expireNow('industry-jobs:90001');

  expect(revalidateTagMock).toHaveBeenCalledExactlyOnceWith('industry-jobs:90001', { expire: 0 });
});
