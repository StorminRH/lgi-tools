import { describe, expect, it } from 'vitest';
import {
  parseStaticsPayload,
  UnresolvableStaticsCodeError,
} from './parse';

/** The eight codes that systems list as statics while carrying `static: false`. */
const STATIC_FALSE_CODES = [
  'C008',
  'D792',
  'E004',
  'G008',
  'L005',
  'M001',
  'Q003',
  'Z006',
] as const;

function feedWithCodes(codes: readonly string[]): string {
  const wormholes: Record<string, { static: boolean }> = {
    E175: { static: true },
  };
  for (const code of codes) {
    wormholes[code] = { static: false };
  }
  return JSON.stringify({
    version: 11,
    systems: {
      J111613: {
        solarSystemID: 31002318,
        statics: ['E175'],
        effectName: 'Cataclysmic Variable',
        cels: [],
      },
      J999999: {
        solarSystemID: 31009999,
        statics: [...codes],
        effectName: 'Pulsar',
      },
    },
    wormholes,
    effects: { ignored: true },
  });
}

describe('parseStaticsPayload', () => {
  it('accepts all eight static:false codes and sorts entries', () => {
    const parsed = parseStaticsPayload(feedWithCodes(STATIC_FALSE_CODES));
    expect(parsed.feedVersion).toBe('11');
    expect(parsed.entries.map((e) => e.code)).toEqual([
      'E175',
      ...[...STATIC_FALSE_CODES].sort((a, b) => a.localeCompare(b)),
    ]);
    expect(parsed.entries[0]).toEqual({
      systemId: 31002318,
      systemName: 'J111613',
      code: 'E175',
    });
    // effectName / cels / effects are parsed away — never present on entries.
    expect(parsed.entries.every((e) => Object.keys(e).sort().join() === 'code,systemId,systemName')).toBe(
      true,
    );
  });

  it('throws on a code absent from the wormholes map', () => {
    const body = JSON.stringify({
      version: 11,
      systems: {
        J111613: { solarSystemID: 31002318, statics: ['XXXX'] },
      },
      wormholes: { E175: { static: true } },
    });
    expect(() => parseStaticsPayload(body)).toThrow(UnresolvableStaticsCodeError);
    try {
      parseStaticsPayload(body);
    } catch (error) {
      expect(error).toMatchObject({ systemId: 31002318, code: 'XXXX' });
    }
  });

  it('rejects malformed JSON and shape-invalid payloads', () => {
    expect(() => parseStaticsPayload('{')).toThrow(/not valid JSON/);
    expect(() =>
      parseStaticsPayload(JSON.stringify({ version: 11, systems: {} })),
    ).toThrow(/boundary validation/);
  });
});
