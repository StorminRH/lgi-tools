import { expect, test } from './fixtures';

test.use({ probeAuthenticated: false });

test('[deliberate-failure] persists sanitized diagnostics', async () => {
  expect(true, 'deliberate assertion failure for sanitized-failure persistence').toBe(false);
});
