import { expect, test } from 'vitest';
import { collectCodexAssetIds } from './assets';
import type { CodexNode } from './doc';

const image = (id: string, assetId: string) =>
  ({ type: 'image', attrs: { id, assetId, alt: 'Gila', caption: '' }, content: [] }) as const;

test('collects each referenced asset once, in page order', () => {
  const nodes: CodexNode[] = [
    image('i1', 'A'),
    { type: 'paragraph', attrs: { id: 'p' }, content: [] },
    image('i2', 'B'),
    image('i3', 'A'),
  ];

  expect(collectCodexAssetIds(nodes)).toEqual(['A', 'B']);
});
