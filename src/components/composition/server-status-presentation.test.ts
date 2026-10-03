import { expect, test } from 'vitest';
import type { EsiHealth } from '@/composition/esi-health';
import { eveStatusSections, serverStatusPresentation } from './server-status-presentation';

const ONLINE = {
  state: 'online',
  players: 13_459,
  build: '3569502',
  startedAt: '2026-10-03T11:03:02Z',
} as const;

const HEALTHY: EsiHealth = {
  availability: { state: 'measured', rate: 0.9984, level: 'green' },
  budget: { state: 'live', remaining: 84, ceiling: 100 },
};

const SDE = { build: '3569502', ingestedAt: new Date('2026-10-02T16:50:42Z') };

const values = (sections: ReturnType<typeof eveStatusSections>) =>
  Object.fromEntries(
    sections.map((s) => [s.heading, s.rows.map((r) => `${r.label}: ${r.value} (${r.level})`)]),
  );

test('serverStatusPresentation gives the header value and its spoken label', () => {
  expect(serverStatusPresentation(ONLINE)).toEqual({
    value: '13,459',
    ariaLabel: 'Tranquility online — 13,459 players',
  });
  expect(serverStatusPresentation({ ...ONLINE, state: 'vip' })).toEqual({
    value: 'VIP',
    ariaLabel: 'Tranquility in VIP-only mode',
  });
  expect(serverStatusPresentation({ state: 'offline' })).toEqual({
    value: 'offline',
    ariaLabel: 'Tranquility server offline',
  });
});

test('eveStatusSections reads Tranquility, ESI and the ingested SDE', () => {
  expect(values(eveStatusSections({ status: ONLINE, sde: SDE, esi: HEALTHY }))).toEqual({
    Tranquility: [
      'Status: Online (green)',
      'Players: 13,459 (green)',
      'Up since: 11:03 UTC (green)',
    ],
    ESI: ['Success, last hour: 99.8% (green)', 'Error budget: 84 of 100 (green)'],
    'Static data': ['Build: 3569502 (green)', 'Ingested: 2 Oct 2026 (green)'],
  });
});

test('eveStatusSections flags what needs attention and admits what it cannot read', () => {
  const newerServer = { ...ONLINE, state: 'vip', build: '3570100', startedAt: null } as const;
  const quiet: EsiHealth = { availability: { state: 'idle' }, budget: { state: 'paused', remaining: 3, ceiling: 100 } };
  expect(values(eveStatusSections({ status: newerServer, sde: SDE, esi: quiet }))).toEqual({
    Tranquility: ['Status: VIP only (amber)', 'Players: 13,459 (green)'],
    ESI: ['Success, last hour: No calls (neutral)', 'Error budget: Paused (red)'],
    'Static data': ['Build: 3569502 · behind (amber)', 'Ingested: 2 Oct 2026 (green)'],
  });

  const unknown: EsiHealth = { availability: { state: 'unknown' }, budget: { state: 'unknown' } };
  expect(values(eveStatusSections({ status: { state: 'offline' }, sde: null, esi: unknown }))).toEqual({
    Tranquility: ['Status: Offline (red)'],
    ESI: ['Success, last hour: Unknown (neutral)', 'Error budget: Unknown (neutral)'],
    'Static data': ['Build: Unknown (neutral)'],
  });
});
