import { expect, test } from 'vitest';
import { trackingToggleLabel } from './tracking-controls-view';

test('trackingToggleLabel names the location reconnect case instead of a silent track toggle', () => {
  expect(
    trackingToggleLabel({ name: 'Alice', tracked: false, needsLocationReconnect: false }),
  ).toBe('Track Alice');
  expect(
    trackingToggleLabel({ name: 'Alice', tracked: true, needsLocationReconnect: false }),
  ).toBe('Stop tracking Alice');
  expect(
    trackingToggleLabel({ name: 'Alice', tracked: false, needsLocationReconnect: true }),
  ).toBe('Track Alice (reconnect required)');
  expect(
    trackingToggleLabel({ name: 'Alice', tracked: true, needsLocationReconnect: true }),
  ).toBe('Stop tracking Alice (cannot sync location)');
});
