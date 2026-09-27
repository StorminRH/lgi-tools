'use client';

import { useState } from 'react';
import { EveImage } from '@/components/eve-image';

const PATH = { corporation: 'corporations', alliance: 'alliances' } as const;

/** A corporation or alliance logo that drops out when the image server has none. */
export function EntityLogo({ kind, id, name }: { kind: 'corporation' | 'alliance'; id: number; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <EveImage
      source="eve"
      family={kind === 'corporation' ? 'corporation-logo' : 'alliance-logo'}
      src={`https://images.evetech.net/${PATH[kind]}/${id}/logo`}
      alt={`${name} logo`}
      width={20}
      height={20}
      loading="lazy"
      className="size-5 shrink-0 rounded-ctl"
      onError={() => setFailed(true)}
    />
  );
}
