'use client';

import { useState } from 'react';
import type { TypeIconVariant } from '@/data/eve-data/type-images';
import type { EveImageFamily } from '@/lib/eve-image';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';

const IMAGE_FAMILY: Record<TypeIconVariant, EveImageFamily> = {
  icon: 'type-icon',
  render: 'type-render',
  bp: 'type-bp',
  bpc: 'type-bpc',
};

const FALLBACK_SIZE_CLASS: Record<number, string> = {
  22: 'size-icon-lg',
  26: 'w-[26px] h-[26px]',
  32: 'w-[32px] h-[32px]',
  64: 'w-[64px] h-[64px]',
  88: 'w-[88px] h-[88px]',
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
  size: number;
  alt?: string;
  mono?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    const text = (mono || alt || '?').slice(0, 2).toUpperCase();
    return (
      <span
        className={cn(
          'type-icon type-icon-fallback',
          FALLBACK_SIZE_CLASS[size] ?? FALLBACK_SIZE_CLASS[32],
          className,
        )}
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
      src={`https://images.evetech.net/types/${typeId}/${variant}`}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
