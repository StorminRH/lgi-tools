'use client';

// Wormhole-sites wrapper around the generic <TerminalSearch> primitive.
// Pulls current ?class= / ?type= for prefill, parses with the slice's
// terminal-query module, and navigates to /sites?… on submit.

import { useRouter, useSearchParams } from 'next/navigation';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  formatTerminalQuery,
  parseTerminalQuery,
  suggestTerminalQuery,
  terminalErrorMessage,
  type TerminalParams,
} from '../terminal-query';
import { SITE_TYPES, WORMHOLE_CLASSES, type SiteType, type WormholeClass } from '../schema';

export function SitesTerminalSearch() {
  const router = useRouter();
  const sp = useSearchParams();

  const rawType = sp.get('type');
  const rawClass = sp.get('class');
  const type = rawType && (SITE_TYPES as readonly string[]).includes(rawType)
    ? (rawType as SiteType)
    : undefined;
  const wormholeClass = rawClass && (WORMHOLE_CLASSES as readonly string[]).includes(rawClass)
    ? (rawClass as WormholeClass)
    : undefined;

  const initialValue = formatTerminalQuery({ type, wormholeClass });

  const navigate = (p: TerminalParams) => {
    const params = new URLSearchParams();
    if (p.wormholeClass) params.set('class', p.wormholeClass);
    if (p.type) params.set('type', p.type);
    const qs = params.toString();
    router.push(`/sites${qs ? `?${qs}` : ''}`);
  };

  return (
    <TerminalSearch
      // Re-key on URL change so navigating via the pill bar re-syncs the input.
      key={initialValue}
      initialValue={initialValue}
      placeholder="Filter — try c5/relic, ore, c2/combat"
      parse={parseTerminalQuery}
      suggest={suggestTerminalQuery}
      errorMessage={terminalErrorMessage}
      onSubmit={navigate}
      onClear={() => router.push('/sites')}
    />
  );
}
