'use client';

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image';
import { snapEveImageSize, type EveImageFamily } from '@/lib/eve-image';

type SharedImageProps = Omit<
  ImageProps,
  'src' | 'alt' | 'width' | 'height' | 'fill' | 'loader' | 'unoptimized' | 'priority'
> & {
  src: string;
  alt: string;
  width: number;
  height: number;
};

type RemoteEveImageProps = SharedImageProps & {
  source: 'eve';
  family: EveImageFamily;
};

type StaticEveImageProps = SharedImageProps & {
  source: 'static';
  family?: never;
};

/** Caller contract for rendering eve image; the component owns presentation while callers own domain data. */
export type EveImageProps = RemoteEveImageProps | StaticEveImageProps;

/** Builds the canonical EVE image-server URL for one family, identifier, rendition, and snapped pixel size. */
export function eveImageUrl(
  family: EveImageFamily,
  { src, width }: ImageLoaderProps,
): string {
  // `src` is always an absolute CCP URL here. A falsy `src` never reaches this
  // loader: next/image short-circuits an empty/blob/data src to `unoptimized`
  // and returns the raw src without invoking the loader (next's get-img-props —
  // the `if (!src)` branch plus `generateImgAttrs`' `unoptimized` early-return).
  // So an id-less portrait degrades to a harmless broken image, as the plain
  // `<img>` did, and no empty-src guard is needed. Re-check that path if next is
  // bumped past 16.2.6.
  const url = new URL(src);
  url.searchParams.set('size', String(snapEveImageSize(family, width)));
  return url.toString();
}

/**
 * Renders either a canonical EVE image-server asset or an approved static source through Next
 * Image, snapping remote dimensions to the supported ladder.
 */
export function EveImage(props: EveImageProps) {
  if (props.source === 'static') {
    const { source: _source, alt, ...imageProps } = props;
    return <Image {...imageProps} alt={alt} unoptimized />;
  }

  const { source: _source, family, alt, ...imageProps } = props;
  return (
    <Image
      {...imageProps}
      alt={alt}
      loader={(loaderProps) => eveImageUrl(family, loaderProps)}
    />
  );
}
