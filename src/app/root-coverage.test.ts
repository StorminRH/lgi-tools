import { expect, test, vi } from 'vitest';

vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '--font-mock', style: { fontFamily: 'mock' } });
  return {
    Barlow_Condensed: font,
    JetBrains_Mono: font,
    Geist: font,
  };
});

import AppLayout, { metadata, viewport } from '@/app/layout';
import { metadata as AppNotFoundMetadata } from '@/app/not-found';
import AppOpengraphImage, { alt, contentType, size } from '@/app/opengraph-image';
import AppSitemap from '@/app/sitemap';

test('pins leftover runtime exports on the test graph', () => {
  expect([
    metadata,
    viewport,
    AppLayout,
    AppNotFoundMetadata,
    alt,
    contentType,
    size,
    AppOpengraphImage,
    AppSitemap,
  ]).not.toContain(undefined);
});
