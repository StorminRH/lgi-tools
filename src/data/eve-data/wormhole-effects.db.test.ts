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
  it('resolves modifiers for every effect and class that systems carry', async () => {
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
      WHERE wormhole_effect IS NOT NULL AND wormhole_class_id IS NOT NULL
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
    const byKey = new Map(effects.map((entry) => [`${entry.effect}:${entry.wormholeClass}`, entry]));
    const missing = systemPairs
      .map((pair) => `${pair.effect}:${pair.wormhole_class_id}`)
      .filter((key) => (byKey.get(key)?.modifiers.length ?? 0) === 0);
    expect(missing).toEqual([]);
  });
});
