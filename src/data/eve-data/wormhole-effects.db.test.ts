import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  EFFECT_BEACON_GROUP_ID,
  beaconAttributeIds,
  buildWormholeEffects,
} from './wormhole-effects';

const harness = await createDbTestHarness({
  schema: 'test_wormhole_effect_beacons',
  tables: ['eve_solar_systems'],
});

describe.skipIf(!harness.reachable)('wormhole effect beacons against the SDE mirror', () => {
  // CCP ships effect beacons for classes 1–6 only. Shattered and Drifter
  // systems (classes 13–18) carry effects too but have no beacon, so the card
  // says it has no data for them.
  it('resolves modifiers for every effect at every regular class systems carry', async () => {
    const beacons = await harness.sql<{ id: number; name: string; attributes: unknown }[]>`
      SELECT type.id, type.name, dogma.attributes
      FROM public.eve_types AS type
      JOIN public.type_dogma AS dogma ON dogma.type_id = type.id
      WHERE type.group_id = ${EFFECT_BEACON_GROUP_ID}
    `;
    const attributeIds = beaconAttributeIds(beacons);
    const attributes = attributeIds.length === 0 ? [] : await harness.sql<{
      id: number;
      name: string;
      displayName: string | null;
      unitId: number | null;
    }[]>`
      SELECT id, name, display_name AS "displayName", unit_id AS "unitId"
      FROM public.dgm_attribute_types
      WHERE id IN ${harness.sql(attributeIds)}
    `;
    const effects = buildWormholeEffects(beacons, attributes);
    const systemPairs = await harness.sql<{ effect: string; wormhole_class_id: number }[]>`
      SELECT DISTINCT wormhole_effect AS effect, wormhole_class_id
      FROM public.eve_solar_systems
      WHERE wormhole_effect IS NOT NULL AND wormhole_class_id BETWEEN 1 AND 6
      ORDER BY 1, 2
    `;

    // Printed so a CI log shows the real table this feature renders.
    console.info(
      effects
        .map((entry) =>
          `${entry.effect} C${entry.wormholeClass} (#${entry.typeId}): ${entry.modifiers
            .map((modifier) => `${modifier.label} ${modifier.percent > 0 ? '+' : ''}${modifier.percent}%`)
            .join('; ')}`,
        )
        .join('\n'),
    );

    expect(systemPairs.length).toBeGreaterThan(0);
    expect(effects.filter((entry) => entry.wormholeClass >= 1 && entry.wormholeClass <= 6)).toHaveLength(36);
    const byKey = new Map(effects.map((entry) => [`${entry.effect}:${entry.wormholeClass}`, entry]));
    const missing = systemPairs
      .map((pair) => `${pair.effect}:${pair.wormhole_class_id}`)
      .filter((key) => (byKey.get(key)?.modifiers.length ?? 0) === 0);
    expect(missing).toEqual([]);

    // Pin real values so a unit or sign mistake cannot pass: Wolf-Rayet at
    // class 5 is +86% armor HP, -43% shield resistances and signature radius,
    // and +172% small weapon damage in game.
    expect(byKey.get('wolf-rayet:5')?.modifiers.map(({ label, percent }) => [label, percent])).toEqual([
      ['Armor HP', 86],
      ['Shield resistances', -43],
      ['Signature radius', -43],
      ['Small weapon damage', 172],
    ]);
    expect(byKey.get('pulsar:1')?.modifiers.map(({ label, percent }) => [label, percent])).toEqual([
      ['Armor resistances', -15],
      ['Capacitor recharge time', -15],
      ['Neutralizer and nosferatu amount', 30],
      ['Shield HP', 30],
      ['Signature radius', 30],
    ]);
  });
});
