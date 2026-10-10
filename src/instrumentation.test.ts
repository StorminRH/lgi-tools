import { expect, test } from 'vitest';

import { registerNeonColdStartTelemetry } from '@/instrumentation.node';
import { register } from '@/instrumentation';

test('pins leftover runtime exports on the test graph', () => {
  expect([registerNeonColdStartTelemetry, register]).not.toContain(undefined);
});
