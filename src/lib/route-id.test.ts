import { describe, it, expect } from 'vitest';
import { loadNumericRouteEntity, parseNumericRouteId } from './route-id';

describe('parseNumericRouteId', () => {
  it('parses a bare digit string', () => {
    expect(parseNumericRouteId('42')).toBe(42);
    expect(parseNumericRouteId('0')).toBe(0);
  });

  it('rejects non-digit and mixed input (never partial-parses "12abc" as 12)', () => {
    expect(parseNumericRouteId('12abc')).toBeNull();
    expect(parseNumericRouteId('abc')).toBeNull();
    expect(parseNumericRouteId('')).toBeNull();
    expect(parseNumericRouteId('1.5')).toBeNull();
    expect(parseNumericRouteId('-3')).toBeNull();
    expect(parseNumericRouteId(' 7')).toBeNull();
  });
});

describe('loadNumericRouteEntity', () => {
  it('parses and loads a matching entity', async () => {
    await expect(
      loadNumericRouteEntity(Promise.resolve({ id: '42' }), async (id) => ({ id })),
    ).resolves.toEqual({ id: 42, entity: { id: 42 } });
  });

  it('does not load invalid ids and returns null for missing entities', async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return null;
    };

    await expect(loadNumericRouteEntity(Promise.resolve({ id: 'bad' }), load)).resolves.toBeNull();
    expect(calls).toBe(0);
    await expect(loadNumericRouteEntity(Promise.resolve({ id: '42' }), load)).resolves.toBeNull();
    expect(calls).toBe(1);
  });
});
