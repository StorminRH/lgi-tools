import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

import { NodeAddMenu } from './NodeAddMenu';

test('the add-connection dialog names its close button and draws the close mark as an icon', () => {
  const html = renderToStaticMarkup(
    createElement(NodeAddMenu, { mapId: 'map-a', menu: null, onMenuOpenChange: vi.fn(), onAdd: vi.fn() }),
  );
  expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*">Add connection<\/h2><button type="button" aria-label="Close add connection"><svg aria-hidden="true"/);
});
