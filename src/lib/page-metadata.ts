import type { Metadata } from 'next';

type PageMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  absoluteTitle?: boolean;
};

/** Build page-specific metadata without inheriting the root's generic social copy. */
export function buildPageMetadata({
  title,
  description,
  canonical,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
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
      title,
      description,
      images: ['/opengraph-image'],
    },
  };
}
