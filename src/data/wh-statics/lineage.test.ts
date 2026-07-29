import { describe, expect, it } from 'vitest';
import {
  parsePathfinderLineage,
  PathfinderLineageError,
  readPathfinderLineage,
} from './lineage';

describe('Pathfinder lineage fixture', () => {
  it('retains the pinned MIT export with every assignment', async () => {
    const rows = await readPathfinderLineage();

    expect(rows).toHaveLength(3_772);
    expect(new Set(rows.map((row) => row.systemId)).size).toBe(2_604);
    expect(rows).toContainEqual({ systemId: 31_000_005, typeId: 34_368 });
  });

  it('fails loudly when the owned header or row shape drifts', () => {
    expect(() => parsePathfinderLineage('id,systemId,typeId\n1,2,3\n')).toThrow(
      PathfinderLineageError,
    );
    expect(() =>
      parsePathfinderLineage('id;systemId;typeId\n1;not-an-id;3\n'),
    ).toThrow(/systemId/);
  });
});
