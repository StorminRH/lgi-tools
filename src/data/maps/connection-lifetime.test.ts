import { describe, expect, it } from 'vitest';
import {
  deathWindowForReport,
  deathWindowFrom,
  intersectOrReset,
  lifetimeDisplay,
} from './connection-lifetime';

const HOUR_MS = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('connection lifetime', () => {
  it('turns every report bucket into its absolute remaining interval', () => {
    expect(deathWindowForReport('under_1_day', NOW, null)).toEqual({
      earliestAt: NOW + 4 * HOUR_MS,
      latestAt: NOW + 24 * HOUR_MS,
    });
    expect(deathWindowForReport('under_4_hours', NOW, null)).toEqual({
      earliestAt: NOW + HOUR_MS,
      latestAt: NOW + 4 * HOUR_MS,
    });
    expect(deathWindowForReport('under_1_hour', NOW, null)).toEqual({
      earliestAt: NOW,
      latestAt: NOW + HOUR_MS,
    });
    expect(deathWindowForReport('expired', NOW, null)).toEqual({
      earliestAt: NOW,
      latestAt: NOW,
    });
  });

  it('caps a report by the typed lifetime ceiling', () => {
    expect(deathWindowForReport('under_1_day', NOW, 16 * 60)).toEqual({
      earliestAt: NOW + 4 * HOUR_MS,
      latestAt: NOW + 16 * HOUR_MS,
    });
  });

  it('narrows a later stage report and a repeated same-bucket report', () => {
    const first = deathWindowForReport('under_1_day', NOW, 16 * 60);
    const later = deathWindowForReport('under_4_hours', NOW + 12 * HOUR_MS, 16 * 60);
    expect(intersectOrReset(first, later)).toEqual({
      earliestAt: NOW + 13 * HOUR_MS,
      latestAt: NOW + 16 * HOUR_MS,
    });

    const sameBucketLater = deathWindowForReport('under_4_hours', NOW + HOUR_MS, null);
    expect(
      intersectOrReset(deathWindowForReport('under_4_hours', NOW, null), sameBucketLater),
    ).toEqual({
      earliestAt: NOW + 2 * HOUR_MS,
      latestAt: NOW + 4 * HOUR_MS,
    });
  });

  it('resets a contradictory report instead of wedging the interval', () => {
    const stored = { earliestAt: NOW + 8 * HOUR_MS, latestAt: NOW + 9 * HOUR_MS };
    const next = deathWindowForReport('expired', NOW, null);
    expect(intersectOrReset(stored, next)).toEqual(next);
  });

  it('normalizes stored pairs through the single deathWindowFrom owner', () => {
    expect(deathWindowFrom(NOW, NOW + HOUR_MS)).toEqual({
      earliestAt: NOW,
      latestAt: NOW + HOUR_MS,
    });
    expect(deathWindowFrom(NOW, NOW)).toEqual({
      earliestAt: NOW,
      latestAt: NOW,
    });
    expect(deathWindowFrom(null, NOW)).toBeNull();
    expect(deathWindowFrom(NOW, null)).toBeNull();
    expect(deathWindowFrom(undefined, undefined)).toBeNull();
    expect(deathWindowFrom(Number.NaN, NOW)).toBeNull();
    expect(deathWindowFrom(NOW + HOUR_MS, NOW)).toBeNull();
  });

  it('derives bounded and expired countdown displays', () => {
    expect(
      lifetimeDisplay(
        { earliestAt: NOW + HOUR_MS, latestAt: NOW + 4 * HOUR_MS },
        NOW,
      ),
    ).toEqual({
      kind: 'range',
      earliestRemainingMs: HOUR_MS,
      latestRemainingMs: 4 * HOUR_MS,
    });
    expect(
      lifetimeDisplay({ earliestAt: NOW - HOUR_MS, latestAt: NOW }, NOW),
    ).toEqual({ kind: 'expired', earliestRemainingMs: 0, latestRemainingMs: 0 });
  });
});
