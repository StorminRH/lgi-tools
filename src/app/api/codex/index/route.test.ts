import { expect, test, vi } from 'vitest';

vi.mock('@/composition/codex-templates', () => ({
  listCodexIndex: async () => [
    { kind: 'wormholes', key: 'c247', title: 'C247' },
    { kind: 'sites', key: '20', title: 'Outpost Frontier Stronghold' },
    { kind: 'classes', key: 'c5', title: 'C5' },
    { kind: 'guides', key: 'rolling-a-c3-static', title: 'Rolling a C3 static' },
  ],
}));

import { GET } from './route';

test('the search index lists guides, wormhole types, and classes but leaves sites to the Sites section', async () => {
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    entries: [
      { kind: 'wormholes', key: 'c247', title: 'C247' },
      { kind: 'classes', key: 'c5', title: 'C5' },
      { kind: 'guides', key: 'rolling-a-c3-static', title: 'Rolling a C3 static' },
    ],
  });
});
