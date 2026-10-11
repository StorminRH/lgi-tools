'use client';

import { useState } from 'react';
import type { TypeIconVariant } from '@/data/eve-data/type-images';
import { eveImageSrc, type EveImageFamily } from '@/lib/eve-image';
import { initials } from '@/lib/format/names';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';

const IMAGE_FAMILY: Record<TypeIconVariant, EveImageFamily> = {
  icon: 'type-icon',
  render: 'type-render',
  bp: 'type-bp',
  bpc: 'type-bpc',
};

export type TypeIconSize = 22 | 26 | 30 | 32 | 40 | 64 | 112;

const FALLBACK_SIZE_CLASS: Record<TypeIconSize, string> = {
  22: 'size-icon-lg',
  26: 'size-[26px]',
  30: 'size-[30px]',
  32: 'size-8',
  40: 'size-10',
  64: 'size-16',
  112: 'size-28',
};

export function TypeIcon({
  typeId,
  variant = 'icon',
  size,
  alt = '',
  mono,
  className,
}: {
  typeId: number;
  variant?: TypeIconVariant;
  size: TypeIconSize;
  alt?: string;
  /** The full name the fallback monogram is taken from, with initials(). Defaults to alt. */
  mono?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    const text = initials(mono || alt || '') || '?';
    return (
      <span
        className={cn('type-icon type-icon-fallback', FALLBACK_SIZE_CLASS[size], className)}
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
        role={alt ? 'img' : undefined}
      >
        {text}
      </span>
    );
  }

  return (
    <EveImage
      source="eve"
      family={IMAGE_FAMILY[variant]}
      className={cn('type-icon', className)}
      src={eveImageSrc(IMAGE_FAMILY[variant], typeId)}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
