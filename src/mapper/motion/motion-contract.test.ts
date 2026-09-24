import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  DEFAULT_MOTION_CONFIG,
  motionCssProperties,
  springFamily,
} from './motion-contract';

function measuredPeak(ease: (t: number) => number): number {
  let peak = 0;
  for (let i = 0; i <= 2000; i += 1) {
    peak = Math.max(peak, ease(i / 2000));
  }
  return peak;
}

test('spring family clamps to the unit interval and peaks at the requested overshoot', () => {
  for (const pct of [0, 8, 20, 40]) {
    const { ease } = springFamily(pct);

    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  }

  expect(measuredPeak(springFamily(0).ease)).toBeLessThanOrEqual(1);
  expect(measuredPeak(springFamily(-10).ease)).toBeLessThanOrEqual(1);

  for (const pct of [5, 12, 25, 40]) {
    const peak = measuredPeak(springFamily(pct).ease);

    expect(peak).toBeGreaterThan(1);
    expect(Math.abs(peak - 1 - pct / 100)).toBeLessThan(0.002);
  }
});

test('spring family overshoots once and settles without ringing', () => {
  const { ease } = springFamily(20);
  let peakIndex = 0;
  const samples = Array.from({ length: 401 }, (_, i) => ease(i / 400));
  samples.forEach((value, index) => {
    if (value > (samples[peakIndex] ?? 0)) peakIndex = index;
  });
  for (let i = peakIndex; i < samples.length - 1; i += 1) {
    expect(samples[i + 1]).toBeLessThanOrEqual((samples[i] ?? 0) + 1e-9);
  }
});

test('css linear() samples the spring at even spacing', () => {
  for (const pct of [0, 12, 33]) {
    const { ease, cssLinear } = springFamily(pct);
    const body = /^linear\((.+)\)$/.exec(cssLinear);

    expect(body).not.toBeNull();
    const stops = (body?.[1] ?? '').split(', ').map(Number);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(1);
    stops.forEach((stop, index) => {
      expect(Math.abs(stop - ease(index / (stops.length - 1)))).toBeLessThan(
        5e-5,
      );
    });
  }
});

test('css properties and pre-hydration fallbacks share the ratified tempos', () => {
  const properties = motionCssProperties(DEFAULT_MOTION_CONFIG);

  expect(Object.keys(properties).sort()).toEqual([
    '--map-motion-ease',
    '--map-motion-ease-settle',
    '--map-motion-fast',
    '--map-motion-mid',
    '--map-motion-slow',
  ]);
  expect(properties['--map-motion-fast']).toBe('250ms');
  expect(properties['--map-motion-mid']).toBe('1000ms');
  expect(properties['--map-motion-slow']).toBe('1000ms');
  const fast = Number.parseInt(properties['--map-motion-fast'] ?? '', 10);
  const mid = Number.parseInt(properties['--map-motion-mid'] ?? '', 10);
  const slow = Number.parseInt(properties['--map-motion-slow'] ?? '', 10);
  expect(fast).toBeLessThan(mid);
  expect(slow).toBeGreaterThanOrEqual(mid);
  expect(properties['--map-motion-ease']).toBe(
    springFamily(DEFAULT_MOTION_CONFIG.overshootPct).cssLinear,
  );
  expect(properties['--map-motion-ease-settle']).toBe(springFamily(0).cssLinear);

  const stylesheet = readFileSync('src/mapper/motion/motion-contract.css', 'utf8');
  const scope = /\[data-map-motion-scope\]\s*\{([^}]*)\}/.exec(stylesheet);

  expect(scope).not.toBeNull();
  const block = scope?.[1] ?? '';
  expect(block).toContain('--map-motion-fast: 250ms');
  expect(block).toContain('--map-motion-mid: 1000ms');
  expect(block).toContain('--map-motion-slow: 1000ms');
});
