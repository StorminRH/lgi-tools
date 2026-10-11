import { expect, test } from 'vitest';
import { buildPageMetadata } from './page-metadata';

test('buildPageMetadata keeps document and social copy aligned on the default card', () => {
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
      siteName: 'LGI.tools',
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

test('buildPageMetadata route mode leaves the images keys out so the segment card applies', () => {
  const metadata = buildPageMetadata({
    title: 'Ordinary Perimeter Deposit',
    description: 'A C1 ore site.',
    canonical: '/sites/100',
    socialImage: 'route',
  });

  expect(metadata.alternates).toEqual({ canonical: '/sites/100' });
  expect(metadata.openGraph).toEqual({
    type: 'website',
    siteName: 'LGI.tools',
    title: 'Ordinary Perimeter Deposit',
    description: 'A C1 ore site.',
    url: '/sites/100',
  });
  expect(metadata.twitter).toEqual({
    card: 'summary_large_image',
    title: 'Ordinary Perimeter Deposit',
    description: 'A C1 ore site.',
  });
  // Next applies a file image only when the key is absent, not merely undefined.
  expect('images' in (metadata.openGraph ?? {})).toBe(false);
  expect('images' in (metadata.twitter ?? {})).toBe(false);
});
