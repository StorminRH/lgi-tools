'use client';

import { useState } from 'react';
import { EveImage, type EveImageFamily } from './eve-image';
import { cn } from './ui/cn';

// Renders an item image from the EVE image server, with a graceful fallback.
// It bakes in the `images.evetech.net` host and the server's rendition
// variants (`icon`/`render` plus the `bp`/`bpc` blueprint renditions), so it's
// EVE-specific — not a generic image element. It knows nothing about prices.
// EveImage sends requests directly to CCP's discrete image sizes without using
// Vercel's optimizer. On a 404 this swaps to a tone-styled monogram rather than
// leaving a broken image.

export type TypeIconVariant = 'icon' | 'render' | 'bp' | 'bpc';

const IMAGE_FAMILY: Record<TypeIconVariant, EveImageFamily> = {
  icon: 'type-icon',
  render: 'type-render',
  bp: 'type-bp',
  bpc: 'type-bpc',
};

// The monogram fallback ignores image width/height attributes — so its box is
// sized by a class. Keyed by the display sizes the
// app actually uses; extend when a new size ships. Unknown sizes fall back to
// the row-icon size.
const FALLBACK_SIZE_CLASS: Record<number, string> = {
  22: 'size-icon-lg',
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
  // Display size in px. The requested image size is derived from this.
  size: number;
  // Accessible label; omit (or '') for a decorative icon sitting next to text.
  alt?: string;
  // Two-char monogram override for the 404 fallback (else derived from alt).
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
