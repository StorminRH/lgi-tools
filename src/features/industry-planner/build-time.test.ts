import { describe, expect, it } from 'vitest';
import { formatBuildDuration, toBuildTimeView } from './build-time';

describe('formatBuildDuration', () => {
  it('formats seconds as the largest two units', () => {
    expect(formatBuildDuration(0)).toBe('<1m');
    expect(formatBuildDuration(6000)).toBe('1h 40m'); // Rifter base
    expect(formatBuildDuration(240_000)).toBe('2d 18h'); // Ishtar base
    expect(formatBuildDuration(9_000_000)).toBe('104d 4h'); // Ragnarok base
  });
});

describe('toBuildTimeView', () => {
  it('shows the final job at base time, runs-scaled', () => {
    expect(toBuildTimeView(240_000, 1)).toEqual({ topJob: '2d 18h' });
    expect(toBuildTimeView(6_000, 3)).toEqual({ topJob: '5h' }); // 3 runs × 1h40m
  });

  it('floors fractional runs and treats zero runs as no figure', () => {
    expect(toBuildTimeView(6_000, 2.9)).toEqual({ topJob: '3h 20m' }); // 2 runs
    expect(toBuildTimeView(6_000, 0)).toBeNull();
  });

  it('returns null when the product has no honest base time', () => {
    expect(toBuildTimeView(null, 1)).toBeNull();
    expect(toBuildTimeView(0, 1)).toBeNull();
  });
});
