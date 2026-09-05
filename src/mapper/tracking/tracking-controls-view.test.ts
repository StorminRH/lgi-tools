import { expect, test } from 'vitest';
import { trackingReconnectVisible, trackingToggleLabel } from './tracking-controls-view';

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
  ).toBe('Alice cannot sync location');
});

test('trackingReconnectVisible is true when any listed character cannot sync location', () => {
  expect(trackingReconnectVisible([])).toBe(false);
  expect(
    trackingReconnectVisible([
      { needsLocationReconnect: false },
      { needsLocationReconnect: false },
    ]),
  ).toBe(false);
  expect(
    trackingReconnectVisible([
      { needsLocationReconnect: false },
      { needsLocationReconnect: true },
    ]),
  ).toBe(true);
});
