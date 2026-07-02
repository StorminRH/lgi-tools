import { describe, expect, it } from 'vitest';
import {
  stripState,
  syncEligibleIds,
  toggleDimmed,
  visibleCharacters,
} from './character-strip-model';

const healthy = (characterId: number) => ({ characterId, needsReconnect: false });
const locked = (characterId: number) => ({ characterId, needsReconnect: true });

describe('stripState', () => {
  it('renders a character absent from the dimmed set lit — store-off-not-on, so a new alt defaults lit', () => {
    expect(stripState(healthy(1), [])).toBe('lit');
    expect(stripState(healthy(1), [2, 3])).toBe('lit');
  });

  it('renders a stored id dimmed', () => {
    expect(stripState(healthy(2), [2, 3])).toBe('dimmed');
  });

  it('locked wins over a stored dim (fail-closed)', () => {
    expect(stripState(locked(2), [2])).toBe('locked');
    expect(stripState(locked(2), [])).toBe('locked');
  });
});

describe('visibleCharacters (the view-only render filter)', () => {
  it('with nothing dimmed returns every character in order — today’s render exactly', () => {
    const characters = [healthy(1), locked(2), healthy(3)];
    expect(visibleCharacters(characters, [])).toEqual(characters);
  });

  it('drops only healthy dimmed characters; locked cards stay (the in-place scope gate remains)', () => {
    const characters = [healthy(1), locked(2), healthy(3)];
    expect(visibleCharacters(characters, [1, 2])).toEqual([locked(2), healthy(3)]);
  });

  it('ignores stale or unknown dimmed ids', () => {
    const characters = [healthy(1)];
    expect(visibleCharacters(characters, [999])).toEqual(characters);
  });

  it('does not mutate its inputs', () => {
    const characters = [healthy(1), healthy(2)];
    const dimmed = [2];
    visibleCharacters(characters, dimmed);
    expect(characters).toEqual([healthy(1), healthy(2)]);
    expect(dimmed).toEqual([2]);
  });
});

describe('toggleDimmed', () => {
  it('dims a lit character and relights a dimmed one, returning a new array', () => {
    const start: number[] = [];
    const dimmedOnce = toggleDimmed(start, healthy(1));
    expect(dimmedOnce).toEqual([1]);
    expect(start).toEqual([]);
    expect(toggleDimmed(dimmedOnce!, healthy(1))).toEqual([]);
  });

  it('never toggles a locked character', () => {
    expect(toggleDimmed([], locked(1))).toBeNull();
    expect(toggleDimmed([1], locked(1))).toBeNull();
  });

  it('leaves stale ids in place — a relinked character restores its prior participation', () => {
    expect(toggleDimmed([999], healthy(1))).toEqual([999, 1]);
  });

  it('tolerates a duplicated stored id (removes every copy on relight)', () => {
    expect(toggleDimmed([1, 1], healthy(1))).toEqual([]);
  });
});

describe('syncEligibleIds (the fetch derivation — dimming must not touch it)', () => {
  it('matches the panels’ pre-strip inline derivation: connected characters, in order', () => {
    const characters = [healthy(1), locked(2), healthy(3)];
    // The legacy inline expression, verbatim:
    const legacy = characters.filter((c) => !c.needsReconnect).map((c) => c.characterId);
    expect(syncEligibleIds(characters)).toEqual(legacy);
    expect(syncEligibleIds(characters)).toEqual([1, 3]);
  });

  it('keeps a dimmed character fetched while the render filter hides it (the view-only pin)', () => {
    const characters = [healthy(1), healthy(2)];
    const dimmed = [2];
    expect(syncEligibleIds(characters)).toEqual([1, 2]);
    expect(visibleCharacters(characters, dimmed).map((c) => c.characterId)).toEqual([1]);
  });
});
