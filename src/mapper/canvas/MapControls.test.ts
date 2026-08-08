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
    expect(html).toContain('bottom-left');
    expect(html).toContain('Layout dials');
    expect(html).toContain('Motion dials');
    expect(html).toContain('Halo dials');
    expect(html).toContain('Fog dials');
    expect(html).not.toContain('Map lock');
    expect(html).not.toContain('Camera follow');

    vi.stubEnv('NODE_ENV', 'production');
    expect(
      renderToStaticMarkup(createElement(MapControls, panelProps())),
    ).toBe('');
  });
});
