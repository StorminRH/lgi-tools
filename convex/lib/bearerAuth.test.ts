import { describe, expect, it } from 'vitest';
import { bearerMatches } from './bearerAuth';

const SECRET = 'shared-secret';

describe('bearerMatches', () => {
  it('accepts the exact bearer and rejects everything else', async () => {
    expect(await bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(await bearerMatches(`Bearer ${SECRET} `, SECRET)).toBe(false);
    expect(await bearerMatches(SECRET, SECRET)).toBe(false);
    expect(await bearerMatches('Bearer wrong', SECRET)).toBe(false);
    expect(await bearerMatches(null, SECRET)).toBe(false);
  });
});
