'use client';

import { useState } from 'react';
import { eveImageSrc } from '@/lib/eve-image';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';

export type LogoSize = 20 | 24 | 32 | 36;

const SIZE_CLASS: Record<LogoSize, string> = {
  20: 'size-5',
  24: 'size-6',
  32: 'size-8',
  36: 'size-9',
};

/**
 * A corporation or alliance logo from the EVE image server: the counterpart
 * of CharacterPortrait. Callers show the name beside it, so alt defaults to
 * ''. A logo that fails to load leaves an empty box of the same size and
 * border, so the row keeps its alignment.
 */
export function EntityLogo({
  kind,
  id,
  size,
  alt = '',
  className,
}: {
  kind: 'corporation' | 'alliance';
  id: number;
  size: LogoSize;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = cn('shrink-0 rounded-ctl', SIZE_CLASS[size], className);
  if (failed) return <span aria-hidden className={cn('inline-block', box)} />;

  const family = `${kind}-logo` as const;
  return (
    <EveImage
      source="eve"
      family={family}
      src={eveImageSrc(family, id)}
      alt={alt}
      width={size}
      height={size}
      className={cn('object-cover', box)}
      onError={() => setFailed(true)}
    />
  );
}
