import { expect, test } from 'vitest';
import { OUTBOUND_USER_AGENT } from './user-agent';

test('outbound User-Agent names the app version and the production contact page', () => {
  expect(OUTBOUND_USER_AGENT).toMatch(
    /^LGI\.tools\/\d+\.\d+\.\d+ \(https:\/\/lgi\.tools\/contact\)$/,
  );
});
