import { describe, expect, it } from 'vitest';
import { serverStatusPresentation } from './server-status-presentation';

describe('serverStatusPresentation', () => {
  it('shows the formatted player count when online', () => {
    expect(serverStatusPresentation({ state: 'online', players: 13459 })).toEqual({
      label: 'TQ · 13,459',
      ariaLabel: 'Tranquility online — 13,459 players',
      reachable: true,
    });
  });

  it('shows VIP without a count during the VIP-only window', () => {
    expect(serverStatusPresentation({ state: 'vip', players: 42 })).toEqual({
      label: 'TQ · VIP',
      ariaLabel: 'Tranquility in VIP-only mode',
      reachable: true,
    });
  });

  it('shows a neutral offline label when unreachable', () => {
    expect(serverStatusPresentation({ state: 'offline' })).toEqual({
      label: 'TQ · offline',
      ariaLabel: 'Tranquility server offline',
      reachable: false,
    });
  });
});
