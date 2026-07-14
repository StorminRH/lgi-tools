import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMAIN_EVENT_TYPES } from './types';
import type { DomainEventInput } from './types';

const h = vi.hoisted(() => ({
  after: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => h.after(callback),
}));

vi.mock('@/db', () => ({
  db: {
    insert: h.insert.mockImplementation(() => ({ values: h.values })),
    select: h.select.mockImplementation(() => ({ from: h.from })),
  },
}));

import { emitDomainEvent, listRecentDomainEvents } from './queries';

const events = [
  {
    eventType: 'price_refresh_finished',
    metadata: {
      outcome: 'completed',
      fetched: 100,
      written: 99,
      esiCount: 90,
      fuzzworkFallbackCount: 10,
      budgetExhausted: false,
      durationMs: 1234,
    },
  },
  {
    eventType: 'esi_snapshot_pulled',
    metadata: {
      snapshotId: 41,
      dataset: 'owned_assets',
      ownerType: 'corporation',
      ownerId: 98_000_001,
      itemCount: 12,
    },
  },
  {
    eventType: 'eve_token_state_changed',
    metadata: {
      characterId: 90_000_001,
      from: 'usable',
      to: 'suspect',
      reason: 'invalid_grant',
    },
  },
  {
    eventType: 'esi_refresh_job_status_changed',
    metadata: {
      jobId: 7,
      dataset: 'skills',
      ownerType: 'character',
      ownerId: 90_000_001,
      status: 'failed_retryable',
      attemptCount: 2,
      failureCode: 'timeout',
    },
  },
  {
    eventType: 'esi_budget_guard_exhausted',
    metadata: {
      count: 3,
      windowMinutes: 15,
      windowStartedAt: '2026-07-14T12:00:00.000Z',
      windowEndedAt: '2026-07-14T12:15:00.000Z',
    },
  },
] as const satisfies readonly DomainEventInput[];

describe('domain event ledger', () => {
  beforeEach(() => {
    h.after.mockReset();
    h.after.mockImplementation((callback: () => unknown) => callback());
    h.insert.mockClear();
    h.values.mockReset();
    h.values.mockResolvedValue(undefined);
    h.from.mockReturnValue({ orderBy: h.orderBy });
    h.orderBy.mockReturnValue({ limit: h.limit });
    h.limit.mockResolvedValue([]);
  });

  it('keeps the closed vocabulary aligned with every typed metadata shape', async () => {
    expect(events.map((event) => event.eventType)).toEqual(DOMAIN_EVENT_TYPES);

    for (const event of events) emitDomainEvent(event);

    await vi.waitFor(() => expect(h.values).toHaveBeenCalledTimes(events.length));
    expect(h.values.mock.calls.map(([value]) => value)).toEqual(
      events.map((event) => ({ eventType: event.eventType, metadata: event.metadata })),
    );
  });

  it('logs a rejected insert without throwing into the caller', async () => {
    const error = new Error('database unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.values.mockRejectedValueOnce(error);

    expect(() => emitDomainEvent(events[0])).not.toThrow();

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[domain-events] ledger write failed',
        error,
      ),
    );
    consoleError.mockRestore();
  });

  it('logs a rejected request-lifetime schedule without throwing', () => {
    const error = new Error('request context unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.after.mockImplementationOnce(() => {
      throw error;
    });

    expect(() => emitDomainEvent(events[0])).not.toThrow();

    expect(consoleError).toHaveBeenCalledWith(
      '[domain-events] ledger scheduling failed',
      error,
    );
    expect(h.insert).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('lists recent events in the database-provided order and limit', async () => {
    const rows = [
      {
        id: 9,
        occurredAt: new Date('2026-07-14T12:00:00Z'),
        ...events[0],
      },
    ];
    h.limit.mockResolvedValueOnce(rows);

    await expect(listRecentDomainEvents(12)).resolves.toEqual(rows);
    expect(h.limit).toHaveBeenCalledWith(12);
  });
});
