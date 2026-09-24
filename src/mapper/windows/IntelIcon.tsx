import type { ReactNode } from 'react';
import { EveImage } from '@/components/eve-image';
import { cn } from '@/components/ui/cn';
import type { WormholeEffect } from '@/data/eve-data/wormhole-contract';

export type IntelIconKind = 'harvestables' | 'hacking' | 'combat' | 'pilot' | 'market' | 'wormhole' | 'expand';

const PATHS: Record<Exclude<IntelIconKind, 'wormhole'>, string> = {
  harvestables: 'M5 12H4.4a3.4 3.4 0 0 1-.6-6.7 4.3 4.3 0 0 1 8-1 3.9 3.9 0 0 1-.2 7.7H9l-.7 2H6.7l.7-2H6.5l-.7 2H4.2Z',
  hacking: 'M5 1h2v2h2V1h2v2h2v2h2v2h-2v2h2v2h-2v2h-2v2H9v-2H7v2H5v-2H3v-2H1V9h2V7H1V5h2V3h2Zm1 5v4h4V6Z',
  combat: 'M7 1h2v2a5.1 5.1 0 0 1 4 4h2v2h-2a5.1 5.1 0 0 1-4 4v2H7v-2a5.1 5.1 0 0 1-4-4H1V7h2a5.1 5.1 0 0 1 4-4Zm1 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  pilot: 'M8 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2 15v-2a6 5 0 0 1 12 0v2Z',
  market: 'M2 2h1v11h12v1H2Zm3 6h2v3H5Zm4-3h2v6H9Zm4-4h2v10h-2Z',
  expand: 'm5 2 6 6-6 6Z',
};

const TONE: Record<IntelIconKind, string> = {
  harvestables: 'text-intel-harvest',
  hacking: 'text-intel-hack',
  combat: 'text-intel-combat',
  pilot: 'text-intel-pilot',
  market: 'text-intel-market',
  wormhole: 'text-intel-wormhole',
  expand: 'text-muted',
};

export function IntelIcon({ kind, className }: { readonly kind: IntelIconKind; readonly className?: string }) {
  if (kind === 'wormhole') {
    return <EveImage source="static" src="/icons/ccp/wormhole.png" width={16} height={16} alt="" aria-hidden="true" className={cn('size-icon-sm shrink-0', className)} />;
  }
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={cn('size-icon-sm shrink-0', TONE[kind], className)}>
      <path d={PATHS[kind]} fillRule="evenodd" />
      {kind === 'combat' ? <circle cx="8" cy="8" r="1.3" /> : null}
    </svg>
  );
}

const EFFECT_GLYPH: Record<WormholeEffect, ReactNode> = {
  pulsar: (
    <>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      <circle cx="12" cy="12" r="6.2" opacity={0.45} />
      <path d="M14.3 9.7 21 3M9.7 14.3 3 21" strokeWidth={2.3} />
    </>
  ),
  'black-hole': (
    <>
      <circle cx="12" cy="12" r="4.8" className="fill-bg-deep" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(-18 12 12)" />
      <path d="M7.4 9.6a4.8 4.8 0 0 1 9.2 0" />
    </>
  ),
  magnetar: (
    <>
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
      <path d="M10.4 10.2C3.5 3.5 3.5 20.5 10.4 13.8M13.6 10.2C20.5 3.5 20.5 20.5 13.6 13.8M12 2.5v4M12 17.5v4" />
    </>
  ),
  'red-giant': (
    <>
      <circle cx="12" cy="12" r="6.4" fill="currentColor" fillOpacity={0.35} />
      <circle cx="12" cy="12" r="6.4" />
      <circle cx="12" cy="12" r="10" strokeDasharray="2 2.7" opacity={0.7} />
    </>
  ),
  'cataclysmic-variable': (
    <>
      <circle cx="8.5" cy="13" r="4.3" fill="currentColor" fillOpacity={0.35} />
      <circle cx="8.5" cy="13" r="4.3" />
      <circle cx="18" cy="9.5" r="2.1" fill="currentColor" />
      <path d="M12.6 11.4q2.6-1.6 3.6-1.6" />
    </>
  ),
  'wolf-rayet': (
    <>
      <path
        d="M12 1.5 13.3 8.86 19.42 4.58 15.14 10.7 22.5 12 15.14 13.3 19.42 19.42 13.3 15.14 12 22.5 10.7 15.14 4.58 19.42 8.86 13.3 1.5 12 8.86 10.7 4.58 4.58 10.7 8.86Z"
        fill="currentColor"
        fillOpacity={0.3}
      />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </>
  ),
};

const EFFECT_TONE: Record<WormholeEffect, string> = {
  pulsar: 'text-effect-pulsar',
  'black-hole': 'text-effect-black-hole',
  magnetar: 'text-effect-magnetar',
  'red-giant': 'text-effect-red-giant',
  'cataclysmic-variable': 'text-effect-cataclysmic-variable',
  'wolf-rayet': 'text-effect-wolf-rayet',
};

export function WormholeEffectIcon({ effect, className }: { readonly effect: WormholeEffect; readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-icon-sm shrink-0', EFFECT_TONE[effect], className)}
    >
      {EFFECT_GLYPH[effect]}
    </svg>
  );
}
