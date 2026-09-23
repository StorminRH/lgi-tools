'use client';

import { memo, useEffect, useRef } from 'react';
import { createWormholeHost, type WormholeInputs } from './host';
import styles from './WormholeVisual.module.css';

function WormholeVisualComponent({
  whClassId = null,
  active,
  paused = false,
  seed = '',
  size = 75,
}: WormholeInputs) {
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
    hostRef.current?.update({ whClassId, active, paused, seed, size });
  }, [whClassId, active, paused, seed, size]);
  return (
    <span className={styles.visual} data-wormhole-visual data-wh-class={whClassId ?? 'unknown'} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.fallback} />
    </span>
  );
}

export const WormholeVisual = memo(WormholeVisualComponent);
