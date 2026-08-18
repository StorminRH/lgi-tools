import { describe, expect, it } from 'vitest';
import { parseLinkedAccountId } from './eve-account-shared';

describe('parseLinkedAccountId', () => {
  it('keeps numeric character ids and drops non-numeric account ids', () => {
    expect(parseLinkedAccountId('90000011')).toBe(90000011);
    expect(parseLinkedAccountId('not-a-number')).toBeNull();
  });
});
