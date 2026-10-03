import { describe, expect, it } from 'vitest';
import { emptyDataText } from './live-character-sync';

describe('emptyDataText', () => {
  it('tells a reconnect-needed character it will never sync', () => {
    expect(emptyDataText(true)).toBe('Nothing synced for this character.');
  });

  it('waits on a character that has not synced yet', () => {
    expect(emptyDataText(false)).toBe('Awaiting first sync.');
  });
});
