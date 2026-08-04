import { describe, expect, it } from 'vitest';
import { shouldToastRightsTransition } from './rights-transition';

describe('rights transition toast gate', () => {
  it('ignores the first mount answer', () => {
    expect(shouldToastRightsTransition(undefined, true)).toBe(false);
    expect(shouldToastRightsTransition(undefined, false)).toBe(false);
  });

  it('fires only when the boolean flips', () => {
    expect(shouldToastRightsTransition(true, false)).toBe(true);
    expect(shouldToastRightsTransition(false, true)).toBe(true);
    expect(shouldToastRightsTransition(true, true)).toBe(false);
    expect(shouldToastRightsTransition(false, false)).toBe(false);
  });
});
