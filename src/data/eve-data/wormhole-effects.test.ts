import { describe, expect, it } from 'vitest';
import {
  beaconAttributeIds,
  buildWormholeEffects,
  effectModifierLabel,
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
  // Display names as CCP ships them on the Pulsar beacons.
  const attributes = [
    { id: 1, name: 'shieldCapacityMultiplier', displayName: 'Shield Hitpoint Bonus', unitId: 104 },
    { id: 2, name: 'armorEmDamageResonance', displayName: 'Armor EM resistance bonus', unitId: 104 },
    { id: 3, name: 'armorExplosiveDamageResonance', displayName: 'Armor explosive resistance bonus', unitId: 104 },
    { id: 4, name: 'armorKineticDamageResonance', displayName: 'Armor kinetic resistance bonus', unitId: 104 },
    { id: 5, name: 'armorThermalDamageResonance', displayName: 'Armor thermal resistance bonus', unitId: 104 },
    { id: 6, name: 'rechargeRateMultiplier', displayName: 'Capacitor recharge multiplier', unitId: 104 },
    { id: 7, name: 'signatureRadiusMultiplier', displayName: 'Signature Penalty', unitId: 104 },
    { id: 8, name: 'energyWarfareStrengthMultiplier', displayName: 'Energy warfare modifier', unitId: 109 },
    { id: 9, name: 'radius', displayName: 'Radius', unitId: 1 },
    { id: 10, name: 'noChange', displayName: 'Unchanged multiplier', unitId: 104 },
  ];

  it('turns beacon dogma into signed, player-facing modifiers', () => {
    const effects = buildWormholeEffects(
      [
        {
          id: 30_844,
          name: 'Pulsar Effect Beacon Class 1',
          attributes: { 1: 1.3, 2: 1.15, 3: 1.15, 4: 1.15, 5: 1.15, 6: 0.85, 7: 1.3, 8: 1.3, 9: 5000, 10: 1 },
        },
        { id: 29_999, name: 'Incursion Effect Beacon', attributes: { 1: 2 } },
      ],
      attributes,
    );
    expect(effects).toEqual([
      {
        effect: 'pulsar',
        wormholeClass: 1,
        typeId: 30_844,
        modifiers: [
          { attributeId: 2, label: 'Armor resistances', percent: -15 },
          { attributeId: 6, label: 'Capacitor recharge time', percent: -15 },
          { attributeId: 8, label: 'Neutralizer and nosferatu amount', percent: 30 },
          { attributeId: 1, label: 'Shield HP', percent: 30 },
          { attributeId: 7, label: 'Signature radius', percent: 30 },
        ],
      },
    ]);
  });

  it('keeps resistances apart when their values differ', () => {
    const [entry] = buildWormholeEffects(
      [{ id: 1, name: 'Pulsar Effect Beacon Class 2', attributes: { 2: 1.1, 3: 1.2, 4: 1.2, 5: 1.2 } }],
      attributes,
    );
    expect(entry?.modifiers.map((modifier) => [modifier.label, modifier.percent])).toEqual([
      ['Armor EM resistance', -10],
      ['Armor explosive resistance', -20],
      ['Armor kinetic resistance', -20],
      ['Armor thermal resistance', -20],
    ]);
  });

  it.each([
    { name: 'agilityMultiplier', displayName: 'Inertia Modifier', unitId: 121, value: 1.15, label: 'Inertia', percent: 15 },
    { name: 'energyTransferAmountBonus', displayName: null, unitId: null, value: 0.85, label: 'Remote capacitor transfer', percent: -15 },
  ])('converts $name without treating unrelated attributes as modifiers', ({ name, displayName, unitId, value, label, percent }) => {
    const [entry] = buildWormholeEffects(
      [{ id: 1, name: 'Black Hole Effect Beacon Class 1', attributes: { 1: value, 2: 1.15, 3: 0.85 } }],
      [
        { id: 1, name, displayName, unitId },
        { id: 2, name: 'unrelatedScaledNumber', displayName: 'Unrelated scaled number', unitId: 121 },
        { id: 3, name: 'unrelatedUnitlessNumber', displayName: null, unitId: null },
      ],
    );
    expect(entry?.modifiers).toEqual([{ attributeId: 1, label, percent }]);
  });

  it('falls back to the display name without its dogma suffix', () => {
    expect(effectModifierLabel('Warp speed multiplier', 'warpSpeedMultiplier')).toBe('Warp speed');
    expect(effectModifierLabel(null, 'droneTrackingBonus')).toBe('Drone Tracking');
    expect(effectModifierLabel('  ', 'agilityMultiplier')).toBe('Agility');
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
