import type { Metadata } from 'next';

export type PageMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  absoluteTitle?: boolean;
  /**
   * 'default': the root 1200x630 card. 'route': leave the `images` keys out so
   * the segment's own opengraph-image file applies. Next skips a file image
   * whenever the page's openGraph or twitter owns an `images` key, even an
   * undefined one.
   */
  socialImage?: 'default' | 'route';
};

const DEFAULT_CARD = '/opengraph-image';

export function buildPageMetadata({
  title,
  description,
  canonical,
  absoluteTitle = false,
  socialImage = 'default',
}: PageMetadataInput): Metadata {
  const ownCard = socialImage === 'default';
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'LGI.tools',
      title,
      description,
      url: canonical,
      ...(ownCard && { images: [{ url: DEFAULT_CARD, width: 1200, height: 630, alt: 'LGI.tools' }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ownCard && { images: [DEFAULT_CARD] }),
    },
  };
}
