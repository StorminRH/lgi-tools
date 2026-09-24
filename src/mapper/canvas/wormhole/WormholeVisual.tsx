'use client';

import { memo, useEffect, useRef } from 'react';
import { createWormholeHost } from './host';
import type { WormholeBody } from './palette';
import styles from './WormholeVisual.module.css';

function WormholeVisualComponent({
  body,
  active,
  paused = false,
  seed = '',
}: {
  readonly body: WormholeBody;
  readonly active: boolean;
  readonly paused?: boolean;
  readonly seed?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<ReturnType<typeof createWormholeHost> | null>(null);
  useEffect(() => {
    const inputs = { body, active, paused, seed };
    if (hostRef.current !== null) {
      hostRef.current.update(inputs);
      return;
    }
    const canvas = canvasRef.current;
    if (canvas !== null) hostRef.current = createWormholeHost(canvas, inputs);
  }, [body, active, paused, seed]);
  useEffect(() => () => {
    hostRef.current?.dispose();
    hostRef.current = null;
  }, []);
  return (
    <span
      className={styles.visual}
      data-wormhole-visual
      data-body={body.kind}
      data-wh-class={body.kind === 'wormhole' ? body.classId ?? 'unknown' : undefined}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.fallback} />
    </span>
  );
}

export const WormholeVisual = memo(WormholeVisualComponent);
