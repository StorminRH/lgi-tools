import { describe, expect, it } from 'vitest';
import { buildPageMetadata } from './page-metadata';

describe('buildPageMetadata', () => {
  it('keeps page copy aligned across document and social metadata', () => {
    expect(
      buildPageMetadata({
        title: 'Contact',
        description: 'Reach the developer.',
        canonical: '/contact',
      }),
    ).toEqual({
      title: 'Contact',
      description: 'Reach the developer.',
      alternates: { canonical: '/contact' },
      openGraph: {
        type: 'website',
        title: 'Contact',
        description: 'Reach the developer.',
        url: '/contact',
        images: [
          {
            url: '/opengraph-image',
            width: 1200,
            height: 630,
            alt: 'LGI.tools',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Contact',
        description: 'Reach the developer.',
        images: ['/opengraph-image'],
      },
    });
  });

  it('supports a title that bypasses the root template', () => {
    const metadata = buildPageMetadata({
      title: 'Eve Tools — LGI.tools',
      description: 'Tools for wormhole pilots.',
      canonical: '/',
      absoluteTitle: true,
    });

    expect(metadata.title).toEqual({ absolute: 'Eve Tools — LGI.tools' });
    expect(metadata.openGraph?.title).toBe('Eve Tools — LGI.tools');
  });
});
