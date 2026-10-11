import { expect, test } from 'vitest';
import {
  SCANNER_ASK_VALUE,
  scannerSelectValue,
  trackableCharacters,
  trackingToggleLabel,
} from './tracking-controls-view';

test('trackingToggleLabel names the location reconnect case instead of a silent track toggle', () => {
  const synced = { name: 'Alice', needsLocationReconnect: false };
  const reconnect = { name: 'Alice', needsLocationReconnect: true };
  expect(trackingToggleLabel(synced, false)).toBe('Track Alice');
  expect(trackingToggleLabel(synced, true)).toBe('Stop tracking Alice');
  expect(trackingToggleLabel({ name: 'Alice' }, true)).toBe('Stop tracking Alice');
  expect(trackingToggleLabel(reconnect, false)).toBe('Track Alice (reconnect required)');
  expect(trackingToggleLabel(reconnect, true)).toBe('Stop tracking Alice (cannot sync location)');
});

test('trackableCharacters keeps the access list roster, or every character when the map is per account', () => {
  const characters = [{ characterId: 1 }, { characterId: 2 }, { characterId: 3 }];
  expect(trackableCharacters(characters, [3, 1, 99])).toEqual([{ characterId: 1 }, { characterId: 3 }]);
  expect(trackableCharacters(characters, [])).toEqual([]);
  const all = trackableCharacters(characters, null);
  expect(all).toEqual(characters);
  expect(all).not.toBe(characters);
});

test('scannerSelectValue reads an unset or unlinked default scanner as Ask', () => {
  const characters = [{ characterId: 7 }, { characterId: 8 }];
  expect(scannerSelectValue(8, characters)).toBe('8');
  expect(scannerSelectValue(null, characters)).toBe(SCANNER_ASK_VALUE);
  expect(scannerSelectValue(99, characters)).toBe(SCANNER_ASK_VALUE);
});
