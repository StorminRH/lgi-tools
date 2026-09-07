import { describe, expect, it } from 'vitest';
import {
  eliminationFollowUpNeeded,
  identifySemanticWrite,
  identifyWriteDigest,
  pasteSemanticWrite,
  pasteWriteDigest,
  typeSetterFollowUpNeeded,
  typeSetterSemanticWrite,
} from './semantic-write';

describe('paste semantic write', () => {
  it('treats unchanged and conflicted scans as idle', () => {
    expect(pasteSemanticWrite({
      inserted: 0,
      updated: 0,
      migrated: 0,
      removedConfident: 0,
    })).toEqual({ kind: 'idle' });
  });

  it('treats inserts, updates, migrations, and confident removals as mutated', () => {
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
  });
});

describe('identify semantic write', () => {
  it('does not treat an unchanged boolean as idle when a connection was claimed', () => {
    expect(identifySemanticWrite({
      changed: false,
      connectionId: 'connection-1',
    })).toEqual({ kind: 'claimed' });
  });

  it('classifies a field change as mutated and a no-op as idle', () => {
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
  });
});

describe('type setter semantic write', () => {
  it('treats a field change as mutated even when a placeholder was also claimed', () => {
    expect(typeSetterSemanticWrite({ changed: true, claimed: false })).toEqual({
      kind: 'mutated',
    });
    expect(typeSetterSemanticWrite({ changed: true, claimed: true })).toEqual({
      kind: 'mutated',
    });
  });

  it('does not treat an unchanged boolean as idle when a placeholder was claimed', () => {
    expect(typeSetterSemanticWrite({ changed: false, claimed: true })).toEqual({
      kind: 'claimed',
    });
  });

  it('treats a true no-op as idle', () => {
    expect(typeSetterSemanticWrite({ changed: false, claimed: false })).toEqual({
      kind: 'idle',
    });
  });

  it('follows up only for mutated and claimed writes', () => {
    expect(typeSetterFollowUpNeeded(undefined)).toBe(false);
    expect(typeSetterFollowUpNeeded({ kind: 'idle' })).toBe(false);
    expect(typeSetterFollowUpNeeded({ kind: 'mutated' })).toBe(true);
    expect(typeSetterFollowUpNeeded({ kind: 'claimed' })).toBe(true);
  });
});

describe('elimination follow-up', () => {
  it('skips only idle work whose digest already succeeded', () => {
    expect(eliminationFollowUpNeeded({ kind: 'idle' }, '1:AAA-111', '1:AAA-111')).toBe(false);
    expect(eliminationFollowUpNeeded({ kind: 'idle' }, undefined, '1:AAA-111')).toBe(true);
    expect(eliminationFollowUpNeeded({ kind: 'idle' }, '1:AAA-111', '1:BBB-222')).toBe(true);
    expect(eliminationFollowUpNeeded({ kind: 'mutated' }, '1:AAA-111', '1:AAA-111')).toBe(true);
    expect(eliminationFollowUpNeeded({ kind: 'claimed' }, '1:AAA-111', '1:AAA-111')).toBe(true);
  });

  it('stores per-system digests from paste rows and identify facts', () => {
    expect(pasteWriteDigest(31_000_001, ['BBB-222', 'AAA-111'])).toBe(
      '31000001:AAA-111,BBB-222',
    );
    expect(identifyWriteDigest(31_000_001, 'AAA-111', 'Wormhole')).toBe(
      '31000001:AAA-111:Wormhole',
    );
  });
});
