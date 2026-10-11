import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOG_CONFIG } from '../fog/fog-model';
import { HALO_PINNED_LIMITS } from '../halo/halo-model';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import { MapControls, type MapControlsProps } from './MapControls';

vi.mock('@xyflow/react', () => ({
  Panel: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    'data-map-dev-dials'?: string;
  }) => createElement('div', props, children),
}));

function panelProps(): MapControlsProps {
  return {
    config: DEFAULT_LAYOUT_CONFIG,
    onConfigChange: () => undefined,
    motion: DEFAULT_MOTION_CONFIG,
    onMotionChange: () => undefined,
    halo: HALO_PINNED_LIMITS,
    onHaloChange: () => undefined,
    fog: DEFAULT_FOG_CONFIG,
    onFogChange: () => undefined,
  };
}

describe('MapControls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders layout/motion/halo/fog dials only in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const html = renderToStaticMarkup(createElement(MapControls, panelProps()));
    expect(html).toContain('data-map-dev-dials');
    expect(html).toContain('bottom-right');
    expect(html).toContain('mr-64');
    expect(html).toContain('Layout dials');
    expect(html).toContain('Motion dials');
    expect(html).toContain('Halo dials');
    expect(html).toContain('Fog dials');
    // Each dial group's ▾ stays out of its summary's accessible name.
    expect(html.match(/<span data-chevron="true" aria-hidden="true"/g)).toHaveLength(4);
    expect(html).not.toContain('Map lock');
    expect(html).not.toContain('Camera follow');
    // Each group shows its steppers, then its choices. A stepper row shows a
    // short label and carries the full accessible name on its field.
    const shown = [...html.matchAll(/text-muted tracking-label">([^<]+)</g)].map((match) => match[1]);
    expect(shown).toEqual([
      'Layout dials', 'Ring spacing', 'Separation', 'Sibling fan', 'Wedge posture', 'Direction order',
      'Motion dials', 'Fast', 'Mid', 'Slow', 'Overshoot', 'Edge flavor', 'Collapse exit',
      'Halo dials', 'Drawn rings', 'Fogged rings', 'Per exit', 'Total cap',
      'Fog dials', 'Reveal', 'Corridor', 'Density %', 'Smoke tier',
    ]);
    const named = [...html.matchAll(/ aria-label="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((name) => !/^(Decrease|Increase) /.test(name ?? ''));
    expect(named).toEqual([
      'Ring spacing', 'Minimum separation', 'Sibling fan', 'Wedge posture', 'Direction order',
      'Fast tempo', 'Mid tempo', 'Slow tempo', 'Overshoot percent', 'Edge flavor', 'Collapse exit',
      'Drawn halo rings', 'Fogged halo rings', 'Halo systems per exit', 'Halo total system cap',
      'Fog reveal radius', 'Fog corridor radius', 'Fog density percent', 'Smoke tier',
    ]);
    // Density reads the stored fraction back as a whole percent.
    expect(html).toMatch(/aria-label="Fog density percent"[^>]*value="95"/);

    vi.stubEnv('NODE_ENV', 'production');
    expect(
      renderToStaticMarkup(createElement(MapControls, panelProps())),
    ).toBe('');
  });
});
