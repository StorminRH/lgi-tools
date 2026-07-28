import { describe, expect, it } from 'vitest';
import { parseStaticsPayload, UnresolvableStaticsCodeError } from './parse';

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

function payload(overrides?: {
  systems?: Record<string, unknown>;
  wormholes?: Record<string, unknown>;
}): string {
  const wormholes: Record<string, unknown> = {
    E175: { static: true, typeID: 30831 },
    ...Object.fromEntries(STATIC_FALSE_CODES.map((code) => [code, { static: false }])),
    ...(overrides?.wormholes ?? {}),
  };
  const systems: Record<string, unknown> = {
    J111613: {
      solarSystemID: 31002318,
      solarSystemName: 'J111613',
      statics: ['E175'],
      effectName: 'Cataclysmic Variable',
      cels: [],
    },
    C13Probe: {
      solarSystemID: 31000001,
      solarSystemName: 'C13Probe',
      statics: [...STATIC_FALSE_CODES],
      effects: {},
    },
    ...(overrides?.systems ?? {}),
  };
  return JSON.stringify({
    version: 11,
    systems,
    wormholes,
    effects: {},
  });
}

describe('parseStaticsPayload', () => {
  it('accepts all eight static:false codes and sorts entries', () => {
    const result = parseStaticsPayload(payload());
    expect(result.feedVersion).toBe('11');
    expect(result.entries.filter((entry) => entry.systemId === 31000001).map((e) => e.code)).toEqual(
      [...STATIC_FALSE_CODES].sort(),
    );
    expect(result.entries.find((entry) => entry.code === 'E175')).toEqual({
      systemId: 31002318,
      systemName: 'J111613',
      code: 'E175',
    });
  });

  it('throws when a system lists a code absent from the wormholes map', () => {
    expect(() =>
      parseStaticsPayload(
        payload({
          systems: {
            Bad: {
              solarSystemID: 42,
              solarSystemName: 'Bad',
              statics: ['ZZZZ'],
            },
          },
        }),
      ),
    ).toThrow(UnresolvableStaticsCodeError);
  });
});
