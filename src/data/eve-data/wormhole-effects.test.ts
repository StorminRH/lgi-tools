import { describe, expect, it } from 'vitest';
import {
  beaconAttributeIds,
  buildWormholeEffects,
  parseEffectBeaconName,
} from './wormhole-effects';

describe('parseEffectBeaconName', () => {
  it('reads effect and class regardless of spacing and punctuation', () => {
    expect(parseEffectBeaconName('Pulsar Effect Beacon Class 3')).toEqual({ effect: 'pulsar', wormholeClass: 3 });
    expect(parseEffectBeaconName('Wolf Rayet Effect Beacon Class 6')).toEqual({ effect: 'wolf-rayet', wormholeClass: 6 });
    expect(parseEffectBeaconName('Wolf-Rayet Effect Beacon Class 1')).toEqual({ effect: 'wolf-rayet', wormholeClass: 1 });
    expect(parseEffectBeaconName('Black Hole Effect Beacon Class 2')).toEqual({ effect: 'black-hole', wormholeClass: 2 });
    expect(parseEffectBeaconName('Red Giant Beacon Class 4')).toEqual({ effect: 'red-giant', wormholeClass: 4 });
    expect(parseEffectBeaconName('Cataclysmic Variable Effect Beacon Class 5')).toEqual({
      effect: 'cataclysmic-variable',
      wormholeClass: 5,
    });
  });

  it('skips beacons that are not wormhole system effects', () => {
    expect(parseEffectBeaconName('Incursion Effect Beacon')).toBeNull();
    expect(parseEffectBeaconName('Pulsar Effect Beacon')).toBeNull();
  });
});

describe('buildWormholeEffects', () => {
  const attributes = [
    { id: 1, name: 'shieldCapacityMultiplier', displayName: 'Shield HP', unitId: 104 },
    { id: 2, name: 'armorResistanceBonus', displayName: '  ', unitId: 124 },
    { id: 3, name: 'signatureRadiusMultiplier', displayName: 'Signature Radius', unitId: 109 },
    { id: 4, name: 'capacitorRechargeRateMultiplier', displayName: 'Capacitor Recharge Time', unitId: 111 },
    { id: 5, name: 'radius', displayName: 'Radius', unitId: 1 },
    { id: 6, name: 'noChange', displayName: 'Unchanged', unitId: 104 },
  ];

  it('turns beacon dogma into signed percent modifiers from the attribute units', () => {
    const effects = buildWormholeEffects(
      [
        {
          id: 30_000,
          name: 'Pulsar Effect Beacon Class 3',
          attributes: { 1: 1.5, 2: -22, 3: 1.25, 4: 0.78, 5: 5000, 6: 1 },
        },
        { id: 29_999, name: 'Incursion Effect Beacon', attributes: { 1: 2 } },
      ],
      attributes,
    );
    expect(effects).toEqual([
      {
        effect: 'pulsar',
        wormholeClass: 3,
        typeId: 30_000,
        modifiers: [
          { attributeId: 2, label: 'Armor Resistance Bonus', percent: -22 },
          { attributeId: 4, label: 'Capacitor Recharge Time', percent: 22 },
          { attributeId: 1, label: 'Shield HP', percent: 50 },
          { attributeId: 3, label: 'Signature Radius', percent: 25 },
        ],
      },
    ]);
  });

  it('keeps the lowest type id when a pair repeats and orders by effect then class', () => {
    const effects = buildWormholeEffects(
      [
        { id: 3, name: 'Pulsar Effect Beacon Class 2', attributes: { 1: 1.1 } },
        { id: 2, name: 'Magnetar Effect Beacon Class 1', attributes: { 1: 1.2 } },
        { id: 1, name: 'Pulsar Effect Beacon Class 2', attributes: { 1: 1.3 } },
        { id: 4, name: 'Pulsar Effect Beacon Class 1', attributes: null },
      ],
      attributes,
    );
    expect(effects.map((entry) => [entry.effect, entry.wormholeClass, entry.typeId])).toEqual([
      ['magnetar', 1, 2],
      ['pulsar', 1, 4],
      ['pulsar', 2, 1],
    ]);
    expect(effects[1]?.modifiers).toEqual([]);
  });

  it('collects the attribute ids beacons carry', () => {
    expect(
      beaconAttributeIds([
        { id: 1, name: 'a', attributes: { 9: 1, 3: 2 } },
        { id: 2, name: 'b', attributes: { 3: 1, x: 1 } },
        { id: 3, name: 'c', attributes: null },
      ]),
    ).toEqual([3, 9]);
  });
});
