import { EveImage } from '@/components/eve-image';
import { cn } from '@/components/ui/cn';

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
