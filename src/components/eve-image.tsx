'use client';

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image';
import { snapEveImageSize, type EveImageFamily } from '@/lib/eve-image';

export type SharedImageProps = Omit<
  ImageProps,
  'src' | 'alt' | 'width' | 'height' | 'fill' | 'loader' | 'unoptimized' | 'priority'
> & {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type RemoteEveImageProps = SharedImageProps & {
  source: 'eve';
  family: EveImageFamily;
};

export type StaticEveImageProps = SharedImageProps & {
  source: 'static';
  family?: never;
};

export type EveImageProps = RemoteEveImageProps | StaticEveImageProps;

export function eveImageUrl(
  family: EveImageFamily,
  { src, width }: ImageLoaderProps,
): string {
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
