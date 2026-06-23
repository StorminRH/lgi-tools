import type { ServerStatus } from '@/data/eve-status/types';
import { formatQuantity } from '@/lib/format/number';

// View mapping for the nav's Tranquility status chip (Humble Component: the
// branching lives here, the JSX shell in ServerStatus.tsx stays declarative).
// `reachable` drives the text tone (live/isk vs muted) and the dot's state
// class is the status itself, so this only needs to produce the labels.
export function serverStatusPresentation(status: ServerStatus): {
  label: string;
  ariaLabel: string;
  reachable: boolean;
} {
  switch (status.state) {
    case 'online':
      return {
        label: `TQ · ${formatQuantity(status.players)}`,
        ariaLabel: `Tranquility online — ${formatQuantity(status.players)} players`,
        reachable: true,
      };
    case 'vip':
      return {
        label: 'TQ · VIP',
        ariaLabel: 'Tranquility in VIP-only mode',
        reachable: true,
      };
    case 'offline':
      return {
        label: 'TQ · offline',
        ariaLabel: 'Tranquility server offline',
        reachable: false,
      };
  }
}
