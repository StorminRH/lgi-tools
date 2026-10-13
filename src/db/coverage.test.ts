import { expect, test } from 'vitest';

import { PG_CONNECT_TIMEOUT_SECONDS } from '@/db/index';

test('pins leftover runtime exports on the test graph', () => {
  expect([PG_CONNECT_TIMEOUT_SECONDS]).not.toContain(undefined);
});
