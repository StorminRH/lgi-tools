import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  readWormholeCodex,
  type WormholeCodexEntry,
} from '@/data/eve-data/universe-assets';
import { crossCheckStatics } from './cross-check';
import { readPathfinderLineage } from './lineage';

const harness = await createDbTestHarness({
  schema: 'test_wh_statics_cross_check',
  tables: ['eve_data_meta', 'dgm_attribute_types', 'eve_types', 'type_dogma'],
});

beforeAll(async () => {
  if (!harness.reachable) return;
  await harness.sql`
    INSERT INTO eve_data_meta
    SELECT * FROM public.eve_data_meta
    WHERE key = 'sde_version'
  `;
  await harness.sql`
    INSERT INTO dgm_attribute_types
    SELECT * FROM public.dgm_attribute_types
    WHERE name IN (
      'wormholeTargetSystemClass',
      'wormholeMaxStableTime',
      'wormholeMaxStableMass',
      'wormholeMassRegeneration',
      'wormholeMaxJumpMass'
    )
  `;
  await harness.sql`
    INSERT INTO eve_types
    SELECT * FROM public.eve_types
    WHERE group_id = 988
  `;
  await harness.sql`
    INSERT INTO type_dogma
    SELECT dogma.* FROM public.type_dogma dogma
    JOIN public.eve_types type ON type.id = dogma.type_id
    WHERE type.group_id = 988
  `;
});

function requireCode(
  codeByTypeId: ReadonlyMap<number, WormholeCodexEntry>,
  typeId: number,
): string {
  const entry = codeByTypeId.get(typeId);
  if (entry === undefined) {
    throw new Error(`Shipped wormhole codex is missing Pathfinder type ${typeId}`);
  }
  return entry.code;
}

describe.skipIf(!harness.reachable)(
  'Pathfinder lineage against the shipped wormhole codex',
  () => {
    it('bridges every committed assignment and reports full agreement', async () => {
      const [lineage, codex] = await Promise.all([
        readPathfinderLineage(),
        readWormholeCodex(harness.db),
      ]);
      const codeByTypeId = new Map(
        codex.types.map((entry) => [entry.typeId, entry]),
      );
      const feedEntries = lineage.map((row) => ({
        systemId: row.systemId,
        systemName: String(row.systemId),
        code: requireCode(codeByTypeId, row.typeId),
      }));

      expect(crossCheckStatics(feedEntries, lineage, codex)).toEqual({
        agreedSystems: 2_604,
        disagreements: [],
        lineageOnlySystems: [],
        feedOnlySystems: [],
      });
    });
  },
);
