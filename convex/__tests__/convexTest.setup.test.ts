// @vitest-environment edge-runtime
import { ConvexError } from 'convex/values';
import { expect, test } from 'vitest';

import { expectConvexErrorCode } from './convexTest.setup';

const assertionFailure = { name: 'AssertionError' };

test('expectConvexErrorCode accepts only a ConvexError whose data.code matches exactly', async () => {
  const selfLoop = new ConvexError({ code: 'SELF_LOOP', detail: 'from and to are the same system' });
  await expect(expectConvexErrorCode(Promise.reject(selfLoop), 'SELF_LOOP')).resolves.toBe(selfLoop);

  const prefixed = new ConvexError({ code: 'SELF_LOOP_CONNECTION' });
  await expect(expectConvexErrorCode(Promise.reject(prefixed), 'SELF_LOOP'))
    .rejects.toMatchObject(assertionFailure);
  await expect(expectConvexErrorCode(Promise.reject(new Error('SELF_LOOP')), 'SELF_LOOP'))
    .rejects.toMatchObject(assertionFailure);
  await expect(expectConvexErrorCode(Promise.reject(new ConvexError('SELF_LOOP')), 'SELF_LOOP'))
    .rejects.toMatchObject(assertionFailure);
  await expect(expectConvexErrorCode(Promise.resolve('done'), 'SELF_LOOP'))
    .rejects.toMatchObject(assertionFailure);
});
