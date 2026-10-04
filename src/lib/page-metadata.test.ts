import { describe, expect, it } from 'vitest';
import { buildPageMetadata } from './page-metadata';

describe('buildPageMetadata', () => {
  it('keeps document/social copy aligned and supports absolute titles', () => {
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

    const absolute = buildPageMetadata({
      title: 'Eve Tools — LGI.tools',
      description: 'Tools for wormhole pilots.',
      canonical: '/',
      absoluteTitle: true,
    });
    expect(absolute.title).toEqual({ absolute: 'Eve Tools — LGI.tools' });
    expect(absolute.openGraph?.title).toBe('Eve Tools — LGI.tools');
  });

  it('leaves the share image to the route segment when asked', () => {
    const meta = buildPageMetadata({
      title: 'Outpost',
      description: 'A combat site.',
      canonical: '/codex/sites/20',
      image: 'segment',
    });

    expect(meta.openGraph).toEqual({
      type: 'website',
      title: 'Outpost',
      description: 'A combat site.',
      url: '/codex/sites/20',
    });
    expect(meta.twitter).toEqual({ card: 'summary_large_image', title: 'Outpost', description: 'A combat site.' });
  });
});
