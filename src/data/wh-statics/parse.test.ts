import { describe, expect, it } from 'vitest';
import {
  parseStaticsPayload,
  UnknownStaticsWormholeCodeError,
} from './parse';

const FALSE_STATIC_CODES = [
  'C008',
  'D792',
  'E004',
  'G008',
  'L005',
  'M001',
  'Q003',
  'Z006',
] as const;

function payload(
  systems: Record<
    string,
    { solarSystemID: number; solarSystemName: string; statics: string[] }
  >,
  codes: readonly string[],
): string {
  return JSON.stringify({
    version: 11,
    systems,
    wormholes: Object.fromEntries(
      codes.map((code) => [
        code,
        { static: false, dest: 'c1', typeID: 34_100 },
      ]),
    ),
    effects: { ignored: true },
  });
}

describe('parseStaticsPayload', () => {
  it('accepts all eight system-listed codes whose upstream static flag is false', () => {
    const systems = Object.fromEntries(
      FALSE_STATIC_CODES.map((code, index) => [
        `J${index}`,
        {
          solarSystemID: 31_000_000 + index,
          solarSystemName: `J${index}`,
          statics: [code],
        },
      ]),
    );

    const parsed = parseStaticsPayload(payload(systems, FALSE_STATIC_CODES));

    expect(parsed.feedVersion).toBe('11');
    expect(parsed.entries.map((entry) => entry.code)).toEqual(
      FALSE_STATIC_CODES,
    );
  });

  it('sorts assignments by system id and then code', () => {
    const parsed = parseStaticsPayload(
      payload(
        {
          JSECOND: {
            solarSystemID: 31_000_002,
            solarSystemName: 'JSECOND',
            statics: ['Z006'],
          },
          JFIRST: {
            solarSystemID: 31_000_001,
            solarSystemName: 'JFIRST',
            statics: ['M001', 'C008'],
          },
        },
        ['Z006', 'M001', 'C008'],
      ),
    );

    expect(parsed.entries).toEqual([
      { systemId: 31_000_001, systemName: 'JFIRST', code: 'C008' },
      { systemId: 31_000_001, systemName: 'JFIRST', code: 'M001' },
      { systemId: 31_000_002, systemName: 'JSECOND', code: 'Z006' },
    ]);
  });

  it('accepts a referenced code whose ignored upstream static flag is null', () => {
    const parsed = parseStaticsPayload(
      JSON.stringify({
        version: 11,
        systems: {
          JNULL: {
            solarSystemID: 31_000_001,
            solarSystemName: 'JNULL',
            statics: ['C414'],
          },
        },
        wormholes: { C414: { static: null } },
      }),
    );

    expect(parsed.entries).toEqual([
      { systemId: 31_000_001, systemName: 'JNULL', code: 'C414' },
    ]);
  });

  it('throws a named error when a system lists an unknown code', () => {
    expect(() =>
      parseStaticsPayload(
        payload(
          {
            JUNKNOWN: {
              solarSystemID: 31_000_001,
              solarSystemName: 'JUNKNOWN',
              statics: ['NOPE'],
            },
          },
          [],
        ),
      ),
    ).toThrow(UnknownStaticsWormholeCodeError);
  });
});
