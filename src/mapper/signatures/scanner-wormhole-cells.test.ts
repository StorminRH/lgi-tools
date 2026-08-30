import { expect, it } from 'vitest';
import {
  scannerLeadsCellKey,
  scannerTypeCellKey,
} from './scanner-wormhole-cells';

it('keeps Type and Destination remount keys distinct when both values are empty', () => {
  const connectionId = 'm577478djxw0qbjjh9dcntqabn8c965j';
  expect(scannerTypeCellKey(connectionId, null)).toBe(
    `type:${connectionId}:`,
  );
  expect(scannerLeadsCellKey(connectionId, undefined, null)).toBe(
    `leads:${connectionId}:`,
  );
  expect(scannerTypeCellKey(connectionId, null)).not.toBe(
    scannerLeadsCellKey(connectionId, undefined, null),
  );
});
