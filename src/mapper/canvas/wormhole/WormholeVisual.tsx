'use client';

import { memo, useEffect, useRef } from 'react';
import { createWormholeHost, type WormholeInputs } from './host';
import styles from './WormholeVisual.module.css';

/** Decorative mapper primitive: its parent owns labels, hit targets and selection.
 * Class controls the core palette. Only pass shipSize for a specific connection;
 * a system can have several connections with different per-jump mass limits.
 */
function WormholeVisualComponent({
  whClassId = null,
  active,
  paused = false,
  seed = '',
  size = 146,
  shipSize = 'unknown',
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
    hostRef.current?.update({ whClassId, active, paused, seed, size, shipSize });
  }, [whClassId, active, paused, seed, size, shipSize]);
  return (
    <span className={styles.visual} data-wormhole-visual data-wh-class={whClassId ?? 'unknown'} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.fallback} />
    </span>
  );
}

export const WormholeVisual = memo(WormholeVisualComponent);
