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
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const host = createWormholeHost(canvas, { active: false });
    hostRef.current = host;
    return () => { host.dispose(); hostRef.current = null; };
  }, []);
  useEffect(() => {
    hostRef.current?.update({ body, active, paused, seed });
  }, [body, active, paused, seed]);
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
