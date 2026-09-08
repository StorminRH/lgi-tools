import { expect, it } from 'vitest';
import {
  eliminationFollowUpNeeded,
  identifySemanticWrite,
  identifyWriteDigest,
  pasteSemanticWrite,
  pasteWriteDigest,
  typeSetterSemanticWrite,
} from './semantic-write';

it('classifies paste, identify, and type-setter writes', () => {
  expect(pasteSemanticWrite({
    inserted: 0,
    updated: 0,
    migrated: 0,
    removedConfident: 0,
  })).toEqual({ kind: 'idle' });
  expect(pasteSemanticWrite({
    inserted: 1,
    updated: 0,
    migrated: 0,
    removedConfident: 0,
  })).toEqual({ kind: 'mutated' });
  expect(pasteSemanticWrite({
    inserted: 0,
    updated: 1,
    migrated: 0,
    removedConfident: 0,
  })).toEqual({ kind: 'mutated' });
  expect(pasteSemanticWrite({
    inserted: 0,
    updated: 0,
    migrated: 1,
    removedConfident: 0,
  })).toEqual({ kind: 'mutated' });
  expect(pasteSemanticWrite({
    inserted: 0,
    updated: 0,
    migrated: 0,
    removedConfident: 1,
  })).toEqual({ kind: 'mutated' });

  expect(identifySemanticWrite({
    changed: false,
    connectionId: 'connection-1',
  })).toEqual({ kind: 'claimed' });
  expect(identifySemanticWrite({
    changed: true,
    connectionId: 'connection-1',
  })).toEqual({ kind: 'mutated' });
  expect(identifySemanticWrite({
    changed: true,
    connectionId: null,
  })).toEqual({ kind: 'mutated' });
  expect(identifySemanticWrite({
    changed: false,
    connectionId: null,
  })).toEqual({ kind: 'idle' });

  expect(typeSetterSemanticWrite({ changed: true, claimed: false })).toEqual({
    kind: 'mutated',
  });
  expect(typeSetterSemanticWrite({ changed: false, claimed: true })).toEqual({
    kind: 'claimed',
  });
  expect(typeSetterSemanticWrite({ changed: false, claimed: false })).toEqual({
    kind: 'idle',
  });
});

it('skips only idle follow-up whose digest already succeeded and stores per-system digests', () => {
  expect(eliminationFollowUpNeeded({ kind: 'idle' }, '1:AAA-111', '1:AAA-111')).toBe(false);
  expect(eliminationFollowUpNeeded({ kind: 'idle' }, undefined, '1:AAA-111')).toBe(true);
  expect(eliminationFollowUpNeeded({ kind: 'idle' }, '1:AAA-111', '1:BBB-222')).toBe(true);
  expect(eliminationFollowUpNeeded({ kind: 'mutated' }, '1:AAA-111', '1:AAA-111')).toBe(true);
  expect(eliminationFollowUpNeeded({ kind: 'claimed' }, '1:AAA-111', '1:AAA-111')).toBe(true);
  expect(pasteWriteDigest(31_000_001, ['BBB-222', 'AAA-111'])).toBe(
    '31000001:AAA-111,BBB-222',
  );
  expect(identifyWriteDigest(31_000_001, 'AAA-111', 'Wormhole')).toBe(
    '31000001:AAA-111:Wormhole',
  );
});
