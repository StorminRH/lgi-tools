import type { Metadata } from 'next';

export type PageMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  absoluteTitle?: boolean;
  /** `'segment'` leaves the share image to the route's own `opengraph-image` file, which Next applies only when the page metadata names no image. */
  image?: 'root' | 'segment';
};

const ROOT_IMAGE = '/opengraph-image';

export function buildPageMetadata({
  title,
  description,
  canonical,
  absoluteTitle = false,
  image = 'root',
}: PageMetadataInput): Metadata {
  const rootImage = image === 'root';
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      ...(rootImage && { images: [{ url: ROOT_IMAGE, width: 1200, height: 630, alt: 'LGI.tools' }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(rootImage && { images: [ROOT_IMAGE] }),
    },
  };
}
