'use client';

import { characterPortraitUrl } from '@/lib/eve-image';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';

export type PortraitSize = 28 | 32 | 36 | 38 | 64;

const SIZE_CLASS: Record<PortraitSize, string> = {
  28: 'size-7',
  32: 'size-8',
  36: 'size-9',
  38: 'size-[38px]',
  64: 'size-16',
};

export function CharacterPortrait({
  characterId,
  name,
  size,
  src,
  className,
  loading,
  preload = false,
}: {
  characterId?: number;
  name: string;
  size: PortraitSize;
  src?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  preload?: boolean;
}) {
  const imageSrc = src ?? (characterId !== undefined ? characterPortraitUrl(characterId, 128) : '');

  return (
    <span className={cn('relative inline-block shrink-0', SIZE_CLASS[size], className)}>
      <EveImage
        source="eve"
        family="character-portrait"
        src={imageSrc}
        alt={name}
        width={size}
        height={size}
        loading={preload ? undefined : loading}
        preload={preload}
        decoding="async"
        className="size-full rounded-full border border-border-idle object-cover"
      />
    </span>
  );
}
