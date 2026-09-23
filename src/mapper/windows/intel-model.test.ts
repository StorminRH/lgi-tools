import { expect, test } from 'vitest';
import { glanceMarkIndex, type SignatureWindowRow } from '../signatures/signature-model';
import { intelCategoryBlocks, intelLocationKind } from './intel-model';

test('system summaries and canvas marks share categories without losing repeated sites', () => {
  const row = (key: string, group: SignatureWindowRow['group'], name: string | null, systemId = 1): SignatureWindowRow => ({
    key, group, name, systemId, signatureId: key, kind: 'signature', signalPct: 100,
    firstSeenAt: 1, connection: null, className: null,
  });
  const rows = [
    row('A', 'Gas Site', 'Reservoir'), row('B', 'Gas Site', 'Reservoir'),
    row('C', 'Relic Site', null), row('D', 'Combat Site', 'Outpost'),
    row('E', 'Wormhole', 'K162'), row('F', null, null),
    row('G', 'Ore Site', 'Belt', 2),
  ];
  expect(intelLocationKind({ security: -1, whClassId: 5 })).toBe('wormhole');
  expect(intelLocationKind({ security: -1, whClassId: 25 })).toBe('k-space');
  expect(intelLocationKind({ security: null, whClassId: null })).toBe('none');
  const blocks = intelCategoryBlocks(rows, 1);
  expect(blocks.map((block) => [block.bucket, block.rows.map((site) => site.key)])).toEqual([
    ['harvestables', ['A', 'B']], ['hacking', ['C']], ['combat', ['D']],
  ]);
  expect(glanceMarkIndex(rows)).toEqual(new Map([
    [1, ['harvestables', 'hacking', 'combat']], [2, ['harvestables']],
  ]));
  expect(intelCategoryBlocks(rows, 2).flatMap((block) => block.rows.map((site) => site.name))).toEqual(['Belt']);
});
