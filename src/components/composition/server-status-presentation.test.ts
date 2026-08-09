import { expect, test } from 'vitest';
import { serverStatusPresentation } from './server-status-presentation';

test('serverStatusPresentation maps online, VIP, and offline Tranquility states', () => {
  expect(serverStatusPresentation({ state: 'online', players: 13459 })).toEqual({
    label: 'TQ · 13,459',
    ariaLabel: 'Tranquility online — 13,459 players',
    reachable: true,
  });
  expect(serverStatusPresentation({ state: 'vip', players: 42 })).toEqual({
    label: 'TQ · VIP',
    ariaLabel: 'Tranquility in VIP-only mode',
    reachable: true,
  });
  expect(serverStatusPresentation({ state: 'offline' })).toEqual({
    label: 'TQ · offline',
    ariaLabel: 'Tranquility server offline',
    reachable: false,
  });
});
