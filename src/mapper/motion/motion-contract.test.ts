import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOTION_CONFIG,
  motionCssProperties,
  springFamily,
} from './motion-contract';

/** Peak of the eased curve over a fine grid — the measured overshoot witness. */
function measuredPeak(ease: (t: number) => number): number {
  let peak = 0;
  for (let i = 0; i <= 2000; i += 1) {
    peak = Math.max(peak, ease(i / 2000));
  }
  return peak;
}

// ── SC-7 · HC-3 — three tiers, one family, dial defaults ─────────────────────
describe('motion config defaults', () => {
  it('ships the G-1-ratified tiers: fast below the shared mid/slow second', () => {
    const { fast, mid, slow } = DEFAULT_MOTION_CONFIG.tempo;

    // Ratified at the 2026-08-02 tuning gate; changing these re-opens the
    // gate, so the exact values are pinned, not just their ordering.
    expect(fast).toBe(250);
    expect(mid).toBe(1000);
    expect(slow).toBe(1000);
    expect(fast).toBeLessThan(mid);
    expect(slow).toBeGreaterThanOrEqual(mid);
  });

  it('ships integer-percent overshoot and a declared flavor and collapse weight', () => {
    expect(Number.isInteger(DEFAULT_MOTION_CONFIG.overshootPct)).toBe(true);
    expect(['fade-with-child', 'grow-from-parent']).toContain(
      DEFAULT_MOTION_CONFIG.edgeFlavor,
    );
    expect(['ordinary', 'heavy']).toContain(DEFAULT_MOTION_CONFIG.collapseWeight);
  });
});

// ── SC-1/SC-2 substrate — the easing family's shape guarantees ───────────────
describe('spring family', () => {
  it('starts at 0 and settles exactly at 1', () => {
    for (const pct of [0, 8, 20, 40]) {
      const { ease } = springFamily(pct);

      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-0.5)).toBe(0);
      expect(ease(1.5)).toBe(1);
    }
  });

  it('produces no overshoot at 0 % — the camera variant', () => {
    expect(measuredPeak(springFamily(0).ease)).toBeLessThanOrEqual(1);
  });

  it('peaks at the requested overshoot percent', () => {
    for (const pct of [5, 12, 25, 40]) {
      const peak = measuredPeak(springFamily(pct).ease);

      expect(peak).toBeGreaterThan(1);
      expect(Math.abs(peak - 1 - pct / 100)).toBeLessThan(0.002);
    }
  });

  it('treats a negative dial value as no overshoot', () => {
    expect(measuredPeak(springFamily(-10).ease)).toBeLessThanOrEqual(1);
  });

  it('overshoots exactly once and settles without ringing', () => {
    const { ease } = springFamily(20);
    // After the peak the curve must descend monotonically back to 1: a second
    // rise would be ringing, which the family promises not to produce.
    let peakIndex = 0;
    const samples = Array.from({ length: 401 }, (_, i) => ease(i / 400));
    samples.forEach((value, index) => {
      if (value > (samples[peakIndex] ?? 0)) peakIndex = index;
    });
    for (let i = peakIndex; i < samples.length - 1; i += 1) {
      expect(samples[i + 1]).toBeLessThanOrEqual((samples[i] ?? 0) + 1e-9);
    }
  });
});

// ── SC-7.2 · HC-3 — the CSS token is the same spring, not a second family ────
describe('css linear() token', () => {
  it('samples the JS function exactly at even spacing', () => {
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
});

// ── SC-7.2 — the stylesheet bridge carries tiers and both ease variants ──────
describe('motion css properties', () => {
  it('exposes exactly the three tier tokens and the two ease tokens', () => {
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
    expect(properties['--map-motion-ease']).toBe(
      springFamily(DEFAULT_MOTION_CONFIG.overshootPct).cssLinear,
    );
    expect(properties['--map-motion-ease-settle']).toBe(springFamily(0).cssLinear);
  });

  it('keeps the stylesheet pre-hydration fallbacks pinned to the ratified defaults', () => {
    // The [data-map-motion-scope] block in globals.css is the only other place
    // the tier values appear; without this pin a retuned default could leave
    // every pre-hydration frame (and the empty canvas) at a retired tempo.
    const stylesheet = readFileSync('src/app/globals.css', 'utf8');
    const scope = /\[data-map-motion-scope\]\s*\{([^}]*)\}/.exec(stylesheet);

    expect(scope).not.toBeNull();
    const block = scope?.[1] ?? '';
    expect(block).toContain(`--map-motion-fast: ${DEFAULT_MOTION_CONFIG.tempo.fast}ms`);
    expect(block).toContain(`--map-motion-mid: ${DEFAULT_MOTION_CONFIG.tempo.mid}ms`);
    expect(block).toContain(`--map-motion-slow: ${DEFAULT_MOTION_CONFIG.tempo.slow}ms`);
  });
});
