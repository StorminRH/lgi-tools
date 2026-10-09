import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CodexImageFigure } from './CodexImage';

const ASSET = 'aaaaaaaa-0000-4000-8000-000000000001';

test.each([
  ['published', 'Screenshot'],
  ['pending', 'Screenshot · awaiting review'],
] as const)('a %s screenshot badge sits on a solid surface over the image', (status, label) => {
  const html = renderToStaticMarkup(
    createElement(CodexImageFigure, {
      attrs: { id: 'shot', assetId: ASSET, alt: 'Gila holding', caption: '' },
      asset: {
        id: ASSET,
        stem: `https://store1.public.blob.vercel-storage.com/codex/local/img/${ASSET}`,
        width: 1920,
        height: 1080,
        status,
        credit: null,
      },
    }),
  );

  const badge = new RegExp(`<span class="([^"]*)"><span class="[^"]*">${label}</span></span>`).exec(html);
  expect(badge?.[1]).toBe('absolute left-3 top-3 flex rounded-full bg-bg-deep');
});
