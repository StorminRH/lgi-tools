import { expect, test } from 'vitest';
import {
  SCANNER_ASK_VALUE,
  scannerSelectValue,
  trackableCharacters,
  trackingToggleLabel,
} from './tracking-controls-view';

test('trackableCharacters keeps the roster on a legacy map and filters it on a scoped one', () => {
  const roster = [{ characterId: 1 }, { characterId: 2 }, { characterId: 3 }];
  expect(trackableCharacters(roster, null)).toEqual(roster);
  expect(trackableCharacters(roster, [3, 1, 9])).toEqual([{ characterId: 1 }, { characterId: 3 }]);
  expect(trackableCharacters(roster, [])).toEqual([]);
});

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

test('scannerSelectValue reads an unset or unlinked default scanner as Ask', () => {
  const characters = [{ characterId: 7 }, { characterId: 8 }];
  expect(scannerSelectValue(8, characters)).toBe('8');
  expect(scannerSelectValue(null, characters)).toBe(SCANNER_ASK_VALUE);
  expect(scannerSelectValue(99, characters)).toBe(SCANNER_ASK_VALUE);
});
