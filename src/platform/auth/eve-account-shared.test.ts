import { describe, expect, it } from 'vitest';
import { parseLinkedAccountId } from './eve-account-shared';

describe('parseLinkedAccountId', () => {
  it('keeps digit character ids and drops values the SQL bigint join rejects', () => {
    expect(parseLinkedAccountId('90000011')).toBe(90000011);
    expect(parseLinkedAccountId('not-a-number')).toBeNull();
    expect(parseLinkedAccountId('')).toBeNull();
    expect(parseLinkedAccountId('1e5')).toBeNull();
    expect(parseLinkedAccountId('90000011.5')).toBeNull();
    expect(parseLinkedAccountId('9007199254740993')).toBeNull();
  });
});
