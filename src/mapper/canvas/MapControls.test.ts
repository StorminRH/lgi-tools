import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import { MapControls } from './MapControls';

vi.mock('@xyflow/react', () => ({
  Panel: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    'data-map-dev-dials'?: string;
  }) => createElement('div', props, children),
}));

describe('MapControls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders layout/motion dials in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const html = renderToStaticMarkup(
      createElement(MapControls, {
        config: DEFAULT_LAYOUT_CONFIG,
        onConfigChange: () => undefined,
        motion: DEFAULT_MOTION_CONFIG,
        onMotionChange: () => undefined,
      }),
    );
    expect(html).toContain('data-map-dev-dials');
    expect(html).toContain('Layout dials');
    expect(html).toContain('Motion dials');
    expect(html).not.toContain('Map lock');
    expect(html).not.toContain('Camera follow');
  });

  it('renders nothing outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const html = renderToStaticMarkup(
      createElement(MapControls, {
        config: DEFAULT_LAYOUT_CONFIG,
        onConfigChange: () => undefined,
        motion: DEFAULT_MOTION_CONFIG,
        onMotionChange: () => undefined,
      }),
    );
    expect(html).toBe('');
  });
});
