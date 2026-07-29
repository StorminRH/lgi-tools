import { describe, expect, it } from 'vitest';
import { parseStaticsPayload, UnknownStaticCodeError } from './parse';

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

function payload(
  statics: readonly string[],
  wormholes: Record<string, { static: boolean | null }>,
): string {
  return JSON.stringify({
    version: 11,
    systems: {
      J000002: {
        solarSystemID: 31_000_002,
        solarSystemName: 'J000002',
        statics: ['Z006'],
        cels: [[6, 1]],
        effectName: 'Ignored',
      },
      J000001: {
        solarSystemID: 31_000_001,
        solarSystemName: 'J000001',
        statics,
        effects: ['ignored'],
      },
    },
    wormholes,
    effects: { ignored: true },
  });
}

describe('parseStaticsPayload', () => {
  it('accepts every real static code whose upstream static flag is false', () => {
    const wormholes = Object.fromEntries(
      STATIC_FALSE_CODES.map((code) => [code, { static: false }]),
    );

    expect(
      parseStaticsPayload(payload(STATIC_FALSE_CODES, wormholes)),
    ).toEqual({
      feedVersion: '11',
      entries: [
        ...STATIC_FALSE_CODES.map((code) => ({
          systemId: 31_000_001,
          systemName: 'J000001',
          code,
        })),
        {
          systemId: 31_000_002,
          systemName: 'J000002',
          code: 'Z006',
        },
      ],
    });
  });

  it('accepts a null upstream static flag because the flag is non-authoritative', () => {
    expect(
      parseStaticsPayload(
        payload(['A001'], {
          A001: { static: null },
          Z006: { static: false },
        }),
      ),
    ).toMatchObject({
      feedVersion: '11',
      entries: [
        {
          systemId: 31_000_001,
          systemName: 'J000001',
          code: 'A001',
        },
        {
          systemId: 31_000_002,
          systemName: 'J000002',
          code: 'Z006',
        },
      ],
    });
  });

  it('throws a named error when a system lists an undefined code', () => {
    expect(() =>
      parseStaticsPayload(payload(['A001'], { Z006: { static: false } })),
    ).toThrow(UnknownStaticCodeError);
  });

  it('rejects duplicate codes before they can violate the serving primary key', () => {
    expect(() =>
      parseStaticsPayload(
        payload(['A001', 'A001'], {
          A001: { static: true },
          Z006: { static: false },
        }),
      ),
    ).toThrow('System statics must be unique');
  });

  it('does not accept inherited object names as wormhole definitions', () => {
    expect(() =>
      parseStaticsPayload(
        payload(['constructor'], {
          Z006: { static: false },
        }),
      ),
    ).toThrow(UnknownStaticCodeError);
  });
});
