'use client';

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image';

export const EVE_IMAGE_SIZES = [32, 64, 128, 256, 512, 1024] as const;
const MAX_EVE_IMAGE_SIZE = 1024;

export type EveImageSize = (typeof EVE_IMAGE_SIZES)[number];

export type EveImageFamily =
  | 'character-portrait'
  | 'corporation-logo'
  | 'alliance-logo'
  | 'type-icon'
  | 'type-render'
  | 'type-bp'
  | 'type-bpc';

const FAMILY_SIZES: Record<EveImageFamily, readonly EveImageSize[]> = {
  'character-portrait': EVE_IMAGE_SIZES,
  'corporation-logo': EVE_IMAGE_SIZES,
  'alliance-logo': EVE_IMAGE_SIZES,
  'type-icon': EVE_IMAGE_SIZES,
  'type-render': EVE_IMAGE_SIZES,
  'type-bp': EVE_IMAGE_SIZES,
  'type-bpc': EVE_IMAGE_SIZES,
};

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

export type EveImageProps = RemoteEveImageProps | StaticEveImageProps;

export function snapEveImageSize(
  family: EveImageFamily,
  requestedWidth: number,
): EveImageSize {
  const sizes = FAMILY_SIZES[family];
  return sizes.find((size) => size >= requestedWidth) ?? MAX_EVE_IMAGE_SIZE;
}

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
