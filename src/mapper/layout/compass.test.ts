import { expect, test } from 'vitest';
import { compassKernel } from './compass';
import type { LayoutFacts } from './layout-contract';

test('compassKernel reports malformed facts as a rejection, never as a throw at the call', async () => {
  const malformed = { systems: null, connections: [] } as unknown as LayoutFacts;
  let run: ReturnType<typeof compassKernel> | undefined;
  expect(() => {
    run = compassKernel(malformed);
  }).not.toThrow();
  await expect(run).rejects.toBeInstanceOf(TypeError);
});
