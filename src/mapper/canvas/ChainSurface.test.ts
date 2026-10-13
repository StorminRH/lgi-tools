import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import { DEFAULT_MOTION_CONFIG, type MotionConfig } from '../motion/motion-contract';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: <T>(factory: () => T) => factory(),
  useCallback: <T>(callback: T) => callback,
}));

import { ChainSurface } from './ChainSurface';

function attachScope(motion: MotionConfig | undefined) {
  const scope = ChainSurface({ nodes: [], edges: [], motion }) as ReactElement<{
    readonly ref: (node: unknown) => void;
  }>;
  const setProperty = vi.fn();
  scope.props.ref({ style: { setProperty } });
  return new Map<string, string>(setProperty.mock.calls.map(([name, value]) => [name, value]));
}

test('the motion scope takes every motion property as it attaches, and keeps its stylesheet defaults without a motion config', () => {
  const written = attachScope({ ...DEFAULT_MOTION_CONFIG, tempo: { fast: 120, mid: 480, slow: 900 } });
  expect([...written.keys()].sort()).toEqual([
    '--map-motion-ease',
    '--map-motion-ease-settle',
    '--map-motion-fast',
    '--map-motion-mid',
    '--map-motion-slow',
  ]);
  expect(written.get('--map-motion-fast')).toBe('120ms');
  expect(written.get('--map-motion-mid')).toBe('480ms');
  expect(written.get('--map-motion-slow')).toBe('900ms');
  expect(written.get('--map-motion-ease')).toMatch(/^linear\(/);
  expect(written.get('--map-motion-ease-settle')).toMatch(/^linear\(/);

  expect(attachScope(undefined).size).toBe(0);
});
