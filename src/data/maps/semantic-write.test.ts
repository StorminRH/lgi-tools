import { expect, it } from 'vitest';
import {
  eliminationFollowUpNeeded,
  identifySemanticWrite,
  identifyWriteDigest,
  pasteSemanticWrite,
  pasteWriteDigest,
  typeSetterSemanticWrite,
} from './semantic-write';

it.each([
  [{ inserted: 0, updated: 0, migrated: 0, removedConfident: 0 }, 'idle'],
  [{ inserted: 1, updated: 0, migrated: 0, removedConfident: 0 }, 'mutated'],
  [{ inserted: 0, updated: 1, migrated: 0, removedConfident: 0 }, 'mutated'],
  [{ inserted: 0, updated: 0, migrated: 1, removedConfident: 0 }, 'mutated'],
  [{ inserted: 0, updated: 0, migrated: 0, removedConfident: 1 }, 'mutated'],
] as const)('pasteSemanticWrite(%j) is %s', (counts, kind) => {
  expect(pasteSemanticWrite(counts)).toEqual({ kind });
});

it.each([
  [{ changed: false, connectionId: 'connection-1' }, 'claimed'],
  [{ changed: true, connectionId: 'connection-1' }, 'mutated'],
  [{ changed: true, connectionId: null }, 'mutated'],
  [{ changed: false, connectionId: null }, 'idle'],
] as const)('identifySemanticWrite(%j) is %s', (result, kind) => {
  expect(identifySemanticWrite(result)).toEqual({ kind });
});

it.each([
  [{ changed: true, claimed: false }, 'mutated'],
  [{ changed: true, claimed: true }, 'mutated'],
  [{ changed: false, claimed: true }, 'claimed'],
  [{ changed: false, claimed: false }, 'idle'],
] as const)('typeSetterSemanticWrite(%j) is %s', (result, kind) => {
  expect(typeSetterSemanticWrite(result)).toEqual({ kind });
});

it.each([
  [{ kind: 'idle' as const }, '1:AAA-111', '1:AAA-111', false],
  [{ kind: 'idle' as const }, undefined, '1:AAA-111', true],
  [{ kind: 'idle' as const }, '1:AAA-111', '1:BBB-222', true],
  [{ kind: 'mutated' as const }, '1:AAA-111', '1:AAA-111', true],
  [{ kind: 'claimed' as const }, '1:AAA-111', '1:AAA-111', true],
])('eliminationFollowUpNeeded(%j, %s, %s) is %s', (write, lastDigest, digest, needed) => {
  expect(eliminationFollowUpNeeded(write, lastDigest, digest)).toBe(needed);
});

it('stores per-system paste and identify digests', () => {
  expect(pasteWriteDigest(31_000_001, ['BBB-222', 'AAA-111'])).toBe(
    '31000001:AAA-111,BBB-222',
  );
  expect(identifyWriteDigest(31_000_001, 'AAA-111', 'Wormhole')).toBe(
    '31000001:AAA-111:Wormhole',
  );
});
