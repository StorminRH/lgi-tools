import { expect, test } from 'vitest';

import { config } from '@/proxy';

test('pins leftover runtime exports on the test graph', () => {
  expect([config]).not.toContain(undefined);
});
